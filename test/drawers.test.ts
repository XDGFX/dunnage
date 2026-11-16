import { describe, expect, test } from "vitest";
import { DRAWER_PRESETS, drawerShape, presetName, wallFields } from "../src/core/index.ts";

describe("presetName", () => {
  test("names a MAXIMERA by its size and height", () => {
    expect(presetName("ikea-maximera-80x60-low")).toBe("MAXIMERA 80 × 60, low");
    expect(presetName("ikea-maximera-us-18-high")).toBe("MAXIMERA US 18 in, high");
  });

  test("gives every built-in drawer a name of its own", () => {
    const names = Object.keys(DRAWER_PRESETS).map(presetName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).not.toMatch(/^ikea-/);
  });

  test("leaves a name it doesn't know as it is", () => {
    expect(presetName("my-drawer")).toBe("my-drawer");
  });
});

describe("wallFields", () => {
  test.each([
    [{ left: 0, right: 0, front: 0, back: 0 }, {}],
    [{ left: 20, right: 20, front: 0, back: 0 }, { sides: 20 }],
    [{ left: 20, right: 0, front: 3, back: 3 }, { left: 20, right: 0, ends: 3 }],
    [{ left: 0, right: 0, front: 2, back: 5 }, { front: 2, back: 5 }],
  ])("writes %o as %o, which reads back the same", (walls, fields) => {
    expect(wallFields(walls)).toEqual(fields);
    expect(drawerShape({ inside: [100, 100, 50], walls: wallFields(walls) })!.walls).toEqual(walls);
  });
});
