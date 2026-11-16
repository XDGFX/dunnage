import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { UPPDATERA } from "../pegboard.ts";
import { latchSockets } from "./board.ts";
import { latchShape, printLatch, socketOf } from "./latch.ts";
import { GRID, type LatchFit } from "./parameters.ts";
import { PITCH, VARIANTS, holeCentre, onBed, peg as pegShape, printJoiner, tile, type Dots, type Variant } from "./tile.ts";

// Test prints for #7, which settle the open numbers in the grid spec (#6 §7), each round as small
// as it can be. Labels are cone dots on the top face: count them.
//
// Round one: a strip of screw pilot holes, and a strip of boss walls.
// Round two, with a wall and hole chosen: the joiner's fit, and the pegs' fit.
// Round three, with a joiner fit chosen: a 2 × 2 set, a full tile to weigh, and a test holder.

export interface Part {
  name: string;
  solid: Manifold;
  /** How many to print. */
  copies: number;
  /** What it tests and how to read it. */
  note: string;
}

export const PILOT_HOLES = [3.0, 3.2, 3.4, 3.6, 3.8];
/** The pilot strip's wall, and the wall strip's hole: #6's starting point for `light`. */
const PILOT_WALL = 0.9;
const WALL_HOLE = 3.3;
/** The boss walls to compare, and the variant each becomes. */
export const WALLS: [number, Variant][] = [
  [0.5, "light-thin"],
  [0.9, "light"],
  [1.2, "light-thick"],
];
/**
 * Radial clearance of a joiner's rings over the bosses; negative is interference. Round two's first
 * try, -0.05 to 0.15, was far too tight: at 0.15 a joiner went on only 1 mm.
 */
export const JOINER_FITS = [0.2, 0.3, 0.4, 0.5, 0.6];
/**
 * How much smaller a peg is than its hole, across the diameter. A peg the hole's size wasn't close to
 * going in: the hole prints small and the peg big.
 */
export const PEG_CLEARANCES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
/** The tightest peg's length; each looser one is a step longer, so they sort by eye. */
const PEG_LENGTH = GRID.peg.length;
const PEG_STEP = 2;
const pegLength = (n: number) => PEG_LENGTH + PEG_STEP * n;
/** Holders put at least this much plastic under a screw head (#6 §6). */
const FLANGE = GRID.screw.flange;
const SCREW_CLEARANCE = GRID.screw.clearance;

export const variantList = Object.keys(VARIANTS) as Variant[];

/** A single row of holes, labelled 1, 2, 3… dots beside them. It never joins, so its band stays whole. */
function strip(wasm: ManifoldToplevel, count: number, hole: (i: number) => number, wall: (i: number) => number, skin: number): Manifold {
  const band = VARIANTS.light.band / 2;
  return tile(wasm, {
    variant: "light",
    nx: count,
    ny: 1,
    hole: (i) => hole(i),
    wall: (i) => wall(i),
    skin,
    joiners: false,
    dots: Array.from({ length: count }, (_, n): Dots => ({ at: [holeCentre(n), band], count: n + 1 })),
  });
}

export function roundOne(wasm: ManifoldToplevel): Part[] {
  return [
    {
      name: "screw-holes",
      solid: strip(
        wasm,
        PILOT_HOLES.length,
        (i) => PILOT_HOLES[i]!,
        () => PILOT_WALL,
        1.2,
      ),
      copies: 1,
      note:
        `Screw pilot holes in a ${PILOT_WALL} mm boss wall, under a 1.2 mm top face: ` +
        PILOT_HOLES.map((d, n) => `${n + 1} = ${d.toFixed(1)} mm`).join(", ") +
        ". Drive a 4×12 wood screw into each; keep the smallest that goes in without splitting the boss and bites hard.",
    },
    {
      name: "boss-walls",
      solid: strip(
        wasm,
        WALLS.length,
        () => WALL_HOLE,
        (i) => WALLS[i]![0],
        0.6,
      ),
      copies: 1,
      note:
        `Boss walls round a ${WALL_HOLE} mm hole, under a 0.6 mm top face: ` +
        WALLS.map(([wall, variant], n) => `${n + 1} = ${wall} mm (${variant})`).join(", ") +
        ". Drive a 4×12 wood screw into each, take it out and put it back; keep the thinnest that doesn't split and still bites.",
    },
  ];
}

export interface Choice {
  variant: Variant;
  hole: number;
  skin: number;
}

export function roundTwo(wasm: ManifoldToplevel, choices: Choice[]): Part[] {
  return choices.flatMap(({ variant, hole, skin }): Part[] => {
    // As in #6 §6: the hole stays at the calibrated size and only the peg changes. Dots on a peg's
    // flat were too small to read, so each size is longer than the last instead.
    const pegs = PEG_CLEARANCES.flatMap((clearance, n) => [0, 1].map(() => pegShape(wasm, toMicron(hole - clearance), pegLength(n))));
    return [
      {
        name: `joiner-tile-${variant}`,
        solid: tile(wasm, { variant, nx: 2, ny: 3, hole, skin }),
        copies: 2,
        note: `Two small ${variant} tiles to join along their long edges, back up.`,
      },
      {
        name: `joiners-${variant}`,
        solid: arrange(
          wasm,
          JOINER_FITS.map((fit, n) => printJoiner(wasm, variant, hole, fit, n + 1)),
          5,
        ),
        copies: 1,
        note:
          `One joiner per fit, by the notches round the end of one ring: ` +
          JOINER_FITS.map((fit, n) => `${n + 1} = ${describeFit(fit)}`).join(", ") +
          ". Press each over the join; keep the one that goes on firmly, holds without play, keeps the tiles together when lifted by one, and can still be prised off.",
      },
      {
        name: `pegs-${variant}`,
        solid: arrange(wasm, pegs, 2),
        copies: 1,
        note:
          `Two pegs of each size, for the joiner tiles' ${hole} mm holes, the shortest the tightest: ` +
          PEG_CLEARANCES.map((c, n) => `${pegLength(n)} mm long = ${toMicron(hole - c)} mm (${c.toFixed(1)} smaller)`).join(", ") +
          ". Press each into a hole; keep the one that's hard to pull out by hand.",
      },
    ];
  });
}

