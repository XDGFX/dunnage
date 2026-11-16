import { drawerShape, type DrawerShape, type Side } from "../drawers.ts";
import type { Box } from "../geometry.ts";
import { pegboard, type Pegboard } from "../pegboard.ts";
import { PRINTER_PRESETS, type Drawer } from "../schema.ts";
import { latchShape, socketOf, type Socket } from "./latch.ts";
import { bedTile, boardJoiners, boardHole, boardTiles, cutAxis, type BoardLatch, type BoardLayout, type GridLayout, type Hole } from "./layout.ts";
import { GRID, gridFit, type PrinterFit, type Variant } from "./parameters.ts";
import { PITCH } from "./tile.ts";

// A grid overlay (#13): a patch of the grid board on part of an UPPDATERA pegboard, its tiles cut
// and joined as the grid base's are, held down by spring latches in the board's slots.

export interface OverlaySpec {
  id: string;
  kind: "grid";
  variant?: Variant;
  /** Its front-left corner, from the pegboard's, in mm. */
  at: [number, number];
  /** Its size in holes. */
  holes: [number, number];
}

export interface OverlayLayout extends BoardLayout {
  kind: "overlay";
  id: string;
  latches: BoardLatch[];
  closed: Hole[];
  free: Side[];
  /** Where it lies, in the drawer. */
  box: Box;
}

/** A board holders fix to: the grid base, or an overlay on a pegboard. */
export type Board = GridLayout | OverlayLayout;

export interface OverlayOptions {
  bed?: readonly [number, number, number];
  fit?: PrinterFit;
}

const DEFAULT_BED = PRINTER_PRESETS["bambu-p1s"];
// An overlay edge within `at_wall` of the pegboard's edge counts as at the drawer wall, since the board fills the drawer.
const { at_wall: AT_WALL, sample: SAMPLE } = GRID.overlay;

/**
 * The holes over latch pockets centred at `centres`, in a grid of `nx` × `ny` holes from `origin`:
 * the socket fills the tile there, so they're closed.
 */
export function closedHoles(origin: readonly [number, number], [nx, ny]: readonly [number, number], centres: readonly (readonly [number, number])[], socket: Socket, hole: number): Hole[] {
  const r = hole / 2;
  const [px, py] = socket.pocket;
  const closed: Hole[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const [x, y] = [origin[0] + (i + 0.5) * PITCH, origin[1] + (j + 0.5) * PITCH];
      if (centres.some(([lx, ly]) => Math.abs(x - lx) < px / 2 + r && Math.abs(y - ly) < py / 2 + r)) closed.push([i, j]);
    }
  }
  return closed;
}

