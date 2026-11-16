import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  addComment,
  addOverlay,
  removeOverlay,
  setOn,
  setOverlay,
  addThing,
  answerQuestion,
  boxesOverlap,
  check,
  GRID,
  closeConcern,
  DRAWER_PRESETS,
  drawerShape,
  holdTogether,
  lockHolder,
  moveThings,
  removeThing,
  seatOnPegs,
  setAside,
  setBase,
  setDrawerPreset,
  setIn,
  setMethod,
  setPose,
  setRotate,
  setWall,
  splitHolder,
  unlockHolder,
} from "../src/core/index.ts";

const COFFEE = readFileSync(new URL("../fixtures/coffee.drawer.yml", import.meta.url), "utf8");
const data = (text: string) => parse(text);
const thing = (text: string, id: string) => data(text).layout.find((t: { id: string }) => t.id === id);
const holder = (text: string, id: string) => data(text).holders.find((h: { id: string }) => h.id === id);
const valid = (text: string) => expect(check(text).problems.filter((p) => !/overlaps|crosses/.test(p.message))).toEqual([]);

describe("moving things", () => {
  test("writes each thing's new centre, to the half millimetre", () => {
    const text = moveThings(COFFEE, [["kettle", 10.3, -2]]);
    expect(thing(text, "kettle").at).toEqual([60.5, 120.5]);
  });

  test("carries a locked holder's shape with what it holds", () => {
    const text = moveThings(COFFEE, [["v60", 10, 5]]);
    expect(thing(text, "v60").at).toEqual([600, 75]);
    expect(holder(text, "v60-peg").lock.shape.at).toEqual([535, 10]);
  });

  test("sets things aside and puts them back", () => {
    const aside = setAside(COFFEE, "kettle", true);
    expect(thing(aside, "kettle").aside).toBe(true);
    const back = setAside(aside, "kettle", false, [60, 120]);
    expect(thing(back, "kettle")).toMatchObject({ at: [60, 120] });
    expect(thing(back, "kettle").aside).toBeUndefined();
  });

  test("writes a pose and a rotation only when they aren't the defaults", () => {
    expect(thing(setPose(COFFEE, "scales", "flat"), "scales").pose).toBeUndefined();
    expect(thing(setPose(COFFEE, "glass-1", { tilt: 30 }), "glass-1").pose).toEqual({ tilt: 30 });
    expect(thing(setRotate(COFFEE, "scales", 0), "scales").rotate).toBeUndefined();
    expect(thing(setRotate(COFFEE, "kettle", 45), "kettle").rotate).toBe(45);
  });
});

describe("holders", () => {
  test("holds things together, taking them out of their holders and dropping any left empty", () => {
    const { text, id } = holdTogether(COFFEE, ["coasters", "mug-large"], "well");
    expect(id).toBe("coasters-and-mug-large");
    expect(holder(text, id)).toEqual({ id, method: "well", holds: ["coasters", "mug-large"], on: "front" });
    expect(holder(text, "coaster-posts")).toBeUndefined();
    expect(holder(text, "mug-tray").holds).toEqual(["mug-small"]);
    valid(text);
  });

  test("holds things from different overlays, or none, off any overlay", () => {
    const { text, id } = holdTogether(COFFEE, ["kettle", "mug-large"], "well");
    expect(holder(text, id).on).toBeUndefined();
  });

  test("splits a holder into one for each thing, each on its overlay", () => {
    const text = splitHolder(COFFEE, "mug-tray");
    expect(holder(text, "mug-tray")).toBeUndefined();
    expect(holder(text, "mug-large-well")).toEqual({ id: "mug-large-well", method: "well", holds: ["mug-large"], on: "front" });
    expect(holder(text, "mug-small-well")).toEqual({ id: "mug-small-well", method: "well", holds: ["mug-small"], on: "front" });
    valid(text);
  });

  test("changes a holder's method, dropping fields the old one used and adding ones the new one needs", () => {
    const custom = setMethod(COFFEE, "mug-tray", "custom");
    expect(holder(custom, "mug-tray").spec).toEqual({ purpose: "Hold the mug, large and the mug, small." });
    valid(custom);
    const back = setMethod(custom, "mug-tray", "posts");
    expect(holder(back, "mug-tray").spec).toBeUndefined();
    valid(back);
  });

  test("locks a holder as built and unlocks it again", () => {
    const shape = { at: [266, 6] as [number, number], size: [208, 143] as [number, number], height: 15, rotate: 0 };
    const locked = lockHolder(COFFEE, "mug-tray", { at: "2026-10-02", tool: "0.3.0", shape, export: "locked/mug-tray.3mf", sha256: "ab12" });
    expect(holder(locked, "mug-tray").lock).toEqual({ at: "2026-10-02", tool: "0.3.0", shape, export: "locked/mug-tray.3mf", sha256: "ab12" });
    valid(locked);
    expect(holder(unlockHolder(locked, "mug-tray"), "mug-tray").lock).toBeUndefined();
  });
});

