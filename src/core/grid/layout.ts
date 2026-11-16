import type { DrawerShape, Side } from "../drawers.ts";
import type { Box } from "../geometry.ts";
import { PRINTER_PRESETS, type Drawer } from "../schema.ts";
import { GRID, gridFit, type Fit, type PrinterFit, type Variant } from "./parameters.ts";
import { PITCH, THICKNESS, VARIANTS } from "./tile.ts";

// A grid board laid out on the drawer floor (#6 §4–§5) in plane geometry, in mm from the floor's
// front-left corner, x to the right and y to the back.

// The schema builds `variant` from a list, so its static type is lost; it's restored here.
export type GridBase = Omit<Extract<NonNullable<Drawer["base"]>, { kind: "grid" }>, "variant"> & { variant?: Variant };
export type Hole = readonly [number, number];
type Path = (string | number)[];

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
  /** An overlay edge strip's pegs, each centred on an UPPDATERA slot under it. */
  pegs?: [number, number][];
  /** How high its sides rise straight from the floor before sloping in to `top`, so they don't end in a feather edge. */
  land?: number;
}

export interface BoardLayout {
  /** A grid base over the whole floor, or an overlay on a pegboard (an `OverlayLayout`). */
  kind: "grid" | "overlay";
  variant: Variant;
  shape: DrawerShape;
  /** Clearance to each wall, at the floor. */
  fit: number;
  /** The whole board, in holes. */
  holes: [number, number];
  /** The board's front-left corner, where hole [0, 0]'s cell starts. */
  origin: [number, number];
  /** Each side's bumper thickness at the floor: board to wall, less the clearance, before the floor edge's chamfer. */
  gap: Record<Side, number>;
  /** How far the bumpers' lap tabs reach under the tiles. */
  lapTab: number;
  tiles: BoardTile[];
  bumpers: BoardBumper[];
  /** Where each joiner is centred, on the corner between its four bosses. */
  joiners: [number, number][];
  /** Holes a rounded drawer corner cuts, left out of their tile. */
  dropped: Hole[];
  countersinks: Hole[];
  /** The radius rounded drawer corners are cut to, round the corner's own centre; absent when the corners are square. */
  corner?: { radius: number; cut: number };
  /** An overlay's edges that face the pegboard rather than a drawer wall, which get a wide band and a chamfer. */
  free?: Side[];
  /** What stops the board being laid out as asked, by the drawer file field it's about. */
  problems: { at: Path; message: string }[];
}

/** A grid base, laid out over the whole floor. */
export type GridLayout = BoardLayout & { kind: "grid" };

export interface LayoutOptions {
  /** The printer's bed. Default: the Bambu P1S's. */
  bed?: readonly [number, number, number];
  /** The printer's fits over the calibrated defaults. */
  fit?: PrinterFit;
}

/** Each wall's outward direction on the floor. */
export const OUTWARD: Record<Side, readonly [number, number]> = { left: [-1, 0], right: [1, 0], front: [0, -1], back: [0, 1] };

/** A box with its edge on `side` moved outward by `by`. */
export function stretch(box: Box, side: Side, by: number): Box {
  const [dx, dy] = OUTWARD[side];
  return { x0: box.x0 + Math.min(dx, 0) * by, y0: box.y0 + Math.min(dy, 0) * by, x1: box.x1 + Math.max(dx, 0) * by, y1: box.y1 + Math.max(dy, 0) * by };
}

const DEFAULT_BED = PRINTER_PRESETS["bambu-p1s"];
const RAD = Math.PI / 180;

/** Splits `n` holes into `k` tiles, the larger first, none more than one hole bigger than another. */
function balanced(n: number, k: number): number[] {
  return Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
}

/** The joiner's reach from the line between a tile and a bumper: half a pitch to the boss, then the ring. */
export function joinerReach(variant: Variant, fit: Fit): number {
  return PITCH / 2 + boardHole(variant, fit) / 2 + VARIANTS[variant].wall + fit.joiner + GRID.joiner.wall;
}

/** The board hole for a variant; one never calibrated takes the default variant's, as a stand-in. */
export function boardHole(variant: Variant, fit: Fit): number {
  return fit.grid_hole[variant] ?? fit.grid_hole[GRID.variant]!;
}

/** The lap tab's reach under a tile: the set depth, or less where the edge bosses come closer, so its rebate leaves them whole. */
export function lapTabDepth(variant: Variant, fit: Fit): number {
  const bossFromEdge = PITCH / 2 - boardHole(variant, fit) / 2 - VARIANTS[variant].wall;
  return Math.min(GRID.lap_tab.depth, bossFromEdge - GRID.lap_tab.clearance);
}

