import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";

// The `grid` base from #6: a board of through holes on a 9.5 mm pitch, printed face-down, so the
// face lies on the bed at z = 0 and the open back is at z = THICKNESS. Tiles join with clips that
// drop into pockets in the back.

export const PITCH = 9.5;
export const THICKNESS = 8;
/** The solid band round the tile's edge. */
export const BAND = 3;
const LEAD_IN = 0.4;
/** The face skin (standard) or web (light). */
const FACE = 1.2;
const RIB = 1.2;
/** Segments round a hole: 64 keeps a 3.4 mm hole within 0.005 mm of its size. */
const SEGMENTS = 64;
const EPS = 0.01;

export type Variant = "standard" | "light" | "light-thick";

export const VARIANTS: Record<Variant, { bossOd: number; face: "skin" | "web"; ribEvery?: number }> = {
  standard: { bossOd: 6.6, face: "skin", ribEvery: 4 },
  light: { bossOd: 5.2, face: "web" },
  // light with a 1.2 mm boss wall instead of 0.9, to find out whether the thin wall is enough.
  "light-thick": { bossOd: 5.8, face: "web" },
};

export type ClipShape = "bow-tie" | "bar";

/** A clip and its pocket. `depth` is how far the pocket goes into the back. */
export interface ClipType {
  shape: ClipShape;
  depth: number;
}

export const CLIP_TYPES: readonly ClipType[] = [
  { shape: "bow-tie", depth: 3 },
  { shape: "bow-tie", depth: 4 },
  { shape: "bar", depth: 2.5 },
  { shape: "bar", depth: 3.5 },
];

export type Edge = "+x" | "-x" | "+y" | "-y";

/** A clip pocket on the gap line `step` pitches along an edge, measured from the tile's origin corner. */
export interface Pocket {
  edge: Edge;
  step: number;
  type: ClipType;
}

/** A row of debossed cone dots on the face, read by counting. */
export interface Dots {
  at: Vec2;
  count: number;
  along?: "x" | "y";
}

export interface TileOptions {
  variant: Variant;
  nx: number;
  ny: number;
  /** Hole diameter, for every hole or by hole `(i, j)`. */
  hole: number | ((i: number, j: number) => number);
  pockets?: readonly Pocket[];
  dots?: readonly Dots[];
}

/**
 * Pocket positions along an edge of `n` holes, as gap lines from the corner: 2 in from each
 * end, then every 5, mirrored so a tile turned round still lines up with its neighbour.
 */
export function pocketSteps(n: number): number[] {
  const steps = new Set<number>();
  for (let k = 2; k <= n / 2; k += 5) steps.add(k).add(n - k);
  let sorted = [...steps].sort((a, b) => a - b);
  const widest = Math.max(...sorted.slice(1).map((k, i) => k - sorted[i]!));
  if (widest > 6) sorted = [...steps.add(Math.floor(n / 2)).add(Math.ceil(n / 2))].sort((a, b) => a - b);
  return sorted;
}

/** The same pockets on every edge of an `nx × ny` tile. */
export function edgePockets(nx: number, ny: number, type: ClipType): Pocket[] {
  return [
    ...pocketSteps(ny).flatMap((step) => (["+x", "-x"] as const).map((edge) => ({ edge, step, type }))),
    ...pocketSteps(nx).flatMap((step) => (["+y", "-y"] as const).map((edge) => ({ edge, step, type }))),
  ];
}

