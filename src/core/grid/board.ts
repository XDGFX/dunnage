import type { CrossSection, Manifold, ManifoldToplevel, Vec3 } from "manifold-3d";
import type { Side } from "../drawers.ts";
import type { Box } from "../geometry.ts";
import { boardHole, OUTWARD, type BoardBumper, type BoardLayout, type BoardTile, type Hole } from "./layout.ts";
import { GRID, gridFit, type PrinterFit } from "./parameters.ts";
import { joinerRoom, peg, PITCH, printJoiner, THICKNESS, tile, VARIANTS } from "./tile.ts";

// The solids of a laid-out grid board, each built in place the right way up with z from the floor,
// which `printable` turns face down onto the bed.

/** Every part of the board: one solid per tile and bumper in place, and one joiner and one peg as they print. */
export interface BoardParts {
  tiles: { tile: BoardTile; solid: Manifold }[];
  bumpers: { bumper: BoardBumper; solid: Manifold }[];
  joiner: Manifold;
  peg: Manifold;
}

const BIG = 1000;
const RAD = Math.PI / 180;

export function buildBoard(wasm: ManifoldToplevel, layout: BoardLayout, fit?: PrinterFit): BoardParts {
  return {
    tiles: layout.tiles.map((t) => ({ tile: t, solid: tileSolid(wasm, layout, t, fit) })),
    bumpers: layout.bumpers.map((b) => ({ bumper: b, solid: bumperSolid(wasm, layout, b, fit) })),
    joiner: joinerSolid(wasm, layout, fit),
    peg: pegSolid(wasm, layout, fit),
  };
}

/** A part turned face down onto the bed, at the origin. */
export function printable(part: Manifold): Manifold {
  const turned = part.rotate([180, 0, 0]);
  const { min } = turned.boundingBox();
  return turned.translate([-min[0], -min[1], -min[2]]);
}

/** Parts are made face down, z from the face, as `tile` makes them; this stands one up in the drawer. */
const standUp = (part: Manifold) => part.mirror([0, 0, 1]).translate([0, 0, THICKNESS]);

/** Where a `row-col` label's dots sit on a tile's face, in the tile's own coordinates: the row's dots, a gap, then the column's. */
export function labelDots(layout: BoardLayout, t: BoardTile): { at: [number, number]; count: number }[] {
  // Clear of the chamfer on an overlay's free front edge.
  const chamfered = t.row === 0 && layout.free?.includes("front") ? GRID.overlay.chamfer + GRID.label.dot : 0;
  const y = Math.max(VARIANTS[layout.variant].band / 2, GRID.label.inset, chamfered);
  const spacing = GRID.label.spacing;
  const [rowDots, colDots] = [t.row + 1, t.col + 1];
  return [
    { at: [PITCH + ((rowDots - 1) * spacing) / 2, y], count: rowDots },
    { at: [PITCH + (rowDots + 1) * spacing + ((colDots - 1) * spacing) / 2, y], count: colDots },
  ];
}

/**
 * The lap tab's profile, and the rebate in the tile over it, as (u, z): u in from the board's edge,
 * z from the face. The rebate stands the clearance off the tab all round.
 */
function lapTabProfiles(depth: number): { tab: [number, number][]; rebate: [number, number][] } {
  const { thickness: th, clearance: cl, slope } = GRID.lap_tab;
  const rise = Math.tan(slope * RAD);
  const overlap = 0.01;
  const off = cl / Math.cos(slope * RAD);
  return {
    tab: [
      [-overlap, THICKNESS],
      [depth, THICKNESS],
      [depth, THICKNESS - th],
      [-overlap, THICKNESS - th - (depth + overlap) * rise],
    ],
    rebate: [
      [-1, THICKNESS + 1],
      [depth + cl, THICKNESS + 1],
      [depth + cl, THICKNESS - th - cl],
      [depth + (off - cl) / rise, THICKNESS - th - cl],
      [-1, THICKNESS - th - (depth + 1) * rise - off],
    ],
  };
}

