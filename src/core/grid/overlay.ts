import { drawerShape, type DrawerShape, type Side } from "../drawers.ts";
import { boxesOverlap, type Box } from "../geometry.ts";
import { pegboard, UPPDATERA, type Pegboard } from "../pegboard.ts";
import { PRINTER_PRESETS, type Drawer } from "../schema.ts";
import { bedTile, boardJoiners, boardTiles, cutAxis, joinerReach, lapTabDepth, stretch, OUTWARD, type BoardBumper, type BoardLayout, type GridLayout } from "./layout.ts";
import { GRID, gridFit, type PrinterFit, type Variant } from "./parameters.ts";
import { PITCH, THICKNESS } from "./tile.ts";

// A grid overlay (#13): a patch of the grid board on part of an UPPDATERA pegboard, its tiles cut
// and joined as the grid base's are. An edge against the drawer wall is held by the wall; every
// other edge gets an edge strip, built as the grid base's bumpers are, with chunky pegs underneath
// that fill the board's slots. Tiles never change for where the slots fall: only the strips do.

export interface OverlaySpec {
  id: string;
  kind: "grid";
  variant?: Variant;
  /** Its front-left corner, from the pegboard's, in mm. */
  at: [number, number];
  /** Its size in holes. */
  holes: [number, number];
}

/** One edge's strip: how wide it is, or why it can't be made. */
export interface EdgeStrip {
  side: Side;
  /** Out from the overlay's edge, in mm; 0 when it can't be made. */
  width: number;
  pegs: number;
  problem?: string;
}

export interface OverlayLayout extends BoardLayout {
  kind: "overlay";
  id: string;
  /** Edges that face the pegboard rather than a drawer wall. */
  free: Side[];
  /** The free edges' strips; each is a `BoardBumper` in `bumpers`, with its pegs. */
  strips: EdgeStrip[];
  /** The sides it's held on, by a wall or a strip. */
  held: Side[];
  /** Where it lies, in the drawer, without its strips. */
  box: Box;
}

/** A board holders fix to: the grid base, or an overlay on a pegboard. */
export type Board = GridLayout | OverlayLayout;

export interface OverlayOptions {
  bed?: readonly [number, number, number];
  fit?: PrinterFit;
}

const DEFAULT_BED = PRINTER_PRESETS["bambu-p1s"];
const SIDES: Side[] = ["left", "right", "front", "back"];
// An overlay edge within `at_wall` of the pegboard's edge counts as at the drawer wall, since the board fills the drawer.
const { at_wall: AT_WALL, sample: SAMPLE, reach: REACH } = GRID.overlay;
const STRIP = GRID.strip;

/** A strip peg's footprint: the slot less the press fit, each way. */
export const stripPeg = (): [number, number] => [UPPDATERA.slot[0] - UPPDATERA.strip_peg.fit, UPPDATERA.slot[1] - UPPDATERA.strip_peg.fit];

/** How far the strip's top runs in from its outer edge as it chamfers down to a `land` above the pegboard. */
export const stripChamfer = () => (THICKNESS - STRIP.land) / Math.tan((STRIP.slope * Math.PI) / 180);

