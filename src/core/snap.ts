import { boxesOverlap, boxOf, grow, half, polygon, push, spansOverlap, unionOf, type Box, type Point } from "./geometry.ts";
import { heldByPegs, lower, partsAt, partsHit, type Plan, type PlannedThing } from "./plan.ts";
import type { Part } from "./shape.ts";

// Moving things by hand. Rules, strongest first: things never overlap, so a thing pushed into a
// neighbour stops against it. On a bare floor a thing is pulled so its holder touches the next
// one (small gaps look like mistakes and let holders slide), then to continue the lines of
// nearby things, then to the middle of a space. On Gridfinity it's pulled to sit centred in
// whole cells. On a pegboard the pegs decide, so nothing pulls: it seats instead. Pulls fade
// with distance.

/** A pull the move gave in to, to explain it on the plan. */
export interface Snap {
  kind: "touch" | "align" | "centre";
  /** Where the moving body's leading edge (x0 or y0) ends up. */
  at: number;
  /** What it touches or lines up with; null for a wall. */
  ref: { id: string; box: Box; shared: boolean } | null;
  /** For a touch, whether it's the body's low edge (left or front). */
  lead?: boolean;
  /** For an align, which edge: 0 low, 1 high, 0.5 centre. */
  edge?: number;
  /** For a centre, the space it's centred in. */
  lo?: number;
  hi?: number;
}

export interface Move {
  dx: number;
  dy: number;
  x: Snap | null;
  y: Snap | null;
}

/** The things being moved, as one: their claimed space, and their real outline. */
export interface Body {
  ids: string[];
  things: PlannedThing[];
  /** The space they claim with their holders' padding. */
  box: Box;
  /** Their outline's bounds. */
  raw: Box;
  zone: string | null;
}

export function bodyOf(p: Plan, ids: string[]): Body {
  const things = ids.map((id) => p.things.find((t) => t.id === id)!).filter(Boolean);
  return {
    ids,
    things,
    box: unionOf(things.map((t) => (t.aside ? t.box : t.claim))),
    raw: unionOf(things.map((t) => t.box)),
    zone: things.every((t) => t.zone === things[0].zone) ? things[0].zone ?? null : null,
  };
}

interface Other {
  id: string;
  box: Box;
  zone?: string;
  shared: boolean;
  parts: Part[];
}

function othersFor(p: Plan, body: Body): Other[] {
  const holders = new Set(body.things.map((t) => t.holder?.id));
  const things = p.placed
    .filter((o) => !body.ids.includes(o.id))
    .map((o) => {
      // Things sharing a holder pack by their own outlines; others by the space they claim.
      const shared = !!o.holder && holders.has(o.holder.id);
      return { id: o.id, box: shared ? o.box : o.claim, zone: o.zone, shared, parts: o.parts };
    });
  return [...things, ...p.obstructions.map((o) => ({ id: o.name, box: o.box, shared: false, parts: [o.part] }))];
}

type Candidate = Snap & { strength: number; reach: number };

/** The strongest pull on one axis, and how strong it is, fading to 0 at the edge of its reach. */
function snapAxis(p: Plan, body: Body, x: number, y: number, axis: "x" | "y", others: Other[]): { snap: Snap; score: number } | null {
  const w = body.box.x1 - body.box.x0;
  const d = body.box.y1 - body.box.y0;
  const span = axis === "x" ? p.width : p.depth;
  const size = axis === "x" ? w : d;
  const { edge_margin: margin, gap } = p.rules;
  const pos = axis === "x" ? x : y;
  const lo = (b: Box) => (axis === "x" ? b.x0 : b.y0);
  const len = (b: Box) => (axis === "x" ? b.x1 - b.x0 : b.y1 - b.y0);
  const across = (b: Box) => (axis === "x" ? spansOverlap(y - 30, y + d + 30, b.y0, b.y1) : spansOverlap(x - 30, x + w + 30, b.x0, b.x1));
  const nearby = (b: Box) => (axis === "x" ? Math.abs((b.y0 + b.y1) / 2 - (y + d / 2)) < 320 : Math.abs((b.x0 + b.x1) / 2 - (x + w / 2)) < 420);

  const C: Candidate[] = [
    { kind: "touch", at: margin, strength: 3, reach: 30, ref: null, lead: true },
    { kind: "touch", at: span - margin - size, strength: 3, reach: 30, ref: null, lead: false },
  ];
  let left = margin;
  let right = span - margin;
  for (const o of others) {
    const b = o.box;
    const same = o.zone && o.zone === body.zone ? 1.4 : 1;
    const g = o.shared ? 2 : gap;
    const ref = { id: o.id, box: b, shared: o.shared };
    if (across(b)) {
      C.push(
        { kind: "touch", at: lo(b) + len(b) + g, strength: 3 * same, reach: 30, ref, lead: true },
        { kind: "touch", at: lo(b) - size - g, strength: 3 * same, reach: 30, ref, lead: false },
      );
      if (lo(b) + len(b) <= pos + 1) left = Math.max(left, lo(b) + len(b));
      if (lo(b) >= pos + size - 1) right = Math.min(right, lo(b));
    } else if (nearby(b)) {
      C.push(
        { kind: "align", at: lo(b), strength: 2 * same, reach: 14, ref, edge: 0 },
        { kind: "align", at: lo(b) + len(b) - size, strength: 2 * same, reach: 14, ref, edge: 1 },
        { kind: "align", at: lo(b) + len(b) / 2 - size / 2, strength: 1.2 * same, reach: 9, ref, edge: 0.5 },
      );
    }
  }
  if (right - left > size + 10) C.push({ kind: "centre", at: (left + right) / 2 - size / 2, strength: 1, reach: 10, ref: null, lo: left, hi: right });

  let best: { snap: Snap; score: number } | null = null;
  for (const { strength, reach, ...snap } of C) {
    const distance = Math.abs(pos - snap.at);
    if (distance >= reach) continue;
    const score = strength * (1 - distance / reach);
    if (!best || score > best.score) best = { snap, score };
  }
  return best;
}

