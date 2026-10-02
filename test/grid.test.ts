import Module, { type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { overhangs } from "../src/core/grid/printability.ts";
import { CLIP_TYPES, PITCH, THICKNESS, edgePockets, holeCentre, pocketSteps, seatedClip, tile, type Variant } from "../src/core/grid/tile.ts";

type Wasm = Awaited<ReturnType<typeof Module>>;
let wasm: Wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

/** The volume of the part inside a tube round (x, y), from radius r0 to r1, clear of the face and back. */
function solidIn(part: Manifold, x: number, y: number, r0: number, r1: number): number {
  const tube = wasm.Manifold.cylinder(THICKNESS - 2, r1, r1, 64).subtract(wasm.Manifold.cylinder(THICKNESS - 2, r0, r0, 64));
  return part.intersect(tube.translate([x, y, 1])).volume();
}

describe("pocketSteps", () => {
  test("puts pockets 2 pitches in from each corner, evenly spaced between", () => {
    expect(pocketSteps(8)).toEqual([2, 6]);
    expect(pocketSteps(24)).toEqual([2, 7, 12, 17, 22]);
    expect(pocketSteps(25)).toEqual([2, 6, 10, 15, 19, 23]);
  });

  test("is symmetric, so tiles line up whichever way round, with pockets 2–6 pitches apart", () => {
    for (let n = 10; n <= 40; n++) {
      const steps = pocketSteps(n);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps.map((k) => n - k).reverse()).toEqual(steps);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]! - steps[i - 1]!).toBeLessThanOrEqual(6);
        expect(steps[i]! - steps[i - 1]!).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("tile", () => {
  const variants: Variant[] = ["standard", "light", "light-thick"];

  test.each(variants)("a %s tile is one closed solid, 8 mm thick, that prints without supports", (variant) => {
    const part = tile(wasm, { variant, nx: 9, ny: 6, hole: 3.4, pockets: edgePockets(9, 6, CLIP_TYPES[0]!) });
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

  test("standard has a face skin and light does not", () => {
    const between = (variant: Variant) => {
      const part = tile(wasm, { variant, nx: 4, ny: 4, hole: 3.4 });
      const probe = wasm.Manifold.cube([1, 1, 1]).translate([PITCH * 2, PITCH * 2, 0]);
      return part.intersect(probe).volume();
    };
    expect(between("standard")).toBeGreaterThan(0.9);
    expect(between("light")).toBe(0);
  });
});

describe("clips", () => {
  test.each(CLIP_TYPES.flatMap((type) => [0, 0.05, 0.2].map((clearance) => [type, clearance] as const)))(
    "a %o clip with %f mm clearance sits flush in the pockets of two tiles without touching them",
    (type, clearance) => {
      const nx = 2;
      const left = tile(wasm, { variant: "light", nx, ny: 2, hole: 3.3, pockets: [{ edge: "+x", step: 1, type }] });
      const right = left.mirror([1, 0, 0]).translate([2 * nx * PITCH, 0, 0]);
      const clip = seatedClip(wasm, type, clearance).translate([nx * PITCH, PITCH, 0]);
      expect(clip.status()).toBe("NoError");
      expect(clip.boundingBox().max[2]).toBeCloseTo(THICKNESS);
      expect(clip.intersect(left).volume()).toBeLessThan(1e-3);
      expect(clip.intersect(right).volume()).toBeLessThan(1e-3);
      // It reaches into both tiles' pockets.
      expect(clip.boundingBox().min[0]).toBeLessThan(nx * PITCH - PITCH);
      expect(clip.boundingBox().max[0]).toBeGreaterThan(nx * PITCH + PITCH);
    },
  );
});