export function layoutOverlay(shape: DrawerShape, board: Pegboard, spec: OverlaySpec, index: number, options: OverlayOptions = {}): OverlayLayout {
  const at = (...path: (string | number)[]) => ["base", "overlays", index, ...path];
  const variant = spec.variant ?? GRID.variant;
  const fit = gridFit(options.fit);
  const bed = options.bed ?? DEFAULT_BED;
  const [nx, ny] = spec.holes;
  const origin: [number, number] = [board.x0 + spec.at[0], board.y0 + spec.at[1]];
  const box: Box = { x0: origin[0], y0: origin[1], x1: origin[0] + nx * PITCH, y1: origin[1] + ny * PITCH };
  const boardBox = boardBoxOf(board);
  const problems: BoardLayout["problems"] = [];
  if (!inside(box, boardBox)) {
    problems.push({ at: at(), message: `runs off the ${board.width} × ${board.depth} mm board: it's ${nx * PITCH} × ${ny * PITCH} mm from [${spec.at.join(", ")}]` });
  }
  const free = SIDES.filter((side) => edgeGap(box, boardBox, side) > AT_WALL);
  const lapTab = lapTabDepth(variant, fit);
  const base = {
    kind: "overlay" as const, id: spec.id, variant, shape, fit: 0, holes: [nx, ny] as [number, number], origin, box, free,
    lapTab, dropped: [], countersinks: [],
  };

  const [mostX, mostY] = bedTile(bed);
  const room = [bed[0] - GRID.tile.bed_margin, bed[1] - GRID.tile.bed_margin] as const;
  // Front and back strips run past the corners over the side strips' ends, so their end pieces carry
  // those widths on the bed. Widths and tiles settle in a pass or two.
  let widths: Record<Side, number> = { left: 0, right: 0, front: 0, back: 0 };
  let found: ReturnType<typeof stripsFor> | undefined;
  let tiles: BoardLayout["tiles"] = [];
  let columns: number[] | undefined;
  let rows: number[] | undefined;
  for (let pass = 0; pass < 4; pass++) {
    columns = cutAxis(nx, mostX, room[0], [widths.left, widths.right]);
    rows = cutAxis(ny, mostY, room[1], [0, 0]);
    if (!columns || !rows) break;
    tiles = boardTiles(origin, columns, rows);
    found = stripsFor(board, box, free, columns, rows, origin, lapTab);
    const next = Object.fromEntries(SIDES.map((side) => [side, found!.strips.find((s) => s.side === side)?.width ?? 0])) as Record<Side, number>;
    if (SIDES.every((side) => next[side] === widths[side])) break;
    widths = next;
  }
  if (!columns || !rows || !found) {
    problems.push({ at: at("holes"), message: `can't be cut into tiles that fit a ${bed[0]} × ${bed[1]} mm bed` });
    return { ...base, gap: widths, tiles: [], bumpers: [], joiners: [], strips: [], held: [], problems };
  }

  const stripped = found.strips.filter((s) => s.width > 0).map((s) => s.side);
  const reach = joinerReach(variant, fit);
  const { joiners, shortest } = boardJoiners(origin, columns, rows, (side) => stripped.includes(side) && widths[side] >= reach);
  if (shortest < Infinity) {
    problems.push({ at: at("holes"), message: `makes a joined tile edge only ${shortest} ${shortest === 1 ? "hole" : "holes"} long: two joiners per join need at least 3` });
  }
  for (const strip of found.strips) if (strip.problem) problems.push({ at: at(), message: strip.problem });

  const held = SIDES.filter((side) => !free.includes(side) || stripped.includes(side));
  const across = held.some((side) => side === "left" || side === "right");
  const along = held.some((side) => side === "front" || side === "back");
  if (!across || !along) {
    problems.push({ at: at(), message: `is held only on its ${held.join(" and ") || "no"} ${held.length === 1 ? "side" : "sides"}: it needs two sides that aren't parallel, each against a wall or with an edge strip` });
  }
  return { ...base, gap: widths, tiles, bumpers: found.bumpers, joiners, strips: found.strips, held, problems };
}

