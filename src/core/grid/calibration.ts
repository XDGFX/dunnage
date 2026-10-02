import type { Manifold, ManifoldToplevel } from "manifold-3d";
import {
  BAND,
  CLIP_TYPES,
  PITCH,
  THICKNESS,
  VARIANTS,
  edgePockets,
  holeCentre,
  onBed,
  pocketSteps,
  seatedClip,
  tile,
  topDots,
  type ClipType,
  type Dots,
  type Variant,
} from "./tile.ts";

// Test prints for #7, which settle the open numbers in the grid spec (#6 §7). Labels are cone
// dots on the face: count them.
//
// Round one: screw pilot holes for each boss wall, and clip shapes, depths and clearances.
// Round two, once round one has chosen a hole size per variant and a clip: pin interference,
// 2 × 2 tile sets for the handling tests, a full tile per variant to weigh, and a test holder.

export interface Part {
  name: string;
  solid: Manifold;
  /** How many to print. */
  copies: number;
  /** What it tests and how to read it. */
  note: string;
}

export const PILOT_HOLES = [3.0, 3.2, 3.4, 3.6, 3.8];
/** Each variant's starting hole, from #6, for holes that aren't under test. */
const NOMINAL_HOLE: Record<Variant, number> = { standard: 3.4, light: 3.3, "light-thick": 3.3 };
const VARIANT_DOTS: Record<Variant, number> = { standard: 1, light: 2, "light-thick": 3 };
export const CLIP_CLEARANCES = [0.05, 0.1, 0.15, 0.2];
export const PIN_INTERFERENCES = [0, 0.05, 0.1, 0.15, 0.2, 0.25];
/** Long enough for the board, plus a handle carrying up to 6 rings. */
const PEG_LENGTH = 14;
const PEG_CHAMFER = 0.4;
/** 45° V-grooves, so they print without support. */
const RING_DEPTH = 0.25;
const RING_PITCH = 0.8;
/** Holders put at least this much plastic under a screw head (#6 §6). */
const FLANGE = 4.5;
const SCREW_CLEARANCE = 4.5;

/**
 * A 4-row tile with one column of test holes per value, labelled 1, 2, 3… dots along the front,
 * and the variant's dots at the back-left corner. The outer columns keep `hole`, so every test
 * hole has a boss on each side.
 */
function columnTest(wasm: ManifoldToplevel, variant: Variant, hole: number, testHoles: number[]): Manifold {
  const ny = 4;
  return tile(wasm, {
    variant,
    nx: testHoles.length + 2,
    ny,
    hole: (i) => testHoles[i - 1] ?? hole,
    dots: [
      ...testHoles.map((_, n): Dots => ({ at: [holeCentre(n + 1), BAND / 2], count: n + 1 })),
      { at: [holeCentre(0), ny * PITCH - BAND / 2], count: VARIANT_DOTS[variant] },
    ],
  });
}