export function layoutBoard(shape: DrawerShape, base: GridBase, options: LayoutOptions = {}): GridLayout {
  const problems: BoardLayout["problems"] = [];
  const variant = base.variant ?? GRID.variant;
  const fits = gridFit(options.fit);
  const clearance = base.bumpers?.fit ?? GRID.bumper.fit;
  const lapTab = lapTabDepth(variant, fits);
  const [width, depth] = shape.inside;
  const bed = options.bed ?? DEFAULT_BED;
  const room = [bed[0] - GRID.tile.bed_margin, bed[1] - GRID.tile.bed_margin] as const;
  const { min, max } = GRID.bumper;
  const split = base.bumpers?.split ?? "even";
  const weight = { x: split === "even" ? "even" : (split.x ?? "even"), y: split === "even" ? "even" : (split.y ?? "even") };

  // Holes on an axis: as many as leave at least the thinnest bumper either side.
  const axis = (length: number, named: string, low: string): { n: number; low: number; high: number } => {
    const n = Math.max(0, Math.floor((length - 2 * clearance - 2 * min) / PITCH + 1e-9));
    const left = length - 2 * clearance - n * PITCH;
    // A named side takes all it can, up to the thickest bumper, and leaves the other side the rest.
    const heavy = Math.min(max, left - min);
    const lowGap = named === "even" ? left / 2 : named === low ? heavy : left - heavy;
    return { n, low: lowGap, high: left - lowGap };
  };
  const ax = axis(width, weight.x, "left");
  const ay = axis(depth, weight.y, "front");
  const gap: Record<Side, number> = { left: ax.low, right: ax.high, front: ay.low, back: ay.high };
  const [nx, ny] = [ax.n, ay.n];
  const origin: [number, number] = [clearance + gap.left, clearance + gap.front];
  const flare = (side: Side) => THICKNESS * Math.tan(shape.walls[side] * RAD);

  const empty = (message: string): GridLayout => ({
    kind: "grid", variant, shape, fit: clearance, holes: [nx, ny], origin, gap, lapTab, tiles: [], bumpers: [], joiners: [], dropped: [], countersinks: [],
    problems: [...problems, { at: ["drawer"], message }],
  });
  if (nx < 1 || ny < 1) {
    return empty(`is too small for a grid board: it needs ${2 * (clearance + min) + PITCH} mm inside for one hole and its bumpers`);
  }

  // Tile sizes: the biggest the bed (or `base.tile`) allows, then balanced. A side bumper runs past
  // the corners at each end of its column, so it has to fit the bed too.
  const largest = bedTile(bed);
  if (base.tile) {
    const [tx, ty] = base.tile;
    if (tx > largest[0]! || ty > largest[1]!) {
      problems.push({
        at: ["base", "tile"],
        message: `a ${tx} × ${ty} tile is ${tx * PITCH} × ${ty * PITCH} mm, more than the bed less its ${GRID.tile.bed_margin} mm margin (${room[0]} × ${room[1]} mm)`,
      });
    }
  }
  const cap = [Math.min(base.tile?.[0] ?? Infinity, largest[0]!), Math.min(base.tile?.[1] ?? Infinity, largest[1]!)];
  const columns = cap[0]! < 1 ? undefined : cutAxis(nx, cap[0]!, room[0], [0, 0]);
  const rows = cap[1]! < 1 ? undefined : cutAxis(ny, cap[1]!, room[1], [gap.front + flare("front"), gap.back + flare("back")]);
  const sideWidth = Math.max(gap.left + flare("left"), gap.right + flare("right")) + lapTab;
  const endDepth = Math.max(gap.front + flare("front"), gap.back + flare("back")) + lapTab;
  if (!columns || !rows || sideWidth > room[0] || endDepth > room[1]) {
    return empty(`can't be laid out in tiles and bumpers that fit a ${bed[0]} × ${bed[1]} mm bed with its ${GRID.tile.bed_margin} mm margin`);
  }

  const [xs, ys] = [starts(columns), starts(rows)];
  const atX = (i: number) => origin[0] + i * PITCH;
  const atY = (j: number) => origin[1] + j * PITCH;
  const tiles = boardTiles(origin, columns, rows);

  // One bumper per outside tile edge. The side bumpers run past the corners to the front and back walls.
  const board: Box = { x0: atX(0), y0: atY(0), x1: atX(nx), y1: atY(ny) };
  const bumper = (side: Side, index: number, floor: Box, walls: Side[]): BoardBumper => {
    const top = walls.reduce((box, wall) => stretch(box, wall, flare(wall)), floor);
    // A strip of the board along this edge; the side tabs stop clear of the front and back tabs.
    const [dx] = OUTWARD[side];
    const reach = lapTab + GRID.lap_tab.clearance;
    const strip: Box = dx
      ? { x0: dx < 0 ? board.x0 : board.x1 - lapTab, x1: dx < 0 ? board.x0 + lapTab : board.x1, y0: Math.max(floor.y0, board.y0 + reach), y1: Math.min(floor.y1, board.y1 - reach) }
      : { x0: floor.x0, x1: floor.x1, y0: side === "front" ? board.y0 : board.y1 - lapTab, y1: side === "front" ? board.y0 + lapTab : board.y1 };
    return { side, index, floor, top, walls, tab: strip };
  };
  const [W, D] = [width, depth];
  const bumpers: BoardBumper[] = [
    ...columns.map((_, col) => bumper("front", col, { x0: atX(xs[col]!), y0: clearance, x1: atX(xs[col + 1]!), y1: board.y0 }, ["front"])),
    ...columns.map((_, col) => bumper("back", col, { x0: atX(xs[col]!), y0: board.y1, x1: atX(xs[col + 1]!), y1: D - clearance }, ["back"])),
    ...(["left", "right"] as const).flatMap((side) =>
      rows.map((_, row) => {
        const [x0, x1] = side === "left" ? [clearance, board.x0] : [board.x1, W - clearance];
        const first = row === 0;
        const last = row === rows.length - 1;
        const walls: Side[] = [side, ...(first ? (["front"] as const) : []), ...(last ? (["back"] as const) : [])];
        return bumper(side, row, { x0, y0: first ? clearance : atY(ys[row]!), x1, y1: last ? D - clearance : atY(ys[row + 1]!) }, walls);
      }),
    ),
  ];

  // Joiners: two along every join, one where four parts meet. A bumper too thin to hold a joiner's
  // rings clear of the wall and the floor edge is held by its lap tab alone.
  const reach = joinerReach(variant, fits) + shape.floor_edge;
  const { joiners, shortest } = boardJoiners(origin, columns, rows, (side) => gap[side] >= reach);
  if (shortest < Infinity) {
    problems.push({
      at: base.tile ? ["base", "tile"] : ["drawer"],
      message: `makes a joined tile edge only ${shortest} ${shortest === 1 ? "hole" : "holes"} long: two joiners per join need at least 3`,
    });
  }

  // Rounded corners, cut with clearance and room for the floor edge's fillet.
  const R = shape.corner_radius;
  const corner = R > 0 ? { radius: R, cut: Math.max(0, R - clearance - shape.floor_edge) } : undefined;
  const bossOf = (countersunk: boolean) => (countersunk ? GRID.countersink.head / 2 : boardHole(variant, fits) / 2) + VARIANTS[variant].wall;
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
        const [x, y] = [atX(i) + PITCH / 2, atY(j) + PITCH / 2];
        const r = bossOf(sunk.has(key([i, j])));
        // Only holes near a corner can be cut.
        if ((x - r > R && W - x - r > R) || (y - r > R && D - y - r > R)) continue;
        const ring = Array.from({ length: 48 }, (_, n) => [x + r * Math.cos((n * Math.PI) / 24), y + r * Math.sin((n * Math.PI) / 24)] as const);
        if (ring.some(([px, py]) => cornerCuts(shape, corner, px, py))) dropped.push([i, j]);
      }
    }
  }
  const droppedKeys = new Set(dropped.map(key));
  for (const [index, hole] of (base.countersinks ?? []).entries()) {
    if (droppedKeys.has(key(hole))) problems.push({ at: ["base", "countersinks", index], message: cutAway(hole) });
  }

  return {
    kind: "grid", variant, shape, fit: clearance, holes: [nx, ny], origin, gap, lapTab, tiles, bumpers, joiners, dropped, countersinks,
    ...(corner ? { corner } : {}), problems,
  };
}

