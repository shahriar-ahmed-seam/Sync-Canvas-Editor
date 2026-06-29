import { Router } from "express";
import { customAlphabet } from "nanoid";
import {
  createBoardMeta,
  getBoardMeta,
  getPermissions,
  grantUser,
  revokeUser,
  setDrawMode,
  updateBoardMeta,
  type DrawMode,
  type Visibility,
} from "./redis.js";
import { publishPermsChanged } from "./room.js";

/** Readable, unambiguous board ids (no 0/o/1/l/i confusion). */
const newBoardId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 12);
const newOwnerToken = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  32
);

const VISIBILITIES: Visibility[] = ["public", "private"];
const DRAW_MODES: DrawMode[] = ["everyone", "owner"];

export const boardsRouter = Router();

/** Public view of a board (never leaks the owner token). */
function publicMeta(meta: NonNullable<Awaited<ReturnType<typeof getBoardMeta>>>) {
  return {
    id: meta.id,
    name: meta.name,
    visibility: meta.visibility,
    drawMode: meta.drawMode,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

/** Verify the owner token for a board; returns the meta or null if forbidden. */
async function requireOwner(
  id: string,
  token: string | undefined
): Promise<NonNullable<Awaited<ReturnType<typeof getBoardMeta>>> | null> {
  const meta = await getBoardMeta(id);
  if (!meta) return null;
  if (!token || token !== meta.ownerToken) return null;
  return meta;
}

// Create a board. The caller becomes the owner and keeps the returned token.
boardsRouter.post("/boards", async (req, res) => {
  const name = String(req.body?.name ?? "Untitled board").slice(0, 120) || "Untitled board";
  const visibility: Visibility = VISIBILITIES.includes(req.body?.visibility)
    ? req.body.visibility
    : "public";

  const now = Date.now();
  const id = newBoardId();
  const ownerToken = newOwnerToken();
  // Private boards start owner-only; public boards let everyone draw.
  const drawMode: DrawMode = visibility === "private" ? "owner" : "everyone";

  await createBoardMeta({
    id,
    name,
    visibility,
    drawMode,
    ownerToken,
    createdAt: now,
    updatedAt: now,
  });

  // ownerToken is returned exactly once, to the creator only.
  res.status(201).json({ id, name, visibility, drawMode, ownerToken, createdAt: now, updatedAt: now });
});

// Fetch board metadata. The ID itself is the access credential.
boardsRouter.get("/boards/:id", async (req, res) => {
  const meta = await getBoardMeta(req.params.id);
  if (!meta) return res.status(404).json({ error: "not_found" });
  res.json(publicMeta(meta));
});

// Current draw permissions (drawMode + granted user ids). Public read.
boardsRouter.get("/boards/:id/permissions", async (req, res) => {
  const perms = await getPermissions(req.params.id);
  if (!perms) return res.status(404).json({ error: "not_found" });
  res.json(perms);
});

// Update name/visibility. Requires the owner token.
boardsRouter.patch("/boards/:id", async (req, res) => {
  const meta = await requireOwner(req.params.id, req.header("x-owner-token"));
  if (!meta) return res.status(403).json({ error: "forbidden" });

  const patch: { name?: string; visibility?: Visibility } = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name.slice(0, 120);
  if (VISIBILITIES.includes(req.body?.visibility)) patch.visibility = req.body.visibility;

  await updateBoardMeta(req.params.id, patch);
  const updated = await getBoardMeta(req.params.id);
  res.json(publicMeta(updated!));
});

// --- Permission mutations (owner only) -------------------------------------

boardsRouter.put("/boards/:id/permissions", async (req, res) => {
  const meta = await requireOwner(req.params.id, req.header("x-owner-token"));
  if (!meta) return res.status(403).json({ error: "forbidden" });
  if (!DRAW_MODES.includes(req.body?.drawMode)) {
    return res.status(400).json({ error: "bad_drawMode" });
  }
  await setDrawMode(req.params.id, req.body.drawMode);
  publishPermsChanged(req.params.id);
  res.json(await getPermissions(req.params.id));
});

boardsRouter.post("/boards/:id/permissions/grant", async (req, res) => {
  const meta = await requireOwner(req.params.id, req.header("x-owner-token"));
  if (!meta) return res.status(403).json({ error: "forbidden" });
  const uid = String(req.body?.uid ?? "").slice(0, 64);
  if (!uid) return res.status(400).json({ error: "bad_uid" });
  await grantUser(req.params.id, uid);
  publishPermsChanged(req.params.id);
  res.json(await getPermissions(req.params.id));
});

boardsRouter.post("/boards/:id/permissions/revoke", async (req, res) => {
  const meta = await requireOwner(req.params.id, req.header("x-owner-token"));
  if (!meta) return res.status(403).json({ error: "forbidden" });
  const uid = String(req.body?.uid ?? "").slice(0, 64);
  if (!uid) return res.status(400).json({ error: "bad_uid" });
  await revokeUser(req.params.id, uid);
  publishPermsChanged(req.params.id);
  res.json(await getPermissions(req.params.id));
});
