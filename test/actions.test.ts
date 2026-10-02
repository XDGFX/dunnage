import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  addComment,
  addThing,
  answerQuestion,
  check,
  closeConcern,
  holdTogether,
  lockHolder,
  moveThings,
  removeThing,
  seatOnPegs,
  setAside,
  setBase,
  setMethod,
  setPose,
  setRotate,
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
    expect(thing(text, "v60").at).toEqual([563, 75]);
    expect(holder(text, "v60-peg").lock.shape.at).toEqual([498, 10]);
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
    const { text, id } = holdTogether(COFFEE, ["kettle", "mug-large"], "well");
    expect(id).toBe("kettle-and-mug-large");
    expect(holder(text, id)).toEqual({ id, method: "well", holds: ["kettle", "mug-large"] });
    expect(holder(text, "kettle-fingers")).toBeUndefined();
    expect(holder(text, "mug-tray").holds).toEqual(["mug-small"]);
    valid(text);
  });

  test("splits a holder into one for each thing", () => {
    const text = splitHolder(COFFEE, "mug-tray");
    expect(holder(text, "mug-tray")).toBeUndefined();
    expect(holder(text, "mug-large-well")).toEqual({ id: "mug-large-well", method: "well", holds: ["mug-large"] });
    expect(holder(text, "mug-small-well")).toEqual({ id: "mug-small-well", method: "well", holds: ["mug-small"] });
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
    expect(data(board).base).toEqual({ kind: "pegboard", preset: "uppdatera-60" });
    expect(data(setBase(board, "gridfinity")).base).toEqual({ kind: "gridfinity" });
    expect(board).toContain("# One base per drawer.");
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
