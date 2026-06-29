import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as awarenessProtocol from "y-protocols/awareness";
import { Awareness } from "y-protocols/awareness";
import type { WebSocket } from "ws";
import { customAlphabet } from "nanoid";
import { config } from "./config.js";
import {
  getPermissions,
  keys,
  loadSnapshot,
  pub,
  saveSnapshot,
  sub,
  type Permissions,
} from "./redis.js";
import { encodeAwarenessMessage, encodeDocUpdate, send } from "./protocol.js";

/**
 * A unique id for THIS server process. Used to ignore our own messages that
 * come back to us over Redis pub/sub (we already applied them locally).
 */
export const INSTANCE_ID = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  8
)();

// Redis payload framing: [8 bytes instanceId][1 byte type][...payload]
const REDIS_DOC = 0;
const REDIS_AWARENESS = 1;
const REDIS_PERMS = 2;

function frame(type: number, payload: Uint8Array): Buffer {
  const head = Buffer.from(INSTANCE_ID, "ascii"); // exactly 8 bytes
  return Buffer.concat([head, Buffer.from([type]), Buffer.from(payload)]);
}

/**
 * Tell every server instance holding this board to reload its permission cache
 * (called by the REST API after an owner changes access). We deliberately do
 * NOT filter by instance here — the instance that made the change must refresh
 * its own cache too.
 */
export function publishPermsChanged(id: string): void {
  pub.publish(keys.channel(id), frame(REDIS_PERMS, new Uint8Array(0)));
}

function encodeRawAwareness(awareness: Awareness, clients: number[]): Uint8Array {
  return awarenessProtocol.encodeAwarenessUpdate(awareness, clients);
}

/**
 * One live board held in memory. Wraps a Y.Doc + Awareness, fans updates out
 * to local WebSocket clients, and relays them to peer instances via Redis.
 */
export class Room {
  readonly id: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly conns = new Set<WebSocket>();

  /** Server-authoritative draw permissions, cached from Redis. */
  private perms: Permissions = { drawMode: "everyone", allowed: [] };
  private allowedSet = new Set<string>();

  private snapshotTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private closed = false;

  private constructor(id: string) {
    this.id = id;
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalState(null); // the server is not itself a presence
  }

  static async open(id: string): Promise<Room> {
    const room = new Room(id);

    // Load the server-authoritative permission state before accepting writes.
    await room.refreshPerms();

    // Hydrate from the last persisted snapshot, if any.
    const snapshot = await loadSnapshot(id);
    if (snapshot) Y.applyUpdate(room.doc, snapshot, "snapshot");

    // Doc changes → relay to peers, broadcast to local clients, mark dirty.
    room.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "redis") {
        pub.publish(keys.channel(id), frame(REDIS_DOC, update));
      }
      if (origin !== "snapshot") {
        const msg = encodeDocUpdate(update);
        for (const conn of room.conns) {
          if (conn !== origin) send(conn, msg);
        }
      }
      room.dirty = true;
    });

    // Awareness changes → relay to peers + broadcast to local clients.
    room.awareness.on(
      "update",
      (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const clients = [...changes.added, ...changes.updated, ...changes.removed];
        if (clients.length === 0) return;

        if (origin !== "redis") {
          pub.publish(
            keys.channel(id),
            frame(REDIS_AWARENESS, encodeRawAwareness(room.awareness, clients))
          );
        }
        const msg = encodeAwarenessMessage(room.awareness, clients);
        for (const conn of room.conns) {
          if (conn !== origin) send(conn, msg);
        }
      }
    );

    await sub.subscribe(keys.channel(id));

    room.snapshotTimer = setInterval(() => {
      void room.persist();
    }, config.snapshotIntervalMs);

    return room;
  }

  /** Apply an update that arrived from a peer instance over Redis. */
  applyRemote(type: number, payload: Uint8Array): void {
    if (type === REDIS_DOC) {
      Y.applyUpdate(this.doc, payload, "redis");
    } else if (type === REDIS_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, payload, "redis");
    }
  }

  /** Reload draw permissions from Redis (after an owner changes access). */
  async refreshPerms(): Promise<void> {
    const perms = await getPermissions(this.id);
    if (perms) {
      this.perms = perms;
      this.allowedSet = new Set(perms.allowed);
    }
  }

  /** May a connection with this identity mutate the document? */
  canWrite(ctx: { isOwner: boolean; uid: string }): boolean {
    if (ctx.isOwner) return true;
    if (this.perms.drawMode === "everyone") return true;
    return ctx.uid.length > 0 && this.allowedSet.has(ctx.uid);
  }

  async persist(): Promise<void> {
    // NOTE: intentionally not guarded by `this.closed` — close() relies on this
    // to write the final snapshot. The interval is cleared before close, so the
    // only caller after close is close() itself.
    if (!this.dirty) return;
    this.dirty = false;
    await saveSnapshot(this.id, Y.encodeStateAsUpdate(this.doc));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    await this.persist();
    this.closed = true;
    await sub.unsubscribe(keys.channel(this.id));
    this.awareness.destroy();
    this.doc.destroy();
  }
}

/**
 * Owns the lifecycle of all in-memory rooms on this instance and routes
 * inbound Redis messages to the right room.
 */
class RoomManager {
  private rooms = new Map<string, Room>();
  private opening = new Map<string, Promise<Room>>();
  private closing = new Map<string, Promise<void>>();

  constructor() {
    sub.on("messageBuffer", (channelBuf: Buffer, messageBuf: Buffer) => {
      const channel = channelBuf.toString("ascii");
      const id = channel.slice("room:".length);
      const room = this.rooms.get(id);
      if (!room) return;

      const type = messageBuf[8];

      // Permission changes must refresh every instance — including the one that
      // published them — so don't filter those by instance id.
      if (type === REDIS_PERMS) {
        void room.refreshPerms();
        return;
      }

      const fromInstance = messageBuf.subarray(0, 8).toString("ascii");
      if (fromInstance === INSTANCE_ID) return; // our own echo
      room.applyRemote(type, messageBuf.subarray(9));
    });
  }

  async get(id: string): Promise<Room> {
    // If this room is mid-close, wait for its snapshot to flush before
    // reopening — otherwise we'd reload a stale/empty snapshot.
    const closing = this.closing.get(id);
    if (closing) await closing;

    const existing = this.rooms.get(id);
    if (existing) return existing;

    const inFlight = this.opening.get(id);
    if (inFlight) return inFlight;

    const promise = Room.open(id).then((room) => {
      this.rooms.set(id, room);
      this.opening.delete(id);
      return room;
    });
    this.opening.set(id, promise);
    return promise;
  }

  /** Drop a room from memory once no local clients remain. */
  async release(id: string): Promise<void> {
    const room = this.rooms.get(id);
    if (room && room.conns.size === 0) {
      this.rooms.delete(id);
      const closed = room.close();
      this.closing.set(
        id,
        closed.finally(() => this.closing.delete(id))
      );
      await closed;
    }
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.rooms.values()].map((r) => r.close()));
    this.rooms.clear();
  }
}

export const rooms = new RoomManager();

// Re-export decoding/encoding so the connection module shares one lib0 instance.
export { encoding, decoding };