const boardBoxOf = (board: Pegboard): Box => ({ x0: board.x0, y0: board.y0, x1: board.x0 + board.width, y1: board.y0 + board.depth });
const inside = (a: Box, b: Box) => a.x0 >= b.x0 - 1e-6 && a.y0 >= b.y0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y1 <= b.y1 + 1e-6;
const edgeGap = (box: Box, outer: Box, side: Side) => ({ left: box.x0 - outer.x0, right: outer.x1 - box.x1, front: box.y0 - outer.y0, back: outer.y1 - box.y1 })[side];
const intersects = (a: Box, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

/** The box a strip `width` wide covers along `side` of `box`, from `a0` to `a1` along the edge. */
function stripBox(box: Box, side: Side, width: number, a0: number, a1: number): Box {
  switch (side) {
    case "left": return { x0: box.x0 - width, x1: box.x0, y0: a0, y1: a1 };
    case "right": return { x0: box.x1, x1: box.x1 + width, y0: a0, y1: a1 };
    case "front": return { x0: a0, x1: a1, y0: box.y0 - width, y1: box.y0 };
    case "back": return { x0: a0, x1: a1, y0: box.y1, y1: box.y1 + width };
  }
}

/** The room a joiner centred at (x, y) takes, from above: its four rings and webs, at the widest variant's bosses. */
const joinerFootprint = ([x, y]: readonly [number, number]): Box => {
  const r = PITCH / 2 + GRID.fit.grid_hole[GRID.variant]! / 2 + GRID.variants["standard"].wall + GRID.joiner.wall + GRID.joiner.ring_room;
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
};

/**
 * The slots a strip's pegs can fill: wholly under the strip, `wall` inside its edges and `edge`
 * inside its outer edge, clear of the joiners at the overlay's edge.
 */
export function stripSlots(board: Pegboard, strip: Box, side: Side, joiners: readonly (readonly [number, number])[]): [number, number][] {
  const [pl, pw] = stripPeg();
  const { wall, edge } = STRIP;
  const [dx, dy] = OUTWARD[side];
  const zone: Box = {
    x0: strip.x0 + (dx < 0 ? edge : wall), x1: strip.x1 - (dx > 0 ? edge : wall),
    y0: strip.y0 + (dy < 0 ? edge : wall), y1: strip.y1 - (dy > 0 ? edge : wall),
  };
  const rooms = joiners.map((j) => joinerFootprint(j));
  return board.holes.filter(([x, y]) => {
    const peg: Box = { x0: x - pl / 2, x1: x + pl / 2, y0: y - pw / 2, y1: y + pw / 2 };
    return inside(peg, zone) && !rooms.some((r) => intersects({ x0: peg.x0 - wall, x1: peg.x1 + wall, y0: peg.y0 - wall, y1: peg.y1 + wall }, r));
  }) as [number, number][];
}

/** Whether every point of a strip is within reach of a peg, sampled `SAMPLE` apart. */
function inReach(strip: Box, pegs: readonly (readonly [number, number])[]): boolean {
  const steps = (from: number, to: number) => {
    const n = Math.max(1, Math.ceil((to - from) / SAMPLE));
    return Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
  };
  const limit = REACH - SAMPLE * Math.SQRT1_2;
  return steps(strip.x0, strip.x1).every((x) => steps(strip.y0, strip.y1).every((y) => pegs.some(([px, py]) => Math.hypot(px - x, py - y) <= limit)));
}

/**
 * Each free edge's strip, cut into one piece a tile like the grid base's bumpers: the narrowest, in
 * `step`s from `min_width` to `max_width`, at which every piece has two pegs and no point more than
 * `reach` from one, on the board.
 */
function stripsFor(board: Pegboard, box: Box, free: readonly Side[], columns: number[], rows: number[], origin: readonly [number, number], lap: number) {
  const boardBox = boardBoxOf(board);
  const edges = (sizes: number[], from: number) => sizes.reduce<number[]>((at, size) => [...at, at.at(-1)! + size * PITCH], [from]);
  const xs = edges(columns, origin[0]);
  const ys = edges(rows, origin[1]);
  // Joiners along each free edge, where the strip joins the tiles.
  const { joiners } = boardJoiners(origin, columns, rows, (side) => free.includes(side));
  const along = (side: Side) => joiners.filter(([x, y]) => (side === "left" ? x === box.x0 : side === "right" ? x === box.x1 : side === "front" ? y === box.y0 : y === box.y1));
  const pieces = (side: Side, widths: Partial<Record<Side, number>>): [number, number][] => {
    if (side === "left" || side === "right") return ys.slice(0, -1).map((y, k) => [y, ys[k + 1]!]);
    // Front and back pieces run past the corners where a side strip meets them.
    return xs.slice(0, -1).map((x, k) => [k === 0 ? x - (widths.left ?? 0) : x, k === columns.length - 1 ? xs[k + 1]! + (widths.right ?? 0) : xs[k + 1]!]);
  };

  const fits = (side: Side, width: number, widths: Partial<Record<Side, number>>) => {
    const placed = pieces(side, widths).map(([a0, a1]) => {
      const strip = stripBox(box, side, width, a0, a1);
      const pegs = inside(strip, boardBox) ? stripSlots(board, strip, side, along(side)) : [];
      return { strip, pegs, ok: inside(strip, boardBox) && pegs.length >= 2 && inReach(strip, pegs) };
    });
    return placed.every((p) => p.ok) ? placed : undefined;
  };
  const narrowest = (side: Side, widths: Partial<Record<Side, number>>) => {
    for (let w = STRIP.min_width; w <= STRIP.max_width + 1e-9; w += STRIP.step) {
      const placed = fits(side, w, widths);
      if (placed) return { width: w, placed };
    }
    return undefined;
  };

  // Sides first, as the front and back pieces run over their ends.
  const widths: Partial<Record<Side, number>> = {};
  const strips: EdgeStrip[] = [];
  const bumpers: BoardBumper[] = [];
  for (const side of (["left", "right", "front", "back"] as const).filter((s) => free.includes(s))) {
    const found = narrowest(side, widths);
    if (!found) {
      strips.push({ side, width: 0, pegs: 0, problem: `its ${side} edge faces the pegboard, and no strip up to ${STRIP.max_width} mm wide reaches two slots under every piece, with every point within ${REACH} mm of one: put that edge against the wall, or move it` });
      continue;
    }
    widths[side] = found.width;
    strips.push({ side, width: found.width, pegs: found.placed.reduce((n, p) => n + p.pegs.length, 0) });
    found.placed.forEach(({ strip, pegs }, k) => bumpers.push(stripBumper(box, side, k, strip, pegs, free, widths, lap)));
  }
  return { strips, bumpers };
}

/**
 * A strip piece as a bumper: its floor footprint, its top drawn in where it chamfers down to the
 * pegboard (its outer edge, and the ends it runs past a corner with), its lap tab under the tiles, and its pegs.
 */
function stripBumper(box: Box, side: Side, index: number, floor: Box, pegs: [number, number][], free: readonly Side[], widths: Partial<Record<Side, number>>, lap: number): BoardBumper {
  const run = stripChamfer();
  let top = stretch(floor, side, -run);
  // A front or back piece's end past a corner faces the pegboard too.
  if ((side === "front" || side === "back") && floor.x0 < box.x0 - 1e-6) top = stretch(top, "left", -run);
  if ((side === "front" || side === "back") && floor.x1 > box.x1 + 1e-6) top = stretch(top, "right", -run);
  // A side piece's end at a free edge with no strip faces the pegboard too.
  for (const end of ["front", "back"] as const) {
    const atEnd = end === "front" ? Math.abs(floor.y0 - box.y0) < 1e-6 : Math.abs(floor.y1 - box.y1) < 1e-6;
    if ((side === "left" || side === "right") && atEnd && free.includes(end) && !widths[end]) top = stretch(top, end, -run);
  }
  // The lap tab runs under the tiles along the edge, short of the corners where another strip's tab runs.
  const reach = lap + GRID.lap_tab.clearance;
  const clip = (a0: number, a1: number, lo: number, hi: number) => [Math.max(a0, lo), Math.min(a1, hi)] as const;
  let tab: Box;
  if (side === "left" || side === "right") {
    const [y0, y1] = clip(floor.y0, floor.y1, box.y0 + (free.includes("front") ? reach : 0), box.y1 - (free.includes("back") ? reach : 0));
    tab = side === "left" ? { x0: box.x0, x1: box.x0 + lap, y0, y1 } : { x0: box.x1 - lap, x1: box.x1, y0, y1 };
  } else {
    const [x0, x1] = clip(floor.x0, floor.x1, box.x0, box.x1);
    tab = side === "front" ? { x0, x1, y0: box.y0, y1: box.y0 + lap } : { x0, x1, y0: box.y1 - lap, y1: box.y1 };
  }
  return { side, index, floor, top, walls: [], tab, pegs, land: STRIP.land };
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

/** All an overlay covers from above: its tiles and its strips. */
export const overlayFootprint = (overlay: OverlayLayout): Box[] => [overlay.box, ...overlay.bumpers.map((b) => b.floor)];

/** Whether two overlays, strips and all, overlap. */
export const overlaysOverlap = (a: OverlayLayout, b: OverlayLayout) => overlayFootprint(a).some((p) => overlayFootprint(b).some((q) => boxesOverlap(p, q)));

/** Whether a point is under an overlay or one of its strips. */
export const underOverlay = (overlay: OverlayLayout, x: number, y: number) => overlayFootprint(overlay).some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