export function tileSolid(wasm: ManifoldToplevel, layout: BoardLayout, t: BoardTile, fit?: PrinterFit): Manifold {
  const hole = boardHole(layout.variant, gridFit(fit));
  const [i0, j0] = t.first;
  const inSet = (holes: readonly Hole[]) => {
    const set = new Set(holes.map(([i, j]) => `${i},${j}`));
    return set.size === 0 ? undefined : (i: number, j: number) => set.has(`${i0 + i},${j0 + j}`);
  };
  const cut = cornerCut(wasm, layout);
  const [w, d] = [t.box.x1 - t.box.x0, t.box.y1 - t.box.y0];
  const clip = cut && !cut.intersect(wasm.CrossSection.square([w, d]).translate(t.box.x0, t.box.y0)).isEmpty()
    ? wasm.CrossSection.square([w + 2, d + 2]).translate(-1, -1).subtract(cut.translate(-t.box.x0, -t.box.y0))
    : undefined;
  const outer = outerSides(layout, t);
  const local = tile(wasm, {
    variant: layout.variant,
    nx: t.size[0],
    ny: t.size[1],
    hole,
    drop: inSet(layout.dropped),
    countersink: inSet(layout.countersinks),
    // A grid base's joiners may reach its bumpers; an overlay's are only between its own tiles.
    joiners: layout.kind === "grid" ? true : SIDES.filter((side) => !outer.includes(side)),
    clip,
    dots: labelDots(layout, t),
  });
  let placed = local.translate([t.box.x0, t.box.y0, 0]);
  if (layout.kind === "grid") {
    // A rebate under each edge that meets a bumper, for its lap tab, so the tile still sits flat.
    const { rebate } = lapTabProfiles(layout.lapTab);
    placed = placed.subtract(wasm.Manifold.union(outer.map((side) => edgePrism(wasm, side, t.box, rebate, 1))));
  }
  // An overlay's free edge faces the pegboard: a wide band so it doesn't crack, chamfered on the face so nothing catches.
  const free = outer.filter((side) => layout.free?.includes(side));
  if (free.length > 0) {
    const { band, chamfer: c } = GRID.overlay;
    placed = placed
      .add(wasm.Manifold.union(free.map((side) => edgePrism(wasm, side, t.box, [[0, 0], [band, 0], [band, THICKNESS], [0, THICKNESS]]))))
      .subtract(wasm.Manifold.union(free.map((side) => edgePrism(wasm, side, t.box, [[-1, -1], [c + 1, -1], [-1, c + 1]], 1))));
  }
  return standUp(placed);
}

const SIDES: Side[] = ["left", "right", "front", "back"];

/** The sides of a tile on the board's outside edge. */
function outerSides(layout: BoardLayout, t: BoardTile): Side[] {
  const lastRow = Math.max(...layout.tiles.map((other) => other.row));
  const lastCol = Math.max(...layout.tiles.map((other) => other.col));
  return [
    ...(t.col === 0 ? (["left"] as const) : []),
    ...(t.col === lastCol ? (["right"] as const) : []),
    ...(t.row === 0 ? (["front"] as const) : []),
    ...(t.row === lastRow ? (["back"] as const) : []),
  ];
}

/** How far out along `side`'s outward direction a box's edge on that side is. */
function edgeOf(box: Box, side: Side): number {
  const [dx, dy] = OUTWARD[side];
  return dx ? dx * (dx < 0 ? box.x0 : box.x1) : dy * (dy < 0 ? box.y0 : box.y1);
}

/**
 * A prism along one edge of a box, from a convex profile in (u, z): u in from that edge, z from the
 * face as parts are made. `past` runs it on beyond the box's ends.
 */
function edgePrism(wasm: ManifoldToplevel, side: Side, box: Box, profile: [number, number][], past = 0): Manifold {
  const [dx, dy] = OUTWARD[side];
  const edge = edgeOf(box, side);
  const points: Vec3[] = profile.flatMap(([u, z]): Vec3[] => {
    const across = (edge - u) * (dx || dy);
    return dx
      ? [[across, box.y0 - past, z], [across, box.y1 + past, z]]
      : [[box.x0 - past, across, z], [box.x1 + past, across, z]];
  });
  return wasm.Manifold.hull(points);
}

