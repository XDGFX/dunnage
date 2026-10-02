import Module, { type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { overhangs } from "../src/core/grid/printability.ts";
import { PITCH, PLATE, THICKNESS, VARIANTS, WEB, holeCentre, seatedPlate, tile, type Variant } from "../src/core/grid/tile.ts";

type Wasm = Awaited<ReturnType<typeof Module>>;
let wasm: Wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const variants = Object.keys(VARIANTS) as Variant[];
const HOLE = 3.4;

/** The volume of the part inside a tube round (x, y), from radius r0 to r1, between heights z0 and z1. */
function solidIn(part: Manifold, x: number, y: number, r0: number, r1: number, z0 = 1.5, z1 = THICKNESS - 2): number {
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
    const part = tile(wasm, { variant, nx: 9, ny: 6, hole: HOLE, skin: 0.6 });
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

  test.each(variants)("a %s boss keeps its wall thickness whatever the hole", (variant) => {
    const { wall } = VARIANTS[variant];
    const sizes: Record<number, number> = { 1: 3.0, 3: 3.8 };
    const part = tile(wasm, { variant, nx: 6, ny: 4, hole: (i) => sizes[i] ?? 3.4 });
    for (const i of [1, 3]) {
      const outer = sizes[i]! / 2 + wall;
      // An inner boss, above the web: solid just inside its wall, nothing just outside.
      expect(solidIn(part, holeCentre(i), holeCentre(1), outer - 0.15, outer - 0.05, WEB.height + 0.1)).toBeGreaterThan(0);
      expect(solidIn(part, holeCentre(i), holeCentre(1), outer + 0.05, outer + 0.15, WEB.height + 0.1)).toBe(0);
    }
  });

  test.each(variants)("a %s tile has a low, thin web along every row and column, joining the bosses", (variant) => {
    const part = tile(wasm, { variant, nx: 6, ny: 6, hole: HOLE, skin: 0.6 });
    const w = WEB.width;
    // Halfway between two inner bosses, along a row and along a column.
    for (const [x, y, dx, dy] of [
      [PITCH * 3, holeCentre(2), 0.4, w / 2],
      [holeCentre(2), PITCH * 3, w / 2, 0.4],
    ] as const) {
      expect(solidInBox(part, [x - dx, y - dy, 1], [x + dx, y + dy, WEB.height])).toBeCloseTo(4 * dx * dy * (WEB.height - 1));
      expect(solidInBox(part, [x - 0.4, y - 0.4, WEB.height + 0.01], [x + 0.4, y + 0.4, THICKNESS])).toBe(0);
      // Thin: nothing just beside it.
      expect(solidInBox(part, [x - 0.4, y - 0.4, 1], [x + 0.4, y + 0.4, WEB.height]) - 4 * dx * dy * (WEB.height - 1)).toBeLessThan(1e-6);
    }
  });

  test.each(variants)("a %s tile's web runs whole to the edge bosses, clear of the plates' sleeves", (variant) => {
    const part = tile(wasm, { variant, nx: 6, ny: 6, hole: HOLE, skin: 0.6 });
    const r = HOLE / 2 + VARIANTS[variant].wall;
    const w = WEB.width;
    // Along column 3, from the edge boss in row 0 to the boss in row 1, at full web height.
    const [y0, y1] = [holeCentre(0) + r - 0.1, holeCentre(1) - r + 0.1];
    expect(solidInBox(part, [holeCentre(3) - w / 2, y0, WEB.height - 0.5], [holeCentre(3) + w / 2, y1, WEB.height])).toBeCloseTo(w * (y1 - y0) * 0.5);
    expect(THICKNESS - PLATE.thickness - PLATE.sleeve).toBeGreaterThan(WEB.height);
  });

  test.each([0.6, 1.2])("the top face is closed, %f mm thick", (skin) => {
    const part = tile(wasm, { variant: "light", nx: 6, ny: 6, hole: HOLE, skin });
    // The middle of a gap square: solid through the skin, and open above it.
    const at = PITCH * 3;
    expect(solidInBox(part, [at - 0.5, at - 0.5, 0], [at + 0.5, at + 0.5, skin])).toBeCloseTo(skin);
    expect(solidInBox(part, [at - 0.5, at - 0.5, skin + 0.01], [at + 0.5, at + 0.5, THICKNESS])).toBe(0);
  });

  test.each(variants)("a %s tile's edge bosses stop short of the back, with room round them for a plate's sleeves", (variant) => {
    const part = tile(wasm, { variant, nx: 6, ny: 6, hole: HOLE });
    const r = HOLE / 2 + VARIANTS[variant].wall;
    const seat = THICKNESS - PLATE.thickness;
    const sleeveBottom = seat - PLATE.sleeve;
    // An edge boss: solid to the seat, nothing above it, and a clear ring round it down to the sleeve's depth.
    expect(solidIn(part, holeCentre(3), holeCentre(0), r - 0.3, r - 0.1, sleeveBottom, seat)).toBeGreaterThan(0);
    expect(solidIn(part, holeCentre(3), holeCentre(0), 0, r + 0.5, seat + 0.01, THICKNESS)).toBe(0);
    expect(solidIn(part, holeCentre(3), holeCentre(0), r + 0.01, r + PLATE.wall + 0.2, sleeveBottom + 0.01, THICKNESS)).toBeLessThan(1e-6);
    // An inner boss runs full height.
    expect(solidIn(part, holeCentre(3), holeCentre(3), r - 0.3, r - 0.1, seat, THICKNESS)).toBeGreaterThan(0);
  });
});

