import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";

// The `grid` base from #6: a board of through holes on a 9.5 mm pitch, printed face-down. The top
// face is what you see in the drawer: a closed skin with holes in it, lying on the bed at z = 0. The
// back is open to save plastic, with a full-height boss round every hole and a band round the edge,
// and lies on the drawer floor at z = THICKNESS. A low web along every row and column of holes ties
// the bosses together.
//
// Tiles join from the back with a joiner: four rings, one over each boss round the corner between
// four holes, tied by webs along the hole lines. The rings slide over the bosses' ends and stop on
// the web; the joiner is flush with the back. The band is cut away only where a joiner passes
// through it, so a joiner fits at any pair of edge holes, or where four tiles meet.

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

export const JOINER = {
  /** The rings' wall, round the bosses. */
  wall: 0.9,
  /** The webs tying the rings together, flush with the back. */
  webWidth: 1.2,
  webHeight: 1.6,
};
/** Room left in the band round a joiner: covers the loosest fit. */
const JOINER_ROOM = 0.3;

/** A row of debossed cone dots on the face, read by counting. */
export interface Dots {
  at: Vec2;
  count: number;
  along?: "x" | "y";
  spacing?: number;
}

type ByHole = number | ((i: number, j: number) => number);

export interface TileOptions {
  variant: Variant;
  nx: number;
  ny: number;
  /** Hole diameter, for every hole or by hole `(i, j)`. */
  hole: ByHole;
  /** Boss wall, if not the variant's. */
  wall?: ByHole;
  /** The top face's thickness. */
  skin?: number;
  /** Cut the band for joiners at the edge holes. A test piece that never joins can leave it whole. */
  joiners?: boolean;
  dots?: readonly Dots[];
}

export function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold {
  const { Manifold, CrossSection } = wasm;
  const { variant, nx, ny, skin = DEFAULT_SKIN, joiners = true } = options;
  const spec = VARIANTS[variant];
  const byHole = (value: ByHole | undefined, i: number, j: number, fallback: number) =>
    value === undefined ? fallback : typeof value === "number" ? value : value(i, j);
  const width = nx * PITCH;
  const depth = ny * PITCH;
  const holes: { x: number; y: number; r: number; boss: number; edges: Vec2[] }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const r = byHole(options.hole, i, j, 0) / 2;
      // Which way the band lies from an edge hole: one way, or two at a corner.
      const edges: Vec2[] = [];
      if (i === 0) edges.push([-1, 0]);
      if (i === nx - 1) edges.push([1, 0]);
      if (j === 0) edges.push([0, -1]);
      if (j === ny - 1) edges.push([0, 1]);
      holes.push({ x: holeCentre(i), y: holeCentre(j), r, boss: r + byHole(options.wall, i, j, spec.wall), edges });
    }
  }

  const outline = CrossSection.square([width, depth]);
  const band = outline.subtract(CrossSection.square([width - 2 * spec.band, depth - 2 * spec.band]).translate(spec.band, spec.band));
  const bosses = holes.map(({ x, y, boss }) => CrossSection.circle(boss, SEGMENTS).translate(x, y));
  const web = CrossSection.union([
    ...Array.from({ length: nx }, (_, i) => CrossSection.square([WEB.width, depth]).translate(holeCentre(i) - WEB.width / 2, 0)),
    ...Array.from({ length: ny }, (_, j) => CrossSection.square([width, WEB.width]).translate(0, holeCentre(j) - WEB.width / 2)),
  ]);
  const solid = Manifold.union([
    Manifold.extrude(CrossSection.union([band, ...bosses]), THICKNESS),
    Manifold.extrude(outline, skin),
    Manifold.extrude(web, WEB.height),
  ]);

  const voids: Manifold[] = [];
  if (joiners) {
    // Round each edge boss, room for a ring down to the web; and where the joiner's webs cross the
    // band, a slot from the back. The bosses themselves are left whole.
    for (const { x, y, boss, edges } of holes.filter((h) => h.edges.length)) {
      const circle = CrossSection.circle(boss, SEGMENTS);
      const ring = CrossSection.circle(boss + JOINER.wall + JOINER_ROOM, SEGMENTS).subtract(circle);
      voids.push(Manifold.extrude(ring, THICKNESS - WEB.height + 1).translate([x, y, WEB.height]));
      const slotWidth = JOINER.webWidth + 2 * JOINER_ROOM;
      for (const [dx, dy] of edges) {
        const length = PITCH;
        const slot = dx ? CrossSection.square([length, slotWidth]).translate(dx > 0 ? 0 : -length, -slotWidth / 2) : CrossSection.square([slotWidth, length]).translate(-slotWidth / 2, dy > 0 ? 0 : -length);
        voids.push(Manifold.extrude(slot.subtract(circle), JOINER.webHeight + 1).translate([x, y, THICKNESS - JOINER.webHeight]));
      }
    }
  }
  for (const { x, y, r } of holes) {
    voids.push(Manifold.cylinder(THICKNESS + 2, r, r, SEGMENTS).translate([x, y, -1]));
    // A 45° lead-in on the face, which also hides elephant's foot.
    voids.push(Manifold.cylinder(LEAD_IN + EPS, r + LEAD_IN + EPS, r, SEGMENTS).translate([x, y, -EPS]));
  }
  for (const dots of options.dots ?? []) voids.push(faceDots(wasm, dots));

  return solid.subtract(Manifold.union(voids));
}

/**
 * A joiner as it sits in the tiles: centred on the corner between 4 holes (a join, and the gap line
 * between two edge holes), flush with the back. `hole` and `wall` are the tiles' edge bosses; `fit`
 * is the radial clearance of the rings over them, and negative is interference.
 */
export function seatedJoiner(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number, wall = VARIANTS[variant].wall): Manifold {
  const { Manifold, CrossSection } = wasm;
  const bore = hole / 2 + wall + fit;
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy): Vec2 => [(sx * PITCH) / 2, (sy * PITCH) / 2]));
  const half = PITCH / 2;
  const w = JOINER.webWidth;
  const webs = CrossSection.union([
    ...[-half, half].map((y) => CrossSection.square([PITCH, w]).translate(-half, y - w / 2)),
    ...[-half, half].map((x) => CrossSection.square([w, PITCH]).translate(x - w / 2, -half)),
  ]);
  // The bores come from the same circle as the bosses, so the two line up.
  const bores = CrossSection.union(corners.map(([x, y]) => CrossSection.circle(bore, SEGMENTS).translate(x, y)));
  const rings = CrossSection.union(corners.map(([x, y]) => CrossSection.circle(bore + JOINER.wall, SEGMENTS).translate(x, y)));
  const ringHeight = THICKNESS - WEB.height;
  return Manifold.union([
    Manifold.extrude(rings.subtract(bores), ringHeight),
    Manifold.extrude(webs.subtract(bores), JOINER.webHeight).translate([0, 0, ringHeight - JOINER.webHeight]),
  ]).translate([0, 0, WEB.height]);
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