export function roundThree(wasm: ManifoldToplevel, choices: (Choice & { fit: number })[]): Part[] {
  // A 2 × 2 set of 8 × 8 tiles has 4 tile edges meeting along its joins: 2 joiners on each, and one
  // where the four tiles meet. Plus a spare.
  const joinersPerSet = 4 * 2 + 1 + 1;
  const perVariant = choices.flatMap(({ variant, hole, skin, fit }): Part[] => [
    {
      name: `tile-8x8-${variant}`,
      solid: tile(wasm, { variant, nx: 8, ny: 8, hole, skin }),
      copies: 4,
      note: `Four make the 2 × 2 set for ${variant}: lift by a corner, refit a screw 5 times, shake with a 1 kg holder.`,
    },
    {
      name: `joiners-${variant}`,
      solid: arrange(
        wasm,
        Array.from({ length: joinersPerSet }, () => printJoiner(wasm, variant, hole, fit)),
        5,
      ),
      copies: 1,
      note: `${joinersPerSet} joiners at ${describeFit(fit)} for the 2 × 2 set: 2 along each join, 1 where the four tiles meet, and a spare.`,
    },
    {
      name: `tile-25x25-${variant}`,
      solid: tile(wasm, { variant, nx: 25, ny: 25, hole, skin }),
      copies: 1,
      note: `A full-size ${variant} tile, to weigh.`,
    },
  ]);
  return [
    ...perVariant,
    {
      name: "test-holder",
      solid: testHolder(wasm),
      copies: choices.length,
      note: `A holder for one 4×12 screw, with a ${FLANGE} mm flange and a loop to hang 1 kg from.`,
    },
  ];
}

/** Latch leg thicknesses to compare, mm: the thicker, the stiffer. */
export const LATCH_LEGS = [1.0, 1.2, 1.4];
/** Catch angles to compare, degrees up from flat: the steeper, the sooner it lets go. */
export const LATCH_CATCHES = [35, 45, 55];
/** The strip's sockets sit over this many slots in one row of the board. */
const STRIP_SLOTS = 3;

/** Each test latch, in the order its notches count: legs, then catches within each. */
export const testLatches = (press = GRID.fit.latch.press): LatchFit[] => LATCH_LEGS.flatMap((leg) => LATCH_CATCHES.map((c) => ({ leg, catch: c, press })));

/**
 * The overlay's latch test (#13 §6): a strip of tile with a socket over each of three slots in a
 * row of a real UPPDATERA board, and a latch at every leg and catch, told apart by notches.
 */
export function latchStrip(wasm: ManifoldToplevel, { variant, hole, skin }: Choice, press = GRID.fit.latch.press): Part[] {
  const fits = testLatches(press);
  const shapes = fits.map((fit) => latchShape(fit));
  const socket = socketOf(shapes, fits[0]);
  const margin = 3;
  const nx = Math.ceil(((STRIP_SLOTS - 1) * UPPDATERA.pitch + socket.pad[0] + 2 * margin) / PITCH);
  const ny = Math.max(3, Math.ceil((socket.pad[1] + 2 * margin) / PITCH));
  const centres = Array.from({ length: STRIP_SLOTS }, (_, n) => [(nx * PITCH) / 2 + (n - (STRIP_SLOTS - 1) / 2) * UPPDATERA.pitch, (ny * PITCH) / 2] as const);
  const { pads, voids, blind } = latchSockets(wasm, centres, socket, hole);
  return [
    {
      name: `latch-strip-${variant}`,
      solid: tile(wasm, { variant, nx, ny, hole, skin, joiners: false, solids: pads, voids, blind }),
      copies: 1,
      note: `A ${variant} strip with ${STRIP_SLOTS} latch sockets ${UPPDATERA.pitch} mm apart, over ${STRIP_SLOTS} slots in one row of a real UPPDATERA board. Press a latch into each socket, then the strip onto the board.`,
    },
    {
      name: "latches",
      solid: arrange(wasm, shapes.map((shape, n) => printLatch(wasm, shape, [Math.floor(n / LATCH_CATCHES.length) + 1, (n % LATCH_CATCHES.length) + 1])), LATCH_CATCHES.length),
      copies: 1,
      note:
        "One latch per leg and catch. Notches on the bar's left half count the leg: " +
        LATCH_LEGS.map((leg, n) => `${n + 1} = ${leg} mm`).join(", ") +
        "; on its right half, the catch: " +
        LATCH_CATCHES.map((c, n) => `${n + 1} = ${c}°`).join(", ") +
        ". Keep the one that snaps in by hand, holds the strip down when shaken, and comes off with a firm pull; set it as `fit.latch` in the printer profile.",
    },
  ];
}

export function describeFit(fit: number): string {
  if (fit === 0) return "line-to-line";
  return fit < 0 ? `${(-fit).toFixed(2)} mm interference` : `${fit.toFixed(2)} mm clearance`;
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
