"use client";

import { customAlphabet } from "nanoid";

/**
 * Identity & local persistence. There is NO auth in Sync-Canvas: a user is just
 * a random id stored in this browser, the owner token proves you created a
 * board, and the board id itself is the only access credential. All of this
 * lives in localStorage — clear it and you lose your boards (by design).
 */

const nid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

const K_USER = "sc:user";
const K_OWNER_TOKENS = "sc:ownerTokens";
const K_HISTORY = "sc:history";

export interface LocalUser {
  id: string;
  name: string;
  color: string;
}

// A small, high-contrast palette for cursor colors. Sharp, not pastel.
const CURSOR_COLORS = [
  "#FF4D2E",
  "#2E7DFF",
  "#12B886",
  "#F2B705",
  "#9B5DE5",
  "#FF6FB5",
  "#19C3D6",
  "#FF8A1E",
];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getLocalUser(): LocalUser {
  const existing = read<LocalUser | null>(K_USER, null);
  if (existing) return existing;
  const user: LocalUser = {
    id: nid(),
    name: `Guest-${nid().slice(0, 4)}`,
    color: CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)],
  };
  write(K_USER, user);
  return user;
}

export function setUserName(name: string): LocalUser {
  const user = getLocalUser();
  const next = { ...user, name: name.trim().slice(0, 32) || user.name };
  write(K_USER, next);
  return next;
}

// ---- Owner tokens (which boards this browser owns) ------------------------

export function rememberOwnerToken(boardId: string, token: string): void {
  const map = read<Record<string, string>>(K_OWNER_TOKENS, {});
  map[boardId] = token;
  write(K_OWNER_TOKENS, map);
}

export function getOwnerToken(boardId: string): string | null {
  return read<Record<string, string>>(K_OWNER_TOKENS, {})[boardId] ?? null;
}

export function isOwner(boardId: string): boolean {
  return getOwnerToken(boardId) !== null;
}

// ---- Recent boards history ------------------------------------------------

export interface HistoryEntry {
  id: string;
  name: string;
  visibility: "public" | "private";
  lastOpened: number;
  owner: boolean;
}

export function getHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(K_HISTORY, []).sort((a, b) => b.lastOpened - a.lastOpened);
}

export function pushHistory(entry: Omit<HistoryEntry, "lastOpened">): void {
  const list = read<HistoryEntry[]>(K_HISTORY, []).filter((e) => e.id !== entry.id);
  list.unshift({ ...entry, lastOpened: Date.now() });
  write(K_HISTORY, list.slice(0, 40));
}

export function removeHistory(id: string): void {
  write(
    K_HISTORY,
    read<HistoryEntry[]>(K_HISTORY, []).filter((e) => e.id !== id)
  );
}