/**
 * Cuts `n` holes into as few balanced tiles as fit under `most` holes and `length` mm, the end
 * tiles with `ends` more to carry (the bumpers that run past a corner).
 */
export function cutAxis(n: number, most: number, length: number, [front, back]: readonly [number, number]): number[] | undefined {
  for (let k = Math.max(1, Math.ceil(n / most)); k <= n; k++) {
    const sizes = balanced(n, k);
    const fits = k === 1 ? sizes[0]! * PITCH + front + back <= length : sizes[0]! * PITCH + front <= length && sizes.at(-1)! * PITCH + back <= length;
    if (sizes[0]! <= most && fits) return sizes;
  }
  return undefined;
}

const starts = (sizes: number[]) => sizes.reduce<number[]>((at, size) => [...at, at.at(-1)! + size], [0]);

/** Tiles in rows and columns of these sizes, in holes, from `origin`. */
export function boardTiles(origin: readonly [number, number], columns: number[], rows: number[]): BoardTile[] {
  const [xs, ys] = [starts(columns), starts(rows)];
  const atX = (i: number) => origin[0] + i * PITCH;
  const atY = (j: number) => origin[1] + j * PITCH;
  return rows.flatMap((sy, row) =>
    columns.map((sx, col) => ({
      row,
      col,
      label: `${row + 1}-${col + 1}`,
      first: [xs[col]!, ys[row]!] as const,
      size: [sx, sy] as [number, number],
      box: { x0: atX(xs[col]!), y0: atY(ys[row]!), x1: atX(xs[col + 1]!), y1: atY(ys[row + 1]!) },
    })),
  );
}

