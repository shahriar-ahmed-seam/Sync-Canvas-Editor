"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Visibility } from "@/lib/api";
import type { ConnStatus, Peer } from "@/lib/use-board";
import type { LocalUser } from "@/lib/identity";

interface Props {
  boardName: string;
  isOwner: boolean;
  visibility: Visibility;
  status: ConnStatus;
  self: LocalUser;
  peers: Peer[];
  onRename: (name: string) => void;
  onShare: () => void;
  onExport: () => void;
  onManageAccess: () => void;
}

export default function TopBar({
  boardName,
  isOwner,
  visibility,
  status,
  self,
  peers,
  onRename,
  onShare,
  onExport,
  onManageAccess,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(boardName);
  useEffect(() => setDraft(boardName), [boardName]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" className="flex items-center gap-2" title="Home">
          <Image src="/logo.png" alt="Sync-Canvas" width={24} height={24} className="h-6 w-auto" />
        </Link>
        <div className="h-6 w-px bg-line" />

        {isOwner && editing ? (
          <input
            autoFocus
            className="field w-56 py-1.5"
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onRename(draft.trim() || boardName);
              setEditing(false);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.target as HTMLInputElement).blur()
            }
          />
        ) : (
          <button
            className="min-w-0 truncate text-sm font-medium text-paper disabled:cursor-default"
            disabled={!isOwner}
            onClick={() => setEditing(true)}
            title={isOwner ? "Rename" : boardName}
          >
            {boardName}
          </button>
        )}

        <span
          className={`label-mono border px-2 py-0.5 ${
            visibility === "public" ? "border-accent text-accent" : "border-line text-muted"
          }`}
        >
          {visibility}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ConnDot status={status} />
        <Presence self={self} peers={peers} />

        {isOwner && (
          <button className="btn-quiet px-2 py-1.5 text-xs" onClick={onManageAccess}>
            Access
          </button>
        )}
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onExport}>
          Export
        </button>
        <button className="btn-accent px-4 py-1.5 text-xs" onClick={onShare}>
          Share
        </button>
      </div>
    </header>
  );
}

function ConnDot({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { c: string; t: string }> = {
    connected: { c: "bg-[#12B886]", t: "Live" },
    connecting: { c: "bg-[#F2B705]", t: "Connecting" },
    disconnected: { c: "bg-accent", t: "Offline" },
  };
  const s = map[status];
  return (
    <span className="flex items-center gap-2" title={s.t}>
      <span className={`h-2 w-2 ${s.c}`} />
      <span className="label-mono hidden sm:inline">{s.t}</span>
    </span>
  );
}

function Presence({ self, peers }: { self: LocalUser; peers: Peer[] }) {
  const all = [{ id: self.id, name: self.name, color: self.color, you: true }].concat(
    peers.map((p) => ({ ...p.user, you: false }))
  );
  const shown = all.slice(0, 6);
  const extra = all.length - shown.length;

  return (
    <div className="flex items-center -space-x-1">
      {shown.map((u, i) => (
        <span
          key={u.id + i}
          title={u.you ? `${u.name} (you)` : u.name}
          className="flex h-7 w-7 items-center justify-center border border-surface text-[11px] font-semibold text-white"
          style={{ backgroundColor: u.color }}
        >
          {u.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?"}
        </span>
      ))}
      {extra > 0 && (
        <span className="flex h-7 w-7 items-center justify-center border border-surface bg-surface-2 text-[11px] text-muted">
          +{extra}
        </span>
      )}
    </div>
  );
}