export function roundOne(wasm: ManifoldToplevel): Part[] {
  const holeTests = (Object.keys(VARIANTS) as Variant[]).map(
    (variant): Part => ({
      name: `holes-${variant}`,
      solid: columnTest(wasm, variant, NOMINAL_HOLE[variant], PILOT_HOLES),
      copies: 1,
      note:
        `Screw pilot holes in the ${variant} boss wall (${VARIANT_DOTS[variant]} dot${VARIANT_DOTS[variant] > 1 ? "s" : ""} at the back-left corner). ` +
        `Columns with 1–5 dots under them are ${PILOT_HOLES.map((d) => d.toFixed(1)).join(", ")} mm. ` +
        "Drive a 4×12 wood screw into each; keep the smallest that goes in without splitting the boss and bites hard.",
    }),
  );

  const ny = 8;
  const steps = [1, 3, 5, 7];
  const coupon = tile(wasm, {
    variant: "light",
    nx: 2,
    ny,
    hole: NOMINAL_HOLE.light,
    pockets: CLIP_TYPES.map((type, n) => ({ edge: "+x" as const, step: steps[n]!, type })),
    dots: CLIP_TYPES.map((_, n): Dots => ({ at: [BAND / 2, steps[n]! * PITCH], count: n + 1, along: "y" })),
  });

  const clips = CLIP_TYPES.flatMap((type, t) => CLIP_CLEARANCES.map((clearance, c) => printClip(wasm, type, clearance, t + 1, c + 1)));

  return [
    ...holeTests,
    {
      name: "clip-coupon-left",
      solid: coupon,
      copies: 1,
      note:
        "Two short tile edges with a pocket of each clip type, numbered by the dots beside them: " +
        CLIP_TYPES.map((type, n) => `${n + 1} = ${describeClip(type)}`).join(", ") +
        ". Lay the coupons back up, edge to edge.",
    },
    { name: "clip-coupon-right", solid: onBed(coupon.mirror([1, 0, 0])), copies: 1, note: "The mirror of the left coupon." },
    {
      name: "clips",
      solid: arrange(wasm, clips, 4),
      copies: 1,
      note:
        "One clip per type and clearance. Each clip has its type's dots at one end and its clearance's at the other: " +
        CLIP_CLEARANCES.map((c, n) => `${n + 1} = ${c.toFixed(2)} mm`).join(", ") +
        ". Keep the clearance that snaps in and holds but can still be prised out.",
    },
  ];
}

export interface RoundTwoOptions {
  /** The variants that survived round one, each with its chosen hole size. */
  variants: { variant: Variant; hole: number }[];
  clip: ClipType;
  clearance: number;
}

export function roundTwo(wasm: ManifoldToplevel, { variants, clip, clearance }: RoundTwoOptions): Part[] {
  const perVariant = variants.flatMap(({ variant, hole }): Part[] => {
    // As in #6 §6: the hole stays at the calibrated size and the peg is bigger by the interference.
    const pegs = PIN_INTERFERENCES.flatMap((interference, n) => [0, 1].map(() => pegShape(wasm, toMicron(hole + interference), n + 1)));
    return [
      {
        name: `pins-${variant}`,
        solid: columnTest(wasm, variant, hole, PIN_INTERFERENCES.map(() => hole)),
        copies: 1,
        note: `${hole} mm pin holes in ${variant}, a column for each peg size: put the peg with n rings in the column with n dots.`,
      },
      {
        name: `pegs-${variant}`,
        solid: arrange(wasm, pegs, 2),
        copies: 1,
        note:
          `Two pegs of each size for pins-${variant}, ${PEG_LENGTH} mm long, counted by the rings at the top: ` +
          PIN_INTERFERENCES.map((v, n) => `${n + 1} = ${toMicron(hole + v)} mm (${v.toFixed(2)} interference)`).join(", ") +
          ". Press each into its hole, rings up; keep the one that's hard to pull out by hand.",
      },
      {
        name: `tile-8x8-${variant}`,
        solid: tile(wasm, { variant, nx: 8, ny: 8, hole, pockets: edgePockets(8, 8, clip) }),
        copies: 4,
        note: `Four make the 2 × 2 set for ${variant}: lift by a corner, refit a screw 5 times, shake with a 1 kg holder.`,
      },
      {
        name: `tile-25x25-${variant}`,
        solid: tile(wasm, { variant, nx: 25, ny: 25, hole, pockets: edgePockets(25, 25, clip) }),
        copies: 1,
        note: `A full-size ${variant} tile, to weigh.`,
      },
    ];
  });

  // A 2 × 2 set has 4 joins, each with a clip per pocket. Plus 2 spares.
  const perSet = 4 * pocketSteps(8).length + 2;
  const clips = Array.from({ length: perSet * variants.length }, () => printClip(wasm, clip, clearance));
  return [
    ...perVariant,
    {
      name: "clips",
      solid: arrange(wasm, clips, 5),
      copies: 1,
      note: `${perSet} ${describeClip(clip)} clips at ${clearance} mm clearance per 2 × 2 set.`,
    },
    {
      name: "test-holder",
      solid: testHolder(wasm),
      copies: variants.length,
      note: `A holder for one 4×12 screw, with a ${FLANGE} mm flange and a loop to hang 1 kg from.`,
    },
  ];
}

