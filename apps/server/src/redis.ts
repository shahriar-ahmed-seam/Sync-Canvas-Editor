import { Redis } from "ioredis";
import { config } from "./config.js";

/**
 * We need three logical Redis connections:
 *  - `pub`   : publish doc updates to other server instances
 *  - `sub`   : subscribe to doc updates from other server instances
 *  - `store` : ordinary GET/SET/HSET for metadata + snapshots
 *
 * A connection in "subscriber mode" can't issue normal commands, hence the split.
 */
const makeClient = (label: string) => {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });
  client.on("error", (err: Error) => console.error(`[redis:${label}] ${err.message}`));
  return client;
};

export const pub = makeClient("pub");
export const sub = makeClient("sub");
export const store = makeClient("store");

// ---- Key helpers ----------------------------------------------------------

export const keys = {
  meta: (id: string) => `board:${id}:meta`,
  doc: (id: string) => `board:${id}:doc`,
  allowed: (id: string) => `board:${id}:allowed`,
  channel: (id: string) => `room:${id}`,
};

// ---- Board metadata -------------------------------------------------------

export type Visibility = "public" | "private";
export type DrawMode = "everyone" | "owner";

export interface BoardMeta {
  id: string;
  name: string;
  visibility: Visibility;
  /** Who may draw: everyone, or only the owner + explicitly-granted users. */
  drawMode: DrawMode;
  /** Secret held by the creator's browser; proves ownership for admin actions. */
  ownerToken: string;
  createdAt: number;
  updatedAt: number;
}

export async function createBoardMeta(meta: BoardMeta): Promise<void> {
  await store.hset(keys.meta(meta.id), {
    id: meta.id,
    name: meta.name,
    visibility: meta.visibility,
    drawMode: meta.drawMode,
    ownerToken: meta.ownerToken,
    createdAt: String(meta.createdAt),
    updatedAt: String(meta.updatedAt),
  });
  await applyTtl(meta.id);
}

export async function getBoardMeta(id: string): Promise<BoardMeta | null> {
  const raw = await store.hgetall(keys.meta(id));
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    name: raw.name ?? "Untitled board",
    visibility: (raw.visibility as Visibility) ?? "public",
    drawMode: (raw.drawMode as DrawMode) ?? "everyone",
    ownerToken: raw.ownerToken ?? "",
    createdAt: Number(raw.createdAt ?? 0),
    updatedAt: Number(raw.updatedAt ?? 0),
  };
}

export async function updateBoardMeta(
  id: string,
  patch: Partial<Pick<BoardMeta, "name" | "visibility">>
): Promise<void> {
  const fields: Record<string, string> = { updatedAt: String(Date.now()) };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.visibility !== undefined) fields.visibility = patch.visibility;
  await store.hset(keys.meta(id), fields);
}

// ---- Permissions (server-authoritative) -----------------------------------

export interface Permissions {
  drawMode: DrawMode;
  /** user ids explicitly allowed to draw while drawMode === "owner". */
  allowed: string[];
}

export async function getPermissions(id: string): Promise<Permissions | null> {
  const meta = await store.hgetall(keys.meta(id));
  if (!meta || !meta.id) return null;
  const allowed = await store.smembers(keys.allowed(id));
  return { drawMode: (meta.drawMode as DrawMode) ?? "everyone", allowed };
}

export async function setDrawMode(id: string, mode: DrawMode): Promise<void> {
  await store.hset(keys.meta(id), "drawMode", mode, "updatedAt", String(Date.now()));
}

export async function grantUser(id: string, uid: string): Promise<void> {
  await store.sadd(keys.allowed(id), uid);
  await applyTtl(id);
}

export async function revokeUser(id: string, uid: string): Promise<void> {
  await store.srem(keys.allowed(id), uid);
}

// ---- Snapshots ------------------------------------------------------------

/** Persist the encoded Y.Doc state (raw bytes) as a base64 string. */
export async function saveSnapshot(id: string, state: Uint8Array): Promise<void> {
  await store.set(keys.doc(id), Buffer.from(state).toString("base64"));
  await store.hset(keys.meta(id), "updatedAt", String(Date.now()));
  await applyTtl(id);
}

export async function loadSnapshot(id: string): Promise<Uint8Array | null> {
  const b64 = await store.get(keys.doc(id));
  if (!b64) return null;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function applyTtl(id: string): Promise<void> {
  if (config.boardTtlSeconds > 0) {
    await Promise.all([
      store.expire(keys.meta(id), config.boardTtlSeconds),
      store.expire(keys.doc(id), config.boardTtlSeconds),
      store.expire(keys.allowed(id), config.boardTtlSeconds),
    ]);
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([pub.quit(), sub.quit(), store.quit()]);
}
