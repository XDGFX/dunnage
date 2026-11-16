import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import Module, { type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  boardCounts, bumperSolid, check, drawerOverlays, drawerShape, exportDrawer, GRID, holeAt, layoutBoard, layoutOverlay, load, pegboard, plan, printable,
  gridFit, stripPeg, tileSolid, UPPDATERA, type Drawer, type OverlayLayout, type OverlaySpec,
} from "../src/core/index.ts";
import { overhangs } from "../src/core/grid/printability.ts";
import { PITCH, THICKNESS } from "../src/core/grid/tile.ts";

let wasm: Awaited<ReturnType<typeof Module>>;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const COFFEE = readFileSync(new URL("../fixtures/coffee.drawer.yml", import.meta.url), "utf8");
const coffee = () => (load(COFFEE) as { drawer: Drawer }).drawer;
const SHAPE = drawerShape({ inside: [700, 500, 150] })!;
const BOARD = pegboard("uppdatera-80", 700, 500);
const overlay = (spec: Partial<OverlaySpec>, bed?: readonly [number, number, number]) =>
  layoutOverlay(SHAPE, BOARD, { id: "front", kind: "grid", at: [0, 0], holes: [16, 16], ...spec }, 0, bed ? { bed } : {});

describe("edge strips", () => {
  // A drawer the 80 cm board's size, so the board's corner is the drawer's. Slots, as UPPDATERA
  // lays them out: 31 steps of 20 mm across 675 mm, centred, start at x = 27.5; 22 rows of 20 mm
  // across 500 mm start at y = 30; a slot is where the step and row counts add up to an even
  // number, and it's 17 mm along x by 7 across. A peg is the slot less 0.2 mm each way.
  //
  // An overlay at [100, 100], 16 × 16 holes, covers 100–252 mm both ways in one tile, clear of
  // every wall, so all four edges get strips. Its joiners sit at 100 + 4 × 9.5 = 138 and
  // 100 + 12 × 9.5 = 214 along each edge, and a joiner's room reaches 8.55 mm round its centre.
  // A peg stays 2 mm inside a strip's edges, 4 mm inside its outer edge, and 2 mm off a joiner.
  //
  // Front: rows must end 2 mm short of y = 100, so y ≤ 94.5: row 90 (odd steps, x = 47.5, 87.5,
  // ...), so the strip is 100 − (90 − 3.5 − 4) = 17.5 mm. It runs past both corners, 55–280: pegs
  // at 87.5, 167.5, 247.5; 127.5 and 207.5 come within 2 mm of the joiners at 138 and 214.
  // Back: rows from y ≥ 252 + 2 + 3.5: row 270 (even steps), 270 + 3.5 + 4 − 252 = 25.5 mm wide,
  // pegs at 67.5–267.5 every 40.
  // Right: columns from x ≥ 252 + 2 + 8.5: column 267.5 (even steps, y = 110, 150, 190, 230), so
  // 267.5 + 8.5 + 4 − 252 = 28 mm; 150 comes within 2 mm of the joiner at y = 138.
  // Left: column 87.5 (odd steps, y = 130, 170, 210) needs 25 mm, but 130 and 210 are by the
  // joiners, leaving one peg; column 67.5 (y = 110, 150, 190, 230) needs 100 − (67.5 − 12.5) = 45.
  const shape = drawerShape({ inside: [675, 500, 100] })!;
  const board = pegboard("uppdatera-80", 675, 500);
  const placed = () => layoutOverlay(shape, board, { id: "a", kind: "grid", at: [100, 100], holes: [16, 16] }, 0);
  const pegsOf = (layout: OverlayLayout, side: string) => layout.bumpers.filter((b) => b.side === side).flatMap((b) => b.pegs ?? []);

  test("are as wide as they must be to reach two slots, edge by edge, worked out by hand", () => {
    const layout = placed();
    expect(layout.problems).toEqual([]);
    expect(Object.fromEntries(layout.strips.map((s) => [s.side, s.width]))).toEqual({ left: 45, right: 28, front: 17.5, back: 25.5 });
  });

  test("put pegs on the slots under them, worked out by hand", () => {
    const layout = placed();
    expect(pegsOf(layout, "front")).toEqual([[87.5, 90], [167.5, 90], [247.5, 90]]);
    expect(pegsOf(layout, "back")).toEqual([67.5, 107.5, 147.5, 187.5, 227.5, 267.5].map((x) => [x, 270]));
    expect(pegsOf(layout, "right")).toEqual([[267.5, 110], [267.5, 190], [267.5, 230]]);
    expect(pegsOf(layout, "left")).toEqual([[67.5, 110], [67.5, 150], [67.5, 190], [67.5, 230], [87.5, 170]]);
    // Every peg is centred on a slot, and lies wholly inside its strip.
    const [pl, pw] = stripPeg();
    for (const strip of layout.bumpers) {
      for (const [x, y] of strip.pegs!) {
        expect(board.holes).toContainEqual([x, y]);
        expect(x - pl / 2).toBeGreaterThanOrEqual(strip.floor.x0);
        expect(x + pl / 2).toBeLessThanOrEqual(strip.floor.x1);
        expect(y - pw / 2).toBeGreaterThanOrEqual(strip.floor.y0);
        expect(y + pw / 2).toBeLessThanOrEqual(strip.floor.y1);
      }
    }
    expect([pl, pw]).toEqual([UPPDATERA.slot[0] - UPPDATERA.strip_peg.fit, UPPDATERA.slot[1] - UPPDATERA.strip_peg.fit]);
  });

  test("run the front and back strips past the corners, over the side strips' ends", () => {
    const layout = placed();
    const side = (s: string) => layout.bumpers.find((b) => b.side === s)!.floor;
    expect(side("front")).toEqual({ x0: 55, x1: 280, y0: 82.5, y1: 100 });
    expect(side("left")).toEqual({ x0: 55, x1: 100, y0: 100, y1: 252 });
  });

  test("leave an edge at the drawer wall alone", () => {
    // At [0, 0] the left and front edges are on the board's, and so at the walls.
    const layout = layoutOverlay(shape, board, { id: "a", kind: "grid", at: [0, 0], holes: [16, 16] }, 0);
    expect(layout.free).toEqual(["right", "back"]);
    expect(layout.strips.map((s) => s.side)).toEqual(["right", "back"]);
  });

  test("report an overlay held only on two parallel sides", () => {
    // 3 mm from the left wall and 7.5 mm from the right: no room for side strips, so only the
    // front and back strips hold it, and they're parallel.
    const layout = layoutOverlay(shape, board, { id: "a", kind: "grid", at: [3, 100], holes: [70, 16] }, 0);
    expect(layout.held).toEqual(["front", "back"]);
    const messages = layout.problems.map((p) => p.message);
    expect(messages).toContainEqual(expect.stringMatching(/^is held only on its front and back sides/));
    expect(messages.filter((m) => /faces the pegboard/.test(m))).toHaveLength(2);
  });

  test("build as solids with no overhang past 45°, solid chunky pegs below, and a top chamfered to the pegboard", () => {
    const layout = placed();
    const strip = layout.bumpers.find((b) => b.side === "back")!;
    const solid = bumperSolid(wasm, layout, strip);
    expect(solid.status()).toBe("NoError");
    expect(solid.decompose().length).toBe(1);
    expect(overhangs(printable(solid).getMesh())).toBe(0);
    // Each peg fills its slot's depth below the floor, solid through its middle.
    for (const [x, y] of strip.pegs!) expect(solid.intersect(wasm.Manifold.cube([4, 4, 2], true).translate([x, y, -1.5])).volume()).toBeCloseTo(32, 3);
    // Flush with the tiles at the joint; down to the pegboard at the outer edge.
    const at = (x: number, y: number, z: number) => solid.intersect(wasm.Manifold.cube([0.4, 0.4, 0.4], true).translate([x, y, z])).volume() > 0;
    expect(at(180, strip.floor.y0 + 1, THICKNESS - 0.3)).toBe(true);
    expect(at(180, strip.floor.y1 - 1, THICKNESS - 0.3)).toBe(false);
    expect(at(180, strip.floor.y1 - 1, 0.3)).toBe(true);
    // Its outer edge stands a land high, not a feather edge.
    expect(at(180, strip.floor.y1 - 0.25, GRID.strip.land - 0.25)).toBe(true);
    expect(at(180, strip.floor.y1 - 0.25, GRID.strip.land + 1)).toBe(false);
  });

  test("join the tiles with a lap tab under them, without running into them", () => {
    const layout = placed();
    const strip = layout.bumpers.find((b) => b.side === "back")!;
    const tile = tileSolid(wasm, layout, layout.tiles[0]!);
    const solid = bumperSolid(wasm, layout, strip);
    expect(solid.intersect(tile).volume()).toBeLessThan(1e-6);
    // The tab reaches under the tile's edge, low down, by the lap tab's depth.
    const under = solid.intersect(wasm.Manifold.cube([100, layout.lapTab, 1]).translate([130, strip.floor.y0 - layout.lapTab, 0.1]));
    expect(under.volume()).toBeGreaterThan(0);
    expect(under.boundingBox().min[1]).toBeCloseTo(strip.floor.y0 - layout.lapTab, 2);
  }, 60_000);
});

