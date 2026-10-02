import Module from "manifold-3d";
import { beforeAll, expect, test } from "vitest";
import { overhangs } from "../src/core/grid/printability.ts";
import { toStl } from "../src/core/grid/stl.ts";

let wasm: Awaited<ReturnType<typeof Module>>;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

test("toStl writes a binary STL with one record per triangle", () => {
  const mesh = wasm.Manifold.cube([10, 20, 30]).getMesh();
  const bytes = toStl(mesh);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  expect(count).toBe(12);
  expect(bytes.byteLength).toBe(84 + 50 * count);
  // Every vertex of the first triangle lies on the cube.
  for (let v = 0; v < 3; v++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = view.getFloat32(84 + 12 + v * 12 + axis * 4, true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(30);
    }
  }
});

test("a part resting on the bed has no overhangs", () => {
  expect(overhangs(wasm.Manifold.cube([10, 10, 10]).getMesh())).toBe(0);
});

test("a part's underside above the bed is an overhang", () => {
  const raised = wasm.Manifold.cube([10, 10, 10]).add(wasm.Manifold.cube([30, 10, 2]).translate([0, 0, 10]));
  expect(overhangs(raised.getMesh())).toBeGreaterThan(0);
});

test("a 45° slope is not an overhang, a shallower one is", () => {
  const cone = (rise: number) => wasm.Manifold.cylinder(10, 2, 2 + rise, 64);
  expect(overhangs(cone(10).getMesh())).toBe(0);
  expect(overhangs(cone(15).getMesh())).toBeGreaterThan(0);
});
