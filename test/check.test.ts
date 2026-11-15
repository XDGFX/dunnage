import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { stringify } from "yaml";
import { check, DRAWER_PRESETS, drawerShape, FORMATS, GRID, load, migrate, type Problem } from "../src/core/index.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

/** A small drawer that passes every check, to break one piece at a time. */
function drawer() {
  return {
    format: "drawer/0.3",
    name: "Test",
    drawer: { inside: [420, 320, 150] },
    items: {
      mug: { name: "Mug", cylinder: [100, 110], handle: [15, 35], poses: ["upright"] },
      scales: { name: "Scales", box: [150, 130, 20], poses: ["flat", "upright"] },
      plate: { name: "Plate", cylinder: [250, 20], nest: 8 },
    },
    layout: [
      { id: "mug", at: [60, 100] },
      { id: "scales", pose: "upright", rotate: 90, at: [130, 100] },
      { id: "plates", item: "plate", stack: 4, at: [270, 170] },
    ] as Record<string, unknown>[],
    holders: [{ id: "mug-well", method: "well", holds: ["mug"] }] as Record<string, unknown>[],
  };
}

const problems = (document: object) => check(stringify(document)).problems;
const paths = (found: Problem[]) => found.map((problem) => problem.path);

describe("check", () => {
  test("accepts the coffee drawer and the P1S printer", () => {
    expect(check(fixture("coffee.drawer.yml"))).toMatchObject({ format: "drawer/0.3", problems: [] });
    expect(check(fixture("p1s.printer.yml"))).toMatchObject({ format: "printer/0.3", problems: [] });
  });

  test("accepts the tool chest's grid drawer, with no warnings", () => {
    expect(check(fixture("tool-chest.drawer.yml"))).toEqual({ format: "drawer/0.3", problems: [] });
  });

  test("accepts the small drawer", () => {
    expect(problems(drawer())).toEqual([]);
  });

  describe("the file itself", () => {
    test("reports YAML it can't parse, with its line", () => {
      const [problem] = check("format: drawer/0.2\nname: [unclosed\n").problems;
      expect(problem).toMatchObject({ path: "", line: expect.any(Number) });
    });

    test("refuses a file with no format line", () => {
      expect(check("name: Coffee\n").problems).toEqual([
        expect.objectContaining({ path: "format", message: expect.stringContaining("no `format:` line") }),
      ]);
    });

    test("refuses an unknown format", () => {
      expect(check("format: toaster/1.0\n").problems[0].message).toContain("unknown format toaster/1.0");
    });

    test("refuses a format newer than this copy of dunnage", () => {
      const [problem] = check("format: drawer/0.10\n").problems;
      expect(problem.message).toContain("newer than this copy of dunnage");
      expect(problem.message).toContain(`drawer/${FORMATS.drawer}`);
    });

    test("migrates a 0.2 file", () => {
      const old = stringify({ ...drawer(), format: "drawer/0.2" });
      expect(check(old)).toMatchObject({ format: "drawer/0.3", migratedFrom: "drawer/0.2", problems: [] });
      expect(check("format: printer/0.2\npreset: bambu-p1s\n")).toMatchObject({ format: "printer/0.3", migratedFrom: "printer/0.2", problems: [] });
    });

    test("refuses an older format it has no migration for", () => {
      expect(check("format: drawer/0.1\n").problems[0].message).toContain("no migration");
    });
  });

  describe("the schema", () => {
    test("names a misspelt field, and where it is", () => {
      const text = stringify({ ...drawer(), layout: [{ id: "mug", at: [60, 100], rotat: 90 }] });
      const [problem] = check(text).problems;
      expect(problem.path).toBe("layout[0]");
      expect(problem.message).toContain("rotat");
      expect(problem.line).toBe(text.split("\n").findIndex((line) => line.includes("rotat")) + 1);
    });

    test("names a missing field", () => {
      const { name: _, ...nameless } = drawer();
      expect(problems(nameless)).toEqual([expect.objectContaining({ path: "", message: expect.stringContaining("name") })]);
    });

    test("judges an item against its own shape, not every shape", () => {
      const document = drawer();
      document.items.scales = { ...document.items.scales, handle: [10, 10] } as never;
      expect(problems(document)).toEqual([expect.objectContaining({ path: "items.scales", message: expect.stringContaining("handle") })]);
    });

    test("judges a holder by its method", () => {
      const document = drawer();
      document.holders = [{ id: "mug-spec", method: "custom", holds: ["mug"] }];
      expect(problems(document)).toEqual([expect.objectContaining({ path: "holders[0]", message: expect.stringContaining("spec") })]);
    });

    test("lists the allowed values when one is wrong", () => {
      const document = drawer();
      document.holders = [{ id: "mug-well", method: "bucket", holds: ["mug"] }];
      expect(problems(document)).toEqual([
        expect.objectContaining({ path: "holders[0].method", message: expect.stringContaining("well, posts, slot") }),
      ]);
    });

    test("refuses an item id that isn't lower case, pointing at it", () => {
      const document = drawer();
      (document.items as Record<string, unknown>).Bowl = { name: "Bowl", cylinder: [160, 20] };
      const text = stringify(document);
      expect(check(text).problems).toEqual([
        { path: "items", message: expect.stringContaining("`Bowl` isn't a valid id"), line: text.split("\n").indexOf("  Bowl:") + 1, column: 3 },
      ]);
    });

    test("refuses an id that isn't lower case", () => {
      const document = drawer();
      document.layout[0] = { id: "Mug", item: "mug", at: [60, 100] };
      document.holders = [];
      expect(paths(problems(document))).toEqual(["layout[0].id"]);
    });
  });

  describe("ids resolve", () => {
    test("a thing names a real item, and says which exist", () => {
      const document = drawer();
      document.layout[2].item = "plat";
      const [problem] = problems(document);
      expect(problem.path).toBe("layout[2].item");
      expect(problem.message).toContain("mug, scales, plate");
    });

    test("a thing's id is its item when it names none", () => {
      const document = drawer();
      document.layout[2].item = undefined;
      expect(paths(problems(document))).toEqual(["layout[2].id"]);
    });

    test("ids are unique across things and holders", () => {
      const document = drawer();
      document.holders = [{ id: "scales", method: "slot", holds: ["scales"] }, { id: "mug-well", method: "well", holds: ["mug"] }];
      document.layout.push({ id: "mug", at: [350, 60] });
      expect(paths(problems(document))).toEqual(expect.arrayContaining(["layout[3].id", "holders[0].id"]));
    });

    test("a zone is a real zone", () => {
      const document = { ...drawer(), zones: { brew: { name: "Brew" } } };
      document.layout[0].zone = "brw";
      expect(paths(problems(document))).toEqual(["layout[0].zone"]);
    });

    test("review entries point at real things", () => {
      const document = {
        ...drawer(),
        review: {
          concerns: [{ id: "c-1", on: ["mug", "cup"], says: "Hm", act: { aside: ["kettle"] }, status: "open" }],
          comments: [{ on: "mug-well", says: "Fine", status: "closed" }, { on: "nothing", says: "Hm", status: "open" }],
        },
      };
      expect(paths(problems(document))).toEqual(["review.concerns[0].on[1]", "review.concerns[0].act.aside[0]", "review.comments[1].on"]);
    });
  });

  describe("poses", () => {
    test("a thing sits in one of its item's poses", () => {
      const document = drawer();
      document.layout[1].pose = "side";
      expect(paths(problems(document))).toEqual(["layout[1].pose"]);
    });

    test("an item's first pose is the one its shape is written in", () => {
      const document = drawer();
      document.items.scales.poses = ["upright", "flat"];
      document.layout[1].pose = "upright";
      expect(paths(problems(document))).toEqual(["items.scales.poses[0]"]);
    });

    test("only the first pose stacks", () => {
      const document = drawer();
      document.items.mug.poses = ["upright", "lying"];
      document.layout[0] = { id: "mug", pose: "lying", stack: 2, at: [60, 100] };
      expect(paths(problems(document))).toEqual(["layout[0].stack"]);
    });
  });

  describe("things fit in the drawer", () => {
    test("inside the walls, handle included", () => {
      const document = drawer();
      document.layout[0].at = [60, 70]; // the handle reaches 35 mm in front of the mug's 50 mm radius
      const [problem] = problems(document);
      expect(problem.path).toBe("layout[0].at");
      expect(problem.message).toContain("front wall by 15 mm");
    });

    test("turned, by the outline it really has", () => {
      const document = drawer();
      document.layout[1].at = [200, 20];
      document.layout[1].rotate = 0;
      expect(problems(document)).toEqual([]);
      document.layout[1].rotate = 90; // on edge and turned, it runs 150 mm front to back
      expect(problems(document)).toContainEqual({ path: "layout[1].at", message: expect.stringContaining("front wall by 55 mm"), line: expect.any(Number), column: expect.any(Number) });
    });

    test("inside the edge margin", () => {
      const document = { ...drawer(), rules: { edge_margin: 20 } };
      expect(paths(problems(document))).toEqual(["layout[0].at"]);
    });

    test("under the drawer's height, stacks included", () => {
      const document = drawer();
      document.layout[2].stack = 18; // 20 + 17 × 8 = 156
      const [problem] = problems(document);
      expect(problem.path).toBe("layout[2]");
      expect(problem.message).toContain("156 mm tall");
    });

    test("clear of obstructions", () => {
      const document = drawer();
      (document.drawer as Record<string, unknown>).obstructions = [{ name: "Runner bracket", at: [0, 280], size: [420, 40], height: 12 }];
      expect(problems(document)).toEqual([expect.objectContaining({ path: "layout[2]", message: expect.stringContaining("Runner bracket") })]);
    });

    test("clear of each other", () => {
      const document = drawer();
      document.layout[0].at = [270, 100];
      expect(problems(document)).toEqual([expect.objectContaining({ path: "layout[2]", message: expect.stringContaining("overlaps mug") })]);
    });

    test("a spout can overhang a neighbour, but not a wall", () => {
      const document = drawer();
      document.items.mug = { ...document.items.mug, handle: undefined, spout: [10, 40] } as never;
      document.layout[0].at = [60, 200];
      document.layout[0].rotate = -90; // the spout points right, over the plates
      expect(problems(document)).toEqual([]);
      document.layout[0].rotate = 90; // and now left, through the wall
      expect(paths(problems(document))).toEqual(["layout[0].at"]);
    });

    test("set-aside things are skipped", () => {
      const document = drawer();
      document.layout[0] = { id: "mug", at: [-500, -500], aside: true };
      expect(problems(document)).toEqual([]);
    });
  });

  describe("holders", () => {
    test("hold real things, each once", () => {
      const document = drawer();
      document.holders = [
        { id: "mug-well", method: "well", holds: ["mug", "mugg"] },
        { id: "mug-posts", method: "posts", holds: ["mug"] },
      ];
      expect(paths(problems(document))).toEqual(["holders[0].holds[1]", "holders[1].holds[0]"]);
    });

    test("hold things, not items or holders", () => {
      const document = drawer();
      document.holders = [{ id: "plate-well", method: "well", holds: ["plate"] }];
      expect(problems(document)[0].message).toContain("plates");
    });

    test("suit the base", () => {
      const document = drawer();
      document.holders = [{ id: "mug-bin", method: "gridfinity", holds: ["mug"] }];
      expect(paths(problems(document))).toEqual(["holders[0].method"]);
      expect(problems({ ...document, base: { kind: "gridfinity" } })).toEqual([]);
    });

    test("are fixed by hole only on a grid base", () => {
      const document = drawer();
      document.holders = [{ id: "mug-well", method: "well", holds: ["mug"], fix: [{ hole: [3, 4], by: "screw" }] }];
      expect(paths(problems(document))).toEqual(["holders[0].fix"]);
      expect(problems({ ...document, base: { kind: "grid" } })).toEqual([]);
    });
  });

  describe("grid base", () => {
    test("takes a variant, tile, bumpers and countersinks", () => {
      const base = { kind: "grid", variant: "light", tile: [24, 17], bumpers: { split: { x: "left" }, fit: 0.5 }, countersinks: [[0, 0]] };
      expect(problems({ ...drawer(), base })).toEqual([]);
    });

    test("refuses a variant the grid parameters don't have", () => {
      expect(paths(problems({ ...drawer(), base: { kind: "grid", variant: "heavy" } }))).toEqual(["base.variant"]);
    });

    test("warns about a variant with no calibrated hole size", () => {
      const uncalibrated = check(stringify({ ...drawer(), base: { kind: "grid", variant: "light" } }));
      expect(uncalibrated.problems).toEqual([]);
      expect(paths(uncalibrated.warnings ?? [])).toEqual(["base.variant"]);
      expect(check(stringify({ ...drawer(), base: { kind: "grid", variant: "light-thin" } })).warnings ?? []).toEqual([]);
    });
  });

  describe("drawer shape", () => {
    const shaped = (shape: object) => ({ ...drawer(), drawer: shape });

    test("needs an inside or a preset, and isn't given to plan without one", () => {
      const text = stringify(shaped({ corner_radius: 3 }));
      expect(paths(check(text).problems)).toEqual(["drawer"]);
      expect(() => load(text)).toThrow();
    });

    test("a preset fills in the shape, and the file's fields override it", () => {
      const preset = DRAWER_PRESETS["ikea-maximera-80x60-low"];
      expect(drawerShape({ preset: "ikea-maximera-80x60-low" })).toMatchObject({ walls: { left: 20, right: 20, front: 0, back: 0 }, floor_edge: 2 });
      const overridden = drawerShape({ preset: "ikea-maximera-80x60-low", inside: [680, 500, 70], walls: { sides: 15, left: 18 }, floor_edge: 1 })!;
      expect(overridden).toMatchObject({ inside: [680, 500, 70], walls: { left: 18, right: 15, front: preset.walls.front, back: preset.walls.back }, floor_edge: 1 });
    });

    test("walls default to vertical; `ends` sets front and back", () => {
      expect(drawerShape({ inside: [100, 100, 50], walls: { ends: 5 } })!.walls).toEqual({ left: 0, right: 0, front: 5, back: 5 });
    });

    test("every MAXIMERA preset is unverified, and check warns when one is used", () => {
      const maximera = Object.entries(DRAWER_PRESETS).filter(([name]) => name.startsWith("ikea-maximera-"));
      expect(maximera.length).toBeGreaterThan(0);
      for (const [, preset] of maximera) expect(preset.unverified).toBe(true);
      const result = check(stringify(shaped({ preset: "ikea-maximera-80x60-high" })));
      expect(result.problems).toEqual([]);
      expect(paths(result.warnings ?? [])).toEqual(["drawer.preset"]);
    });

    test("refuses a preset that isn't built in", () => {
      expect(paths(problems(shaped({ preset: "ikea-alex" })))).toEqual(["drawer.preset"]);
    });

    test("a peg goes through an outlet", () => {
      const document = drawer();
      document.holders = [{ id: "mug-peg", method: "peg", holds: ["mug"] }];
      expect(problems(document)[0]).toMatchObject({ path: "holders[0].holds[0]", message: expect.stringContaining("outlet") });
    });
  });

  describe("printers", () => {
    test("need a bed or a preset", () => {
      expect(paths(check("format: printer/0.2\n").problems)).toEqual([""]);
      expect(check("format: printer/0.2\nbed: [200, 200, 200]\n").problems).toEqual([]);
    });

    test("name a known preset", () => {
      expect(check("format: printer/0.2\npreset: toaster\n").problems[0].message).toContain("bambu-p1s");
    });
  });
});

