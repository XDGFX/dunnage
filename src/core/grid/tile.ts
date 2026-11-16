import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
import type { Side } from "../drawers.ts";
import { GRID, type Variant } from "./parameters.ts";

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

export type { Variant };
export const PITCH = GRID.pitch;
export const THICKNESS = GRID.thickness;
const LEAD_IN = GRID.lead_in;
/** A low web along every row and column of holes, tying each boss to its neighbours; `height` is from the top face. */
export const WEB = GRID.web;
/** A 45° flare where each boss meets the top face, to stiffen it where it bends. */
export const BOSS_CHAMFER = GRID.boss_chamfer;
/** Segments round a hole: 64 keeps a 3.4 mm hole within 0.005 mm of its size. */
const SEGMENTS = 64;
const EPS = 0.01;

/** Where hole `i` sits along an axis: half a pitch in from the tile's edge, then every pitch. */
export const holeCentre = (i: number) => PITCH / 2 + PITCH * i;

/** `wall` is the boss wall round the hole, `band` the solid edge of the tile. */
export const VARIANTS: Record<Variant, { wall: number; band: number }> = GRID.variants;

/** The rings' wall round the bosses, and the webs tying the rings together, flush with the back. */
export const JOINER = { wall: GRID.joiner.wall, webWidth: GRID.joiner.web_width, webHeight: GRID.joiner.web_height };
/** Room left in the band round a joiner's rings: more than the loosest joiner fit in the calibration print. */
export const RING_ROOM = GRID.joiner.ring_room;
/** Room either side of a joiner's webs where they cross the band. */
const SLOT_ROOM = GRID.joiner.slot_room;

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
  /** Cut the band for joiners at the edge holes, on every edge or these. A test piece that never joins can leave it whole. */
  joiners?: boolean | readonly Side[];
  dots?: readonly Dots[];
  /** Holes left out, bosses and all: those a rounded drawer corner cuts. */
  drop?: (i: number, j: number) => boolean;
  /** Holes countersunk in the face for a screw into the drawer floor. */
  countersink?: (i: number, j: number) => boolean;
  /** Keep only this region, in the tile's own coordinates, with a band along its new edge. */
  clip?: CrossSection;
}

/** A floor screw's countersink: the head's diameter on the face, narrowing to the hole. */
const COUNTERSINK = GRID.countersink;
const countersinkDepth = (r: number) => (COUNTERSINK.head / 2 - r) / Math.tan(((COUNTERSINK.angle / 2) * Math.PI) / 180);

