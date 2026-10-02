import { describe, expect, test } from "vitest";
import { appendIn, deleteIn, linesOf, removeIn, setIn } from "../src/core/index.ts";

const FILE = `# A drawer, with comments to keep.
format: drawer/0.2
name: Test                         # what it's called

rules:
  gap: 0                           # between holders

layout:
  - id: kettle
    zone: brew
    at: [50, 122.5]                # its centre
    why: Boiling is step one, so it starts the line. Handle to the front, spout running
      back.

  - { id: glass-1, item: glass, at: [200, 198], why: "Lying, because it's tall." }
  - { id: glass-2, item: glass, at: [370, 198] }

holders:
  - id: kettle-fingers
    method: posts
    holds: [kettle]

  - id: glass-cradle
    method: custom
    holds: [glass-1, glass-2]

  # A commented-out holder stays where it is.
  # - id: plate-pegs

review:
  comments: []                     # yours
`;

/** The file with one line swapped, for the edits that change a single line. */
const swap = (from: string, to: string) => {
  expect(FILE).toContain(from);
  return FILE.replace(from, to);
};

describe("setIn", () => {
  test("replaces a value in a block map, keeping its comment and every other line", () => {
    expect(setIn(FILE, ["layout", 0, "at"], [51, 120])).toBe(swap("at: [50, 122.5]", "at: [51, 120]"));
  });

  test("replaces a value in a flow map", () => {
    expect(setIn(FILE, ["layout", 1, "at"], [10, 20])).toBe(swap("at: [200, 198]", "at: [10, 20]"));
  });

  test("replaces a folded scalar over all its lines", () => {
    expect(setIn(FILE, ["layout", 0, "why"], "Moved.")).toBe(
      swap("why: Boiling is step one, so it starts the line. Handle to the front, spout running\n      back.", "why: Moved."),
    );
  });

  test("quotes strings that need it", () => {
    expect(setIn(FILE, ["name"], "Tea: and coffee")).toBe(swap("name: Test", 'name: "Tea: and coffee"'));
  });

  test("quotes strings with commas or brackets, which would end them in a flow map", () => {
    expect(setIn(FILE, ["layout", 2, "why"], "Left, then right")).toBe(swap("at: [370, 198] }", 'at: [370, 198], why: "Left, then right" }'));
  });

  test("adds a field to a block map before its why", () => {
    expect(setIn(FILE, ["layout", 0, "rotate"], 90)).toBe(swap("    why: Boiling", "    rotate: 90\n    why: Boiling"));
  });

  test("adds a field to the end of a block map with no why, after a trailing comment", () => {
    expect(setIn(FILE, ["rules", "angle_step"], 15)).toBe(swap("# between holders\n", "# between holders\n  angle_step: 15\n"));
  });

  test("adds a field to a flow map before its why, or at the end", () => {
    expect(setIn(FILE, ["layout", 1, "aside"], true)).toBe(swap("at: [200, 198], why", "at: [200, 198], aside: true, why"));
    expect(setIn(FILE, ["layout", 2, "aside"], true)).toBe(swap("at: [370, 198] }", "at: [370, 198], aside: true }"));
  });

  test("writes objects and lists in flow style", () => {
    expect(setIn(FILE, ["holders", 0, "fit"], { play: 2, spring: 0 })).toBe(
      swap("holds: [kettle]\n", "holds: [kettle]\n    fit: { play: 2, spring: 0 }\n"),
    );
  });

  test("adds missing maps on the way", () => {
    expect(setIn(FILE, ["base", "kind"], "bare")).toBe(`${FILE}base: { kind: bare }\n`);
  });
});

describe("deleteIn", () => {
  test("removes a field from a block map, with all its lines", () => {
    expect(deleteIn(FILE, ["layout", 0, "why"])).toBe(swap("    why: Boiling is step one, so it starts the line. Handle to the front, spout running\n      back.\n", ""));
    expect(deleteIn(FILE, ["layout", 0, "zone"])).toBe(swap("    zone: brew\n", ""));
  });

  test("removes a field from a flow map", () => {
    expect(deleteIn(FILE, ["layout", 1, "item"])).toBe(swap("glass-1, item: glass,", "glass-1,"));
    expect(deleteIn(FILE, ["layout", 1, "id"])).toBe(swap("{ id: glass-1, item", "{ item"));
  });

  test("leaves the file alone when the field isn't there", () => {
    expect(deleteIn(FILE, ["layout", 0, "aside"])).toBe(FILE);
  });
});

describe("appendIn", () => {
  test("adds an entry to a block list, in the list's own style", () => {
    expect(appendIn(FILE, ["holders"], { id: "mug-tray", method: "well", holds: ["mug"] })).toBe(
      swap("holds: [glass-1, glass-2]\n", "holds: [glass-1, glass-2]\n\n  - id: mug-tray\n    method: well\n    holds: [mug]\n"),
    );
  });

  test("adds an entry to a flow list", () => {
    expect(appendIn(FILE, ["holders", 0, "holds"], "kettle-2")).toBe(swap("holds: [kettle]", "holds: [kettle, kettle-2]"));
  });

  test("turns an empty list into a block list for its first map, keeping its comment", () => {
    expect(appendIn(FILE, ["review", "comments"], { on: "kettle", says: "Turn it", status: "open" })).toBe(
      swap("  comments: []                     # yours\n", "  comments:                     # yours\n    - on: kettle\n      says: Turn it\n      status: open\n"),
    );
  });

  test("turns an empty map into a block map for its first field", () => {
    const text = "items: {}\nlayout: []\n";
    expect(setIn(text, ["items", "jug"], { name: "Jug" })).toBe("items:\n  jug: { name: Jug }\nlayout: []\n");
  });

  test("starts a list that isn't there", () => {
    const text = "format: drawer/0.2\nname: Test\n";
    expect(appendIn(text, ["review", "comments"], { on: "a", says: "b", status: "open" })).toBe(
      `${text}review: { comments: [{ on: a, says: b, status: open }] }\n`,
    );
  });
});

describe("removeIn", () => {
  test("removes an entry from a block list, with the blank line before it", () => {
    expect(removeIn(FILE, ["holders", 1])).toBe(swap("\n  - id: glass-cradle\n    method: custom\n    holds: [glass-1, glass-2]\n", ""));
  });

  test("removes a one-line entry", () => {
    expect(removeIn(FILE, ["layout", 2])).toBe(swap("  - { id: glass-2, item: glass, at: [370, 198] }\n", ""));
  });

  test("leaves an empty list behind when the last entry goes", () => {
    const text = "holders:\n  - id: a\n    method: well\n    holds: [x]\nreview: {}\n";
    expect(removeIn(text, ["holders", 0])).toBe("holders: []\nreview: {}\n");
  });
});

describe("linesOf", () => {
  test("gives the lines an entry spans", () => {
    expect(linesOf(FILE, ["layout", 0])).toEqual([9, 13]);
    expect(linesOf(FILE, ["layout", 1])).toEqual([15, 15]);
    expect(linesOf(FILE, ["layout", 9])).toBeNull();
  });
});
