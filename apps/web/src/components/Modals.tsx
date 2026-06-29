"use client";

import { useEffect, useState } from "react";
import type { UseBoard } from "@/lib/use-board";
import type { Visibility } from "@/lib/api";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="label-mono text-paper">{title}</h3>
          <button className="btn-quiet px-2 py-1" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ShareDialog({
  boardId,
  visibility,
  onClose,
}: {
  boardId: string;
  visibility: Visibility;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"id" | "link" | null>(null);
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/board/${boardId}` : "";

  async function copy(value: string, which: "id" | "link") {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Modal title="Share board" onClose={onClose}>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Anyone with this link can open the board.{" "}
        {visibility === "public"
          ? "Since it's public, they can draw right away."
          : "Since it's private, only people you grant access to can draw."}
      </p>

      <label className="label-mono mb-2 block">Board link</label>
      <div className="mb-5 flex gap-2">
        <input readOnly value={link} className="field font-mono text-xs" />
        <button className="btn-ghost shrink-0" onClick={() => copy(link, "link")}>
          {copied === "link" ? "Copied" : "Copy"}
        </button>
      </div>

      <label className="label-mono mb-2 block">Board ID</label>
      <div className="flex gap-2">
        <input readOnly value={boardId} className="field font-mono text-xs" />
        <button className="btn-ghost shrink-0" onClick={() => copy(boardId, "id")}>
          {copied === "id" ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-6 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-muted">
        There is no recovery. If this ID is lost and removed from everyone&apos;s
        history, the board is gone forever.
      </p>
    </Modal>
  );
}

export function AccessPanel({
  board,
  onVisibilityChange,
  visibility,
  onClose,
}: {
  board: UseBoard;
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Access & permissions" onClose={onClose}>
      <label className="label-mono mb-2 block">Visibility</label>
      <div className="mb-6 flex border border-line">
        {(["public", "private"] as Visibility[]).map((v) => (
          <button
            key={v}
            onClick={() => onVisibilityChange(v)}
            className={`flex-1 px-4 py-2 text-sm capitalize transition-colors ${
              visibility === v ? "bg-accent text-accent-ink" : "hover:bg-surface-2"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <label className="label-mono mb-2 block">Who can draw</label>
      <div className="mb-6 flex border border-line">
        {(
          [
            ["everyone", "Everyone"],
            ["owner", "Only people I allow"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => board.setDrawMode(mode)}
            className={`flex-1 px-4 py-2 text-xs transition-colors ${
              board.drawMode === mode ? "bg-surface-2 text-paper" : "text-muted hover:text-paper"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="label-mono mb-2 block">People here now</label>
      <div className="max-h-56 divide-y divide-line overflow-y-auto border border-line">
        {board.peers.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted">Nobody else is here yet.</p>
        )}
        {board.peers.map((p) => {
          const allowed = board.drawMode === "everyone" || board.allowedIds.has(p.user.id);
          return (
            <div key={p.clientId} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-5 w-5" style={{ backgroundColor: p.user.color }} />
                <span className="text-sm">{p.user.name}</span>
              </div>
              {board.drawMode === "everyone" ? (
                <span className="label-mono">can draw</span>
              ) : board.allowedIds.has(p.user.id) ? (
                <button
                  className="btn-quiet px-2 py-1 text-xs hover:text-accent"
                  onClick={() => board.revoke(p.user.id)}
                >
                  Revoke
                </button>
              ) : (
                <button
                  className="btn-ghost px-3 py-1 text-xs"
                  onClick={() => board.grant(p.user.id)}
                >
                  Allow
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
