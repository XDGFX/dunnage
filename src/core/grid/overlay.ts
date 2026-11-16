import { drawerShape, type DrawerShape, type Side } from "../drawers.ts";
import { boxesOverlap, type Box } from "../geometry.ts";
import { pegboard, UPPDATERA, type Pegboard } from "../pegboard.ts";
import { PRINTER_PRESETS, type Drawer } from "../schema.ts";
import { bedTile, boardHole, boardJoiners, boardTiles, cutAxis, type BoardLayout, type GridLayout, type Hole } from "./layout.ts";
import { GRID, gridFit, type Fit, type PrinterFit, type Variant } from "./parameters.ts";
import { PITCH } from "./tile.ts";

// A grid overlay (#13): a patch of the grid board on part of an UPPDATERA pegboard, its tiles cut
// and joined as the grid base's are. It's held by lock pins from the library (ADR 0001): each
// twists into a slot first, and the overlay presses down over their pegs, which go up into its
// holes. dunnage works out which holes line up with a slot, and which of those to pin.

export interface OverlaySpec {
  id: string;
  kind: "grid";
  variant?: Variant;
  /** Its front-left corner, from the pegboard's, in mm. */
  at: [number, number];
  /** Its size in holes. */
  holes: [number, number];
  /** The holes to pin, in its own holes; chosen when left out. */
  pins?: [number, number][];
}

/** A hole over a slot, where a lock pin can go: the hole, the slot's lock position, and the tile it's in. */
export interface PinSpot {
  hole: Hole;
  slot: [number, number];
  tile: number;
}

export interface OverlayLayout extends BoardLayout {
  kind: "overlay";
  id: string;
  /** Every hole a lock pin can go up into. */
  compatible: PinSpot[];
  /** The holes chosen for lock pins, which no fixing can use. */
  pins: PinSpot[];
  free: Side[];
  /** Where it lies, in the drawer. */
  box: Box;
}

/** A board holders fix to: the grid base, or an overlay on a pegboard. */
export type Board = GridLayout | OverlayLayout;

export interface OverlayOptions {
  bed?: readonly [number, number, number];
  fit?: PrinterFit;
  /** How far a hole's centre may be from a slot's lock position, [along the slot, across it]. */
  tolerance?: readonly [number, number];
}

const DEFAULT_BED = PRINTER_PRESETS["bambu-p1s"];
const LOCK = UPPDATERA.lock_pin;
// An overlay edge within `at_wall` of the pegboard's edge counts as at the drawer wall, since the board fills the drawer.
const { at_wall: AT_WALL, sample: SAMPLE, reach: REACH } = GRID.overlay;

const key = ([i, j]: Hole) => `${i},${j}`;

/** The lock pin's peg: the overlay's hole less the press fit a holder's own peg takes. */
export const lockPinPeg = (variant: Variant, fit: Fit) => boardHole(variant, fit) - fit.peg_fixed;

export function layoutOverlay(shape: DrawerShape, board: Pegboard, spec: OverlaySpec, index: number, options: OverlayOptions = {}): OverlayLayout {
  const at = (...path: (string | number)[]) => ["base", "overlays", index, ...path];
  const { layout, problem } = overlayTiles(shape, board, spec, options);
  const problems: BoardLayout["problems"] = layout.problems.map((p) => ({ ...p, at: at(...p.at) }));
  if (problem) problems.push({ at: at("holes"), message: problem });

  let pins: PinSpot[];
  if (spec.pins) {
    const byHole = new Map(layout.compatible.map((spot) => [key(spot.hole), spot]));
    pins = [];
    for (const [slot, hole] of spec.pins.entries()) {
      const spot = byHole.get(key(hole));
      if (spot) pins.push(spot);
      else problems.push({ at: at("pins", slot), message: `[${hole.join(", ")}] isn't over an UPPDATERA slot a lock pin can reach` });
    }
    const unmet = pinRules(layout, pins, SAMPLE);
    if (unmet) problems.push({ at: at("pins"), message: unmet });
  } else {
    const chosen = choosePins(layout, layout.compatible, SAMPLE);
    pins = chosen.pins;
    if (chosen.problem) problems.push({ at: at(), message: chosen.problem });
  }
  return { ...layout, pins, occupied: pins.map((spot) => spot.hole), problems };
}

