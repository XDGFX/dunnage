import type { DrawerShape, Side } from "../drawers.ts";
import type { Box } from "../geometry.ts";
import type { Drawer } from "../schema.ts";
import { GRID, gridFit, type Fit, type Variant } from "./parameters.ts";

// Laying a grid board out in a drawer (#6 §4–§5), in plane geometry only, so it can be drawn
// without building a solid. Units are mm on the drawer floor: x left to right, y front to back,
// from the floor's front-left corner. Hole [0, 0] is the one nearest that corner.

export type GridBase = Extract<NonNullable<Drawer["base"]>, { kind: "grid" }>;
export type Hole = readonly [number, number];
type Path = (string | number)[];

const PITCH = GRID.pitch;
const THICKNESS = GRID.thickness;

export interface BoardTile {
  /** Counted from the front (row) and the left (col), from 0. */
  row: number;
  col: number;
  /** `row-col`, from 1, as debossed on the face. */
  label: string;
  /** The tile's front-left hole, in board holes. */
  first: Hole;
  /** In holes. */
  size: [number, number];
  box: Box;
}

export interface BoardBumper {
  /** The wall it fills out to. */
  side: Side;
  /** Along its wall: the tile column (front, back) or row (left, right) it runs beside. */
  index: number;
  /** Its footprint on the floor. */
  floor: Box;
  /** Its footprint at the board's face, wider where it meets a sloping wall. */
  top: Box;
  /** The walls it bears on: its own, and the front or back where a side bumper runs past a corner. */
  walls: Side[];
  /** The lap tab's footprint: along its foot, under the tile's edge band. */
  tab: Box;
}

export interface BoardLayout {
  variant: Variant;
  shape: DrawerShape;
  /** Clearance to each wall, at the floor. */
  fit: number;
  /** The whole board, in holes. */
  holes: [number, number];
  /** The board's front-left corner, where hole [0, 0]'s cell starts. */
  origin: [number, number];
  /** Each side's bumper thickness at the floor. */
  gap: Record<Side, number>;
  tiles: BoardTile[];
  bumpers: BoardBumper[];
  /** Where each joiner is centred, on the corner between its four bosses. */
  joiners: [number, number][];
  /** Holes a rounded drawer corner cuts, left out of their tile. */
  dropped: Hole[];
  countersinks: Hole[];
  /** The radius rounded drawer corners are cut to, round the corner's own centre; absent when the corners are square. */
  corner?: { radius: number; cut: number };
  /** What stops the board being laid out as asked, by the drawer file field it's about. */
  problems: { at: Path; message: string }[];
}

export interface LayoutOptions {
  /** The printer's bed. Default: the Bambu P1S's. */
  bed?: readonly [number, number, number];
  /** The printer's fits over the calibrated defaults. */
  fit?: Partial<Fit>;
}

const DEFAULT_BED = [256, 256, 256] as const;
const RAD = Math.PI / 180;

/** Splits `n` holes into `k` tiles, the larger first, none more than one hole bigger than another. */
function balanced(n: number, k: number): number[] {
  return Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
}

/** The joiner's reach from the line between a tile and a bumper: half a pitch to the boss, then the ring. */
export function joinerReach(variant: Variant, fit: Fit): number {
  return PITCH / 2 + boardHole(variant, fit) / 2 + GRID.variants[variant].wall + fit.joiner + GRID.joiner.wall;
}

/** The board hole for a variant; one never calibrated takes the default variant's, as a stand-in. */
export function boardHole(variant: Variant, fit: Fit): number {
  return fit.grid_hole[variant] ?? fit.grid_hole[GRID.variant]!;
}

