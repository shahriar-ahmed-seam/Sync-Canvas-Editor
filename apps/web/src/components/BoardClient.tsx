"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBoard, updateBoard, type BoardMeta, type Visibility } from "@/lib/api";
import {
  getLocalUser,
  getOwnerToken,
  pushHistory,
  type LocalUser,
} from "@/lib/identity";
import { exportPng } from "@/lib/render";
import type { Tool } from "@/lib/scene";
import { useBoard } from "@/lib/use-board";
import Canvas from "./Canvas";
import Toolbar from "./Toolbar";
import TopBar from "./TopBar";
import { AccessPanel, ShareDialog } from "./Modals";

type LoadState =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "error" }
  | { phase: "ready"; meta: BoardMeta; self: LocalUser };

export default function BoardClient({ boardId }: { boardId: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await getBoard(boardId);
        if (cancelled) return;
        if (!meta) return setState({ phase: "missing" });
        const self = getLocalUser();
        pushHistory({
          id: meta.id,
          name: meta.name,
          visibility: meta.visibility,
          owner: getOwnerToken(meta.id) !== null,
        });
        setState({ phase: "ready", meta, self });
      } catch {
        if (!cancelled) setState({ phase: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  if (state.phase === "loading") return <Splash text="Opening board…" />;
  if (state.phase === "error")
    return <Splash text="Can't reach the server." sub="Is the backend running?" />;
  if (state.phase === "missing") return <NotFound boardId={boardId} />;

  return <Workspace boardId={boardId} meta={state.meta} self={state.self} />;
}

function Workspace({
  boardId,
  meta,
  self,
}: {
  boardId: string;
  meta: BoardMeta;
  self: LocalUser;
}) {
  const board = useBoard(boardId, self);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#0B0C0E");
  const [strokeWidth, setStrokeWidth] = useState(4);

  const [name, setName] = useState(meta.name);
  const [visibility, setVisibility] = useState<Visibility>(meta.visibility);
  const [shareOpen, setShareOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const ownerToken = useMemo(() => getOwnerToken(boardId), [boardId]);

  // Undo / redo keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (!board.canDraw) return;
      if (e.shiftKey) board.redo();
      else board.undo();
    };
    // Ctrl+Y as an alternate redo (common on Windows)
    const onKeyY = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (board.canDraw) board.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onKeyY);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onKeyY);
    };
  }, [board]);

  async function patch(p: { name?: string; visibility?: Visibility }) {
    if (!ownerToken) return;
    try {
      const updated = await updateBoard(boardId, ownerToken, p);
      setName(updated.name);
      setVisibility(updated.visibility);
    } catch {
      /* keep optimistic local value */
    }
  }

  async function handleExport() {
    const blob = await exportPng(board.elements, "#F4EFE3");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "board"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        boardName={name}
        isOwner={board.isOwner}
        visibility={visibility}
        status={board.status}
        self={board.self}
        peers={board.peers}
        onRename={(n) => {
          setName(n);
          void patch({ name: n });
        }}
        onShare={() => setShareOpen(true)}
        onExport={handleExport}
        onManageAccess={() => setAccessOpen(true)}
      />

      <div className="relative flex-1">
        <Canvas board={board} tool={tool} color={color} strokeWidth={strokeWidth} />

        {!board.canDraw && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-line bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            View only — ask the owner for draw access
          </div>
        )}

        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
          <Toolbar
            tool={tool}
            setTool={setTool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            canDraw={board.canDraw}
            canUndo={board.canUndo}
            canRedo={board.canRedo}
            onUndo={board.undo}
            onRedo={board.redo}
            onClear={() => {
              if (confirm("Clear the entire board for everyone?")) board.clear();
            }}
          />
        </div>
      </div>

      {shareOpen && (
        <ShareDialog
          boardId={boardId}
          visibility={visibility}
          onClose={() => setShareOpen(false)}
        />
      )}
      {accessOpen && board.isOwner && (
        <AccessPanel
          board={board}
          visibility={visibility}
          onVisibilityChange={(v) => {
            setVisibility(v);
            void patch({ visibility: v });
          }}
          onClose={() => setAccessOpen(false)}
        />
      )}
    </div>
  );
}

function Splash({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="grid-backdrop flex h-screen flex-col items-center justify-center gap-2">
      <div className="mb-4 h-8 w-8 animate-pulse bg-accent" />
      <p className="font-mono text-sm tracking-widest text-paper">{text}</p>
      {sub && <p className="font-mono text-xs text-muted">{sub}</p>}
    </div>
  );
}

function NotFound({ boardId }: { boardId: string }) {
  return (
    <div className="grid-backdrop flex h-screen flex-col items-center justify-center px-6 text-center">
      <p className="label-mono mb-4 text-accent">404 · No such board</p>
      <h1 className="max-w-lg text-3xl font-bold tracking-tight">
        This board doesn&apos;t exist — or it&apos;s gone forever.
      </h1>
      <p className="mt-4 max-w-md font-mono text-xs leading-relaxed text-muted">
        /{boardId}
        <br />
        Boards have no recovery. If the ID was lost or expired, there&apos;s
        nothing left to load.
      </p>
      <Link href="/" className="btn-accent mt-8">
        Create a new board →
      </Link>
    </div>
  );
}