export function bumperSolid(wasm: ManifoldToplevel, layout: BoardLayout, b: BoardBumper, fit?: PrinterFit): Manifold {
  const { Manifold } = wasm;
  const { floor, top } = b;
  // Made face down: the face's footprint at z = 0 and the floor's at z = THICKNESS.
  const corners = (box: Box, z: number): Vec3[] => [
    [box.x0, box.y0, z],
    [box.x1, box.y0, z],
    [box.x1, box.y1, z],
    [box.x0, box.y1, z],
  ];
  let solid = Manifold.hull([...corners(top, 0), ...corners(floor, THICKNESS)]);
  // The lap tab along its foot, under the tile's band; its sloping top prints face down.
  if (b.tab.x1 > b.tab.x0 && b.tab.y1 > b.tab.y0) solid = solid.add(edgePrism(wasm, b.side, b.tab, lapTabProfiles(layout.lapTab).tab));

  // A 45° chamfer along the floor edge of each wall it bears on, at least the floor edge's size.
  const e = layout.shape.floor_edge;
  if (e > 0) {
    for (const wall of b.walls) {
      const [nx, ny] = OUTWARD[wall];
      // Keep s + z ≤ edge + THICKNESS − e, where s is the distance outward.
      solid = solid.trimByPlane([-nx / Math.SQRT2, -ny / Math.SQRT2, -1 / Math.SQRT2], -(edgeOf(floor, wall) + THICKNESS - e) / Math.SQRT2);
    }
  }

  const voids: Manifold[] = [];
  const cut = cornerCut(wasm, layout);
  if (cut) voids.push(Manifold.extrude(cut, THICKNESS + 2).translate([0, 0, -1]));
  // Room for each joiner with a ring over this bumper.
  const hole = boardHole(layout.variant, gridFit(fit));
  const room = joinerRoom(wasm, layout.variant, hole);
  const inside = (x: number, y: number) => x > floor.x0 && x < floor.x1 && y > floor.y0 && y < floor.y1;
  for (const [x, y] of layout.joiners) {
    const rings = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [x + (sx * PITCH) / 2, y + (sy * PITCH) / 2] as const));
    if (rings.some(([rx, ry]) => inside(rx, ry))) voids.push(room.translate([x, y, 0]));
  }
  if (voids.length > 0) solid = solid.subtract(Manifold.union(voids));
  return standUp(solid);
}

/** One joiner, as it prints. */
export function joinerSolid(wasm: ManifoldToplevel, layout: BoardLayout, fit?: PrinterFit): Manifold {
  const fits = gridFit(fit);
  return printJoiner(wasm, layout.variant, boardHole(layout.variant, fits), fits.joiner);
}

/** One peg, as it prints: smaller than the board hole by the calibrated peg fit. */
export function pegSolid(wasm: ManifoldToplevel, layout: BoardLayout, fit?: PrinterFit): Manifold {
  const fits = gridFit(fit);
  return peg(wasm, boardHole(layout.variant, fits) - fits.peg);
}

/** What the drawer's rounded corners cut away, on the floor, or undefined for square corners. */
function cornerCut(wasm: ManifoldToplevel, layout: BoardLayout): CrossSection | undefined {
  const { corner } = layout;
  if (!corner) return undefined;
  const { CrossSection } = wasm;
  const [W, D] = layout.shape.inside;
  const R = corner.radius;
  let one = CrossSection.square([R + BIG, R + BIG]).translate(-BIG, -BIG);
  if (corner.cut > 0) one = one.subtract(CrossSection.circle(corner.cut, 64).translate(R, R));
  return CrossSection.union([
    one,
    one.mirror([1, 0]).translate(W, 0),
    one.mirror([0, 1]).translate(0, D),
    one.mirror([1, 0]).mirror([0, 1]).translate(W, D),
  ]);
}