export function describeClip({ shape, depth }: ClipType): string {
  return `${shape} ${depth} mm deep`;
}

/** A clip laid flat for printing, with its type and clearance as dots on top. */
function printClip(wasm: ManifoldToplevel, type: ClipType, clearance: number, typeDots = 0, clearanceDots = 0): Manifold {
  const seated = seatedClip(wasm, type, clearance);
  // A bow-tie prints as it sits. A bar prints on its side, so its barbs flex in the layer plane.
  const flat = onBed(type.shape === "bow-tie" ? seated : seated.rotate([-90, 0, 0]));
  if (!typeDots && !clearanceDots) return flat;
  const { max } = flat.boundingBox();
  // The dots run along the bar, or the bow-tie's neck, either side of the middle.
  const middle = max[0] / 2;
  const y = type.shape === "bow-tie" ? max[1] / 2 : max[1] - type.depth / 2;
  const both: Dots[] = [
    { at: [middle - PITCH / 2, y], count: typeDots },
    { at: [middle + PITCH / 2, y], count: clearanceDots },
  ];
  const dots = both.filter((d) => d.count > 0);
  return flat.subtract(wasm.Manifold.union(dots.map((d) => topDots(wasm, d, max[2]))));
}

/** An upright peg, chamfered at both ends, with `rings` V-grooves above the part that goes into the board. */
function pegShape(wasm: ManifoldToplevel, diameter: number, rings: number): Manifold {
  const r = diameter / 2;
  const c = PEG_CHAMFER;
  const g = RING_DEPTH;
  // The half-profile in (radius, height), revolved round the peg's axis.
  const profile: [number, number][] = [
    [0, 0],
    [r - c, 0],
    [r, c],
  ];
  for (let n = 0; n < rings; n++) {
    const z = THICKNESS + 1 + n * RING_PITCH;
    profile.push([r, z - g], [r - g, z], [r, z + g]);
  }
  profile.push([r, PEG_LENGTH - c], [r - c, PEG_LENGTH], [0, PEG_LENGTH]);
  return wasm.CrossSection.ofPolygons([profile]).revolve(64);
}

/** A flange for one screw, and a wall with a diamond hole to hang a weight from or pull on. */
function testHolder(wasm: ManifoldToplevel): Manifold {
  const { Manifold } = wasm;
  const size = 3 * PITCH;
  const wall = 3;
  const loop = 6;
  const flange = Manifold.cube([size, size, FLANGE]).subtract(
    Manifold.cylinder(FLANGE + 2, SCREW_CLEARANCE / 2, SCREW_CLEARANCE / 2, 64).translate([size / 2, size / 2, -1]),
  );
  const side = /* a diamond's diagonal is `loop` */ loop / Math.SQRT2;
  const diamond = Manifold.cube([wall + 2, side, side], true)
    .rotate([45, 0, 0])
    .translate([wall / 2, size / 2, FLANGE + 10]);
  const tab = Manifold.cube([wall, size, 20]).translate([0, 0, FLANGE]).subtract(diamond);
  return flange.add(tab);
}

/** Lay parts out in rows on one plate. */
function arrange(wasm: ManifoldToplevel, parts: Manifold[], perRow: number): Manifold {
  const gap = 4;
  const placed: Manifold[] = [];
  let y = 0;
  for (let row = 0; row * perRow < parts.length; row++) {
    const items = parts.slice(row * perRow, (row + 1) * perRow).map(onBed);
    let x = 0;
    let rowDepth = 0;
    for (const item of items) {
      const { max } = item.boundingBox();
      placed.push(item.translate([x, y, 0]));
      x += max[0] + gap;
      rowDepth = Math.max(rowDepth, max[1]);
    }
    y += rowDepth + gap;
  }
  return wasm.Manifold.union(placed);
}

const toMicron = (mm: number) => Math.round(mm * 1000) / 1000;