/** An overlay's tiles, joiners, free edges and compatible holes, before pins are chosen; problems are by path within the overlay. */
function overlayTiles(shape: DrawerShape, board: Pegboard, spec: OverlaySpec, options: OverlayOptions): { layout: Omit<OverlayLayout, "pins">; problem?: string } {
  const variant = spec.variant ?? GRID.variant;
  const bed = options.bed ?? DEFAULT_BED;
  const [nx, ny] = spec.holes;
  const origin: [number, number] = [board.x0 + spec.at[0], board.y0 + spec.at[1]];
  const box: Box = { x0: origin[0], y0: origin[1], x1: origin[0] + nx * PITCH, y1: origin[1] + ny * PITCH };
  const boardBox: Box = { x0: board.x0, y0: board.y0, x1: board.x0 + board.width, y1: board.y0 + board.depth };
  const problems: BoardLayout["problems"] = [];
  if (!inside(box, boardBox)) {
    problems.push({ at: [], message: `runs off the ${board.width} × ${board.depth} mm board: it's ${nx * PITCH} × ${ny * PITCH} mm from [${spec.at.join(", ")}]` });
  }
  const free = (["left", "right", "front", "back"] as const).filter((side) => {
    const gap = { left: box.x0 - boardBox.x0, right: boardBox.x1 - box.x1, front: box.y0 - boardBox.y0, back: boardBox.y1 - box.y1 }[side];
    return gap > AT_WALL;
  });
  const base = {
    kind: "overlay" as const, id: spec.id, variant, shape, fit: 0, holes: [nx, ny] as [number, number], origin, box, free,
    gap: { left: 0, right: 0, front: 0, back: 0 }, lapTab: 0, bumpers: [], dropped: [], countersinks: [],
  };

  const [mostX, mostY] = bedTile(bed);
  const room = [bed[0] - GRID.tile.bed_margin, bed[1] - GRID.tile.bed_margin] as const;
  const columns = cutAxis(nx, mostX, room[0], [0, 0]);
  const rows = cutAxis(ny, mostY, room[1], [0, 0]);
  if (!columns || !rows) return { layout: { ...base, tiles: [], joiners: [], compatible: [], problems }, problem: `can't be cut into tiles that fit a ${bed[0]} × ${bed[1]} mm bed` };
  const tiles = boardTiles(origin, columns, rows);
  const { joiners, shortest } = boardJoiners(origin, columns, rows, () => false);
  const problem = shortest < Infinity ? `makes a joined tile edge only ${shortest} ${shortest === 1 ? "hole" : "holes"} long: two joiners per join need at least 3` : undefined;
  const layout = { ...base, tiles, joiners, compatible: [] as PinSpot[], problems };
  layout.compatible = compatibleHoles(board, layout, boardHole(variant, gridFit(options.fit)), options.tolerance);
  return { layout, problem };
}

const inside = (a: Box, b: Box) => a.x0 >= b.x0 - 1e-6 && a.y0 >= b.y0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y1 <= b.y1 + 1e-6;

/**
 * The holes a lock pin can go up into: over a slot wholly under the overlay, within `tolerance` of
 * its lock position, and a real hole, not dropped and not under a joiner or a free edge's band.
 */
