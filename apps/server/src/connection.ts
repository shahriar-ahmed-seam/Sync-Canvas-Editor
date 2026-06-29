import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import type { WebSocket } from "ws";
import {
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  encodeAwarenessMessage,
  encodeSyncStep1,
  send,
} from "./protocol.js";
import { rooms, type Room } from "./room.js";

const PING_INTERVAL_MS = 30_000;

export interface ConnContext {
  /** Proven via the owner token in the WS query string. */
  isOwner: boolean;
  /** Self-asserted user id (matches awareness user.id + permission grants). */
  uid: string;
}

/**
 * Attach a freshly upgraded WebSocket to a board room and drive the Yjs
 * sync + awareness handshake for its whole lifetime.
 */
export async function setupConnection(
  ws: WebSocket,
  boardId: string,
  ctx: ConnContext
): Promise<void> {
  ws.binaryType = "arraybuffer";

  // The client sends sync-step-1 the instant the socket opens. Opening a room
  // can take real time (awaiting an in-flight close + loading the snapshot from
  // Redis), so we MUST start listening immediately and buffer anything that
  // arrives before the room is ready — otherwise the first sync message is lost
  // and the client never receives the persisted document.
  let room: Room | null = null;
  const pending: Uint8Array[] = [];
  let torn = false;

  const onMessage = (data: ArrayBuffer | Buffer) => {
    const bytes = new Uint8Array(data as ArrayBuffer);
    if (!room) {
      pending.push(bytes);
      return;
    }
    try {
      handleMessage(ws, room, bytes, ctx);
    } catch (err) {
      console.error(`[conn:${boardId}] message error`, err);
    }
  };
  ws.on("message", onMessage);

  let teardown = () => {
    torn = true;
  }; // replaced once the room is ready
  ws.on("close", () => teardown());
  ws.on("error", () => teardown());

  room = await rooms.get(boardId);
  if (torn) {
    // Socket already closed while the room was opening.
    void rooms.release(boardId);
    return;
  }
  room.conns.add(ws);

  // Track which awareness clientIds this socket controls, so we can clear
  // their presence the moment the socket drops.
  const controlledIds = new Set<number>();
  const onAwareness = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin !== ws) return;
    changes.added.forEach((id) => controlledIds.add(id));
    changes.removed.forEach((id) => controlledIds.delete(id));
  };
  room.awareness.on("update", onAwareness);

  let alive = true;
  ws.on("pong", () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return teardown();
    alive = false;
    try {
      ws.ping();
    } catch {
      teardown();
    }
  }, PING_INTERVAL_MS);

  let done = false;
  teardown = () => {
    if (done) return;
    done = true;
    clearInterval(ping);
    room!.awareness.off("update", onAwareness);
    room!.conns.delete(ws);
    if (controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room!.awareness,
        [...controlledIds],
        "disconnect"
      );
    }
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    if (room!.conns.size === 0) void rooms.release(room!.id);
  };

  // --- initial handshake ---
  send(ws, encodeSyncStep1(room.doc)); // advertise our state vector
  const states = room.awareness.getStates();
  if (states.size > 0) {
    send(ws, encodeAwarenessMessage(room.awareness, [...states.keys()]));
  }

  // Replay anything the client sent while the room was still opening.
  for (const bytes of pending) {
    try {
      handleMessage(ws, room, bytes, ctx);
    } catch (err) {
      console.error(`[conn:${boardId}] buffered message error`, err);
    }
  }
  pending.length = 0;
}

function handleMessage(
  ws: WebSocket,
  room: Room,
  data: Uint8Array,
  ctx: ConnContext
): void {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MESSAGE_SYNC: {
      // Peek the sync sub-type. Step2 (1) and Update (2) carry document
      // mutations; Step1 (0) is a read request. Reject mutations from clients
      // that aren't allowed to draw — this is the real, server-side guarantee.
      const peek = decoding.createDecoder(data);
      decoding.readVarUint(peek); // MESSAGE_SYNC
      const syncType = decoding.readVarUint(peek);
      const isWrite =
        syncType === syncProtocol.messageYjsSyncStep2 ||
        syncType === syncProtocol.messageYjsUpdate;
      if (isWrite && !room.canWrite(ctx)) {
        return; // silently drop unauthorized writes
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      // Applies incoming updates to the doc (origin = ws so we don't echo back)
      // and writes any required reply (e.g. syncStep2) into `encoder`.
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
      if (encoding.length(encoder) > 1) {
        send(ws, encoding.toUint8Array(encoder));
      }
      break;
    }
    case MESSAGE_AWARENESS: {
      // Awareness (cursors/presence) is allowed for everyone — view-only users
      // still get a named cursor.
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        ws // origin: prevents echoing back to this socket
      );
      break;
    }
    default:
      break;
  }
}
