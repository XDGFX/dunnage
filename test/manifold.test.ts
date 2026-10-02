import Module from "manifold-3d";
import { expect, test } from "vitest";

// Holder geometry will come from manifold-3d. This keeps its WASM build honest in Node.
test("manifold-3d builds solids in Node", async () => {
  const wasm = await Module();
  wasm.setup();
  const cube = wasm.Manifold.cube([10, 20, 30]);
  expect(cube.volume()).toBeCloseTo(6000);
  cube.delete();
});