export function compatibleHoles(
  board: Pegboard,
  layout: Pick<OverlayLayout, "origin" | "holes" | "tiles" | "joiners" | "dropped" | "free" | "box">,
  hole: number,
  tolerance: readonly [number, number] = LOCK.tolerance,
): PinSpot[] {
  const [L, W] = UPPDATERA.slot;
  const [nx, ny] = layout.holes;
  const { origin, box } = layout;
  const covered = new Set<string>(layout.dropped.map(key));
  // A joiner sits round the four holes at the corner it's centred on.
  for (const [x, y] of layout.joiners) {
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) covered.add(key([Math.round((x - origin[0]) / PITCH + u / 2 - 0.5), Math.round((y - origin[1]) / PITCH + v / 2 - 0.5)]));
  }
  const band = GRID.overlay.band + hole / 2;
  const spots: PinSpot[] = [];
  for (const [sx, sy] of board.holes) {
    if (!inside({ x0: sx - L / 2, y0: sy - W / 2, x1: sx + L / 2, y1: sy + W / 2 }, box)) continue;
    const [lx, ly] = [sx + LOCK.at[0], sy + LOCK.at[1]];
    const h: Hole = [Math.round((lx - origin[0]) / PITCH - 0.5), Math.round((ly - origin[1]) / PITCH - 0.5)];
    if (h[0] < 0 || h[1] < 0 || h[0] >= nx || h[1] >= ny || covered.has(key(h))) continue;
    const [hx, hy] = [origin[0] + (h[0] + 0.5) * PITCH, origin[1] + (h[1] + 0.5) * PITCH];
    if (Math.abs(hx - lx) > tolerance[0] + 1e-9 || Math.abs(hy - ly) > tolerance[1] + 1e-9) continue;
    const nearFree = layout.free.some((side) => ({ left: hx - box.x0, right: box.x1 - hx, front: hy - box.y0, back: box.y1 - hy })[side] < band);
    if (nearFree) continue;
    const tile = layout.tiles.findIndex((t) => hx > t.box.x0 && hx < t.box.x1 && hy > t.box.y0 && hy < t.box.y1);
    spots.push({ hole: h, slot: [sx, sy], tile });
  }
  return spots;
}

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

/** Points over the overlay, `step` apart or less, edges included. */
function samples(box: Box, step: number): [number, number][] {
  const steps = (from: number, to: number) => {
    const n = Math.max(1, Math.ceil((to - from) / step));
    return Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
  };
  return steps(box.x0, box.x1).flatMap((x) => steps(box.y0, box.y1).map((y): [number, number] => [x, y]));
}

/** How far the point farthest from every pin is; sampled `step` apart, so it may be up to `step` / √2 short. */
function farthest(box: Box, pins: readonly PinSpot[], step: number): { at: [number, number]; d: number } {
  let far = { at: [box.x0, box.y0] as [number, number], d: -1 };
  for (const s of samples(box, step)) {
    const d = pins.length ? Math.min(...pins.map((p) => distance(s, p.slot))) : Infinity;
    if (d > far.d) far = { at: s, d };
  }
  return far;
}

const offLine = (pins: readonly PinSpot[]) => {
  const [a, b] = [pins[0]!.slot, pins.at(-1)!.slot];
  return pins.some(({ slot: c }) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / Math.max(distance(a, b), 1e-9) > 1);
};

/** Why these pins don't hold the overlay, or undefined when they do: two a tile, three not in a line, and every point in reach. */
export function pinRules(layout: Pick<OverlayLayout, "tiles" | "box">, pins: readonly PinSpot[], step: number = SAMPLE): string | undefined {
  const short = layout.tiles.filter((_, index) => pins.filter((p) => p.tile === index).length < 2).map((t) => t.label);
  if (short.length > 0) return `needs two lock pins in tile ${short.join(", ")}, and has ${short.length === 1 ? "too few holes over slots there" : "too few holes over slots in each"}`;
  if (pins.length < 3 || !offLine(pins)) return "needs three lock pins not in a line, so it can't rock";
  // Sampled `step` apart, so no point is more than step / √2 from a sample.
  const far = farthest(layout.box, pins, step);
  if (far.d > REACH - step * Math.SQRT1_2) return `leaves a point ${Math.round(far.d)} mm from the nearest lock pin, more than ${REACH} mm`;
  return undefined;
}

/**
 * Chooses the fewest lock pins it can: two a tile as far apart as they go, then the hole nearest
 * the point farthest from a pin until all are in reach, then one off the line, then any that can go.
 */
export function choosePins(layout: Pick<OverlayLayout, "tiles" | "box">, compatible: readonly PinSpot[], step: number = SAMPLE): { pins: PinSpot[]; problem?: string } {
  const chosen: PinSpot[] = [];
  for (const index of layout.tiles.keys()) {
    const own = compatible.filter((c) => c.tile === index);
    if (own.length < 2) {
      chosen.push(...own);
      continue;
    }
    let best: [PinSpot, PinSpot] = [own[0]!, own[1]!];
    for (let a = 0; a < own.length; a++) for (let b = a + 1; b < own.length; b++) if (distance(own[a]!.slot, own[b]!.slot) > distance(best[0].slot, best[1].slot) + 1e-9) best = [own[a]!, own[b]!];
    chosen.push(...best);
  }
  const left = () => compatible.filter((c) => !chosen.includes(c));
  for (let far = farthest(layout.box, chosen, step); far.d > REACH - step * Math.SQRT1_2 && left().length > 0; far = farthest(layout.box, chosen, step)) {
    chosen.push(left().reduce((a, b) => (distance(b.slot, far.at) < distance(a.slot, far.at) ? b : a)));
  }
  if (chosen.length >= 1 && (chosen.length < 3 || !offLine(chosen))) {
    const third = left().find((c) => offLine([...chosen, c])) ?? left()[0];
    if (third) chosen.push(third);
  }
  // Then drop any pin the rules don't need, the last chosen first.
  for (let k = chosen.length - 1; k >= 0; k--) {
    const without = chosen.filter((_, n) => n !== k);
    if (!pinRules(layout, without, step)) chosen.splice(k, 1);
  }
  return { pins: chosen, problem: pinRules(layout, chosen, step) };
}

