import { API_URL } from "./env";

export type Visibility = "public" | "private";
export type DrawMode = "everyone" | "owner";

export interface BoardMeta {
  id: string;
  name: string;
  visibility: Visibility;
  drawMode: DrawMode;
  createdAt: number;
  updatedAt: number;
}

export interface CreatedBoard extends BoardMeta {
  /** Returned exactly once, only to the creator. Persist locally. */
  ownerToken: string;
}

export interface Permissions {
  drawMode: DrawMode;
  allowed: string[];
}

export async function createBoard(input: {
  name?: string;
  visibility?: Visibility;
}): Promise<CreatedBoard> {
  const res = await fetch(`${API_URL}/api/boards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create board (${res.status})`);
  return res.json();
}

export async function getBoard(id: string): Promise<BoardMeta | null> {
  const res = await fetch(`${API_URL}/api/boards/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
  return res.json();
}

export async function updateBoard(
  id: string,
  ownerToken: string,
  patch: { name?: string; visibility?: Visibility }
): Promise<BoardMeta> {
  const res = await fetch(`${API_URL}/api/boards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-owner-token": ownerToken },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update board (${res.status})`);
  return res.json();
}

// ---- Permissions ----------------------------------------------------------

export async function getPermissions(id: string): Promise<Permissions | null> {
  const res = await fetch(`${API_URL}/api/boards/${encodeURIComponent(id)}/permissions`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load permissions (${res.status})`);
  return res.json();
}

export async function setDrawModeApi(
  id: string,
  ownerToken: string,
  drawMode: DrawMode
): Promise<Permissions> {
  const res = await fetch(`${API_URL}/api/boards/${encodeURIComponent(id)}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-owner-token": ownerToken },
    body: JSON.stringify({ drawMode }),
  });
  if (!res.ok) throw new Error(`Failed to set draw mode (${res.status})`);
  return res.json();
}

export async function grantUserApi(
  id: string,
  ownerToken: string,
  uid: string
): Promise<Permissions> {
  const res = await fetch(`${API_URL}/api/boards/${encodeURIComponent(id)}/permissions/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-owner-token": ownerToken },
    body: JSON.stringify({ uid }),
  });
  if (!res.ok) throw new Error(`Failed to grant access (${res.status})`);
  return res.json();
}

export async function revokeUserApi(
  id: string,
  ownerToken: string,
  uid: string
): Promise<Permissions> {
  const res = await fetch(`${API_URL}/api/boards/${encodeURIComponent(id)}/permissions/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-owner-token": ownerToken },
    body: JSON.stringify({ uid }),
  });
  if (!res.ok) throw new Error(`Failed to revoke access (${res.status})`);
  return res.json();
}