describe("laying out an overlay", () => {
  const cases: [string, OverlayLayout][] = [];
  beforeAll(() => {
    cases.push(["the coffee drawer's", drawerOverlays(coffee())[0]!]);
    cases.push(["a 2 × 2-tile", overlay({ holes: [16, 16] }, [90, 90, 90])]);
    cases.push(["a whole board", overlay({ holes: [71, 52] })]);
  });

  test("keeps hole centres on the 9.5 mm grid across the joins between its tiles", () => {
    for (const [name, layout] of cases) {
      for (const t of layout.tiles) {
        const [x, y] = holeAt(layout, t.first);
        expect(x - PITCH / 2, name).toBeCloseTo(t.box.x0, 9);
        expect(y - PITCH / 2, name).toBeCloseTo(t.box.y0, 9);
        expect(t.box.x1 - t.box.x0, name).toBeCloseTo(t.size[0] * PITCH, 9);
      }
      // Tiles meet edge to edge, so the pitch carries on across every join.
      const xs = [...new Set(layout.tiles.flatMap((t) => [t.box.x0, t.box.x1]))].sort((p, q) => p - q);
      for (const x of xs) expect(((x - layout.origin[0]) / PITCH) % 1, name).toBeCloseTo(0, 9);
    }
  });

  test("joins tiles to each other and to strips, never at a wall", () => {
    const [, layout] = cases[0]!;
    // Against the front and right walls; strips along the left and back.
    expect(layout.free).toEqual(["left", "back"]);
    expect(layout.problems).toEqual([]);
    for (const [x, y] of layout.joiners) {
      expect(y > layout.box.y0 && x < layout.box.x1).toBe(true);
    }
    expect(layout.joiners.some(([x]) => x === layout.box.x0)).toBe(true);
    expect(layout.joiners.some(([, y]) => y === layout.box.y1)).toBe(true);
  });

  test("reports an overlay that runs off the board", () => {
    expect(overlay({ at: [600, 0], holes: [16, 16] }).problems.map((p) => p.at)).toContainEqual(["base", "overlays", 0]);
  });
});