export function layoutOverlay(shape: DrawerShape, board: Pegboard, spec: OverlaySpec, index: number, options: OverlayOptions = {}): OverlayLayout {
  const at = (...path: (string | number)[]) => ["base", "overlays", index, ...path];
  const problems: BoardLayout["problems"] = [];
  const variant = spec.variant ?? GRID.variant;
  const fit = gridFit(options.fit);
  const bed = options.bed ?? DEFAULT_BED;
  const [nx, ny] = spec.holes;
  const origin: [number, number] = [board.x0 + spec.at[0], board.y0 + spec.at[1]];
  const box: Box = { x0: origin[0], y0: origin[1], x1: origin[0] + nx * PITCH, y1: origin[1] + ny * PITCH };
  const boardBox: Box = { x0: board.x0, y0: board.y0, x1: board.x0 + board.width, y1: board.y0 + board.depth };

  const outside = box.x0 < boardBox.x0 - 1e-6 || box.y0 < boardBox.y0 - 1e-6 || box.x1 > boardBox.x1 + 1e-6 || box.y1 > boardBox.y1 + 1e-6;
  if (outside) {
    problems.push({
      at: at(),
      message: `runs off the ${board.width} × ${board.depth} mm board: it's ${nx * PITCH} × ${ny * PITCH} mm from [${spec.at.join(", ")}]`,
    });
  }
  const free = (["left", "right", "front", "back"] as const).filter((side) => {
    const gap = { left: box.x0 - boardBox.x0, right: boardBox.x1 - box.x1, front: box.y0 - boardBox.y0, back: boardBox.y1 - box.y1 }[side];
    return gap > AT_WALL;
  });

  const empty: Omit<OverlayLayout, "tiles" | "joiners" | "latches" | "closed" | "problems"> = {
    kind: "overlay", id: spec.id, variant, shape, fit: 0, holes: [nx, ny], origin, box, free,
    gap: { left: 0, right: 0, front: 0, back: 0 }, lapTab: 0, bumpers: [], dropped: [], countersinks: [],
  };

  const [mostX, mostY] = bedTile(bed);
  const room = [bed[0] - GRID.tile.bed_margin, bed[1] - GRID.tile.bed_margin] as const;
  const columns = cutAxis(nx, mostX, room[0], [0, 0]);
  const rows = cutAxis(ny, mostY, room[1], [0, 0]);
  if (!columns || !rows) {
    problems.push({ at: at("holes"), message: `can't be cut into tiles that fit a ${bed[0]} × ${bed[1]} mm bed` });
    return { ...empty, tiles: [], joiners: [], latches: [], closed: [], problems };
  }
  const tiles = boardTiles(origin, columns, rows);
  const { joiners, shortest } = boardJoiners(origin, columns, rows, () => false);
  if (shortest < Infinity) {
    problems.push({ at: at("holes"), message: `makes a joined tile edge only ${shortest} ${shortest === 1 ? "hole" : "holes"} long: two joiners per join need at least 3` });
  }

  const socket = socketOf([latchShape(fit.latch)], fit.latch);
  const { latches, problem } = chooseLatches(board, tiles, box, socket.pad);
  if (problem) problems.push({ at: at(), message: problem });
  const closed = closedHoles(origin, [nx, ny], latches.map((l) => l.at), socket, boardHole(variant, fit));
  return { ...empty, tiles, joiners, latches, closed, problems };
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

/**
 * Picks the slots to latch into: at least 2 in every tile, as far apart as they go, then more
 * until no point of the overlay is farther than `GRID.overlay.reach` from one, and a third off the
 * line if they're all in one. A slot is used only where its latch's pad lies inside one tile, clear
 * of its edges.
 */
function chooseLatches(board: Pegboard, tiles: BoardLayout["tiles"], box: Box, pad: [number, number]): { latches: BoardLatch[]; problem?: string } {
  const edge = GRID.overlay.edge_room;
  const candidates: BoardLatch[] = [];
  for (const [x, y] of board.holes) {
    const tile = tiles.findIndex(({ box: b }) => x - pad[0] / 2 >= b.x0 + edge && x + pad[0] / 2 <= b.x1 - edge && y - pad[1] / 2 >= b.y0 + edge && y + pad[1] / 2 <= b.y1 - edge);
    if (tile >= 0) candidates.push({ at: [x, y], tile });
  }
  const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
  const chosen: BoardLatch[] = [];
  const short: string[] = [];
  for (const [index, tile] of tiles.entries()) {
    const own = candidates.filter((c) => c.tile === index);
    if (own.length < 2) {
      short.push(tile.label);
      chosen.push(...own);
      continue;
    }
    let best: [BoardLatch, BoardLatch] = [own[0]!, own[1]!];
    for (let a = 0; a < own.length; a++) for (let b = a + 1; b < own.length; b++) if (distance(own[a]!.at, own[b]!.at) > distance(best[0].at, best[1].at) + 1e-9) best = [own[a]!, own[b]!];
    chosen.push(...best);
  }
  if (short.length > 0) return { latches: chosen, problem: `has no room for two latches in tile ${short.join(", ")}: each latch needs a slot ${edge} mm inside its tile` };

  // Then cover the overlay: the slot nearest its worst point, until every point is in reach.
  const reach = GRID.overlay.reach - SAMPLE;
  const steps = (from: number, to: number) => {
    const n = Math.max(1, Math.ceil((to - from) / SAMPLE));
    return Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
  };
  const samples = steps(box.x0, box.x1).flatMap((x) => steps(box.y0, box.y1).map((y): [number, number] => [x, y]));
  const worst = () => {
    let far = { at: samples[0]!, d: -1 };
    for (const s of samples) {
      const d = Math.min(...chosen.map((c) => distance(s, c.at)));
      if (d > far.d) far = { at: s, d };
    }
    return far;
  };
  for (let far = worst(); far.d > reach; far = worst()) {
    const left = candidates.filter((c) => !chosen.includes(c));
    if (left.length === 0) return { latches: chosen, problem: `can't be latched so no point is more than ${GRID.overlay.reach} mm from a latch` };
    chosen.push(left.reduce((a, b) => (distance(b.at, far.at) < distance(a.at, far.at) ? b : a)));
  }

  // Three or more, not in a line, so it can't rock about one.
  const offLine = (c: BoardLatch) => {
    const [a, b] = [chosen[0]!.at, chosen.at(-1)!.at];
    const length = distance(a, b);
    return length < 1e-9 ? distance(a, c.at) : Math.abs((b[0] - a[0]) * (c.at[1] - a[1]) - (b[1] - a[1]) * (c.at[0] - a[0])) / length;
  };
  if (chosen.length < 3 || chosen.every((c) => offLine(c) < 1)) {
    const left = candidates.filter((c) => !chosen.includes(c));
    const third = left.reduce<BoardLatch | undefined>((a, c) => (!a || offLine(c) > offLine(a) ? c : a), undefined);
    if (!third || offLine(third) < 1) return { latches: chosen, problem: "needs three latches not in a line, and has room for only one line of them" };
    chosen.push(third);
  }
  return { latches: chosen };
}
