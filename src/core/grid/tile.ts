import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";

// The `grid` base from #6: a board of through holes on a 9.5 mm pitch, printed face-down. The top
// face is what you see in the drawer: a closed skin with holes in it, lying on the bed at z = 0. The
// back is open to save plastic, with a boss round every hole, and lies on the drawer floor at
// z = THICKNESS.
//
// Tiles join from the back. The edge bosses stop short of the back, and a plate covering 2 × 2
// holes across a join sits on their ends, flush. Sleeves under the plate slide down over the
// bosses, which holds the tiles together. It fits at any pair of edge holes, and where four tiles
// meet; its holes keep the grid usable.

export const PITCH = 9.5;
export const THICKNESS = 8;
const LEAD_IN = 0.4;
const DEFAULT_SKIN = 1.2;
/** A low web along every row and column of holes, tying each boss to its neighbours. */
export const WEB = {
  width: 0.8,
  /** From the top face. */
  height: 3,
};
/** Segments round a hole: 64 keeps a 3.4 mm hole within 0.005 mm of its size. */
const SEGMENTS = 64;
const EPS = 0.01;

/** Where hole `i` sits along an axis: half a pitch in from the tile's edge, then every pitch. */
export const holeCentre = (i: number) => PITCH / 2 + PITCH * i;

export type Variant = "standard" | "light-thick" | "light" | "light-thin";

/** `wall` is the boss wall round the hole, `band` the solid edge of the tile. */
export const VARIANTS: Record<Variant, { wall: number; band: number }> = {
  standard: { wall: 1.6, band: 3 },
  "light-thick": { wall: 1.2, band: 1.2 },
  light: { wall: 0.9, band: 1.2 },
  // A single extrusion line, to find out how thin a boss can go.
  "light-thin": { wall: 0.5, band: 1.2 },
};

export const PLATE = {
  /** The plate, flush with the back, sitting on the edge bosses' ends. */
  thickness: 1.6,
  /** How far its sleeves slide down the bosses. */
  sleeve: 5,
  /** The sleeves' wall. */
  wall: 0.9,
};
/** Room round an edge boss for a sleeve, beyond its wall: covers the loosest fit. */
const SLEEVE_ROOM = 0.3;
/** Between neighbouring plates along an edge. */
const PLATE_GAP = 0.2;
/** Clearance round a plate's holes, so a screw or pin goes through. */
const PLATE_HOLE_CLEARANCE = 0.2;
const SLEEVE_LEAD_IN = 0.4;

/** A row of debossed cone dots on the face, read by counting. */
export interface Dots {
  at: Vec2;
  count: number;
  along?: "x" | "y";
  spacing?: number;
}

export interface TileOptions {
  variant: Variant;
  nx: number;
  ny: number;
  /** Hole diameter, for every hole or by hole `(i, j)`. */
  hole: number | ((i: number, j: number) => number);
  /** The top face's thickness. */
  skin?: number;
  dots?: readonly Dots[];
}