/** The solid in a thin rod down a hole's centre, from the face. */
function solidDown(part: Manifold, x: number, y: number): number {
  return part.intersect(wasm.Manifold.cylinder(THICKNESS + 2, 0.3, 0.3, 16).translate([x, y, -1])).volume();
}

describe("building an overlay's tiles", () => {
  test("puts the holes either side of every column and row join on the 9.5 mm pitch, measured on the solids", () => {
    const layout = overlay({ at: [20, 20], holes: [16, 16] }, [90, 90, 90]);
    expect(layout.tiles.map((t) => t.label)).toEqual(["1-1", "1-2", "2-1", "2-2"]);
    const solids = layout.tiles.map((t) => tileSolid(wasm, layout, t));
    const r = gridFit().grid_hole[GRID.variant]! / 2;
    const mid = THICKNESS / 2;
    /** Open down the hole's centre, and solid boss wall just outside its bore, all round. */
    const holeHere = (solid: Manifold, x: number, y: number) =>
      solidDown(solid, x, y) === 0 &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([u, v]) => solid.intersect(wasm.Manifold.cube([0.1, 0.1, 0.5], true).translate([x + u! * (r + 0.25), y + v! * (r + 0.25), mid])).volume() > 0);
    const [i0, j0] = [layout.tiles[1]!.first[0], layout.tiles[2]!.first[1]];
    // Each pair straddles a join: the last hole of one tile and the first of the next, a pitch apart.
    const pairs: [[number, number], [number, number]][] = [
      [[i0 - 1, 2], [i0, 2]],
      [[2, j0 - 1], [2, j0]],
      [[i0 - 1, j0 - 1], [i0, j0]],
    ];
    const tileOf = ([i, j]: [number, number]) => layout.tiles.findIndex((t) => i >= t.first[0] && i < t.first[0] + t.size[0] && j >= t.first[1] && j < t.first[1] + t.size[1]);
    for (const pair of pairs) {
      const [a, b] = pair.map((hole) => holeAt(layout, hole));
      expect(Math.hypot(b![0] - a![0], b![1] - a![1])).toBeCloseTo(PITCH * Math.hypot(pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]), 9);
      expect(tileOf(pair[0])).not.toBe(tileOf(pair[1]));
      for (const hole of pair) expect(holeHere(solids[tileOf(hole)]!, ...holeAt(layout, hole)), `${hole}`).toBe(true);
    }
  }, 60_000);
});