/**
 * Joiners: two along every join, one where four parts meet, and along an outer edge only where
 * `outer` says a part there takes them. `shortest` is the shortest joined edge with room for
 * fewer than two, in holes.
 */
export function boardJoiners(origin: readonly [number, number], columns: number[], rows: number[], outer: (side: Side) => boolean): { joiners: [number, number][]; shortest: number } {
  const [xs, ys] = [starts(columns), starts(rows)];
  const atX = (i: number) => origin[0] + i * PITCH;
  const atY = (j: number) => origin[1] + j * PITCH;
  const joiners: [number, number][] = [];
  let shortest = Infinity;
  const twoAlong = (from: number, holes: number) => {
    const at = [...new Set([Math.round(holes / 4), holes - Math.round(holes / 4)])].filter((g) => g >= 1 && g < holes).map((g) => from + g * PITCH);
    if (at.length < 2) shortest = Math.min(shortest, holes);
    return at;
  };
  // Edges between columns, and the left and right edges.
  for (let a = 0; a <= columns.length; a++) {
    const edge = a === 0 ? "left" : a === columns.length ? "right" : undefined;
    if (edge && !outer(edge)) continue;
    for (let row = 0; row < rows.length; row++) {
      for (const y of twoAlong(atY(ys[row]!), rows[row]!)) joiners.push([atX(xs[a]!), y]);
      if (row > 0) joiners.push([atX(xs[a]!), atY(ys[row]!)]);
    }
  }
  // Edges between rows, and the front and back edges.
  for (let b = 0; b <= rows.length; b++) {
    const edge = b === 0 ? "front" : b === rows.length ? "back" : undefined;
    if (edge && !outer(edge)) continue;
    for (let col = 0; col < columns.length; col++) {
      for (const x of twoAlong(atX(xs[col]!), columns[col]!)) joiners.push([x, atY(ys[b]!)]);
      // Where four tiles meet is counted once, on the column edges above.
      if (col > 0 && edge) joiners.push([atX(xs[col]!), atY(ys[b]!)]);
    }
  }
  return { joiners, shortest };
}

/** Whether a point on the floor is in what a rounded corner cuts away. */
export function cornerCuts(shape: DrawerShape, corner: { radius: number; cut: number }, x: number, y: number): boolean {
  const [W, D] = shape.inside;
  const R = corner.radius;
  const u = x < W / 2 ? x : W - x;
  const v = y < D / 2 ? y : D - y;
  return u < R && v < R && Math.hypot(R - u, R - v) > corner.cut;
}

/** The largest tile a bed takes, in holes, less its margin. */
export function bedTile(bed: readonly [number, number, number]): [number, number] {
  return [Math.floor((bed[0] - GRID.tile.bed_margin) / PITCH), Math.floor((bed[1] - GRID.tile.bed_margin) / PITCH)];
}

/** Each tile column's width and each tile row's depth, in holes, from the left and the front. */
export function tileSizes(layout: BoardLayout): { columns: number[]; rows: number[] } {
  return {
    columns: layout.tiles.filter((t) => t.row === 0).map((t) => t.size[0]),
    rows: layout.tiles.filter((t) => t.col === 0).map((t) => t.size[1]),
  };
}

/** The hole nearest each corner of the board that a rounded drawer corner leaves, each once. */
export function cornerHoles(layout: BoardLayout): Hole[] {
  const [nx, ny] = layout.holes;
  if (nx < 1 || ny < 1) return [];
  const dropped = new Set(layout.dropped.map(([i, j]) => `${i},${j}`));
  const holes = new Map<string, Hole>();
  for (const [i, j, di, dj] of [[0, 0, 1, 1], [nx - 1, 0, -1, 1], [0, ny - 1, 1, -1], [nx - 1, ny - 1, -1, -1]] as const) {
    // Step in along the diagonal past any holes the corner cuts.
    let k = 0;
    while (k < Math.min(nx, ny) - 1 && dropped.has(`${i + k * di},${j + k * dj}`)) k++;
    const hole: Hole = [i + k * di, j + k * dj];
    holes.set(`${hole[0]},${hole[1]}`, hole);
  }
  return [...holes.values()];
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