export function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold {
  const { Manifold, CrossSection } = wasm;
  const { variant, nx, ny } = options;
  const spec = VARIANTS[variant];
  const width = nx * PITCH;
  const depth = ny * PITCH;
  const holes: { x: number; y: number; d: number }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const d = typeof options.hole === "number" ? options.hole : options.hole(i, j);
      holes.push({ x: PITCH / 2 + PITCH * i, y: PITCH / 2 + PITCH * j, d });
    }
  }

  const outline = CrossSection.square([width, depth]);
  const plan: CrossSection[] = [outline.subtract(CrossSection.square([width - 2 * BAND, depth - 2 * BAND]).translate(BAND, BAND))];
  plan.push(...holes.map(({ x, y }) => CrossSection.circle(spec.bossOd / 2, SEGMENTS).translate(x, y)));
  if (spec.ribEvery) {
    for (let k = spec.ribEvery; k < nx; k += spec.ribEvery) plan.push(CrossSection.square([RIB, depth]).translate(k * PITCH - RIB / 2, 0));
    for (let k = spec.ribEvery; k < ny; k += spec.ribEvery) plan.push(CrossSection.square([width, RIB]).translate(0, k * PITCH - RIB / 2));
  }
  const solids: Manifold[] = [Manifold.extrude(CrossSection.union(plan), THICKNESS)];
  if (spec.face === "skin") {
    solids.push(Manifold.extrude(outline, FACE));
  } else {
    const bars = [
      ...Array.from({ length: nx }, (_, i) => CrossSection.square([FACE, depth]).translate(PITCH / 2 + PITCH * i - FACE / 2, 0)),
      ...Array.from({ length: ny }, (_, j) => CrossSection.square([width, FACE]).translate(0, PITCH / 2 + PITCH * j - FACE / 2)),
    ];
    solids.push(Manifold.extrude(CrossSection.union(bars), FACE));
  }

  const voids: Manifold[] = [];
  for (const { x, y, d } of holes) {
    const r = d / 2;
    voids.push(Manifold.cylinder(THICKNESS + 2, r, r, SEGMENTS).translate([x, y, -1]));
    // A 45° lead-in on the face, which also hides elephant's foot.
    voids.push(Manifold.cylinder(LEAD_IN + EPS, r + LEAD_IN + EPS, r, SEGMENTS).translate([x, y, -EPS]));
  }
  for (const pocket of options.pockets ?? []) {
    const place = (m: Manifold) => placeOnEdge(m, pocket, width, depth);
    const { cup, cut } = pocketShape(wasm, pocket.type);
    solids.push(place(cup));
    voids.push(place(cut));
  }
  for (const dots of options.dots ?? []) voids.push(faceDots(wasm, dots));

  // Clip anything (cups, mostly) back to the tile's outline.
  const body = Manifold.union(solids).intersect(Manifold.extrude(outline, THICKNESS));
  return body.subtract(Manifold.union(voids));
}

/** Pockets are drawn with the edge on x = 0, the tile at x < 0 and the gap line on y = 0. */
function placeOnEdge(m: Manifold, { edge, step }: Pocket, width: number, depth: number): Manifold {
  const along = step * PITCH;
  switch (edge) {
    case "+x":
      return m.translate([width, along, 0]);
    case "-x":
      return m.rotate([0, 0, 180]).translate([0, along, 0]);
    case "+y":
      return m.rotate([0, 0, 90]).translate([along, depth, 0]);
    case "-y":
      return m.rotate([0, 0, -90]).translate([along, 0, 0]);
  }
}

// Bow-tie: two round heads in the gap squares either side of the join, and a neck through the
// gap between the edge bosses. Held sideways by its shape, and down by friction.
const HEAD = 2.6;
const NECK = 2.0;
// Bar: a straight bar in a slot across the join, with a leg at each end that drops into a deep
// notch and snaps a barb into a groove in the notch's outer wall.
const BAR_WIDTH = 2.0;
const LEG = 1.6;
const BARB = 0.2;
/** Room for the leg to flex inwards as the barb goes past. */
const FLEX = 0.3;
const NOTCH_FLOOR = FACE;
const BARB_HEIGHT = NOTCH_FLOOR + 1.0;
/** Solid round each pocket, so light tiles have something to cut it from. */
const CUP_WALL = 0.6;