describe("a grid base's tiles", () => {
  test("keep the joiner room and lap tab rebates on their outer edges, whatever the bumpers", () => {
    const shape = drawerShape({ inside: [120, 120, 40] })!;
    const layout = layoutBoard(shape, { kind: "grid", tile: [6, 6] });
    const t = layout.tiles[0]!;
    const withBumpers = tileSolid(wasm, layout, t).volume();
    expect(tileSolid(wasm, { ...layout, bumpers: [] }, t).volume()).toBeCloseTo(withBumpers, 6);
  });
});

describe("building an overlay tile", () => {
  test("prints face down without supports, the same whichever slots are under it, its holes open through", () => {
    // Clear of the board's edges, so every outer edge has a strip, with a rebate for its lap tab.
    const layout = overlay({ at: [20, 20], holes: [16, 16] }, [90, 90, 90]);
    expect(layout.free).toEqual(["left", "right", "front", "back"]);
    const t = layout.tiles[0]!;
    const solid = tileSolid(wasm, layout, t);
    expect(solid.status()).toBe("NoError");
    expect(overhangs(printable(solid).getMesh())).toBe(0);
    // Every hole stays a through hole, so a pin's peg goes up into whichever is chosen.
    for (const i of [0, t.size[0] - 1]) for (const j of [0, t.size[1] - 1]) expect(solidDown(solid, ...holeAt(layout, [t.first[0] + i, t.first[1] + j]))).toBe(0);
  });
});

describe("an overlay in a drawer", () => {
  const text = COFFEE;
  const problems = (edit: (drawer: Record<string, any>) => void) => {
    const drawer = parse(text);
    edit(drawer);
    return check(JSON.stringify(drawer)).problems;
  };

  test("migrates a 0.3 file, which has none", () => {
    const old = readFileSync(new URL("../fixtures/tool-chest.drawer.yml", import.meta.url), "utf8").replace("drawer/0.4", "drawer/0.3");
    expect(check(old)).toMatchObject({ migratedFrom: "drawer/0.3", problems: [] });
  });

  test("warns that the UPPDATERA sizes are unverified, as for MAXIMERA", () => {
    const warnings = check(text).warnings ?? [];
    expect(warnings.map((w) => w.path)).toEqual(["base.overlays"]);
    expect(warnings[0]!.message).toContain(UPPDATERA.unverified.join(", "));
    const plain = parse(text);
    delete plain.base.overlays;
    for (const h of plain.holders) delete h.on, delete h.fix;
    expect(check(JSON.stringify(plain)).warnings).toBeUndefined();
  });

  /** An empty 80 cm pegboard drawer with a 16 × 16-hole overlay at [0, 0] and these after it. */
  const onBoard = (...more: object[]) =>
    check(JSON.stringify({
      format: "drawer/0.4", name: "Board", drawer: { inside: [700, 500, 100] }, items: {}, layout: [],
      base: { kind: "pegboard", preset: "uppdatera-80", overlays: [{ id: "a", kind: "grid", at: [0, 0], holes: [16, 16] }, ...more.map((o) => ({ kind: "grid", holes: [16, 16], ...o }))] },
    })).problems.filter((p) => !/faces the pegboard|is held only/.test(p.message));
  const SIDE = 16 * PITCH;

  test("reports an overlay off the board", () => {
    expect(onBoard({ id: "b", at: [600, 0] }).map((p) => p.path)).toEqual(["base.overlays[1]"]);
  });

  test("reports overlays that overlap", () => {
    expect(onBoard({ id: "b", at: [SIDE - 10, 0] }).map((p) => p.path)).toContain("base.overlays[1]");
  });

  test("reports an overlay that runs into another's strip", () => {
    // Overlay a's right strip runs out past its edge, under where b starts.
    const found = onBoard({ id: "b", at: [SIDE, 0] });
    expect(found).toContainEqual(expect.objectContaining({ path: "base.overlays[1]", message: "overlaps overlay a, strips included" }));
  });

  test("reports overlays that share an id", () => {
    expect(onBoard({ id: "a", at: [300, 0] }).map((p) => p.path)).toEqual(["base.overlays[1].id"]);
  });

  test("lets overlays sit apart, strips and all", () => {
    expect(onBoard({ id: "b", at: [400, 0] })).toEqual([]);
  });

  test("gives the full height to a holder whose `on` names no overlay, and reports the name", () => {
    const found = problems((d) => {
      d.holders.find((h: any) => h.id === "mug-tray").on = "nowhere";
      d.items["mug-large"].cylinder[1] = 150 - THICKNESS + 1;
    });
    expect(found.map((p) => p.path)).toContain("holders[3].on");
    expect(found.filter((p) => p.message.includes("on overlay"))).toEqual([]);
  });

  test("reports a holder on an overlay that isn't there, and fixings with no overlay named", () => {
    expect(problems((d) => (d.holders.find((h: any) => h.id === "mug-tray").on = "back")).map((p) => p.path)).toContain("holders[3].on");
    expect(problems((d) => delete d.holders.find((h: any) => h.id === "mug-tray").on).map((p) => p.path)).toEqual(expect.arrayContaining(["holders[3].fix", "holders[3]"]));
  });

  test("reports a holder that straddles an overlay's edge", () => {
    const found = problems((d) => (d.layout.find((t: any) => t.id === "mug-large").at = [320, 140]));
    expect(found.find((p) => p.path === "holders[3].on")?.message).toContain("mug-large isn't wholly on overlay front");
  });

  test("reports IKEA pegs over an overlay, whose slots they can't reach", () => {
    const found = problems((d) => {
      d.holders = d.holders.filter((h: any) => h.id !== "coaster-posts");
      d.holders.push({ id: "coaster-pegs", method: "pegs", holds: ["coasters"] });
    });
    expect(found.find((p) => p.path === `holders[${parse(text).holders.length - 1}]`)?.message).toContain("IKEA pegs can't use the slots under them");
  });

  test("gives what sits on it the drawer's height less the overlay's", () => {
    const tall = (height: number) =>
      problems((d) => {
        d.items["mug-large"].cylinder[1] = height;
      }).filter((p) => p.message.includes("on overlay front"));
    expect(tall(150 - THICKNESS)).toEqual([]);
    expect(tall(150 - THICKNESS + 1).map((p) => p.path)).toEqual(["layout[3]"]);
  });

  test("raises what it carries in the plan, and covers the slots under it", () => {
    const p = plan(coffee(), [256, 256, 256]);
    const mug = p.things.find((t) => t.id === "mug-large")!;
    expect(mug.z0).toBe(GRID.thickness + 2);
    const [front] = p.base.overlays!;
    expect(p.base.board!.holes.some(([x, y]) => x > front!.box.x0 && x < front!.box.x1 && y > front!.box.y0 && y < front!.box.y1)).toBe(false);
    expect(BOARD.holes.length).toBeGreaterThan(p.base.board!.holes.length);
  });
});

