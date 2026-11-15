import type { CrossSection, Manifold, ManifoldToplevel, Vec3 } from "manifold-3d";
import type { Side } from "../drawers.ts";
import { boardHole, type BoardBumper, type BoardLayout, type BoardTile, type Hole } from "./layout.ts";
import { GRID, gridFit, type Fit } from "./parameters.ts";
import { joinerRoom, peg, PITCH, printJoiner, THICKNESS, tile, VARIANTS } from "./tile.ts";

// The solids of a laid-out grid board. Each part is built where it sits in the drawer, the right way
// up: x and y on the floor as in the layout, z up from the floor. `printable` turns one over onto
// the bed, face down, as it prints.

/** Every part of the board: one solid per tile and bumper in place, and one joiner and one peg as they print. */
export interface BoardParts {
  tiles: { tile: BoardTile; solid: Manifold }[];
  bumpers: { bumper: BoardBumper; solid: Manifold }[];
  joiner: Manifold;
  peg: Manifold;
}

const BIG = 1000;

export function buildBoard(wasm: ManifoldToplevel, layout: BoardLayout, fit?: Partial<Fit>): BoardParts {
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

export function tileSolid(wasm: ManifoldToplevel, layout: BoardLayout, t: BoardTile, fit?: Partial<Fit>): Manifold {
  const hole = boardHole(layout.variant, gridFit(fit));
  const [i0, j0] = t.first;
  const has = (holes: readonly Hole[]) => {
    const set = new Set(holes.map(([i, j]) => `${i},${j}`));
    return set.size === 0 ? undefined : (i: number, j: number) => set.has(`${i0 + i},${j0 + j}`);
  };
  const band = VARIANTS[layout.variant].band;
  const y = Math.max(band / 2, GRID.label.dot + 0.02);
  const spacing = GRID.label.spacing;
  const [rowDots, colDots] = [t.row + 1, t.col + 1];
  // `row-col` along the front band: the row's dots, a gap, then the column's.
  const dots = [
    { at: [PITCH + ((rowDots - 1) * spacing) / 2, y] as [number, number], count: rowDots },
    { at: [PITCH + (rowDots + 1) * spacing + ((colDots - 1) * spacing) / 2, y] as [number, number], count: colDots },
  ];
  const cut = cornerCut(wasm, layout);
  const clip = cut && !cut.intersect(wasm.CrossSection.square([t.box.x1 - t.box.x0, t.box.y1 - t.box.y0]).translate(t.box.x0, t.box.y0)).isEmpty()
    ? wasm.CrossSection.square([t.box.x1 - t.box.x0 + 2, t.box.y1 - t.box.y0 + 2]).translate(-1, -1).subtract(cut.translate(-t.box.x0, -t.box.y0))
    : undefined;
  const local = tile(wasm, {
    variant: layout.variant,
    nx: t.size[0],
    ny: t.size[1],
    hole,
    drop: has(layout.dropped),
    countersink: has(layout.countersinks),
    clip,
    dots,
  });
  // A rebate under each edge that meets a bumper, for its lap tab, so the tile still sits flat.
  const lastRow = Math.max(...layout.tiles.map((other) => other.row));
  const lastCol = Math.max(...layout.tiles.map((other) => other.col));
  const outer: Side[] = [
    ...(t.col === 0 ? (["left"] as const) : []),
    ...(t.col === lastCol ? (["right"] as const) : []),
    ...(t.row === 0 ? (["front"] as const) : []),
    ...(t.row === lastRow ? (["back"] as const) : []),
  ];
  const { depth: d, thickness: th, clearance: cl } = GRID.lap_tab;
  const reach = d + cl;
  const rebate: [number, number][] = [
    [-1, THICKNESS + 1],
    [reach, THICKNESS + 1],
    [reach, THICKNESS - th - cl],
    [-1, THICKNESS - th - cl - (reach + 1)],
  ];
  const rebates = outer.map((side) => edgePrism(wasm, side, t.box, rebate, 1));
  const placed = local.translate([t.box.x0, t.box.y0, 0]);
  return standUp(rebates.length > 0 ? placed.subtract(wasm.Manifold.union(rebates)) : placed);
}

/**
 * A prism along one edge of a box, from a convex profile in (u, z): u in from that edge, z from the
 * face as parts are made. `past` runs it on beyond the box's ends.
 */
function edgePrism(wasm: ManifoldToplevel, side: Side, box: { x0: number; y0: number; x1: number; y1: number }, profile: [number, number][], past = 0): Manifold {
  const points: Vec3[] = profile.flatMap(([u, z]) => {
    if (side === "left") return [[box.x0 + u, box.y0 - past, z], [box.x0 + u, box.y1 + past, z]] as Vec3[];
    if (side === "right") return [[box.x1 - u, box.y0 - past, z], [box.x1 - u, box.y1 + past, z]] as Vec3[];
    if (side === "front") return [[box.x0 - past, box.y0 + u, z], [box.x1 + past, box.y0 + u, z]] as Vec3[];
    return [[box.x0 - past, box.y1 - u, z], [box.x1 + past, box.y1 - u, z]] as Vec3[];
  });
  return wasm.Manifold.hull(points);
}

export function bumperSolid(wasm: ManifoldToplevel, layout: BoardLayout, b: BoardBumper, fit?: Partial<Fit>): Manifold {
  const { Manifold } = wasm;
  const { floor, top } = b;
  // Made face down: the face's footprint at z = 0 and the floor's at z = THICKNESS.
  const corners = (box: typeof floor, z: number): Vec3[] => [
    [box.x0, box.y0, z],
    [box.x1, box.y0, z],
    [box.x1, box.y1, z],
    [box.x0, box.y1, z],
  ];
  let solid = Manifold.hull([...corners(top, 0), ...corners(floor, THICKNESS)]);
  // The lap tab along its foot, under the tile's band; its top slopes at 45° so it prints face down.
  const { depth: d, thickness: th } = GRID.lap_tab;
  const into = 0.01;
  const tab: [number, number][] = [
    [-into, THICKNESS],
    [d, THICKNESS],
    [d, THICKNESS - th],
    [-into, THICKNESS - th - d - into],
  ];
  solid = solid.add(edgePrism(wasm, b.side, b.tab, tab));

  // A 45° chamfer along the floor edge of each wall it bears on, at least the floor edge's size.
  const e = layout.shape.floor_edge;
  if (e > 0) {
    for (const wall of b.walls) {
      const [n, edge] = outward(wall, floor);
      // Keep s + z ≤ edge + THICKNESS − e, where s is the distance outward.
      solid = solid.trimByPlane([-n[0] / Math.SQRT2, -n[1] / Math.SQRT2, -1 / Math.SQRT2], -(edge + THICKNESS - e) / Math.SQRT2);
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
export function joinerSolid(wasm: ManifoldToplevel, layout: BoardLayout, fit?: Partial<Fit>): Manifold {
  const fits = gridFit(fit);
  return printJoiner(wasm, layout.variant, boardHole(layout.variant, fits), fits.joiner);
}

/** One peg, as it prints: smaller than the board hole by the calibrated peg fit. */
export function pegSolid(wasm: ManifoldToplevel, layout: BoardLayout, fit?: Partial<Fit>): Manifold {
  const fits = gridFit(fit);
  return peg(wasm, boardHole(layout.variant, fits) - fits.peg);
}

/** The outward direction from a wall's bumper, and how far along it that bumper's floor edge is. */
function outward(wall: Side, floor: { x0: number; y0: number; x1: number; y1: number }): [[number, number], number] {
  if (wall === "left") return [[-1, 0], -floor.x0];
  if (wall === "right") return [[1, 0], floor.x1];
  if (wall === "front") return [[0, -1], -floor.y0];
  return [[0, 1], floor.y1];
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
