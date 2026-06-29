"use client";

import type { Tool } from "@/lib/scene";

const TOOLS: { id: Tool; label: string; glyph: string }[] = [
  { id: "select", label: "Pan / select", glyph: "✥" },
  { id: "pen", label: "Pen", glyph: "✎" },
  { id: "line", label: "Line", glyph: "╱" },
  { id: "rect", label: "Rectangle", glyph: "▢" },
  { id: "ellipse", label: "Ellipse", glyph: "◯" },
  { id: "eraser", label: "Eraser", glyph: "⌫" },
];

const COLORS = ["#0B0C0E", "#FF4D2E", "#2E7DFF", "#12B886", "#F2B705", "#9B5DE5"];
const WIDTHS = [2, 4, 8, 16];

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  canDraw: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  canDraw,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: Props) {
  return (
    <div className="pointer-events-auto flex items-stretch gap-px border border-line bg-line shadow-lg">
      {/* History */}
      <div className="flex bg-surface">
        <button
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canDraw || !canUndo}
          className="flex h-12 w-11 items-center justify-center text-lg text-paper transition-colors hover:bg-surface-2 disabled:opacity-25"
        >
          ↶
        </button>
        <button
          title="Redo (Ctrl+Shift+Z)"
          onClick={onRedo}
          disabled={!canDraw || !canRedo}
          className="flex h-12 w-11 items-center justify-center text-lg text-paper transition-colors hover:bg-surface-2 disabled:opacity-25"
        >
          ↷
        </button>
      </div>

      {/* Tools */}
      <div className="flex bg-surface">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setTool(t.id)}
            className={`flex h-12 w-12 items-center justify-center text-lg transition-colors ${
              tool === t.id
                ? "bg-accent text-accent-ink"
                : "text-paper hover:bg-surface-2"
            }`}
          >
            {t.glyph}
          </button>
        ))}
      </div>

      {/* Colors */}
      <div className="flex items-center gap-2 bg-surface px-3">
        {COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => setColor(c)}
            disabled={!canDraw}
            className={`h-6 w-6 border-2 transition-transform disabled:opacity-30 ${
              color === c ? "border-paper scale-110" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Stroke widths */}
      <div className="flex items-center gap-1 bg-surface px-3">
        {WIDTHS.map((w) => (
          <button
            key={w}
            title={`${w}px`}
            onClick={() => setStrokeWidth(w)}
            disabled={!canDraw}
            className={`flex h-10 w-9 items-center justify-center disabled:opacity-30 ${
              strokeWidth === w ? "bg-surface-2" : "hover:bg-surface-2"
            }`}
          >
            <span
              className="block rounded-none bg-paper"
              style={{ width: 20, height: Math.max(2, w / 1.5) }}
            />
          </button>
        ))}
      </div>

      {/* Destructive */}
      <div className="flex bg-surface">
        <button
          title="Clear board"
          onClick={onClear}
          disabled={!canDraw}
          className="flex h-12 items-center px-4 font-mono text-[11px] uppercase tracking-widest text-muted hover:text-accent disabled:opacity-30"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