/** Every overlay on a drawer's pegboard, laid out; none for any other base. */
export function drawerOverlays(drawer: Drawer, options: OverlayOptions = {}): OverlayLayout[] {
  const base = drawer.base;
  const shape = drawerShape(drawer.drawer);
  if (base?.kind !== "pegboard" || !base.overlays?.length || !shape) return [];
  const board = pegboard(base.preset, shape.inside[0], shape.inside[1]);
  return base.overlays.map((spec, index) => layoutOverlay(shape, board, spec as OverlaySpec, index, options));
}

/** The overlay a holder sits on, if it names one that's there. */
export function overlayOf(overlays: readonly OverlayLayout[], holder: { on?: string }): OverlayLayout | undefined {
  return holder.on === undefined ? undefined : overlays.find((overlay) => overlay.id === holder.on);
}

export interface BestFit {
  at: [number, number];
  /** Whether the pins chosen there meet the rules, and how many holes line up with a slot. */
  met: boolean;
  compatible: number;
}

/**
 * The best place for an overlay within a slot pitch of where it is, `fit_step` apart: on the board,
 * off the other overlays, where its pins meet the rules first, then where most holes line up.
 */
export function bestOverlayAt(shape: DrawerShape, board: Pegboard, spec: OverlaySpec, others: readonly Pick<OverlaySpec, "at" | "holes">[], options: OverlayOptions = {}): BestFit {
  const { fit_step: step, search_sample: coarse } = GRID.overlay;
  const [nx, ny] = spec.holes;
  const boxAt = ([x, y]: readonly [number, number], [w, d]: readonly [number, number]): Box => ({ x0: x, y0: y, x1: x + w * PITCH, y1: y + d * PITCH });
  const boardBox: Box = { x0: 0, y0: 0, x1: board.width, y1: board.depth };
  const candidates: { at: [number, number]; layout: Omit<OverlayLayout, "pins"> }[] = [];
  const reachX = UPPDATERA.pitch / 2;
  const reachY = UPPDATERA.row / 2;
  for (let dx = -reachX; dx <= reachX + 1e-9; dx += step) {
    for (let dy = -reachY; dy <= reachY + 1e-9; dy += step) {
      const at: [number, number] = [round(spec.at[0] + dx), round(spec.at[1] + dy)];
      const box = boxAt(at, [nx, ny]);
      if (at[0] < 0 || at[1] < 0 || !inside(box, boardBox) || others.some((o) => boxesOverlap(box, boxAt(o.at, o.holes)))) continue;
      candidates.push({ at, layout: overlayTiles(shape, board, { ...spec, at, pins: undefined }, options).layout });
    }
  }
  if (candidates.length === 0) return { at: spec.at, met: false, compatible: 0 };
  // Most compatible holes first, nearest to where it is on a tie; the first that meets the rules wins.
  candidates.sort((a, b) => b.layout.compatible.length - a.layout.compatible.length || distance(a.at, spec.at) - distance(b.at, spec.at));
  // A coarse look first, as there are thousands of places, then the full one for the winner.
  for (const c of candidates) {
    if (!choosePins(c.layout, c.layout.compatible, coarse).problem && !choosePins(c.layout, c.layout.compatible).problem) return { at: c.at, met: true, compatible: c.layout.compatible.length };
  }
  return { at: candidates[0]!.at, met: false, compatible: candidates[0]!.layout.compatible.length };
}

const round = (v: number) => Math.round(v * 100) / 100;