describe("the drawer", () => {
  test("changes the base", () => {
    const board = setBase(COFFEE, "uppdatera-60");
    expect(data(board).base).toEqual({ ...data(COFFEE).base, preset: "uppdatera-60" });
    const grid = setBase(board, "gridfinity");
    expect(data(grid).base).toEqual({ kind: "gridfinity" });
    expect(board).toContain("# One base per drawer");
  });

  test("adds, places, sizes and removes an overlay", () => {
    const { text, id } = addOverlay(COFFEE);
    expect(id).toBe("overlay");
    const added = data(text).base.overlays.at(-1);
    expect(added).toMatchObject({ id, kind: "grid", holes: GRID.overlay.size });
    // Placed clear of the overlay already there, and the next clear of both.
    const twice = addOverlay(text).text;
    const boxes = data(twice).base.overlays.map((o: { at: number[]; holes: number[] }) => ({ x0: o.at[0], y0: o.at[1], x1: o.at[0] + o.holes[0] * GRID.pitch, y1: o.at[1] + o.holes[1] * GRID.pitch }));
    for (const [n, a] of boxes.entries()) for (const b of boxes.slice(0, n)) expect(boxesOverlap(a, b)).toBe(false);
    expect(check(twice).problems.filter((p) => /overlaps overlay|runs off/.test(p.message))).toEqual([]);
    const placed = setOverlay(setOverlay(setOverlay(text, id, "at", [0, 300]), id, "holes", [20, 18]), id, "variant", "light");
    expect(data(placed).base.overlays.at(-1)).toEqual({ id, kind: "grid", at: [0, 300], holes: [20, 18], variant: "light" });
    expect(data(removeOverlay(placed, id)).base.overlays.map((o: { id: string }) => o.id)).toEqual(["front"]);
  });

  test("removing the last overlay takes its holders off it, fixings and all", () => {
    const text = removeOverlay(COFFEE, "front");
    expect(data(text).base.overlays).toBeUndefined();
    expect(holder(text, "mug-tray")).toEqual({ id: "mug-tray", method: "well", holds: ["mug-large", "mug-small"], why: holder(COFFEE, "mug-tray").why });
    valid(text);
  });

  test("puts a holder on an overlay or takes it off, dropping fixings made for where it was", () => {
    const off = setOn(COFFEE, "mug-tray", undefined);
    expect(holder(off, "mug-tray").on).toBeUndefined();
    expect(holder(off, "mug-tray").fix).toBeUndefined();
    expect(holder(setOn(off, "mug-tray", "front"), "mug-tray").on).toBe("front");
    expect(setOn(COFFEE, "mug-tray", "front")).toBe(COFFEE);
  });

  test("takes holders off the overlays when the base stops being a pegboard", () => {
    const bare = setBase(COFFEE, "bare");
    expect(data(bare).base).toEqual({ kind: "bare" });
    expect(data(bare).holders.filter((h: { on?: string; fix?: unknown }) => h.on !== undefined || h.fix !== undefined)).toEqual([]);
    valid(bare);
  });

  test("adds a thing and its item, set aside until it's placed", () => {
    const { text, id } = addThing(COFFEE, { name: "Milk jug", cylinder: [80, 120] });
    expect(id).toBe("milk-jug");
    expect(data(text).items["milk-jug"]).toEqual({ name: "Milk jug", cylinder: [80, 120] });
    expect(thing(text, "milk-jug")).toEqual({ id: "milk-jug", at: [0, 0], aside: true });
    valid(text);
  });

  test("names a second thing of the same item apart", () => {
    const { text, id } = addThing(COFFEE, { name: "Kettle", cylinder: [85, 145] });
    expect(id).toBe("kettle-2");
    valid(text);
  });

  test("removes a thing from the layout and its holder", () => {
    const text = removeThing(COFFEE, "mug-small");
    expect(thing(text, "mug-small")).toBeUndefined();
    expect(holder(text, "mug-tray").holds).toEqual(["mug-large"]);
    valid(text);
  });
});

