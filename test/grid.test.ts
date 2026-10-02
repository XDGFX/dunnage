import Module, { type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { overhangs } from "../src/core/grid/printability.ts";
import { PITCH, REBATE, THICKNESS, VARIANTS, holeCentre, seatedPlate, tile, type Variant } from "../src/core/grid/tile.ts";

type Wasm = Awaited<ReturnType<typeof Module>>;
let wasm: Wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const variants = Object.keys(VARIANTS) as Variant[];

/** The volume of the part inside a tube round (x, y), from radius r0 to r1, between heights z0 and z1. */
function solidIn(part: Manifold, x: number, y: number, r0: number, r1: number, z0 = 1, z1 = THICKNESS - 1): number {
  const tube = wasm.Manifold.cylinder(z1 - z0, r1, r1, 64);
  const ring = r0 > 0 ? tube.subtract(wasm.Manifold.cylinder(z1 - z0, r0, r0, 64)) : tube;
  return part.intersect(ring.translate([x, y, z0])).volume();
}

/** The volume of the part inside a box. */
function solidInBox(part: Manifold, min: [number, number, number], max: [number, number, number]): number {
  const box = wasm.Manifold.cube([max[0] - min[0], max[1] - min[1], max[2] - min[2]]).translate(min);
  return part.intersect(box).volume();
}

describe("tile", () => {
  test.each(variants)("a %s tile is one closed solid, 8 mm thick, that prints without supports", (variant) => {
    const part = tile(wasm, { variant, nx: 9, ny: 6, hole: 3.4 });
    expect(part.status()).toBe("NoError");
    expect(part.genus()).toBeGreaterThan(0);
    const box = part.boundingBox();
    expect(box.min).toEqual([0, 0, 0]);
    expect(box.max[0]).toBeCloseTo(9 * PITCH);
    expect(box.max[1]).toBeCloseTo(6 * PITCH);
    expect(box.max[2]).toBeCloseTo(THICKNESS);
    expect(overhangs(part.getMesh())).toBe(0);
  });

  test("holes go right through on the 9.5 mm grid, half a pitch from the edges, at their own sizes", () => {
    const sizes = [3.0, 3.4, 3.8];
    const part = tile(wasm, { variant: "light", nx: 3, ny: 2, hole: (i) => sizes[i]! });
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const r = sizes[i]! / 2;
        expect(solidIn(part, holeCentre(i), holeCentre(j), 0, r - 0.05)).toBe(0);
        expect(solidIn(part, holeCentre(i), holeCentre(j), r + 0.05, r + 0.3)).toBeGreaterThan(0);
      }
    }
  });

  test.each(variants)("a %s tile has a closed top face between the holes", (variant) => {
    const part = tile(wasm, { variant, nx: 6, ny: 6, hole: 3.4 });
    // The middle of a gap square, on the face, which lies on the bed.
    expect(solidInBox(part, [PITCH * 3 - 0.5, PITCH * 3 - 0.5, 0], [PITCH * 3 + 0.5, PITCH * 3 + 0.5, 0.5])).toBeCloseTo(0.5);
  });

  test.each(variants)("a %s tile's open back has a rebate round every edge, with the edge bosses standing up in it as stubs", (variant) => {
    const nx = 6;
    const part = tile(wasm, { variant, nx, ny: 6, hole: 3.4 });
    const od = VARIANTS[variant].bossOd;
    const back = THICKNESS - REBATE.depth;
    for (const [x, y] of [
      [PITCH * 3, 1.5], // the band, on the -y edge
      [nx * PITCH - 1.5, PITCH * 3], // the band, on the +x edge
    ] as const) {
      expect(solidIn(part, x, y, 0, 0.4, back - 1, back)).toBeGreaterThan(0);
      expect(solidIn(part, x, y, 0, 0.4, back + 0.01, THICKNESS)).toBe(0);
    }
    // An edge boss carries on above the rebate floor as a stub; an inner boss runs full height.
    expect(solidIn(part, holeCentre(3), holeCentre(0), od / 2 - 0.4, od / 2 - 0.1, back, back + REBATE.stub)).toBeGreaterThan(0);
    expect(solidIn(part, holeCentre(3), holeCentre(0), 0, od / 2 + 0.5, back + REBATE.stub + 0.01, THICKNESS)).toBe(0);
    expect(solidIn(part, holeCentre(3), holeCentre(3), od / 2 - 0.4, od / 2 - 0.1, back, THICKNESS)).toBeGreaterThan(0);
  });
});

describe("plates", () => {
  // Two tiles side by side, joined along x = nx * PITCH.
  const nx = 4;
  const ny = 6;
  const pair = (variant: Variant) => {
    const left = tile(wasm, { variant, nx, ny, hole: 3.4 });
    return [left, left.translate([nx * PITCH, 0, 0])] as const;
  };

  test.each(variants)("a %s plate sits flush over the stubs either side of a join, at any pair of edge holes", (variant) => {
    const [left, right] = pair(variant);
    for (const j of [0, 2, 4]) {
      // A plate is centred on the corner between 4 holes: the join, and the gap line between holes j and j + 1.
      const plate = seatedPlate(wasm, variant, 0).translate([nx * PITCH, (j + 1) * PITCH, 0]);
      expect(plate.status()).toBe("NoError");
      expect(plate.boundingBox().max[2]).toBeCloseTo(THICKNESS);
      expect(plate.intersect(left).volume()).toBeLessThan(1e-3);
      expect(plate.intersect(right).volume()).toBeLessThan(1e-3);
    }
  });

  test("a plate with interference grips the stubs, and one with clearance doesn't touch them", () => {
    const [left, right] = pair("standard");
    const at = (fit: number) => seatedPlate(wasm, "standard", fit).translate([nx * PITCH, 2 * PITCH, 0]);
    expect(at(-0.05).intersect(left.add(right)).volume()).toBeGreaterThan(0);
    expect(at(0.1).intersect(left.add(right)).volume()).toBeLessThan(1e-6);
  });

  test("a plate leaves the holes clear for a screw or pin", () => {
    const plate = seatedPlate(wasm, "standard", 0);
    for (const [x, y] of [
      [-PITCH / 2, -PITCH / 2],
      [PITCH / 2, PITCH / 2],
    ] as const) {
      expect(solidIn(plate, x, y, 0, 3.8 / 2, 0, THICKNESS)).toBe(0);
    }
  });

  test("a plate fits where four tiles meet", () => {
    const one = tile(wasm, { variant: "light", nx, ny: nx, hole: 3.3 });
    const four = wasm.Manifold.union([0, 1].flatMap((a) => [0, 1].map((b) => one.translate([a * nx * PITCH, b * nx * PITCH, 0]))));
    const plate = seatedPlate(wasm, "light", 0).translate([nx * PITCH, nx * PITCH, 0]);
    expect(plate.intersect(four).volume()).toBeLessThan(1e-3);
  });
});