export function layoutBoard(shape: DrawerShape, base: GridBase, options: LayoutOptions = {}): BoardLayout {
  const problems: BoardLayout["problems"] = [];
  const variant = base.variant ?? GRID.variant;
  const fits = gridFit(options.fit);
  const c = base.bumpers?.fit ?? GRID.bumper.fit;
  const [width, depth] = shape.inside;
  const bed = options.bed ?? DEFAULT_BED;
  const limit = [bed[0] - GRID.tile.bed_margin, bed[1] - GRID.tile.bed_margin];
  const { min, max } = GRID.bumper;
  const split = base.bumpers?.split ?? "even";
  const weight = { x: split === "even" ? "even" : (split.x ?? "even"), y: split === "even" ? "even" : (split.y ?? "even") };

  // Holes on an axis: as many as leave at least the thinnest bumper either side.
  const axis = (length: number, named: string, low: string): { n: number; low: number; high: number } => {
    const n = Math.max(0, Math.floor((length - 2 * c - 2 * min) / PITCH + 1e-9));
    const r = length - 2 * c - n * PITCH;
    // A named side takes all it can, up to the thickest bumper, and leaves the other side the rest.
    const heavy = Math.min(max, r - min);
    const lowGap = named === "even" ? r / 2 : named === low ? heavy : r - heavy;
    return { n, low: lowGap, high: r - lowGap };
  };
  const ax = axis(width, weight.x, "left");
  const ay = axis(depth, weight.y, "front");
  const gap: Record<Side, number> = { left: ax.low, right: ax.high, front: ay.low, back: ay.high };
  const [nx, ny] = [ax.n, ay.n];
  const origin: [number, number] = [c + gap.left, c + gap.front];
  const flare = (side: Side) => THICKNESS * Math.tan(shape.walls[side] * RAD);

  const empty = (message: string): BoardLayout => ({
    variant, shape, fit: c, holes: [nx, ny], origin, gap, tiles: [], bumpers: [], joiners: [], dropped: [], countersinks: [],
    problems: [...problems, { at: ["drawer"], message }],
  });
  if (nx < 1 || ny < 1) {
    return empty(`is too small for a grid board: it needs ${2 * (c + min) + PITCH} mm inside for one hole and its bumpers`);
  }

  // Tile sizes: the biggest the bed (or `base.tile`) allows, then balanced; a side bumper that runs
  // past a corner has to fit the bed too.
  const largest = [Math.floor(limit[0]! / PITCH), Math.floor(limit[1]! / PITCH)];
  if (base.tile) {
    const [tx, ty] = base.tile;
    if (tx > largest[0]! || ty > largest[1]!) {
      problems.push({
        at: ["base", "tile"],
        message: `a ${tx} × ${ty} tile is ${tx * PITCH} × ${ty * PITCH} mm, more than the bed less its ${GRID.tile.bed_margin} mm margin (${limit[0]} × ${limit[1]} mm)`,
      });
    }
  }
  const most = [Math.min(base.tile?.[0] ?? Infinity, largest[0]!), Math.min(base.tile?.[1] ?? Infinity, largest[1]!)];
  const tileSizes = (n: number, cap: number, room: number, ends: [number, number]): number[] | undefined => {
    for (let k = Math.max(1, Math.ceil(n / cap)); k <= n; k++) {
      const sizes = balanced(n, k);
      if (sizes[0]! <= cap && sizes[0]! * PITCH + ends[0] <= room && sizes.at(-1)! * PITCH + ends[1] <= room) return sizes;
    }
    return undefined;
  };
  const columns = most[0]! < 1 ? undefined : tileSizes(nx, most[0]!, limit[0]!, [0, 0]);
  const rows = most[1]! < 1 ? undefined : tileSizes(ny, most[1]!, limit[1]!, [gap.front + flare("front"), gap.back + flare("back")]);
  const sideWidth = Math.max(gap.left + flare("left"), gap.right + flare("right"));
  if (!columns || !rows || sideWidth > limit[0]!) {
    return empty(`can't be laid out in tiles and bumpers that fit a ${bed[0]} × ${bed[1]} mm bed with its ${GRID.tile.bed_margin} mm margin`);
  }

  const starts = (sizes: number[]) => sizes.reduce<number[]>((at, size) => [...at, at.at(-1)! + size], [0]);
  const [xs, ys] = [starts(columns), starts(rows)];
  const X = (i: number) => origin[0] + i * PITCH;
  const Y = (j: number) => origin[1] + j * PITCH;

  const tiles: BoardTile[] = rows.flatMap((sy, row) =>
    columns.map((sx, col) => ({
      row,
      col,
      label: `${row + 1}-${col + 1}`,
      first: [xs[col]!, ys[row]!] as const,
      size: [sx, sy] as [number, number],
      box: { x0: X(xs[col]!), y0: Y(ys[row]!), x1: X(xs[col + 1]!), y1: Y(ys[row + 1]!) },
    })),
  );

  // One bumper per outside tile edge. The side bumpers run past the corners to the front and back walls.
  const [W, D] = [width, depth];
  const bumper = (side: Side, index: number, floor: Box, walls: Side[]): BoardBumper => {
    const top = { ...floor };
    for (const wall of walls) {
      const by = flare(wall);
      if (wall === "left") top.x0 -= by;
      if (wall === "right") top.x1 += by;
      if (wall === "front") top.y0 -= by;
      if (wall === "back") top.y1 += by;
    }
    // The front and back tabs run to the board's corners; the side tabs stop short of them, clear.
    const { depth: d, clearance: gapTab } = GRID.lap_tab;
    const [yIn0, yIn1] = [Y(0) + d + gapTab, Y(ny) - d - gapTab];
    const tab: Box =
      side === "front" ? { x0: floor.x0, y0: Y(0), x1: floor.x1, y1: Y(0) + d }
      : side === "back" ? { x0: floor.x0, y0: Y(ny) - d, x1: floor.x1, y1: Y(ny) }
      : side === "left" ? { x0: X(0), y0: Math.max(floor.y0, yIn0), x1: X(0) + d, y1: Math.min(floor.y1, yIn1) }
      : { x0: X(nx) - d, y0: Math.max(floor.y0, yIn0), x1: X(nx), y1: Math.min(floor.y1, yIn1) };
    return { side, index, floor, top, walls, tab };
  };
  const bumpers: BoardBumper[] = [
    ...columns.map((_, col) => bumper("front", col, { x0: X(xs[col]!), y0: c, x1: X(xs[col + 1]!), y1: origin[1] }, ["front"])),
    ...columns.map((_, col) => bumper("back", col, { x0: X(xs[col]!), y0: Y(ny), x1: X(xs[col + 1]!), y1: D - c }, ["back"])),
    ...(["left", "right"] as const).flatMap((side) =>
      rows.map((_, row) => {
        const [x0, x1] = side === "left" ? [c, origin[0]] : [X(nx), W - c];
        const first = row === 0;
        const last = row === rows.length - 1;
        const walls: Side[] = [side, ...(first ? (["front"] as const) : []), ...(last ? (["back"] as const) : [])];
        return bumper(side, row, { x0, y0: first ? c : Y(ys[row]!), x1, y1: last ? D - c : Y(ys[row + 1]!) }, walls);
      }),
    ),
  ];

  // Joiners: two along every join, one where four parts meet. A bumper too thin to hold a joiner's
  // rings clear of the wall and the floor edge is held by wedging alone.
  const reach = joinerReach(variant, fits) + shape.floor_edge;
  const holds = (side: Side) => gap[side] >= reach;
  const joiners: [number, number][] = [];
  const along = (from: number, holes: number) =>
    [...new Set([Math.round(holes / 4), holes - Math.round(holes / 4)])].filter((g) => g >= 1 && g < holes).map((g) => from + g * PITCH);
  // Edges between columns, and the board's left and right edges.
  for (let a = 0; a <= columns.length; a++) {
    const outer = a === 0 ? "left" : a === columns.length ? "right" : undefined;
    if (outer && !holds(outer)) continue;
    for (let row = 0; row < rows.length; row++) {
      for (const y of along(Y(ys[row]!), rows[row]!)) joiners.push([X(xs[a]!), y]);
      if (row > 0) joiners.push([X(xs[a]!), Y(ys[row]!)]);
    }
  }
  // Edges between rows, and the board's front and back edges.
  for (let b = 0; b <= rows.length; b++) {
    const outer = b === 0 ? "front" : b === rows.length ? "back" : undefined;
    if (outer && !holds(outer)) continue;
    for (let col = 0; col < columns.length; col++) {
      for (const x of along(X(xs[col]!), columns[col]!)) joiners.push([x, Y(ys[b]!)]);
      // Where four tiles meet is counted once, on the column edges above.
      if (col > 0 && outer) joiners.push([X(xs[col]!), Y(ys[b]!)]);
    }
  }

  // Rounded corners, cut with clearance and room for the floor edge's fillet.
  const R = shape.corner_radius;
  const corner = R > 0 ? { radius: R, cut: Math.max(0, R - c - shape.floor_edge) } : undefined;
  const bossOf = (sunk: boolean) => (sunk ? GRID.countersink.head / 2 : boardHole(variant, fits) / 2) + GRID.variants[variant].wall;
  const key = ([i, j]: Hole) => `${i},${j}`;

  const countersinks: Hole[] = [];
  const sunk = new Set<string>();
  for (const [index, hole] of (base.countersinks ?? []).entries()) {
    if (hole[0] >= nx || hole[1] >= ny) {
      problems.push({ at: ["base", "countersinks", index], message: offBoard(hole, nx, ny) });
    } else {
      countersinks.push(hole);
      sunk.add(key(hole));
    }
  }

  const dropped: Hole[] = [];
  if (corner) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const [x, y] = [X(i) + PITCH / 2, Y(j) + PITCH / 2];
        const r = bossOf(sunk.has(key([i, j])));
        // Only holes near a corner can be cut.
        if ((x - r > R && W - x - r > R) || (y - r > R && D - y - r > R)) continue;
        const ring = Array.from({ length: 48 }, (_, n) => [x + r * Math.cos((n * Math.PI) / 24), y + r * Math.sin((n * Math.PI) / 24)] as const);
        if (ring.some(([px, py]) => cornerCuts(shape, corner, px, py))) dropped.push([i, j]);
      }
    }
  }
  const gone = new Set(dropped.map(key));
  for (const [index, hole] of (base.countersinks ?? []).entries()) {
    if (gone.has(key(hole))) problems.push({ at: ["base", "countersinks", index], message: cutAway(hole) });
  }

  return { variant, shape, fit: c, holes: [nx, ny], origin, gap, tiles, bumpers, joiners, dropped, countersinks, ...(corner ? { corner } : {}), problems };
}