/**
 * Where a body ends up when dragged by (rdx, rdy): pulled by the rules unless `free`, then
 * pushed out of the walls and its neighbours on their real outlines. Null when it can't get free.
 */
export function solve(p: Plan, ids: string[], rdx: number, rdy: number, free: boolean): Move | null {
  const body = bodyOf(p, ids);
  const others = othersFor(p, body);
  let x = body.box.x0 + rdx;
  let y = body.box.y0 + rdy;
  let sx: Snap | null = null;
  let sy: Snap | null = null;
  const grid = p.base.grid;
  if (!free && grid) {
    // Gridfinity: centre the things in whole cells.
    const w = body.box.x1 - body.box.x0;
    const d = body.box.y1 - body.box.y0;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const cell = grid.pitch / 2;
    const tx = grid.ox + Math.round((cx - grid.ox) / cell) * cell;
    const ty = grid.oy + Math.round((cy - grid.oy) / cell) * cell;
    if (Math.abs(tx - cx) < 12) x = tx - w / 2;
    if (Math.abs(ty - cy) < 12) y = ty - d / 2;
  } else if (!free && !p.base.board) {
    // Each pull draws the body part of the way, all of it when strong.
    const px = snapAxis(p, body, x, y, "x", others);
    if (px) x += (px.snap.at - x) * Math.min(1, px.score * 1.2);
    const py = snapAxis(p, body, x, y, "y", others);
    if (py) y += (py.snap.at - y) * Math.min(1, py.score * 1.2);
    sx = px?.snap ?? null;
    sy = py?.snap ?? null;
    if (sx && Math.abs(x - sx.at) < 1) x = sx.at;
    else sx = null;
    if (sy && Math.abs(y - sy.at) < 1) y = sy.at;
    else sy = null;
  }

  // Push out of the walls and out of other things, on the real outlines.
  let dx = x - body.box.x0;
  let dy = y - body.box.y0;
  const clamp = () => {
    dx = Math.max(-body.raw.x0, Math.min(p.width - body.raw.x1, dx));
    dy = Math.max(-body.raw.y0, Math.min(p.depth - body.raw.y1, dy));
  };
  clamp();
  const mine = body.things.flatMap((t) => t.parts.map((part) => polygon(part)));
  const theirs = others.flatMap((o) => o.parts.map((part) => polygon(part)));
  const moved = () => mine.map((poly) => poly.map(([a, b]) => [a + dx, b + dy] as const));
  for (let k = 0; k < 8; k++) {
    let hit = false;
    for (const q of theirs) {
      for (const poly of moved()) {
        const m = push(poly, q);
        if (m) {
          hit = true;
          // A little past touching, so rounding to the half millimetre can't leave an overlap.
          const scale = (m.depth + 0.3) / m.depth;
          dx += m.x * scale;
          dy += m.y * scale;
        }
      }
    }
    clamp();
    if (!hit) break;
    if (k === 7 && theirs.some((q) => moved().some((poly) => push(poly, q)))) return null;
  }
  if (Math.abs(body.box.x0 + dx - x) > 0.01) sx = null;
  if (Math.abs(body.box.y0 + dy - y) > 0.01) sy = null;
  return { dx: half(dx), dy: half(dy), x: sx, y: sy };
}

/** Wraps an angle into (-180, 180]. */
export const wrap = (a: number) => {
  const w = (((a % 360) + 540) % 360) - 180;
  return w === -180 ? 180 : w;
};

/** The angle a thing turned towards `raw` settles on: square, parallel to a turned neighbour, or the rotation step. */
export function snapAngle(p: Plan, t: PlannedThing, raw: number, free: boolean): { angle: number; why: string | null } {
  const a = wrap(raw);
  if (free) return { angle: Math.round(a), why: null };
  const step = p.rules.angle_step || 15;
  const C: { at: number; reach: number; why: string }[] = [];
  for (let k = -180; k <= 180; k += 90) C.push({ at: k, reach: 8, why: "Square" });
  for (const o of p.placed) if (o !== t && o.rotate % 90 !== 0) C.push({ at: o.rotate, reach: 5, why: `Parallel to ${lower(o.id)}` });
  let best: { at: number; why: string; d: number } | null = null;
  for (const c of C) {
    const d = Math.abs(a - c.at);
    if (d < c.reach && (!best || d < best.d)) best = { ...c, d };
  }
  if (best) return { angle: wrap(best.at), why: best.why };
  return { angle: wrap(Math.round(a / step) * step), why: `${step}° steps` };
}