function pocketShape(wasm: ManifoldToplevel, type: ClipType): { cup: Manifold; cut: Manifold } {
  const { Manifold, CrossSection } = wasm;
  const head = (r: number) => CrossSection.circle(r, SEGMENTS).translate(-PITCH, 0);
  const strip = (halfWidth: number, from: number) => CrossSection.square([-from + EPS, 2 * halfWidth]).translate(from, -halfWidth);
  if (type.shape === "bow-tie") {
    return {
      cup: Manifold.extrude(head(HEAD + CUP_WALL).add(strip(NECK / 2 + CUP_WALL, -PITCH)), THICKNESS),
      cut: Manifold.extrude(head(HEAD).add(strip(NECK / 2, -PITCH)), type.depth + EPS).translate([0, 0, THICKNESS - type.depth]),
    };
  }
  const outer = -PITCH - LEG / 2;
  const notch = CrossSection.ofPolygons([
    [
      [outer, NOTCH_FLOOR],
      [-PITCH + LEG / 2 + FLEX, NOTCH_FLOOR],
      [-PITCH + LEG / 2 + FLEX, THICKNESS + EPS],
      [outer, THICKNESS + EPS],
      [outer, BARB_HEIGHT + BARB],
      [outer - BARB, BARB_HEIGHT],
      [outer, BARB_HEIGHT - BARB],
    ],
  ]);
  const slot = CrossSection.square([-outer + EPS, type.depth + EPS]).translate(outer, THICKNESS - type.depth);
  return {
    cup: Manifold.extrude(head(BAR_WIDTH / 2 + CUP_WALL + 1.6).add(strip(BAR_WIDTH / 2 + CUP_WALL, -PITCH)), THICKNESS),
    cut: profile(wasm, notch.add(slot), BAR_WIDTH),
  };
}

/** Extrude a profile drawn in (x, z) to `width` across y, centred on y = 0. */
function profile(wasm: ManifoldToplevel, section: CrossSection, width: number): Manifold {
  return wasm.Manifold.extrude(section, width).rotate([90, 0, 0]).translate([0, width / 2, 0]);
}

/** A clip as it sits in two joined tiles: the join on x = 0, the gap line on y = 0, flush with the back. */
export function seatedClip(wasm: ManifoldToplevel, type: ClipType, clearance: number): Manifold {
  const { Manifold, CrossSection } = wasm;
  const c = clearance;
  if (type.shape === "bow-tie") {
    const plan = CrossSection.union([
      CrossSection.circle(HEAD, SEGMENTS).translate(-PITCH, 0),
      CrossSection.circle(HEAD, SEGMENTS).translate(PITCH, 0),
      CrossSection.square([2 * PITCH, NECK], true),
    ]);
    const shrunk = c > 0 ? plan.offset(-c, "Round", 2, SEGMENTS) : plan;
    return Manifold.extrude(shrunk, type.depth).translate([0, 0, THICKNESS - type.depth]);
  }
  const reach = PITCH + LEG / 2 - c;
  const legBottom = NOTCH_FLOOR + c;
  const legTop = THICKNESS - type.depth;
  const tooth = BARB + c;
  const leg = CrossSection.ofPolygons([
    [
      [PITCH - LEG / 2 + c, legBottom],
      [reach, legBottom],
      [reach, BARB_HEIGHT - tooth],
      [reach + tooth, BARB_HEIGHT],
      [reach, BARB_HEIGHT + tooth],
      [reach, legTop + EPS],
      [PITCH - LEG / 2 + c, legTop + EPS],
    ],
  ]);
  const bar = CrossSection.square([2 * reach, type.depth]).translate(-reach, legTop);
  return profile(wasm, CrossSection.union([bar, leg, leg.mirror([1, 0])]), BAR_WIDTH - 2 * c);
}

/** Cone dots, 45° so the face prints without bridging. */
const DOT = 0.6;
const DOT_SPACING = 1.6;

function dotRow(wasm: ManifoldToplevel, { at, count, along = "x" }: Dots): Manifold {
  const cones = Array.from({ length: count }, (_, n) => {
    const offset = (n - (count - 1) / 2) * DOT_SPACING;
    const [x, y] = along === "x" ? [at[0] + offset, at[1]] : [at[0], at[1] + offset];
    return wasm.Manifold.cylinder(DOT + EPS, DOT + EPS, 0, 24).translate([x, y, -EPS]);
  });
  return wasm.Manifold.union(cones);
}

/** Dots debossed into the face (the bed side). */
export function faceDots(wasm: ManifoldToplevel, dots: Dots): Manifold {
  return dotRow(wasm, dots);
}

/** Dots debossed into a top surface at height `z`. */
export function topDots(wasm: ManifoldToplevel, dots: Dots, z: number): Manifold {
  return dotRow(wasm, dots).mirror([0, 0, 1]).translate([0, 0, z]);
}

/** Lay a part on the bed at the origin. */
export function onBed(m: Manifold): Manifold {
  const { min } = m.boundingBox();
  return m.translate([-min[0], -min[1], -min[2]]);
}
