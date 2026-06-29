"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  boardToScreen,
  drawElement,
  hitTest,
  screenToBoard,
  type Camera,
} from "@/lib/render";
import type { Element, Tool } from "@/lib/scene";
import type { UseBoard } from "@/lib/use-board";

const PAPER = "#F4EFE3";
const GRID = "rgba(18,16,11,0.06)";

interface Props {
  board: UseBoard;
  tool: Tool;
  color: string;
  strokeWidth: number;
}

type Pointer = { boardX: number; boardY: number; screenX: number; screenY: number };

export default function Canvas({ board, tool, color, strokeWidth }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const [, forceCursors] = useState(0); // re-render overlay when camera moves

  // Active interaction state (kept in refs to avoid re-renders mid-stroke).
  const draftRef = useRef<Element | null>(null);
  const drawingRef = useRef(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const spaceRef = useRef(false);
  const erasedRef = useRef<Set<string>>(new Set());

  const frameRef = useRef<number | null>(null);

  // `schedule` is stable but must always invoke the LATEST paint(). Routing
  // through a ref avoids a stale closure that would otherwise render an old
  // (often empty) element list mid-stroke, making existing strokes vanish
  // until the next state change.
  const paintRef = useRef<() => void>(() => {});

  const schedule = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paintRef.current();
    });
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cam = camRef.current;

    // paper
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cw, ch);

    // grid (every 32 board units)
    const step = 32 * cam.zoom;
    if (step > 6) {
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      const ox = (-cam.x * cam.zoom) % step;
      const oy = (-cam.y * cam.zoom) % step;
      ctx.beginPath();
      for (let x = ox; x < cw; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, ch);
      }
      for (let y = oy; y < ch; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(cw, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    const erasing = drawingRef.current && erasedRef.current.size > 0;
    for (const el of board.elements) {
      if (erasing && erasedRef.current.has(el.id)) continue; // live erase preview
      drawElement(ctx, cam, el);
    }
    if (draftRef.current) drawElement(ctx, cam, draftRef.current);
  }, [board.elements]);

  // Keep the scheduler pointed at the latest paint closure.
  useEffect(() => {
    paintRef.current = paint;
  }, [paint]);

  // Repaint when elements or viewport change.
  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const ro = new ResizeObserver(() => paint());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [paint]);

  // --- keyboard: hold space to pan ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function pointerInfo(e: React.PointerEvent): Pointer {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [bx, by] = screenToBoard(camRef.current, sx, sy);
    return { boardX: bx, boardY: by, screenX: sx, screenY: sy };
  }

  const isPanning = (e: React.PointerEvent) =>
    spaceRef.current || tool === "select" || e.button === 1;

  function onPointerDown(e: React.PointerEvent) {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = pointerInfo(e);

    if (isPanning(e)) {
      panRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!board.canDraw) return;

    if (tool === "eraser") {
      drawingRef.current = true;
      erasedRef.current = new Set();
      eraseAt(p);
      return;
    }

    drawingRef.current = true;
    const baseEl = {
      id: nanoid(12),
      stroke: color,
      strokeWidth,
      author: board.self.id,
      authorName: board.self.name,
      createdAt: Date.now(),
    };
    if (tool === "pen") {
      draftRef.current = { ...baseEl, type: "pen", points: [p.boardX, p.boardY] };
    } else if (tool === "line" || tool === "rect" || tool === "ellipse") {
      draftRef.current = { ...baseEl, type: tool, x: p.boardX, y: p.boardY, w: 0, h: 0 };
    }
    schedule();
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pointerInfo(e);
    board.setCursor({ x: p.boardX, y: p.boardY }, drawingRef.current);

    if (panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = { x: e.clientX, y: e.clientY };
      camRef.current.x -= dx / camRef.current.zoom;
      camRef.current.y -= dy / camRef.current.zoom;
      forceCursors((n) => n + 1);
      schedule();
      return;
    }

    if (!drawingRef.current) return;

    if (tool === "eraser") {
      eraseAt(p);
      return;
    }

    const draft = draftRef.current;
    if (!draft) return;
    if (draft.type === "pen") {
      draft.points.push(p.boardX, p.boardY);
    } else {
      draft.w = p.boardX - draft.x;
      draft.h = p.boardY - draft.y;
    }
    schedule();
  }

  function onPointerUp() {
    panRef.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    board.setCursor(null, false);

    if (tool === "eraser") {
      board.removeEls(erasedRef.current);
      erasedRef.current = new Set();
      return;
    }

    const draft = draftRef.current;
    draftRef.current = null;
    if (!draft) return;
    // Discard accidental zero-size shapes / single-point strokes.
    if (draft.type === "pen" && draft.points.length >= 4) board.addEl(draft);
    if (draft.type !== "pen" && (Math.abs(draft.w) > 2 || Math.abs(draft.h) > 2)) {
      board.addEl(draft);
    }
    schedule();
  }

  function eraseAt(p: Pointer) {
    // A small, fixed-size eraser brush (~6px on screen), expanded by each
    // element's own stroke half-width so thick strokes stay easy to hit.
    const base = 6 / camRef.current.zoom;
    for (const el of board.elements) {
      if (erasedRef.current.has(el.id)) continue;
      if (hitTest(el, p.boardX, p.boardY, base + el.strokeWidth / 2)) {
        erasedRef.current.add(el.id);
      }
    }
    // Live preview: hide erased elements immediately by repainting without them.
    schedule();
  }

  function onWheel(e: React.WheelEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cam = camRef.current;
    const [bx, by] = screenToBoard(cam, sx, sy);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    cam.zoom = Math.min(8, Math.max(0.15, cam.zoom * factor));
    // keep the point under the cursor fixed
    cam.x = bx - sx / cam.zoom;
    cam.y = by - sy / cam.zoom;
    forceCursors((n) => n + 1);
    schedule();
  }

  const cursorClass =
    panRef.current || tool === "select"
      ? "cursor-grab"
      : board.canDraw
      ? "cursor-crosshair"
      : "cursor-not-allowed";

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-paper">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${cursorClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />
      <CursorsOverlay board={board} cam={camRef.current} />
    </div>
  );
}

/** Named cursors for everyone else in the room. */
function CursorsOverlay({ board, cam }: { board: UseBoard; cam: Camera }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {board.peers.map((peer) => {
        if (!peer.cursor) return null;
        const [x, y] = boardToScreen(cam, peer.cursor.x, peer.cursor.y);
        return (
          <div
            key={peer.clientId}
            className="absolute will-change-transform"
            style={{ transform: `translate(${x}px, ${y}px)` }}
          >
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
              <path
                d="M1 1L1 16.5L5 12.5L7.5 19L10 18L7.5 11.5H13L1 1Z"
                fill={peer.user.color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            <span
              className="ml-3 inline-block px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: peer.user.color }}
            >
              {peer.user.name}
              {peer.drawing ? " ✎" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
