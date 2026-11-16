import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import Module, { type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  bestOverlayAt, boardCounts, check, compatibleHoles, drawerOverlays, drawerShape, exportDrawer, GRID, gridFit, holeAt, layoutBoard, layoutOverlay, load, pegboard, pinRules, plan, printable,
  tileSolid, UPPDATERA, withSpares, type Drawer, type OverlayLayout, type OverlaySpec, type PinSpot,
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

/** How far the point of an overlay farthest from every pin is, a millimetre apart. */
function farthest(layout: OverlayLayout): number {
  let worst = 0;
  for (let x = layout.box.x0; x <= layout.box.x1; x += 1) {
    for (let y = layout.box.y0; y <= layout.box.y1; y += 1) {
      worst = Math.max(worst, Math.min(...layout.pins.map(({ slot }) => Math.hypot(slot[0] - x, slot[1] - y))));
    }
  }
  return worst;
}

const keyOf = (spots: readonly PinSpot[]) => spots.map(({ hole, slot }) => `${hole.join(",")} @ ${slot.join(",")}`).sort();

describe("which holes line up with a slot", () => {
  // A drawer the 80 cm board's size, so the board's corner is the drawer's. Slots, as UPPDATERA
  // lays them out: 31 steps of 20 mm across 675 mm, centred, start at x = 27.5; 22 rows of 20 mm
  // across 500 mm start at y = 30; a slot is where the step and row counts add up to an even
  // number. An overlay at [0, 0], 16 × 16 holes, has hole centres at 4.75 + 9.5 i and covers
  // 0–152 mm, so a whole slot (17 × 7) under it has its centre at x 8.5–143.5, y 3.5–148.5.
  //
  // Rows y = 30, 50, 70, 130 are 3.25, 2.25, 1.25 and 1.75 mm from the nearest hole row: more than
  // 1 mm across. Row y = 90 (row 3, odd steps): x = 47.5 is 4.75 mm from a hole, 87.5 is 2.75 mm
  // from hole 9 (90.25), and 127.5 is 0.75 mm from hole 13 (128.25); y is 0.25 mm from row 9. Row
  // y = 110 (row 4, even steps): 27.5 and 67.5 are 3.75 mm from a hole, 107.5 is 1.75 mm from hole
  // 11 (109.25); y is 0.75 mm from row 11.
  const shape = drawerShape({ inside: [675, 500, 100] })!;
  const board = pegboard("uppdatera-80", 675, 500);
  const at00 = (options = {}) => layoutOverlay(shape, board, { id: "a", kind: "grid", at: [0, 0], holes: [16, 16] }, 0, { tolerance: [3, 1], ...options });

  test("lists the slots within 3 mm along and 1 mm across of a hole, worked out by hand", () => {
    expect(keyOf(at00().compatible)).toEqual(["11,11 @ 107.5,110", "13,9 @ 127.5,90", "9,9 @ 87.5,90"]);
  });

  test("and none within 0.5 mm both ways", () => {
    expect(at00({ tolerance: [0.5, 0.5] }).compatible).toEqual([]);
  });

  test("reports the rules failing there: the corner at [0, 0] is 125.5 mm from the pin at (87.5, 90)", () => {
    const layout = at00();
    expect(layout.problems.map((p) => p.message)).toEqual([expect.stringMatching(/^leaves a point 12[56] mm from the nearest lock pin/)]);
    expect(Math.hypot(87.5, 90)).toBeGreaterThan(GRID.overlay.reach);
  });

  test("leaves out a hole a joiner sits round, or that's been dropped", () => {
    const layout = at00();
    const hole = gridFit().grid_hole[GRID.variant]!;
    // A joiner centred on the corner up and right of hole (9, 9) sits round it and its three neighbours.
    const [x, y] = holeAt(layout, [9, 9]);
    const joined = compatibleHoles(board, { ...layout, joiners: [[x + PITCH / 2, y + PITCH / 2]] }, hole, [3, 1]);
    expect(keyOf(joined)).toEqual(["11,11 @ 107.5,110", "13,9 @ 127.5,90"]);
    const dropped = compatibleHoles(board, { ...layout, dropped: [[13, 9]] }, hole, [3, 1]);
    expect(keyOf(dropped)).toEqual(["11,11 @ 107.5,110", "9,9 @ 87.5,90"]);
  });
});

describe("choosing lock pins", () => {
  const cases: [string, OverlayLayout][] = [];
  beforeAll(() => {
    cases.push(["the coffee drawer's", drawerOverlays(coffee())[0]!]);
    const shape = drawerShape({ inside: [675, 500, 100] })!;
    const board = pegboard("uppdatera-80", 675, 500);
    const spec: OverlaySpec = { id: "a", kind: "grid", at: [0, 0], holes: [16, 16] };
    cases.push(["a one-tile overlay at its best fit", layoutOverlay(shape, board, { ...spec, at: bestOverlayAt(shape, board, spec, []).at }, 0)]);
  });

  test("picks compatible holes, two a tile, three not in a line, and every point within 120 mm, measured a millimetre apart", () => {
    for (const [name, layout] of cases) {
      expect(layout.problems, name).toEqual([]);
      for (const pin of layout.pins) expect(layout.compatible, name).toContain(pin);
      for (const index of layout.tiles.keys()) expect(layout.pins.filter((p) => p.tile === index).length, name).toBeGreaterThanOrEqual(2);
      const [a, b] = [layout.pins[0]!.slot, layout.pins[1]!.slot];
      expect(layout.pins.some(({ slot: c }) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1), name).toBe(true);
      expect(farthest(layout), name).toBeLessThanOrEqual(GRID.overlay.reach);
    }
  });

  test("uses as few as it can: none can go without breaking a rule", () => {
    for (const [name, layout] of cases) {
      for (const k of layout.pins.keys()) expect(pinRules(layout, layout.pins.filter((_, n) => n !== k)), `${name} without pin ${k}`).toBeDefined();
    }
  });

  test("takes pins named by hand, and reports one that isn't over a slot, and a set that breaks the rules", () => {
    const named = layoutOverlay(SHAPE, BOARD, { id: "a", kind: "grid", at: [0, 0], holes: [16, 16], pins: [[0, 0]] }, 0);
    expect(named.problems.map((p) => p.at)).toEqual(expect.arrayContaining([["base", "overlays", 0, "pins", 0], ["base", "overlays", 0, "pins"]]));
    const coffeeSpec = coffee().base as { overlays: OverlaySpec[] };
    const chosen = drawerOverlays(coffee())[0]!.pins.map((p) => p.hole) as [number, number][];
    const byHand = layoutOverlay(SHAPE, BOARD, { ...coffeeSpec.overlays[0]!, pins: chosen }, 0);
    expect(byHand.problems).toEqual([]);
    expect(byHand.pins.map((p) => p.hole)).toEqual(chosen);
  });
});

describe("the best fit", () => {
  test("moves an overlay whose pins break the rules to where they don't, with more holes over slots", () => {
    const shape = drawerShape({ inside: [675, 500, 100] })!;
    const board = pegboard("uppdatera-80", 675, 500);
    const spec: OverlaySpec = { id: "a", kind: "grid", at: [0, 0], holes: [16, 16] };
    const before = layoutOverlay(shape, board, spec, 0);
    expect(before.problems).not.toEqual([]);
    const best = bestOverlayAt(shape, board, spec, []);
    expect(best.met).toBe(true);
    const after = layoutOverlay(shape, board, { ...spec, at: best.at }, 0);
    expect(after.problems).toEqual([]);
    expect(after.compatible.length).toBeGreaterThanOrEqual(before.compatible.length);
    // Within a slot pitch along a row, and a row, of where it was.
    expect(Math.abs(best.at[0] - spec.at[0])).toBeLessThanOrEqual(UPPDATERA.pitch / 2);
    expect(Math.abs(best.at[1] - spec.at[1])).toBeLessThanOrEqual(UPPDATERA.row / 2);
  });

  test("keeps off the other overlays and on the board", () => {
    const shape = drawerShape({ inside: [675, 500, 100] })!;
    const board = pegboard("uppdatera-80", 675, 500);
    const other = { at: [0, 16 * PITCH] as [number, number], holes: [16, 16] as [number, number] };
    const best = bestOverlayAt(shape, board, { id: "a", kind: "grid", at: [0, 0], holes: [16, 16] }, [other]);
    expect(best.at[0]).toBeGreaterThanOrEqual(0);
    expect(best.at[1]).toBeGreaterThanOrEqual(0);
    expect(best.at[1] + 16 * PITCH).toBeLessThanOrEqual(other.at[1] + 0.5);
  });

  test("puts the coffee drawer's overlay where it is", () => {
    const drawer = coffee();
    const shape = drawerShape(drawer.drawer)!;
    const spec = (drawer.base as { overlays: OverlaySpec[] }).overlays[0]!;
    expect(bestOverlayAt(shape, pegboard("uppdatera-80", shape.inside[0], shape.inside[1]), spec, []).at).toEqual(spec.at);
  });
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

  test("joins tiles only to each other, and counts an edge at a wall as not free", () => {
    const [, layout] = cases[0]!;
    // At [87, 0] on the board: its front edge is on the board's, and the rest face the pegboard.
    expect(layout.free).toEqual(["left", "right", "back"]);
    for (const [x, y] of layout.joiners) {
      expect(x > layout.box.x0 && x < layout.box.x1 && y > layout.box.y0 && y < layout.box.y1).toBe(true);
    }
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
  test("prints face down without supports, with its free edges chamfered and its pins' holes open from below", () => {
    // Clear of the board's edges, so every outer edge is free and chamfered.
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
    })).problems.filter((p) => !/lock pin/.test(p.message));
  const SIDE = 16 * PITCH;

  test("reports an overlay off the board", () => {
    expect(onBoard({ id: "b", at: [600, 0] }).map((p) => p.path)).toEqual(["base.overlays[1]"]);
  });

  test("reports overlays that overlap", () => {
    expect(onBoard({ id: "b", at: [SIDE - 10, 0] })).toEqual([expect.objectContaining({ path: "base.overlays[1]", message: "overlaps overlay a" })]);
  });

  test("reports overlays that share an id", () => {
    expect(onBoard({ id: "a", at: [300, 0] }).map((p) => p.path)).toEqual(["base.overlays[1].id"]);
  });

  test("lets overlays touch edge to edge", () => {
    expect(onBoard({ id: "b", at: [SIDE, 0] }, { id: "c", at: [0, SIDE] })).toEqual([]);
  });

  test("reports a fixing in a hole a lock pin takes", () => {
    const [front] = drawerOverlays(coffee());
    const taken = front!.pins[0]!.hole;
    const found = problems((d) => (d.holders.find((h: any) => h.id === "mug-tray").fix[0].hole = taken));
    expect(found).toEqual([expect.objectContaining({ path: "holders[3].fix[0].hole", message: expect.stringContaining("taken by a lock pin") })]);
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
    expect(found.find((p) => p.path === `holders[${parse(text).holders.length - 1}]`)?.message).toContain("IKEA pegs can't use the slots under it");
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
  // At [97, 100], the best fit near [100, 100]: three lock pins.
  const SMALL = `
format: drawer/0.4
name: Small pegboard
drawer: { inside: [475, 500, 100] }
base:
  kind: pegboard
  preset: uppdatera-60
  overlays:
    - { id: patch, kind: grid, at: [97, 100], holes: [16, 16] }
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

  test("plates its tiles as a grid base's, and lists the lock pins, with spares, as a library part", async () => {
    expect(check(SMALL).problems).toEqual([]);
    const drawer = (load(SMALL) as { drawer: Drawer }).drawer;
    const files = exportDrawer(await Module(), drawer, { bed: [256, 256, 256] });
    const names = files.map((f) => f.name);
    expect(names.filter((n) => n.startsWith("overlay-patch-tile-"))).toEqual(["overlay-patch-tile-1-1.3mf"]);

    const overlays = drawerOverlays(drawer);
    const counts = boardCounts(drawer, overlays);
    expect(counts.lockPins).toBe(withSpares(overlays[0]!.pins.length));
    const plate = strFromU8(unzipSync(files.find((f) => f.name === "plate.3mf")!.data)["3D/3dmodel.model"]!);
    expect(plate.match(/<item /g)?.length).toBe(counts.joiners + counts.pegs);

    const parts = strFromU8(files.find((f) => f.name === "parts.md")!.data);
    expect(parts).toContain(`UPPDATERA lock pin × ${counts.lockPins}`);
    expect(parts).toContain("not in the library yet");
    // The peg is the 3.2 mm hole less the 0.5 mm press fit a holder's own peg takes.
    expect(parts).toContain(`with a ${gridFit().grid_hole[GRID.variant]! - gridFit().peg_fixed} mm peg`);
    const linked = exportDrawer(await Module(), drawer, { library: { "lock-pin": { name: "Lock pin", url: "https://example.org/pin" } } });
    expect(strFromU8(linked.find((f) => f.name === "parts.md")!.data)).toContain("[Lock pin](https://example.org/pin)");
  }, 120_000);
});
