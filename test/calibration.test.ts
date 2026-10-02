import Module from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { roundOne, roundTwo, type Part } from "../src/core/grid/calibration.ts";
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
  test("every part prints without supports and fits the bed", () => {
    const parts = roundOne(wasm);
    expect(parts.map((p) => p.name)).toEqual([
      "holes-standard-skin-0.6",
      "holes-standard-skin-1.2",
      "holes-light-thick-skin-0.6",
      "holes-light-thick-skin-1.2",
      "holes-light-skin-0.6",
      "holes-light-skin-1.2",
      "holes-light-thin-skin-0.6",
      "holes-light-thin-skin-1.2",
      "plates-standard",
      "plates-light-thick",
      "plates-light",
      "plates-light-thin",
    ]);
    parts.forEach(expectPrintable);
  }, 60_000);
});

describe("round two", () => {
  test("every part prints without supports and fits the bed, including a full 25 × 25 tile", () => {
    const parts = roundTwo(wasm, {
      variants: [
        { variant: "light", hole: 3.3, fit: 0.05, skin: 0.6 },
        { variant: "standard", hole: 3.4, fit: 0, skin: 1.2 },
      ],
    });
    expect(parts.map((p) => p.name)).toEqual([
      "pins-light",
      "pegs-light",
      "tile-8x8-light",
      "tile-25x25-light",
      "plates-light",
      "pins-standard",
      "pegs-standard",
      "tile-8x8-standard",
      "tile-25x25-standard",
      "plates-standard",
      "test-holder",
    ]);
    parts.forEach(expectPrintable);
  }, 180_000);
});