describe("load", () => {
  test("returns the drawer with its kind", () => {
    const file = load(fixture("coffee.drawer.yml"));
    expect(file.kind).toBe("drawer");
    if (file.kind === "drawer") expect(file.drawer.drawer.inside).toEqual([700, 500, 150]);
  });

  test("fills a printer's bed from its preset", () => {
    expect(load("format: printer/0.2\npreset: prusa-mk4\n")).toMatchObject({ kind: "printer", printer: { bed: [250, 210, 220] } });
  });

  test("fills a printer's grid fits from the grid parameters, under any it sets", () => {
    expect(load("format: printer/0.3\npreset: bambu-p1s\n")).toMatchObject({ printer: { fit: GRID.fit } });
    const file = load("format: printer/0.3\npreset: bambu-p1s\nfit: { grid_hole: { light: 3.4 }, joiner: 0.3 }\n");
    expect(file).toMatchObject({ printer: { fit: { ...GRID.fit, grid_hole: { ...GRID.fit.grid_hole, light: 3.4 }, joiner: 0.3 } } });
  });

  test("throws with the problems when the file is wrong", () => {
    expect(() => load("format: drawer/0.2\n")).toThrow(/name/);
  });
});

describe("migrate", () => {
  const migrations = {
    drawer: {
      "0.0": { to: "0.1", up: (document: Record<string, unknown>) => ({ ...document, title: undefined, name: document.title }) },
      "0.1": { to: "0.2", up: (document: Record<string, unknown>) => ({ ...document, layout: document.layout ?? [] }) },
      "0.2": { to: "0.3", up: (document: Record<string, unknown>) => document },
    },
  };

  test("steps an older file up to the current format", () => {
    expect(migrate({ format: "drawer/0.0", title: "Old" }, "drawer", "0.0", migrations)).toEqual({
      format: `drawer/${FORMATS.drawer}`,
      name: "Old",
      title: undefined,
      layout: [],
    });
  });

  test("leaves a current file alone", () => {
    const document = { format: `drawer/${FORMATS.drawer}` };
    expect(migrate(document, "drawer", FORMATS.drawer, migrations)).toBe(document);
  });

  test("refuses a version with no migration", () => {
    expect(() => migrate({}, "drawer", "0.05", migrations)).toThrow("no migration");
  });
});