describe("exporting an overlay", () => {
  const SMALL = `
format: drawer/0.4
name: Small pegboard
drawer: { inside: [475, 500, 100] }
base:
  kind: pegboard
  preset: uppdatera-60
  overlays:
    - { id: patch, kind: grid, at: [100, 100], holes: [16, 16] }
items:
  cup: { name: Cup, cylinder: [40, 40] }
layout:
  - { id: cup, at: [176, 176] }
holders:
  - id: cup-cradle
    method: custom
    holds: [cup]
    on: patch
    spec: { purpose: Hold the cup }
    fix: [{ hole: [7, 8], by: pin }]
`;

  test("plates its strips with the joiners and pegs, and counts them in the parts list", async () => {
    expect(check(SMALL).problems).toEqual([]);
    const drawer = (load(SMALL) as { drawer: Drawer }).drawer;
    const files = exportDrawer(await Module(), drawer, { bed: [256, 256, 256] });
    const names = files.map((f) => f.name);
    expect(names.filter((n) => n.startsWith("overlay-patch-tile-"))).toEqual(["overlay-patch-tile-1-1.3mf"]);

    const overlays = drawerOverlays(drawer);
    const counts = boardCounts(drawer, overlays);
    expect(counts.strips).toBe(overlays[0]!.bumpers.length);
    expect(counts.strips).toBe(4);
    const plates = files.filter((f) => /^plate(-\d+)?\.3mf$/.test(f.name)).map((f) => strFromU8(unzipSync(f.data)["3D/3dmodel.model"]!));
    const items = plates.reduce((n, model) => n + (model.match(/<item /g)?.length ?? 0), 0);
    expect(items).toBe(counts.strips + counts.joiners + counts.pegs);
    expect(plates.join("")).toContain('name="strip patch back 1"');

    const parts = strFromU8(files.find((f) => f.name === "parts.md")!.data);
    expect(parts).toContain(`${counts.strips} edge strips, with ${counts.stripPegs} pegs`);
  }, 120_000);
});