describe("plates", () => {
  // Two tiles side by side, joined along x = nx * PITCH.
  const nx = 4;
  const ny = 6;
  const pair = (variant: Variant) => {
    const left = tile(wasm, { variant, nx, ny, hole: HOLE });
    return [left, left.translate([nx * PITCH, 0, 0])] as const;
  };

  test.each(variants)("a %s plate sits flush on the edge bosses either side of a join, at any pair of edge holes", (variant) => {
    const [left, right] = pair(variant);
    for (const j of [0, 2, 4]) {
      // A plate is centred on the corner between 4 holes: the join, and the gap line between holes j and j + 1.
      const plate = seatedPlate(wasm, variant, HOLE, 0).translate([nx * PITCH, (j + 1) * PITCH, 0]);
      expect(plate.status()).toBe("NoError");
      expect(plate.boundingBox().max[2]).toBeCloseTo(THICKNESS);
      expect(plate.boundingBox().min[2]).toBeCloseTo(THICKNESS - PLATE.thickness - PLATE.sleeve);
      expect(plate.intersect(left).volume()).toBeLessThan(1e-3);
      expect(plate.intersect(right).volume()).toBeLessThan(1e-3);
    }
  });

  test("a plate with interference grips the bosses, and one with clearance doesn't touch them", () => {
    const [left, right] = pair("standard");
    const at = (fit: number) => seatedPlate(wasm, "standard", HOLE, fit).translate([nx * PITCH, 2 * PITCH, 0]);
    expect(at(-0.05).intersect(left.add(right)).volume()).toBeGreaterThan(0);
    expect(at(0.1).intersect(left.add(right)).volume()).toBeLessThan(1e-6);
  });

  test("a plate leaves the holes clear for a screw or pin", () => {
    const plate = seatedPlate(wasm, "standard", HOLE, 0);
    for (const [x, y] of [
      [-PITCH / 2, -PITCH / 2],
      [PITCH / 2, PITCH / 2],
    ] as const) {
      expect(solidIn(plate, x, y, 0, HOLE / 2, 0, THICKNESS)).toBe(0);
    }
  });

  test("a plate fits where four tiles meet", () => {
    const one = tile(wasm, { variant: "light", nx, ny: nx, hole: HOLE });
    const four = wasm.Manifold.union([0, 1].flatMap((a) => [0, 1].map((b) => one.translate([a * nx * PITCH, b * nx * PITCH, 0]))));
    const plate = seatedPlate(wasm, "light", HOLE, 0).translate([nx * PITCH, nx * PITCH, 0]);
    expect(plate.intersect(four).volume()).toBeLessThan(1e-3);
  });
});