describe("the review", () => {
  test("answers a question and closes it", () => {
    const text = answerQuestion(COFFEE, "q-nest", "About 8 mm");
    expect(data(text).review.questions[1]).toEqual({ id: "q-nest", ask: expect.any(String), answer: "About 8 mm", status: "closed" });
  });

  test("accepting a concern does what it suggests and closes it", () => {
    const text = closeConcern(COFFEE, "c-glasses", true);
    expect(thing(text, "glass-3").aside).toBe(true);
    expect(thing(text, "glass-4").aside).toBe(true);
    expect(data(text).review.concerns[0].status).toBe("closed");
    expect(thing(closeConcern(COFFEE, "c-glasses", false), "glass-3").aside).toBeUndefined();
  });

  test("adds a comment", () => {
    const text = addComment(COFFEE, "kettle", "Can the spout face left?");
    expect(data(text).review.comments).toEqual([{ on: "kettle", says: "Can the spout face left?", status: "open" }]);
    valid(text);
  });
});

describe("pegs", () => {
  test("settles a thing held by pegs onto the nearest seat", () => {
    // A 90 mm jar is held at (320, 241) on an UPPDATERA 80 board: see the plan tests.
    const text = `format: drawer/0.2
name: Test
drawer: { inside: [700, 500, 150] }
base: { kind: pegboard, preset: uppdatera-80 }
items: { jar: { name: Jar, cylinder: [90, 100] } }
layout:
  - { id: jar, at: [322, 243] }
holders:
  - { id: jar-pegs, method: pegs, holds: [jar] }
`;
    const [x, y] = thing(seatOnPegs(text, ["jar"], [256, 256, 256]), "jar").at;
    expect(Math.hypot(x - 322, y - 243)).toBeLessThanOrEqual(3);
    expect([x, y]).not.toEqual([322, 243]);
  });
});

describe("the drawer's shape", () => {
  const MEASURED = `format: drawer/0.3
name: Test
drawer:
  inside: [560, 400, 75]
  corner_radius: 3
base: { kind: grid }
items: {}
layout: []
`;

  test("naming a built-in drawer drops the sizes that would override it", () => {
    const text = setDrawerPreset(MEASURED, "ikea-maximera-80x60-low");
    expect(data(text).drawer).toEqual({ preset: "ikea-maximera-80x60-low" });
    valid(text);
  });

  test("describing it by hand starts from the built-in drawer's shape", () => {
    const preset = DRAWER_PRESETS["ikea-maximera-80x60-low"];
    const text = setDrawerPreset(setDrawerPreset(MEASURED, "ikea-maximera-80x60-low"), null);
    expect(data(text).drawer).toEqual({ inside: preset.inside, walls: { sides: preset.walls.left }, floor_edge: preset.floor_edge });
    expect(drawerShape(data(text).drawer)).toEqual(drawerShape({ preset: "ikea-maximera-80x60-low" }));
    valid(text);
  });

  test("keeps walls that differ side to side", () => {
    const text = setDrawerPreset(setIn(MEASURED, ["drawer", "walls"], { left: 5, back: 2 }), null);
    expect(data(text).drawer.walls).toEqual({ left: 5, right: 0, front: 0, back: 2 });
  });
});

describe("wall lean", () => {
  const WALLS = `format: drawer/0.3
name: Test
drawer:
  inside: [560, 400, 75]
  walls: { left: 20, right: 0, ends: 3 }
base: { kind: grid }
items: {}
layout: []
`;
  const walls = (text: string) => drawerShape(data(text).drawer)!.walls;

  test("setting one wall leaves the others as the file has them", () => {
    const text = setWall(WALLS, "right", 5);
    expect(data(text).drawer.walls).toEqual({ left: 20, right: 5, ends: 3 });
    expect(walls(text)).toEqual({ left: 20, right: 5, front: 3, back: 3 });
    valid(text);
  });

  test("setting a pair replaces that pair's own values, and only theirs", () => {
    const text = setWall(WALLS, "sides", 10);
    expect(data(text).drawer.walls).toEqual({ ends: 3, sides: 10 });
    expect(walls(text)).toEqual({ left: 10, right: 10, front: 3, back: 3 });
    valid(text);
  });
});
