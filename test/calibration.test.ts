import Module from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { roundOne, roundThree, roundTwo, type Part } from "../src/core/grid/calibration.ts";
import { overhangs } from "../src/core/grid/printability.ts";

let wasm: Awaited<ReturnType<typeof Module>>;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

// A P1S bed, less the 10 mm margin from #6.
const FITS = 256 - 10;

function expectPrintable(part: Part) {
  expect(part.solid.status(), part.name).toBe("NoError");
  expect(part.solid.isEmpty(), part.name).toBe(false);
  expect(overhangs(part.solid.getMesh()), part.name).toBe(0);
  const { min, max } = part.solid.boundingBox();
  expect(min[2], part.name).toBeCloseTo(0);
  expect(max[0] - min[0], part.name).toBeLessThanOrEqual(FITS);
  expect(max[1] - min[1], part.name).toBeLessThanOrEqual(FITS);
}


describe("round one", () => {
  test("is two small strips, and they print without supports", () => {
    const parts = roundOne(wasm);
    expect(parts.map((p) => p.name)).toEqual(["screw-holes", "boss-walls"]);
    parts.forEach(expectPrintable);
    // Small: a single row of holes each.
    for (const part of parts) expect(part.solid.boundingBox().max[1]).toBeLessThan(10);
  });
});

describe("round two", () => {
  test("every part prints without supports", () => {
    const parts = roundTwo(wasm, [{ variant: "light", hole: 3.3, skin: 0.6 }]);
    expect(parts.map((p) => p.name)).toEqual(["joiner-tile-light", "joiners-light", "pins-light", "pegs-light"]);
    parts.forEach(expectPrintable);
  }, 60_000);
});

describe("round three", () => {
  test("every part prints without supports and fits the bed, including a full 25 × 25 tile", () => {
    const parts = roundThree(wasm, [{ variant: "light", hole: 3.3, skin: 0.6, fit: 0.05 }]);
    expect(parts.map((p) => p.name)).toEqual(["tile-8x8-light", "joiners-light", "tile-25x25-light", "test-holder"]);
    parts.forEach(expectPrintable);
  }, 180_000);
});
