import * as Y from "yjs";

/**
 * The shared scene lives entirely inside a Y.Doc so every edit is a CRDT
 * operation that merges conflict-free across clients (including after going
 * offline). Structure:
 *
 *   doc.getArray("elements") : Y.Array<Y.Map>   — every stroke / shape
 *
 * NOTE: draw permissions are deliberately NOT stored in the doc. They are
 * server-authoritative (Redis + owner-token REST) so they can't be tampered
 * with via raw CRDT updates. See lib/api.ts + the server's room enforcement.
 */

export type Tool = "select" | "pen" | "line" | "rect" | "ellipse" | "eraser";

export interface BaseElement {
  id: string;
  stroke: string;
  strokeWidth: number;
  author: string;
  authorName: string;
  createdAt: number;
}

export interface PathElement extends BaseElement {
  type: "pen";
  /** Flat [x0, y0, x1, y1, ...] in board coordinates. */
  points: number[];
}

export interface ShapeElement extends BaseElement {
  type: "line" | "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Element = PathElement | ShapeElement;

export function getElements(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>("elements");
}

/** Convert a Y.Map element into a plain object for rendering. */
export function toElement(m: Y.Map<unknown>): Element | null {
  const type = m.get("type") as Element["type"] | undefined;
  if (!type) return null;
  const base: BaseElement = {
    id: m.get("id") as string,
    stroke: (m.get("stroke") as string) ?? "#0B0C0E",
    strokeWidth: (m.get("strokeWidth") as number) ?? 3,
    author: (m.get("author") as string) ?? "",
    authorName: (m.get("authorName") as string) ?? "",
    createdAt: (m.get("createdAt") as number) ?? 0,
  };
  if (type === "pen") {
    return { ...base, type, points: (m.get("points") as number[]) ?? [] };
  }
  return {
    ...base,
    type,
    x: (m.get("x") as number) ?? 0,
    y: (m.get("y") as number) ?? 0,
    w: (m.get("w") as number) ?? 0,
    h: (m.get("h") as number) ?? 0,
  };
}

export function readElements(doc: Y.Doc): Element[] {
  const out: Element[] = [];
  getElements(doc).forEach((m) => {
    const el = toElement(m);
    if (el) out.push(el);
  });
  return out;
}

/** Append a finished element to the shared array inside one transaction. */
export function addElement(doc: Y.Doc, el: Element): void {
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    Object.entries(el).forEach(([k, v]) => m.set(k, v));
    getElements(doc).push([m]);
  });
}

/** Remove elements by id (used by the eraser and undo). */
export function removeElements(doc: Y.Doc, ids: Set<string>): void {
  if (ids.size === 0) return;
  const arr = getElements(doc);
  doc.transact(() => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const id = arr.get(i).get("id") as string;
      if (ids.has(id)) arr.delete(i, 1);
    }
  });
}

export function clearScene(doc: Y.Doc): void {
  const arr = getElements(doc);
  doc.transact(() => arr.delete(0, arr.length));
}