export function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold {
  const { Manifold, CrossSection } = wasm;
  const { variant, nx, ny, skin = DEFAULT_SKIN } = options;
  const spec = VARIANTS[variant];
  const width = nx * PITCH;
  const depth = ny * PITCH;
  const holes: { x: number; y: number; r: number; edge: boolean }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const d = typeof options.hole === "number" ? options.hole : options.hole(i, j);
      holes.push({ x: holeCentre(i), y: holeCentre(j), r: d / 2, edge: i === 0 || j === 0 || i === nx - 1 || j === ny - 1 });
    }
  }

  const outline = CrossSection.square([width, depth]);
  const inset = (by: number) => CrossSection.square([width - 2 * by, depth - 2 * by]).translate(by, by);
  const plan: CrossSection[] = [outline.subtract(inset(spec.band))];
  plan.push(...holes.map(({ x, y, r }) => CrossSection.circle(r + spec.wall, SEGMENTS).translate(x, y)));
  const web = CrossSection.union([
    ...Array.from({ length: nx }, (_, i) => CrossSection.square([WEB.width, depth]).translate(holeCentre(i) - WEB.width / 2, 0)),
    ...Array.from({ length: ny }, (_, j) => CrossSection.square([width, WEB.width]).translate(0, holeCentre(j) - WEB.width / 2)),
  ]);
  const solid = Manifold.union([
    Manifold.extrude(CrossSection.union(plan), THICKNESS),
    Manifold.extrude(outline, skin),
    Manifold.extrude(web, WEB.height),
  ]);

  // Room for plates: above the edge bosses' ends, and round each edge boss for a sleeve.
  const seat = THICKNESS - PLATE.thickness;
  const strip = PITCH + 0.3;
  const room = [Manifold.extrude(outline.subtract(inset(strip)), PLATE.thickness + 1).translate([0, 0, seat])];
  for (const { x, y, r } of holes.filter((h) => h.edge)) {
    const inner = r + spec.wall;
    const ring = CrossSection.circle(inner + PLATE.wall + SLEEVE_ROOM, SEGMENTS).subtract(CrossSection.circle(inner, SEGMENTS));
    room.push(Manifold.extrude(ring, PLATE.sleeve + PLATE.thickness + 1).translate([x, y, seat - PLATE.sleeve]));
  }

  const voids: Manifold[] = [...room];
  for (const { x, y, r } of holes) {
    voids.push(Manifold.cylinder(THICKNESS + 2, r, r, SEGMENTS).translate([x, y, -1]));
    // A 45° lead-in on the face, which also hides elephant's foot.
    voids.push(Manifold.cylinder(LEAD_IN + EPS, r + LEAD_IN + EPS, r, SEGMENTS).translate([x, y, -EPS]));
  }
  for (const dots of options.dots ?? []) voids.push(faceDots(wasm, dots));

  return solid.subtract(Manifold.union(voids));
}

/**
 * A plate as it sits in the tiles: centred on the corner between 4 holes (a join, and the gap line
 * between two edge holes), flush with the back. `hole` is the tiles' edge holes; `fit` is the
 * radial clearance of the sleeves over the bosses, and negative is interference.
 */
export function seatedPlate(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number): Manifold {
  const { Manifold, CrossSection } = wasm;
  const size = 2 * PITCH - 2 * PLATE_GAP;
  const inner = hole / 2 + VARIANTS[variant].wall + fit;
  const through = hole / 2 + PLATE_HOLE_CLEARANCE;
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy): Vec2 => [(sx * PITCH) / 2, (sy * PITCH) / 2]));

  const plate = Manifold.extrude(CrossSection.square([size, size], true), PLATE.thickness).translate([0, 0, PLATE.sleeve]);
  const sleeve = Manifold.extrude(CrossSection.circle(inner + PLATE.wall, SEGMENTS), PLATE.sleeve + EPS);
  const solid = Manifold.union([plate, ...corners.map(([x, y]) => sleeve.translate([x, y, 0]))]);
  const voids = corners.flatMap(([x, y]) => [
    // From the same circle as the bosses, so the two line up.
    Manifold.extrude(CrossSection.circle(inner, SEGMENTS), PLATE.sleeve + EPS).translate([x, y, -EPS]),
    // A lead-in at the sleeve's tip, which goes on first.
    Manifold.cylinder(SLEEVE_LEAD_IN + EPS, inner + SLEEVE_LEAD_IN + EPS, inner, SEGMENTS).translate([x, y, -EPS]),
    Manifold.cylinder(PLATE.sleeve + PLATE.thickness + 2, through, through, SEGMENTS).translate([x, y, -1]),
  ]);
  return solid.subtract(Manifold.union(voids)).translate([0, 0, THICKNESS - PLATE.thickness - PLATE.sleeve]);
}

/** Cone dots, 45° so the face prints without bridging. */
const DOT = 0.6;
const DOT_SPACING = 1.6;

/** Dots debossed into the face (the bed side). */
export function faceDots(wasm: ManifoldToplevel, { at, count, along = "x", spacing = DOT_SPACING }: Dots): Manifold {
  const cones = Array.from({ length: count }, (_, n) => {
    const offset = (n - (count - 1) / 2) * spacing;
    const [x, y] = along === "x" ? [at[0] + offset, at[1]] : [at[0], at[1] + offset];
    return wasm.Manifold.cylinder(DOT + EPS, DOT + EPS, 0, 24).translate([x, y, -EPS]);
  });
  return wasm.Manifold.union(cones);
}

/** Lay a part on the bed at the origin. */
export function onBed(m: Manifold): Manifold {
  const { min } = m.boundingBox();
  return m.translate([-min[0], -min[1], -min[2]]);
}
