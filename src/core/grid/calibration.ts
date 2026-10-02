import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { BAND, PITCH, VARIANTS, faceDots, holeCentre, onBed, seatedPlate, tile, type Dots, type Variant } from "./tile.ts";

// Test prints for #7, which settle the open numbers in the grid spec (#6 §7). Labels are cone
// dots on the face: count them.
//
// Round one: screw pilot holes for each boss wall, and plate fits. Two of each hole-test tile, so
// they can be joined with the plates.
// Round two, once round one has chosen a hole size and plate fit per variant: pin interference,
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
/** Radial clearance of a plate's holes over the stubs; negative is interference. */
export const PLATE_FITS = [-0.05, 0, 0.05, 0.1, 0.15];
export const PIN_INTERFERENCES = [0, 0.05, 0.1, 0.15, 0.2, 0.25];
const PEG_LENGTH = 14;
const PEG_CHAMFER = 0.4;
/**
 * Where the flat is cut, as an angle up the peg from its bottom. Above 45°, so the curve rises off
 * the flat steeply enough to print without support.
 */
const PEG_FLAT_ANGLE = 50;
/** Holders put at least this much plastic under a screw head (#6 §6). */
const FLANGE = 4.5;
const SCREW_CLEARANCE = 4.5;

const variantList = Object.keys(VARIANTS) as Variant[];

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
  const holeTests = variantList.map(
    (variant): Part => ({
      name: `holes-${variant}`,
      solid: columnTest(wasm, variant, NOMINAL_HOLE[variant], PILOT_HOLES),
      copies: 2,
      note:
        `Screw pilot holes in the ${variant} boss wall (${VARIANT_DOTS[variant]} dot${VARIANT_DOTS[variant] > 1 ? "s" : ""} at the back-left corner). ` +
        `Columns with 1–5 dots under them are ${PILOT_HOLES.map((d) => d.toFixed(1)).join(", ")} mm. ` +
        "Drive a 4×12 wood screw into each; keep the smallest that goes in without splitting the boss and bites hard. " +
        "Then join the two pieces with the plates.",
    }),
  );
  const plates = variantList.map(
    (variant): Part => ({
      name: `plates-${variant}`,
      solid: arrange(
        wasm,
        PLATE_FITS.map((fit, n) => printPlate(wasm, variant, fit, n + 1)),
        5,
      ),
      copies: 1,
      note:
        `Plates to join two holes-${variant} pieces, one per fit, by the dots on the outer face: ` +
        PLATE_FITS.map((fit, n) => `${n + 1} = ${describeFit(fit)}`).join(", ") +
        ". Keep the one that presses on firmly, holds the join without play, and can still be prised off.",
    }),
  );
  return [...holeTests, ...plates];
}

export interface RoundTwoOptions {
  /** The variants that survived round one, each with its chosen hole size and plate fit. */
  variants: { variant: Variant; hole: number; fit: number }[];
}

export function roundTwo(wasm: ManifoldToplevel, { variants }: RoundTwoOptions): Part[] {
  // A 2 × 2 set of 8 × 8 tiles has 4 tile edges meeting along its joins: 2 plates on each, and one
  // where the four tiles meet. Plus a spare.
  const platesPerSet = 4 * 2 + 1 + 1;
  const perVariant = variants.flatMap(({ variant, hole, fit }): Part[] => {
    // As in #6 §6: the hole stays at the calibrated size and the peg is bigger by the interference.
    const pegs = PIN_INTERFERENCES.flatMap((interference, n) => [0, 1].map(() => pegShape(wasm, toMicron(hole + interference), n + 1)));
    return [
      {
        name: `pins-${variant}`,
        solid: columnTest(
          wasm,
          variant,
          hole,
          PIN_INTERFERENCES.map(() => hole),
        ),
        copies: 1,
        note: `${hole} mm pin holes in ${variant}, a column for each peg size: put the peg with n dots in the column with n dots.`,
      },
      {
        name: `pegs-${variant}`,
        solid: arrange(wasm, pegs, 2),
        copies: 1,
        note:
          `Two pegs of each size for pins-${variant}, ${PEG_LENGTH} mm long, counted by the dots on the flat: ` +
          PIN_INTERFERENCES.map((v, n) => `${n + 1} = ${toMicron(hole + v)} mm (${v.toFixed(2)} interference)`).join(", ") +
          ". Press each into its hole; keep the one that's hard to pull out by hand.",
      },
      {
        name: `tile-8x8-${variant}`,
        solid: tile(wasm, { variant, nx: 8, ny: 8, hole }),
        copies: 4,
        note: `Four make the 2 × 2 set for ${variant}: lift by a corner, refit a screw 5 times, shake with a 1 kg holder.`,
      },
      {
        name: `tile-25x25-${variant}`,
        solid: tile(wasm, { variant, nx: 25, ny: 25, hole }),
        copies: 1,
        note: `A full-size ${variant} tile, to weigh.`,
      },
      {
        name: `plates-${variant}`,
        solid: arrange(
          wasm,
          Array.from({ length: platesPerSet }, () => printPlate(wasm, variant, fit)),
          5,
        ),
        copies: 1,
        note: `${platesPerSet} plates at ${describeFit(fit)} for the ${variant} 2 × 2 set: 2 along each join, 1 where the four tiles meet, and a spare.`,
      },
    ];
  });
  return [
    ...perVariant,
    {
      name: "test-holder",
      solid: testHolder(wasm),
      copies: variants.length,
      note: `A holder for one 4×12 screw, with a ${FLANGE} mm flange and a loop to hang 1 kg from.`,
    },
  ];
}

export function describeFit(fit: number): string {
  if (fit === 0) return "line-to-line";
  return fit < 0 ? `${(-fit).toFixed(2)} mm interference` : `${fit.toFixed(2)} mm clearance`;
}

/** A plate turned over to print: its outer face, flush with the back in use, on the bed, carrying the dots. */
function printPlate(wasm: ManifoldToplevel, variant: Variant, fit: number, dots = 0): Manifold {
  const flat = onBed(seatedPlate(wasm, variant, fit).rotate([180, 0, 0]));
  if (!dots) return flat;
  const { max } = flat.boundingBox();
  // In the middle, between the four holes.
  return flat.subtract(faceDots(wasm, { at: [max[0] / 2, max[1] / 2], count: dots, spacing: 1.25 }));
}

/**
 * A round peg with one flat, chamfered at both ends, lying on the flat: its layers run along its
 * length, and the flat carries `dots`.
 */
function pegShape(wasm: ManifoldToplevel, diameter: number, dots: number): Manifold {
  const { Manifold, CrossSection } = wasm;
  const r = diameter / 2;
  const c = PEG_CHAMFER;
  // The half-profile in (radius, length), revolved round the peg's axis, then laid along x.
  const round = CrossSection.ofPolygons([
    [
      [0, 0],
      [r - c, 0],
      [r, c],
      [r, PEG_LENGTH - c],
      [r - c, PEG_LENGTH],
      [0, PEG_LENGTH],
    ],
  ])
    .revolve(64)
    .rotate([0, 90, 0]);
  const cut = r * Math.cos((PEG_FLAT_ANGLE * Math.PI) / 180);
  const peg = onBed(round.intersect(Manifold.cube([PEG_LENGTH + 2, 2 * r + 2, 2 * r], true).translate([PEG_LENGTH / 2, 0, r - cut])));
  const { max } = peg.boundingBox();
  return peg.subtract(faceDots(wasm, { at: [max[0] / 2, max[1] / 2], count: dots }));
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
