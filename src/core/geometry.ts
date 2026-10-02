import { bounds, RAD, type Part } from "./shape.ts";

// Plane geometry for laying things out: boxes, and pushing convex shapes apart. Units are mm,
// x left to right, y front to back, angles anticlockwise in degrees.

export type Point = readonly [number, number];
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export { RAD };

/** The point (u, v) in a frame centred at `centre` and turned by `angle`. */
export function turn([cx, cy]: Point, u: number, v: number, angle: number): [number, number] {
  const cos = Math.cos(angle * RAD);
  const sin = Math.sin(angle * RAD);
  return [cx + u * cos - v * sin, cy + u * sin + v * cos];
}

export function boxOf(parts: Part[]): Box {
  const { left, right, front, back } = bounds(parts);
  return { x0: left, y0: front, x1: right, y1: back };
}

export function unionOf(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

export const grow = (b: Box, by: number): Box => ({ x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by });
export const shift = (b: Box, dx: number, dy: number): Box => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });

/** Rounds to the half millimetre, as files write positions. */
export const half = (v: number) => Math.round(v * 2) / 2 || 0;

/** Whether two spans overlap by more than half a millimetre. */
export const spansOverlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
export const boxesOverlap = (a: Box, b: Box) => spansOverlap(a.x0, a.x1, b.x0, b.x1) && spansOverlap(a.y0, a.y1, b.y0, b.y1);

export const boxPart = (b: Box): Part => ({ kind: "polygon", points: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] });

export function movePart(part: Part, dx: number, dy: number): Part {
  return part.kind === "circle"
    ? { ...part, centre: [part.centre[0] + dx, part.centre[1] + dy] }
    : { kind: "polygon", points: part.points.map(([x, y]) => [x + dx, y + dy] as const) };
}

/** A part as a polygon, anticlockwise. A circle becomes a polygon just outside it, so pushing polygons apart clears the circle too. */
export function polygon(part: Part, sides = 32): Point[] {
  if (part.kind === "polygon") return part.points;
  const r = part.radius / Math.cos(Math.PI / sides);
  return Array.from({ length: sides }, (_, i) => [part.centre[0] + r * Math.cos((i / sides) * 2 * Math.PI), part.centre[1] + r * Math.sin((i / sides) * 2 * Math.PI)] as const);
}

/** The shortest push that moves convex polygon P off Q, or null when they don't overlap. */
export function push(P: Point[], Q: Point[]): { x: number; y: number; depth: number } | null {
  let best: { x: number; y: number; depth: number } | null = null;
  for (const poly of [P, Q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      let nx = -(y2 - y1);
      let ny = x2 - x1;
      const length = Math.hypot(nx, ny);
      if (!length) continue;
      nx /= length;
      ny /= length;
      const [p0, p1] = project(P, nx, ny);
      const [q0, q1] = project(Q, nx, ny);
      const depth = Math.min(p1, q1) - Math.max(p0, q0);
      if (depth <= 0.01) return null;
      if (!best || depth < best.depth) {
        const away = (p0 + p1) / 2 < (q0 + q1) / 2 ? -1 : 1;
        best = { x: nx * depth * away, y: ny * depth * away, depth };
      }
    }
  }
  return best;
}

function project(points: Point[], nx: number, ny: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of points) {
    const along = x * nx + y * ny;
    lo = Math.min(lo, along);
    hi = Math.max(hi, along);
  }
  return [lo, hi];
}
