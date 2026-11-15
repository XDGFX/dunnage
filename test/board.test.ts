import { readFileSync } from "node:fs";
import Module, { type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import { buildBoard, bumperSolid, joinerSolid, pegSolid, printable, tileSolid } from "../src/core/grid/board.ts";
import { cornerCuts, holeAt, joinerReach, layoutBoard, type BoardLayout, type GridBase } from "../src/core/grid/layout.ts";
import { GRID, gridFit } from "../src/core/grid/parameters.ts";
import { overhangs } from "../src/core/grid/printability.ts";
import { PITCH, THICKNESS, VARIANTS, WEB, seatedJoiner } from "../src/core/grid/tile.ts";
import { DRAWER_PRESETS, drawerShape, type DrawerShape, type Side } from "../src/core/index.ts";

type Wasm = Awaited<ReturnType<typeof Module>>;
let wasm: Wasm;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const GRID_BASE: GridBase = { kind: "grid" };
const SIDES: Side[] = ["left", "right", "front", "back"];
const P1S = [256, 256, 256] as const;
const HOLE = gridFit().grid_hole[GRID.variant]!;
const RAD = Math.PI / 180;

const shape = (fields: Partial<DrawerShape> & { inside: [number, number, number] }): DrawerShape => ({
  walls: { left: 0, right: 0, front: 0, back: 0 },
  corner_radius: 0,
  floor_edge: 0,
  ...fields,
});

/** Distances in whole pitches, sorted; each must be a whole number of pitches. */
function pitches(distances: number[]): number[] {
  const n = distances.map((d) => d / PITCH);
  for (const v of n) expect(v).toBeCloseTo(Math.round(v), 9);
  return n.map(Math.round).sort((a, b) => a - b);
}

/** What a layout must always be, whatever the drawer. */
function expectSound(layout: BoardLayout, bed: readonly number[]) {
  expect(layout.problems).toEqual([]);
  const [W, D] = layout.shape.inside;
  const [nx, ny] = layout.holes;
  const { gap, fit } = layout;
  // The layout plus clearance is the drawer's inside size.
  expect(fit + gap.left + nx * PITCH + gap.right + fit).toBeCloseTo(W, 9);
  expect(fit + gap.front + ny * PITCH + gap.back + fit).toBeCloseTo(D, 9);
  // Every bumper is 5–10 mm thick at the floor.
  for (const side of SIDES) {
    expect(gap[side]).toBeGreaterThanOrEqual(GRID.bumper.min - 1e-9);
    expect(gap[side]).toBeLessThanOrEqual(GRID.bumper.max + 1e-9);
  }
  const room = [bed[0]! - GRID.tile.bed_margin, bed[1]! - GRID.tile.bed_margin];
  for (const t of layout.tiles) {
    // Every tile fits the bed with its margin, and its holes sit on the board's pitch.
    expect(t.box.x1 - t.box.x0).toBeLessThanOrEqual(room[0]!);
    expect(t.box.y1 - t.box.y0).toBeLessThanOrEqual(room[1]!);
    expect(t.box.x0).toBeCloseTo(holeAt(layout, t.first)[0] - PITCH / 2, 9);
    expect(t.box.y0).toBeCloseTo(holeAt(layout, t.first)[1] - PITCH / 2, 9);
  }
  for (const b of layout.bumpers) {
    expect(b.top.x1 - b.top.x0).toBeLessThanOrEqual(room[0]!);
    expect(b.top.y1 - b.top.y0).toBeLessThanOrEqual(room[1]!);
  }
  // The tiles cover the board, each hole once.
  expect(layout.tiles.reduce((sum, t) => sum + t.size[0] * t.size[1], 0)).toBe(nx * ny);
}

describe("laying out a board", () => {
  test.each(Object.keys(DRAWER_PRESETS))("%s lays out without errors", (preset) => {
    expectSound(layoutBoard(drawerShape({ preset })!, GRID_BASE), P1S);
  });

  test("the tool chest fixture lays out without errors", () => {
    const file = parse(readFileSync(new URL("../fixtures/tool-chest.drawer.yml", import.meta.url), "utf8"));
    expectSound(layoutBoard(drawerShape(file.drawer)!, file.base), P1S);
  });

  test("a MAXIMERA 80×60 lays out as the spec's worked example", () => {
    const layout = layoutBoard(drawerShape({ preset: "ikea-maximera-80x60-low" })!, GRID_BASE);
    expect(layout.holes).toEqual([70, 52]);
    expect(layout.tiles.filter((t) => t.row === 0).map((t) => t.size[0])).toEqual([24, 23, 23]);
    expect(layout.tiles.filter((t) => t.col === 0).map((t) => t.size[1])).toEqual([18, 17, 17]);
    expect(layout.gap.left).toBeCloseTo(7.7);
    expect(layout.gap.front).toBeCloseTo(5.2);
    expect(layout.tiles.map((t) => t.label)).toContain("3-2");
  });

  test("a named side takes all it can, up to the thickest bumper", () => {
    const base: GridBase = { kind: "grid", bumpers: { split: { x: "right", y: "front" } } };
    const layout = layoutBoard(shape({ inside: [681, 505, 80] }), base);
    expect(layout.gap.right).toBeCloseTo(GRID.bumper.max);
    expect(layout.gap.left).toBeCloseTo(15.4 - GRID.bumper.max);
    // 10.4 mm to share: the front takes all but the thinnest.
    expect(layout.gap.back).toBeCloseTo(GRID.bumper.min);
    expect(layout.gap.front).toBeCloseTo(10.4 - GRID.bumper.min);
  });

  test("`tile` caps the tile size, and the layout balances under it", () => {
    const layout = layoutBoard(shape({ inside: [681, 505, 80] }), { kind: "grid", tile: [20, 30] });
    expect(layout.problems.map((p) => p.at)).toEqual([["base", "tile"]]);
    expect(layout.tiles.filter((t) => t.row === 0).map((t) => t.size[0])).toEqual([18, 18, 17, 17]);
  });

  test("a side bumper running past a corner fits the bed too", () => {
    // 25 holes is the biggest tile a P1S takes, but not with a 10 mm bumper on its end.
    const layout = layoutBoard(shape({ inside: [100, 25 * PITCH + 0.6 + 15, 80] }), { kind: "grid", bumpers: { split: { y: "front" } } });
    expectSound(layout, P1S);
    expect(layout.holes[1]).toBe(25);
    expect(layout.gap.front).toBeCloseTo(GRID.bumper.max);
    expect(layout.tiles.map((t) => t.size[1])).toEqual([13, 12]);
  });

  test("a drawer too small for a hole is a problem, not a layout", () => {
    expect(layoutBoard(shape({ inside: [15, 200, 80] }), GRID_BASE).problems.map((p) => p.at)).toEqual([["drawer"]]);
  });

  test("tiles join with two joiners along every join and one where four meet; thin bumpers aren't joined", () => {
    // 2 × 2 tiles of 6 × 5 holes, on a bed that takes no more than 7.
    const layout = layoutBoard(shape({ inside: [130, 110, 80] }), GRID_BASE, { bed: [80, 80, 80] });
    expect(layout.tiles).toHaveLength(4);
    expect(layout.gap.left).toBeLessThan(joinerReach(layout.variant, gridFit()));
    const { origin } = layout;
    const mid = [origin[0] + 6 * PITCH, origin[1] + 5 * PITCH];
    // Along the middle column line: two in each row, and one at the middle.
    expect(pitches(layout.joiners.filter(([x]) => x === mid[0]).map(([, y]) => y - origin[1]))).toEqual([1, 4, 5, 6, 9]);
    expect(pitches(layout.joiners.filter(([, y]) => y === mid[1]).map(([x]) => x - origin[0]))).toEqual([2, 4, 6, 8, 10]);
    expect(layout.joiners).toHaveLength(9);
  });

  test("a bumper thick enough for a joiner's rings is joined along every tile edge", () => {
    const layout = layoutBoard(shape({ inside: [130, 110, 80] }), { kind: "grid", bumpers: { split: { x: "left" } } }, { bed: [80, 80, 80] });
    expect(layout.gap.left).toBeGreaterThanOrEqual(joinerReach(layout.variant, gridFit()));
    expect(pitches(layout.joiners.filter(([x]) => x === layout.origin[0]).map(([, y]) => y - layout.origin[1]))).toEqual([1, 4, 5, 6, 9]);
  });

  test("a rounded corner drops the holes whose bosses it cuts, and only those", () => {
    const layout = layoutBoard(shape({ inside: [130, 110, 80], corner_radius: 40 }), GRID_BASE, { bed: [80, 80, 80] });
    expect(layout.dropped).toContainEqual([0, 0]);
    expect(layout.dropped).not.toContainEqual([5, 5]);
    const boss = HOLE / 2 + VARIANTS[layout.variant].wall;
    const ring = (i: number, j: number) => {
      const [x, y] = holeAt(layout, [i, j]);
      return Array.from({ length: 360 }, (_, a) => cornerCuts(layout.shape, layout.corner!, x + boss * Math.cos(a * RAD), y + boss * Math.sin(a * RAD)));
    };
    for (let i = 0; i < layout.holes[0]; i++) {
      for (let j = 0; j < layout.holes[1]; j++) {
        const cut = ring(i, j).some(Boolean);
        expect([i, j, layout.dropped.some(([a, b]) => a === i && b === j)]).toEqual([i, j, cut]);
      }
    }
  });
});

/** The volume of a part inside a tube round (x, y), between heights z0 and z1 above the floor. */
function solidIn(part: Manifold, x: number, y: number, r0: number, r1: number, z0: number, z1: number): number {
  const tube = wasm.Manifold.cylinder(z1 - z0, r1, r1, 64);
  const ring = r0 > 0 ? tube.subtract(wasm.Manifold.cylinder(z1 - z0, r0, r0, 64)) : tube;
  return part.intersect(ring.translate([x, y, z0])).volume();
}

/** A joiner seated in the board, in place: centred on (x, y), flush with the floor. */
const seated = (layout: BoardLayout, x: number, y: number, fit: number) =>
  seatedJoiner(wasm, layout.variant, HOLE, fit).mirror([0, 0, 1]).translate([x, y, THICKNESS]);

describe("building a board", () => {
  // 2 × 2 tiles, sloped side walls, a floor edge, and a left bumper thick enough to join. Solids are
  // built for one tile pair, one joined bumper, one plain bumper, a joiner and a peg.
  const SLOPE = 20;
  const small = () =>
    layoutBoard(shape({ inside: [130, 110, 80], walls: { left: SLOPE, right: SLOPE, front: 0, back: 0 }, floor_edge: 1 }), { kind: "grid", bumpers: { split: { x: "left" } }, countersinks: [[2, 2]] }, { bed: [80, 80, 80] });

  test("every part is one closed solid that prints face down without supports", () => {
    const layout = small();
    // Tiles and bumpers are made in place; joiners and pegs as they print.
    const parts: Manifold[] = [
      printable(tileSolid(wasm, layout, layout.tiles[0]!)),
      printable(bumperSolid(wasm, layout, layout.bumpers.find((b) => b.side === "left" && b.index === 0)!)),
      printable(bumperSolid(wasm, layout, layout.bumpers.find((b) => b.side === "front")!)),
      joinerSolid(wasm, layout),
      pegSolid(wasm, layout),
    ];
    for (const part of parts) {
      expect(part.status()).toBe("NoError");
      expect(part.isEmpty()).toBe(false);
      expect(part.boundingBox().min[2]).toBeCloseTo(0, 9);
      expect(overhangs(part.getMesh())).toBe(0);
    }
  });

  test("hole centres sit on the pitch across a tile join", () => {
    const layout = small();
    const [a, b] = [layout.tiles.find((t) => t.label === "1-1")!, layout.tiles.find((t) => t.label === "1-2")!];
    const pair = tileSolid(wasm, layout, a).add(tileSolid(wasm, layout, b));
    const r = HOLE / 2;
    // The last hole of one tile and the first of the next, a pitch apart.
    for (const i of [a.size[0] - 1, a.size[0]]) {
      const [x, y] = holeAt(layout, [i, 1]);
      expect(solidIn(pair, x, y, 0, r - 0.05, 0, THICKNESS)).toBe(0);
      expect(solidIn(pair, x, y, r + 0.05, r + 0.3, 1, THICKNESS - 1)).toBeGreaterThan(0);
    }
  });

  test("joiners seat over the bosses at every layout position, across tiles and onto a bumper", () => {
    const layout = small();
    const parts = buildBoard(wasm, { ...layout, tiles: layout.tiles.slice(0, 1), bumpers: layout.bumpers.filter((b) => b.side === "left" && b.index === 0) });
    const tile = parts.tiles[0]!.solid;
    const bumper = parts.bumpers[0]!.solid;
    const onBumper = layout.joiners.filter(([x, y]) => x === layout.origin[0] && y < layout.tiles[0]!.box.y1);
    expect(onBumper.length).toBeGreaterThan(0);
    for (const [x, y] of onBumper) {
      expect(seated(layout, x, y, gridFit().joiner).intersect(tile.add(bumper)).volume()).toBeLessThan(1e-3);
      // With interference, the rings grip the bumper's own bosses: they're on the pitch too.
      expect(seated(layout, x, y, -0.05).intersect(bumper).volume()).toBeGreaterThan(0);
    }
  });

  test("a bumper's outer face takes its wall's slope, with a chamfer along the floor edge", () => {
    const layout = small();
    const left = layout.bumpers.find((b) => b.side === "left" && b.index === 1)!;
    const solid = bumperSolid(wasm, layout, left);
    const outer = (z: number) => solid.slice(z).bounds().min[0];
    const [z0, z1] = [3, 7];
    expect((outer(z0) - outer(z1)) / (z1 - z0)).toBeCloseTo(Math.tan(SLOPE * RAD), 3);
    expect(outer(z0)).toBeCloseTo(layout.fit - z0 * Math.tan(SLOPE * RAD), 3);
    // At the floor it stands a floor edge in from where the face would meet it.
    expect(outer(0.001)).toBeGreaterThanOrEqual(layout.fit + layout.shape.floor_edge - 0.01);
    // Its inner face meets the board, upright, above the lap tab.
    expect(solid.slice(z1).bounds().max[0]).toBeCloseTo(layout.origin[0], 6);
  });

  test("a bumper's lap tab runs under the tile's edge by its depth, and the tile still sits flat on the floor", () => {
    const layout = small();
    const { depth, thickness } = GRID.lap_tab;
    const t = layout.tiles.find((tile) => tile.label === "1-1")!;
    const tile = tileSolid(wasm, layout, t);
    for (const side of ["left", "front"] as const) {
      const b = layout.bumpers.find((bumper) => bumper.side === side && bumper.index === 0)!;
      const bumper = bumperSolid(wasm, layout, b);
      const foot = bumper.slice(thickness / 2).bounds();
      if (side === "left") expect(foot.max[0] - layout.origin[0]).toBeCloseTo(depth, 6);
      else expect(foot.max[1] - layout.origin[1]).toBeCloseTo(depth, 6);
      expect(bumper.status()).toBe("NoError");
      expect(bumper.intersect(tile).volume()).toBeLessThan(1e-3);
    }
    expect(tile.boundingBox().min[2]).toBeCloseTo(0, 9);
    // Under the tile's band, between two holes: the tab below, the band above it.
    const [x, y] = [layout.origin[0] + 0.6, layout.origin[1] + PITCH];
    const left = bumperSolid(wasm, layout, layout.bumpers.find((b) => b.side === "left" && b.index === 0)!);
    expect(solidIn(left, x, y, 0, 0.3, 0, thickness)).toBeGreaterThan(0);
    expect(solidIn(tile, x, y, 0, 0.3, 0, thickness)).toBe(0);
    expect(solidIn(tile, x, y, 0, 0.3, THICKNESS - 2, THICKNESS)).toBeGreaterThan(0);
  });

  test("a countersunk hole opens to a screw head on the face, in a widened boss", () => {
    const layout = small();
    const solid = tileSolid(wasm, layout, layout.tiles[0]!);
    const head = GRID.countersink.head / 2;
    const face = (i: number, j: number) => {
      const [x, y] = holeAt(layout, [i, j]);
      return solidIn(solid, x, y, HOLE / 2 + 0.6, head - 0.1, THICKNESS - 0.05, THICKNESS);
    };
    expect(face(2, 2)).toBe(0);
    expect(face(3, 2)).toBeGreaterThan(0);
    // The boss round it is whole out past the head, where a plain hole has only its webs.
    const [x, y] = holeAt(layout, [2, 2]);
    const [r0, r1, h] = [head + 0.05, head + 0.4, WEB.height - 0.2];
    expect(solidIn(solid, x, y, r0, r1, THICKNESS - WEB.height + 0.1, THICKNESS - 0.1)).toBeGreaterThan(0.95 * Math.PI * (r1 ** 2 - r0 ** 2) * h);
  });

  test("a peg is smaller than the board hole by the calibrated peg fit", () => {
    const layout = small();
    const { max } = pegSolid(wasm, layout).boundingBox();
    expect(max[0]).toBeCloseTo(GRID.peg.length);
    expect(max[1]).toBeCloseTo(HOLE - gridFit().peg, 2);
  });

  test("a rounded corner cuts the corner tile and bumpers to the arc, with a band along it", () => {
    const layout = layoutBoard(shape({ inside: [130, 110, 80], corner_radius: 40 }), GRID_BASE, { bed: [80, 80, 80] });
    const tile = tileSolid(wasm, layout, layout.tiles[0]!);
    const bumper = bumperSolid(wasm, layout, layout.bumpers.find((b) => b.side === "left" && b.index === 0)!);
    const R = layout.corner!.radius;
    // What's left of the corner square is inside the arc.
    const corner = wasm.Manifold.cube([R, R, THICKNESS]).subtract(wasm.Manifold.cylinder(THICKNESS, layout.corner!.cut + 0.01, layout.corner!.cut + 0.01, 128).translate([R, R, 0]));
    for (const part of [tile, bumper]) {
      expect(part.status()).toBe("NoError");
      expect(part.intersect(corner).volume()).toBeLessThan(1e-3);
      expect(overhangs(printable(part).getMesh())).toBe(0);
    }
    // The band: solid right along the arc, full height, where the cut crosses the tile.
    const a = 45 * RAD;
    const [x, y] = [R - (layout.corner!.cut - 0.3) * Math.cos(a), R - (layout.corner!.cut - 0.3) * Math.sin(a)];
    expect(solidIn(tile, x, y, 0, 0.2, 1, THICKNESS - 1)).toBeGreaterThan(0);
  });
});
