import type { Element } from "./scene";

/** Camera maps board coordinates → screen pixels. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function boardToScreen(cam: Camera, x: number, y: number): [number, number] {
  return [(x - cam.x) * cam.zoom, (y - cam.y) * cam.zoom];
}

export function screenToBoard(cam: Camera, x: number, y: number): [number, number] {
  return [x / cam.zoom + cam.x, y / cam.zoom + cam.y];
}

/** Draw a single element in screen space. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  el: Element
): void {
  ctx.strokeStyle = el.stroke;
  ctx.fillStyle = el.stroke;
  ctx.lineWidth = el.strokeWidth * cam.zoom;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (el.type === "pen") {
    const pts = el.points;
    if (pts.length < 2) return;
    ctx.beginPath();
    const [sx, sy] = boardToScreen(cam, pts[0], pts[1]);
    ctx.moveTo(sx, sy);
    // Quadratic smoothing through midpoints for a clean ink feel.
    for (let i = 2; i < pts.length - 2; i += 2) {
      const [x0, y0] = boardToScreen(cam, pts[i], pts[i + 1]);
      const [x1, y1] = boardToScreen(cam, pts[i + 2], pts[i + 3]);
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const [ex, ey] = boardToScreen(cam, pts[pts.length - 2], pts[pts.length - 1]);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    return;
  }

  const [x, y] = boardToScreen(cam, el.x, el.y);
  const w = el.w * cam.zoom;
  const h = el.h * cam.zoom;

  if (el.type === "rect") {
    ctx.strokeRect(x, y, w, h);
  } else if (el.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === "line") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
}

/** Axis-aligned bounding box of an element in board coordinates. */
export function bounds(el: Element): { x: number; y: number; w: number; h: number } {
  if (el.type === "pen") {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < el.points.length; i += 2) {
      minX = Math.min(minX, el.points[i]);
      maxX = Math.max(maxX, el.points[i]);
      minY = Math.min(minY, el.points[i + 1]);
      maxY = Math.max(maxY, el.points[i + 1]);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const x = Math.min(el.x, el.x + el.w);
  const y = Math.min(el.y, el.y + el.h);
  return { x, y, w: Math.abs(el.w), h: Math.abs(el.h) };
}

/** Squared distance from point P to segment AB, in board units. */
function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

/**
 * Precise hit test for the eraser: true only when the point is within `pad`
 * board-units of the element's actual geometry (its stroke / outline), not its
 * bounding box. This is what stops nearby shapes from being erased together.
 */
export function hitTest(el: Element, px: number, py: number, pad: number): boolean {
  // Cheap bounding-box reject first (with padding), then exact distance.
  const b = bounds(el);
  if (
    px < b.x - pad ||
    px > b.x + b.w + pad ||
    py < b.y - pad ||
    py > b.y + b.h + pad
  ) {
    return false;
  }

  const padSq = pad * pad;

  if (el.type === "pen") {
    const p = el.points;
    if (p.length === 2) {
      const dx = p[0] - px;
      const dy = p[1] - py;
      return dx * dx + dy * dy <= padSq;
    }
    for (let i = 0; i + 3 < p.length; i += 2) {
      if (distSqToSegment(px, py, p[i], p[i + 1], p[i + 2], p[i + 3]) <= padSq) {
        return true;
      }
    }
    return false;
  }

  if (el.type === "line") {
    return distSqToSegment(px, py, el.x, el.y, el.x + el.w, el.y + el.h) <= padSq;
  }

  if (el.type === "rect") {
    const x0 = el.x;
    const y0 = el.y;
    const x1 = el.x + el.w;
    const y1 = el.y + el.h;
    // distance to the nearest of the 4 outline edges
    return (
      distSqToSegment(px, py, x0, y0, x1, y0) <= padSq ||
      distSqToSegment(px, py, x1, y0, x1, y1) <= padSq ||
      distSqToSegment(px, py, x1, y1, x0, y1) <= padSq ||
      distSqToSegment(px, py, x0, y1, x0, y0) <= padSq
    );
  }

  // ellipse: sample the outline into a polyline and test proximity to it.
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const rx = Math.abs(el.w / 2);
  const ry = Math.abs(el.h / 2);
  const STEPS = 48;
  let prevX = cx + rx;
  let prevY = cy;
  for (let i = 1; i <= STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2;
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    if (distSqToSegment(px, py, prevX, prevY, x, y) <= padSq) return true;
    prevX = x;
    prevY = y;
  }
  return false;
}

/**
 * Render the whole scene to an offscreen canvas sized to its content and
 * return a PNG blob — used for "Download as image".
 */
export function exportPng(elements: Element[], background: string): Promise<Blob> {
  const PAD = 48;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    const b = bounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1280;
    maxY = 720;
  }
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cam: Camera = { x: minX - PAD, y: minY - PAD, zoom: 1 };
  for (const el of elements) drawElement(ctx, cam, el);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? new Blob()), "image/png")
  );
}