/**
 * The nearest spot within `reach` of (x, y) where pegs hold the thing. Holes are fixed, so this
 * is how a pegboard snaps: to a seat, not to a grid. A thing with an outlet seats straight onto a hole.
 */
export function seat(p: Plan, t: PlannedThing, x: number, y: number, reach = 30): Point | null {
  const others = p.placed.filter((o) => o.id !== t.id);
  const fits = (cx: number, cy: number) => {
    const parts = partsAt(t, cx, cy);
    const b = boxOf(parts);
    if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > p.width + 0.5 || b.y1 > p.depth + 0.5) return false;
    return !others.some((o) => boxesOverlap(grow(b, 1), o.box) && partsHit(parts, o.parts));
  };
  if (t.item.outlet) {
    const holes = (p.base.board?.holes ?? [])
      .map((h) => [h, Math.hypot(h[0] - x, h[1] - y)] as const)
      .filter(([, d]) => d <= reach)
      .sort((a, b) => a[1] - b[1]);
    return holes.find(([h]) => fits(h[0], h[1]))?.[0] ?? null;
  }
  // Rings outwards: every millimetre close in, every 2 mm further out.
  for (let r = 0; r <= reach; r += r < 8 ? 1 : 2) {
    const step = r < 8 ? 1 : 2;
    const offsets: Point[] = [];
    for (let dx = -r; dx <= r; dx += step) {
      if (r === 0) offsets.push([0, 0]);
      else if (Math.abs(dx) === r) for (let dy = -r; dy <= r; dy += step) offsets.push([dx, dy]);
      else offsets.push([dx, -r], [dx, r]);
    }
    for (const [dx, dy] of offsets) {
      if (fits(x + dx, y + dy) && heldByPegs(p, t, x + dx, y + dy)) return [x + dx, y + dy];
    }
  }
  return null;
}

/** Somewhere to put a set-aside thing back: the first spot, front to back, where it fits. */
export function putBackSpot(p: Plan, t: PlannedThing): Point {
  const others = p.placed.filter((o) => o.id !== t.id);
  for (let y = 0; y <= p.depth; y += 10) {
    for (let x = 0; x <= p.width; x += 10) {
      const parts = partsAt(t, x, y);
      const b = boxOf(parts);
      if (b.x0 < 0 || b.y0 < 0 || b.x1 > p.width || b.y1 > p.depth) continue;
      if (!others.some((o) => partsHit(parts, o.parts)) && !p.obstructions.some((o) => partsHit(parts, [o.part]))) return [x, y];
    }
  }
  return [p.width / 2, p.depth / 2];
}

export type ArrangeOp = "left" | "hmid" | "right" | "front" | "vmid" | "back" | "dist-x" | "dist-y" | "pack-x" | "pack-y";

/** Lines up, spaces out or packs things by the space they claim. Returns how far to move each, [id, dx, dy]. */
export function arrange(p: Plan, ids: string[], op: ArrangeOp): [string, number, number][] {
  const ts = ids.map((id) => p.placed.find((t) => t.id === id)).filter((t): t is PlannedThing => !!t && !t.holder?.locked);
  if (ts.length < 2) return [];
  const across = ["left", "hmid", "right", "dist-x", "pack-x"].includes(op);
  const at = (t: PlannedThing) => (across ? t.claim.x0 : t.claim.y0);
  const size = (t: PlannedThing) => (across ? t.claim.x1 - t.claim.x0 : t.claim.y1 - t.claim.y0);
  const lo = Math.min(...ts.map(at));
  const hi = Math.max(...ts.map((t) => at(t) + size(t)));
  const sorted = [...ts].sort((a, b) => at(a) - at(b));
  const to = new Map<PlannedThing, number>();
  if (op === "left" || op === "front") for (const t of ts) to.set(t, lo);
  if (op === "right" || op === "back") for (const t of ts) to.set(t, hi - size(t));
  if (op === "hmid" || op === "vmid") for (const t of ts) to.set(t, (lo + hi) / 2 - size(t) / 2);
  if (op.startsWith("dist")) {
    const gap = (hi - lo - sorted.reduce((a, t) => a + size(t), 0)) / (sorted.length - 1);
    let next = lo;
    for (const t of sorted) {
      to.set(t, next);
      next += size(t) + gap;
    }
  }
  if (op.startsWith("pack")) {
    let next = at(sorted[0]);
    for (const t of sorted) {
      to.set(t, next);
      next += size(t) + p.rules.gap;
    }
  }
  return ts.map((t) => {
    const by = half(to.get(t)! - at(t));
    return across ? [t.id, by, 0] : [t.id, 0, by];
  });
}

