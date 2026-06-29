"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createBoard, type Visibility } from "@/lib/api";
import {
  getHistory,
  getLocalUser,
  pushHistory,
  rememberOwnerToken,
  removeHistory,
  setUserName,
  type HistoryEntry,
} from "@/lib/identity";

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    setHistory(getHistory());
    setDisplayName(getLocalUser().name);
  }, []);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const board = await createBoard({
        name: name.trim() || "Untitled board",
        visibility,
      });
      rememberOwnerToken(board.id, board.ownerToken);
      pushHistory({
        id: board.id,
        name: board.name,
        visibility: board.visibility,
        owner: true,
      });
      router.push(`/board/${board.id}`);
    } catch (e) {
      setError("Could not reach the server. Is the backend running?");
      setBusy(false);
    }
  }

  function handleJoin() {
    const id = joinId.trim().replace(/.*\/board\//, "");
    if (id) router.push(`/board/${encodeURIComponent(id)}`);
  }

  return (
    <main className="min-h-screen">
      <Header
        name={displayName}
        onRename={(n) => setDisplayName(setUserName(n).name)}
      />

      <section className="relative isolate overflow-hidden border-b border-line">
        {/* Hero image, full-bleed behind the content */}
        <Image
          src="/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Warm scrims keep the left-hand copy legible over the image */}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-transparent to-ink/40" />

        <div className="relative mx-auto flex max-w-shell flex-col gap-12 px-6 py-24 lg:flex-row lg:items-center lg:py-32">
          {/* Pitch */}
          <div className="flex-1">
            <p className="label-mono mb-6">CRDT-Powered · Real-Time</p>
            <h1 className="max-w-xl text-5xl font-bold leading-[0.95] tracking-tightest text-paper sm:text-6xl">
              Draw together.
              <br />
              <span className="text-accent">Conflict-free.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
              A collaborative whiteboard built on conflict-free replicated data
              types. Edit offline, reconnect, and your strokes merge cleanly —
              no overwrites, no lost work. Live cursors show who&apos;s drawing
              where.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <FeatureTag>Offline → online merge</FeatureTag>
              <FeatureTag>Live named cursors</FeatureTag>
              <FeatureTag>No sign-up</FeatureTag>
            </div>
          </div>

          {/* Actions */}
          <div className="w-full max-w-md">
            <div className="panel bg-surface/95 p-8 shadow-2xl backdrop-blur-sm">
              <p className="label-mono mb-3">New board</p>
              <input
                className="field"
                placeholder="Board name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="mt-4 flex border border-line">
                <VisibilityOption
                  active={visibility === "public"}
                  onClick={() => setVisibility("public")}
                  title="Public"
                  desc="Anyone with the link can draw"
                />
                <VisibilityOption
                  active={visibility === "private"}
                  onClick={() => setVisibility("private")}
                  title="Private"
                  desc="Only people you allow can draw"
                />
              </div>

              <button
                className="btn-accent mt-5 w-full"
                onClick={handleCreate}
                disabled={busy}
              >
                {busy ? "Creating…" : "Create board →"}
              </button>

              {error && (
                <p className="mt-3 font-mono text-xs text-accent">{error}</p>
              )}

              <div className="mt-8 border-t border-line pt-6">
                <p className="label-mono mb-3">Join with an ID or link</p>
                <div className="flex gap-2">
                  <input
                    className="field"
                    placeholder="e.g. 7kq3p2m9xz4f"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                  <button className="btn-ghost shrink-0" onClick={handleJoin}>
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RecentBoards
        history={history}
        onRemove={(id) => {
          removeHistory(id);
          setHistory(getHistory());
        }}
        onOpen={(id) => router.push(`/board/${id}`)}
      />

      <Footer />
    </main>
  );
}

function Header({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-4">
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Sync-Canvas" width={28} height={28} priority className="h-7 w-auto" />
        <span className="font-mono text-sm font-semibold tracking-widest">
          SYNC-CANVAS
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="label-mono">You</span>
        {editing ? (
          <input
            autoFocus
            className="field w-40 py-1.5"
            value={draft}
            maxLength={32}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onRename(draft);
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button className="btn-ghost py-1.5" onClick={() => setEditing(true)}>
            {name || "Guest"}
          </button>
        )}
      </div>
    </header>
  );
}

function FeatureTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted">
      {children}
    </span>
  );
}

function VisibilityOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-left transition-colors ${
        active ? "bg-accent text-accent-ink" : "bg-transparent text-paper hover:bg-surface-2"
      }`}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span
        className={`mt-0.5 block text-[11px] ${active ? "text-accent-ink/70" : "text-muted"}`}
      >
        {desc}
      </span>
    </button>
  );
}

function RecentBoards({
  history,
  onOpen,
  onRemove,
}: {
  history: HistoryEntry[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const hasHistory = history.length > 0;
  const subtitle = useMemo(
    () =>
      hasHistory
        ? "Stored only in this browser. Lose it and the board is gone forever."
        : "Boards you create or open will appear here — kept only in this browser.",
    [hasHistory]
  );

  return (
    <section className="mx-auto max-w-shell px-6 py-20">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="label-mono mb-2">History</p>
          <h2 className="text-2xl font-semibold tracking-tight">Recent boards</h2>
        </div>
        <p className="max-w-xs text-right text-xs text-muted">{subtitle}</p>
      </div>

      {hasHistory ? (
        <div className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {history.map((b) => (
            <div key={b.id} className="group flex flex-col justify-between bg-surface p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 ${b.visibility === "public" ? "bg-accent" : "bg-muted"}`}
                  />
                  <span className="truncate text-sm font-medium">{b.name}</span>
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted">/{b.id}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <span className="label-mono">
                  {b.owner ? "Owner" : b.visibility}
                </span>
                <div className="flex gap-2">
                  <button className="btn-quiet px-2 py-1 text-xs" onClick={() => onRemove(b.id)}>
                    Forget
                  </button>
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => onOpen(b.id)}>
                    Open
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-line p-12 text-center font-mono text-sm text-muted">
          No boards yet.
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line px-6 py-8">
      <div className="mx-auto flex max-w-shell items-center justify-between">
        <span className="font-mono text-xs text-muted">
          SYNC-CANVAS · CRDT WHITEBOARD
        </span>
        <span className="font-mono text-xs text-muted">Yjs · WebSocket · Redis</span>
      </div>
    </footer>
  );
}