export function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold {
  const { Manifold, CrossSection } = wasm;
  const { variant, nx, ny, skin = GRID.face, joiners = true } = options;
  const spec = VARIANTS[variant];
  const byHole = (value: ByHole | undefined, i: number, j: number, fallback: number) =>
    value === undefined ? fallback : typeof value === "number" ? value : value(i, j);
  const width = nx * PITCH;
  const depth = ny * PITCH;
  const holes: { x: number; y: number; r: number; boss: number; edges: Vec2[]; sunk: boolean }[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (options.drop?.(i, j)) continue;
      const r = byHole(options.hole, i, j, 0) / 2;
      // Which way the band lies from an edge hole: one way, or two at a corner.
      const edges: Vec2[] = [];
      if (i === 0) edges.push([-1, 0]);
      if (i === nx - 1) edges.push([1, 0]);
      if (j === 0) edges.push([0, -1]);
      if (j === ny - 1) edges.push([0, 1]);
      holes.push({ x: holeCentre(i), y: holeCentre(j), r, boss: r + byHole(options.wall, i, j, spec.wall), edges, sunk: options.countersink?.(i, j) ?? false });
    }
  }

  const outline = CrossSection.square([width, depth]);
  const band = outline.subtract(CrossSection.square([width - 2 * spec.band, depth - 2 * spec.band]).translate(spec.band, spec.band));
  const bosses = holes.map(({ x, y, boss }) => CrossSection.circle(boss, SEGMENTS).translate(x, y));
  const web = CrossSection.union([
    ...Array.from({ length: nx }, (_, i) => CrossSection.square([WEB.width, depth]).translate(holeCentre(i) - WEB.width / 2, 0)),
    ...Array.from({ length: ny }, (_, j) => CrossSection.square([width, WEB.width]).translate(0, holeCentre(j) - WEB.width / 2)),
  ]);
  const flares = holes.map(({ x, y, boss }) =>
    Manifold.extrude(CrossSection.circle(boss + BOSS_CHAMFER, SEGMENTS), BOSS_CHAMFER, 0, 0, boss / (boss + BOSS_CHAMFER)).translate([x, y, skin]),
  );
  // A countersunk hole's boss is widened to carry the head, up to the web, below the joiners' rings.
  const sunkBosses = holes
    .filter((h) => h.sunk)
    .map(({ x, y, boss, r }) => Manifold.cylinder(WEB.height, COUNTERSINK.head / 2 + boss - r, COUNTERSINK.head / 2 + boss - r, SEGMENTS).translate([x, y, 0]));
  let solid = Manifold.union([
    Manifold.extrude(CrossSection.union([band, ...bosses]), THICKNESS),
    Manifold.extrude(outline, skin),
    Manifold.extrude(web, WEB.height),
    ...flares,
    ...sunkBosses,
  ]);
  if (options.clip) {
    const kept = outline.intersect(options.clip);
    const edge = kept.subtract(options.clip.offset(-spec.band, "Round", 2, SEGMENTS));
    solid = solid.intersect(Manifold.extrude(kept, THICKNESS)).add(Manifold.extrude(edge, THICKNESS));
  }

  const voids: Manifold[] = [];
  if (joiners) {
    // Round each edge boss, room for a ring down to the web; and where the joiner's webs cross the
    // band, a slot from the back. The bosses themselves are left whole.
    const sideOf = ([dx, dy]: Vec2): Side => (dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "front" : "back");
    const joined = (edge: Vec2) => joiners === true || joiners.includes(sideOf(edge));
    for (const hole of holes) hole.edges = hole.edges.filter(joined);
    for (const { x, y, boss, edges } of holes.filter((h) => h.edges.length)) {
      const circle = CrossSection.circle(boss, SEGMENTS);
      const ring = CrossSection.circle(boss + JOINER.wall + RING_ROOM, SEGMENTS).subtract(circle);
      voids.push(Manifold.extrude(ring, THICKNESS - WEB.height + 1).translate([x, y, WEB.height]));
      const slotWidth = JOINER.webWidth + 2 * SLOT_ROOM;
      for (const [dx, dy] of edges) {
        const length = PITCH;
        const slot = dx ? CrossSection.square([length, slotWidth]).translate(dx > 0 ? 0 : -length, -slotWidth / 2) : CrossSection.square([slotWidth, length]).translate(-slotWidth / 2, dy > 0 ? 0 : -length);
        voids.push(Manifold.extrude(slot.subtract(circle), JOINER.webHeight + 1).translate([x, y, THICKNESS - JOINER.webHeight]));
      }
    }
  }
  for (const { x, y, r, sunk } of holes) {
    voids.push(Manifold.cylinder(THICKNESS + 2, r, r, SEGMENTS).translate([x, y, -1]));
    // A 45° lead-in on the face, which also hides elephant's foot; or the countersink in its place.
    const [depth, mouth] = sunk ? [countersinkDepth(r), COUNTERSINK.head / 2] : [LEAD_IN, r + LEAD_IN];
    voids.push(Manifold.cylinder(depth + EPS, mouth + EPS, r, SEGMENTS).translate([x, y, -EPS]));
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

/**
 * The room a seated joiner needs in a solid part, such as a bumper, centred like `seatedJoiner`:
 * round each of the four bosses down to the web, and slots for its webs. The bosses stay.
 */
export function joinerRoom(wasm: ManifoldToplevel, variant: Variant, hole: number): Manifold {
  const { Manifold, CrossSection } = wasm;
  const boss = hole / 2 + VARIANTS[variant].wall;
  const half = PITCH / 2;
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy): Vec2 => [sx * half, sy * half]));
  const bosses = CrossSection.union(corners.map(([x, y]) => CrossSection.circle(boss, SEGMENTS).translate(x, y)));
  const rings = CrossSection.union(corners.map(([x, y]) => CrossSection.circle(boss + JOINER.wall + RING_ROOM, SEGMENTS).translate(x, y)));
  const w = JOINER.webWidth + 2 * SLOT_ROOM;
  const frame = CrossSection.square([PITCH + w, PITCH + w], true).subtract(CrossSection.square([PITCH - w, PITCH - w], true));
  return Manifold.union([
    Manifold.extrude(rings.subtract(bosses), THICKNESS - WEB.height + 1).translate([0, 0, WEB.height]),
    Manifold.extrude(frame.subtract(bosses), JOINER.webHeight + 1).translate([0, 0, THICKNESS - JOINER.webHeight]),
  ]);
}

/**
 * A joiner turned over to print: its flat side, flush with the back in use, on the bed, and its rings
 * standing up. The webs are too small for dots, so `notches` V-notches round the end of one ring
 * label it.
 */
export function printJoiner(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number, notches = 0): Manifold {
  const { Manifold } = wasm;
  let seated = seatedJoiner(wasm, variant, hole, fit);
  if (notches) {
    const { min } = seated.boundingBox();
    const radius = hole / 2 + VARIANTS[variant].wall + fit + JOINER.wall / 2;
    const side = 0.6;
    // A square prism on its edge, along a radius, cuts a 45° V across the ring's end.
    const notch = Manifold.cube([JOINER.wall + 2, side, side], true).rotate([45, 0, 0]).translate([radius, 0, min[2]]);
    const cuts = Array.from({ length: notches }, (_, n) => notch.rotate([0, 0, (360 * n) / notches + 45]).translate([-PITCH / 2, -PITCH / 2, 0]));
    seated = seated.subtract(Manifold.union(cuts));
  }
  return onBed(seated.rotate([180, 0, 0]));
}

/**
 * Where a peg's flat is cut, as an angle up the peg from its bottom. Above 45°, so the curve rises
 * off the flat steeply enough to print without support.
 */
const PEG_FLAT_ANGLE = GRID.peg.flat_angle;

/**
 * A round peg with one flat, chamfered at both ends, lying on the flat so its layers run along its
 * length.
 */
export function peg(wasm: ManifoldToplevel, diameter: number, length: number = GRID.peg.length): Manifold {
  const { Manifold, CrossSection } = wasm;
  const r = diameter / 2;
  const c = GRID.peg.chamfer;
  // The half-profile in (radius, length), revolved round the peg's axis, then laid along x.
  const round = CrossSection.ofPolygons([
    [
      [0, 0],
      [r - c, 0],
      [r, c],
      [r, length - c],
      [r - c, length],
      [0, length],
    ],
  ])
    .revolve(64)
    .rotate([0, 90, 0]);
  const cut = r * Math.cos((PEG_FLAT_ANGLE * Math.PI) / 180);
  return onBed(round.intersect(Manifold.cube([length + 2, 2 * r + 2, 2 * r], true).translate([length / 2, 0, r - cut])));
}

/** Cone dots, 45° so the face prints without bridging. */
const DOT = GRID.label.dot;
const DOT_SPACING = GRID.label.spacing;

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
