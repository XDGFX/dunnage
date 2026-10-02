import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";

// The `grid` base from #6: a board of through holes on a 9.5 mm pitch, printed face-down. The face
// is what you see in the drawer: a closed skin with holes in it, lying on the bed at z = 0. The back
// is open to save plastic, and lies on the drawer floor; at z = THICKNESS.
//
// Tiles join from the back. Every edge has a rebate one pitch wide, in which the edge bosses stand
// up as stubs. A plate covering 2 × 2 holes across a join presses down over the stubs of both
// tiles, flush with the back. It fits at any pair of edge holes, and where four tiles meet.

export const PITCH = 9.5;
export const THICKNESS = 8;
/** The solid band round the tile's edge. */
export const BAND = 3;
const LEAD_IN = 0.4;
const FACE = 1.2;
const RIB = 1.2;
/** Segments round a hole: 64 keeps a 3.4 mm hole within 0.005 mm of its size. */
const SEGMENTS = 64;
const EPS = 0.01;

/** Where hole `i` sits along an axis: half a pitch in from the tile's edge, then every pitch. */
export const holeCentre = (i: number) => PITCH / 2 + PITCH * i;

export type Variant = "standard" | "light" | "light-thick";

export const VARIANTS: Record<Variant, { bossOd: number; ribEvery?: number }> = {
  standard: { bossOd: 6.6, ribEvery: 4 },
  light: { bossOd: 5.2 },
  // light with a 1.2 mm boss wall instead of 0.9, to find out whether the thin wall is enough.
  "light-thick": { bossOd: 5.8 },
};

export const REBATE = {
  /** How far the rebate goes into the back: the plate's thickness. */
  depth: 2.4,
  /** How far the stubs stand up from the rebate floor, stopping short of the back. */
  stub: 2.0,
  /** In from the edge: past the edge bosses, short of the next row. */
  width: PITCH + 0.3,
};
const STUB_CHAMFER = 0.4;
/** Between neighbouring plates along an edge. */
const PLATE_GAP = 0.2;

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
  dots?: readonly Dots[];
}

export function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold {
  const { Manifold, CrossSection } = wasm;
  const { variant, nx, ny } = options;
  const spec = VARIANTS[variant];
  const r = spec.bossOd / 2;
  const width = nx * PITCH;
  const depth = ny * PITCH;
  const holes: { x: number; y: number; d: number; edge: boolean }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const d = typeof options.hole === "number" ? options.hole : options.hole(i, j);
      holes.push({ x: holeCentre(i), y: holeCentre(j), d, edge: i === 0 || j === 0 || i === nx - 1 || j === ny - 1 });
    }
  }

  const outline = CrossSection.square([width, depth]);
  const inset = (by: number) => CrossSection.square([width - 2 * by, depth - 2 * by]).translate(by, by);
  const plan: CrossSection[] = [outline.subtract(inset(BAND))];
  plan.push(...holes.map(({ x, y }) => CrossSection.circle(r, SEGMENTS).translate(x, y)));
  if (spec.ribEvery) {
    for (let k = spec.ribEvery; k < nx; k += spec.ribEvery) plan.push(CrossSection.square([RIB, depth]).translate(k * PITCH - RIB / 2, 0));
    for (let k = spec.ribEvery; k < ny; k += spec.ribEvery) plan.push(CrossSection.square([width, RIB]).translate(0, k * PITCH - RIB / 2));
  }
  // Short ribs across the rebate, between the edge bosses, for a plate to sit on.
  const strip = REBATE.width;
  for (let k = 1; k < ny; k++) {
    for (const x of [0, width - strip]) plan.push(CrossSection.square([strip, RIB]).translate(x, k * PITCH - RIB / 2));
  }
  for (let k = 1; k < nx; k++) {
    for (const y of [0, depth - strip]) plan.push(CrossSection.square([RIB, strip]).translate(k * PITCH - RIB / 2, y));
  }

  // Stacked rather than cut, so the stubs line up exactly with the bosses below them: everything up
  // to the rebate floor, then the middle of the tile to the back, and the stubs in the rebate.
  const floor = THICKNESS - REBATE.depth;
  const all = CrossSection.union(plan);
  const boss = CrossSection.circle(r, SEGMENTS);
  const stub = Manifold.union([
    Manifold.extrude(boss, REBATE.stub - STUB_CHAMFER),
    Manifold.extrude(boss, STUB_CHAMFER, 0, 0, (r - STUB_CHAMFER) / r).translate([0, 0, REBATE.stub - STUB_CHAMFER]),
  ]);
  const layers = [
    Manifold.extrude(outline, FACE),
    Manifold.extrude(all, floor),
    ...holes.filter((h) => h.edge).map(({ x, y }) => stub.translate([x, y, floor])),
  ];
  // A tile too small to have a middle is all rebate.
  if (width > 2 * strip && depth > 2 * strip) layers.push(Manifold.extrude(all.intersect(inset(strip)), REBATE.depth).translate([0, 0, floor]));
  const body = Manifold.union(layers);

  const voids: Manifold[] = [];
  for (const { x, y, d } of holes) {
    const hr = d / 2;
    voids.push(Manifold.cylinder(THICKNESS + 2, hr, hr, SEGMENTS).translate([x, y, -1]));
    // A 45° lead-in on the face, which also hides elephant's foot.
    voids.push(Manifold.cylinder(LEAD_IN + EPS, hr + LEAD_IN + EPS, hr, SEGMENTS).translate([x, y, -EPS]));
  }
  for (const dots of options.dots ?? []) voids.push(faceDots(wasm, dots));

  return body.subtract(Manifold.union(voids));
}

/**
 * A plate as it sits in the tiles: centred on the corner between 4 holes (a join, and the gap line
 * between two edge holes), flush with the back. `fit` is the radial clearance over the stubs;
 * negative is interference.
 */
export function seatedPlate(wasm: ManifoldToplevel, variant: Variant, fit: number): Manifold {
  const { Manifold } = wasm;
  const size = 2 * PITCH - 2 * PLATE_GAP;
  const r = VARIANTS[variant].bossOd / 2 + fit;
  const holes = [-1, 1].flatMap((sx) =>
    [-1, 1].flatMap((sy) => {
      const [x, y] = [(sx * PITCH) / 2, (sy * PITCH) / 2];
      return [
        Manifold.cylinder(REBATE.depth + 2, r, r, SEGMENTS).translate([x, y, -1]),
        // A lead-in on the side that goes on first.
        Manifold.cylinder(STUB_CHAMFER + EPS, r + STUB_CHAMFER + EPS, r, SEGMENTS).translate([x, y, -EPS]),
      ];
    }),
  );
  return Manifold.cube([size, size, REBATE.depth], true)
    .translate([0, 0, REBATE.depth / 2])
    .subtract(Manifold.union(holes))
    .translate([0, 0, THICKNESS - REBATE.depth]);
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