/** Whether a point on the floor is in what a rounded corner cuts away. */
export function cornerCuts(shape: DrawerShape, corner: { radius: number; cut: number }, x: number, y: number): boolean {
  const [W, D] = shape.inside;
  const R = corner.radius;
  const u = x < W / 2 ? x : W - x;
  const v = y < D / 2 ? y : D - y;
  return u < R && v < R && Math.hypot(R - u, R - v) > corner.cut;
}

/** Where a hole's centre is on the floor. */
export function holeAt(layout: BoardLayout, [i, j]: Hole): [number, number] {
  return [layout.origin[0] + (i + 0.5) * PITCH, layout.origin[1] + (j + 0.5) * PITCH];
}

/** Why a hole can't take a fixing, or undefined when it can. */
export function holeProblem(layout: BoardLayout, hole: Hole): string | undefined {
  const [nx, ny] = layout.holes;
  if (hole[0] >= nx || hole[1] >= ny) return offBoard(hole, nx, ny);
  if (layout.dropped.some(([i, j]) => i === hole[0] && j === hole[1])) return cutAway(hole);
  return undefined;
}

const offBoard = (hole: Hole, nx: number, ny: number) => `[${hole[0]}, ${hole[1]}] isn't on the board, which is ${nx} × ${ny} holes, from [0, 0] to [${nx - 1}, ${ny - 1}]`;
const cutAway = (hole: Hole) => `[${hole[0]}, ${hole[1]}] is cut away by the drawer's rounded corner`;
