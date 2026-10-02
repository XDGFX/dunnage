import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { load, plan, specSheet, type Drawer } from "../src/core/index.ts";

const BED: [number, number, number] = [256, 256, 256];
const coffee = () => {
  const file = load(readFileSync(new URL("../fixtures/coffee.drawer.yml", import.meta.url), "utf8"));
  if (file.kind !== "drawer") throw new Error("not a drawer");
  return file.drawer;
};

/** A drawer with only what a test needs. */
function drawer(extra: Partial<Drawer>): Drawer {
  return {
    format: "drawer/0.2",
    name: "Test",
    drawer: { inside: [400, 300, 150] },
    items: {
      mug: { name: "Mug", cylinder: [100, 110] },
      tin: { name: "Tin", cylinder: [80, 100] },
      jar: { name: "Jar", cylinder: [90, 100] },
      box: { name: "Box", box: [100, 60, 40] },
    },
    layout: [],
    ...extra,
  };
}

const texts = (issues: { text: string }[]) => issues.map((issue) => issue.text);

describe("plan", () => {
  test("shapes a well round what it holds, handles included, with the method's padding", () => {
    // The large mug's handle reaches 35 mm in front of its body, to y = 10; the well pads 4 mm.
    const tray = plan(coffee(), BED).holders.find((holder) => holder.id === "mug-tray")!;
    expect(tray.shape).toEqual({ x0: 266, y0: 6, x1: 474, y1: 149 });
  });

  test("keeps a locked holder's shape as built", () => {
    const peg = plan(coffee(), BED).holders.find((holder) => holder.id === "v60-peg")!;
    expect(peg.locked).toBe(true);
    expect(peg.shape).toEqual({ x0: 488, y0: 5, x1: 618, y1: 130 });
  });

  test("puts things set aside on the counter, out of the drawer", () => {
    const d = coffee();
    d.layout.find((thing) => thing.id === "glass-4")!.aside = true;
    const glass = plan(d, BED).things.find((thing) => thing.id === "glass-4")!;
    expect(glass.aside).toBe(true);
    expect(glass.box.y1).toBeLessThan(0);
  });

  test("says when a thing isn't held yet", () => {
    const p = plan(drawer({ layout: [{ id: "mug", at: [100, 100] }] }), BED);
    expect(texts(p.things[0].issues)).toEqual(["Not held yet"]);
  });

  test("counts the holder's floor and the base in a thing's height", () => {
    const tall = drawer({
      items: { jar: { name: "Jar", cylinder: [80, 149] } },
      layout: [{ id: "jar", at: [100, 100] }],
      holders: [{ id: "jar-well", method: "well", holds: ["jar"] }],
    });
    expect(texts(plan(tall, BED).things[0].issues)).toEqual(["Too tall: 151 mm in a 150 mm drawer, counting the holder's floor (2 mm)"]);
  });

  describe("on a bare floor", () => {
    test("grows holders to close small gaps, halfway to each other and all the way to a wall", () => {
      // Two wells 108 mm wide, 20 mm apart, the left one 20 mm off the wall and the right one 144 mm.
      const p = plan(
        drawer({
          drawer: { inside: [400, 300, 150] },
          layout: [{ id: "a", item: "box", at: [74, 150] }, { id: "b", item: "box", at: [202, 150] }],
          holders: [{ id: "a-well", method: "well", holds: ["a"] }, { id: "b-well", method: "well", holds: ["b"] }],
        }),
        BED,
      );
      const [a, b] = p.holders;
      expect(a.rect!.x0).toBe(0);
      expect(a.rect!.x1).toBeCloseTo(138);
      expect(b.rect!.x0).toBeCloseTo(138);
    });

    test("leaves wide gaps and says how far the holder can slide", () => {
      const p = plan(
        drawer({ layout: [{ id: "mug", at: [200, 150] }], holders: [{ id: "mug-well", method: "well", holds: ["mug"] }] }),
        BED,
      );
      // 108 mm wide in 400: 146 mm free each side.
      expect(texts(p.holders[0].issues)).toContain("Slides 292 mm: nothing it touches stops it");
    });
  });

  test("flags a printed holder bigger than the bed", () => {
    const p = plan(
      drawer({ layout: [{ id: "a", item: "box", at: [60, 50] }, { id: "b", item: "box", at: [300, 50] }], holders: [{ id: "both", method: "well", holds: ["a", "b"] }] }),
      BED,
    );
    expect(texts(p.holders[0].issues).join()).toContain("bigger than the 256 mm bed");
  });

  test("puts Gridfinity bins in whole cells, centred in the drawer", () => {
    const p = plan(
      drawer({
        drawer: { inside: [400, 300, 150] },
        base: { kind: "gridfinity" },
        layout: [{ id: "tin", at: [116, 108] }],
        holders: [{ id: "tin-bin", method: "gridfinity", holds: ["tin"] }],
      }),
      BED,
    );
    // 9 × 7 cells of 42 mm, 11 mm in from the sides and 3 mm from front and back.
    expect(p.base.grid).toEqual({ pitch: 42, nx: 9, ny: 7, ox: 11, oy: 3 });
    expect(p.holders[0].cells).toEqual([1, 1, 4, 4]);
    expect(p.holders[0].rect).toEqual({ x0: 53, y0: 45, x1: 179, y1: 171 });
  });

  describe("on a pegboard", () => {
    const board = (at: [number, number]) =>
      drawer({
        drawer: { inside: [700, 500, 150] },
        base: { kind: "pegboard", preset: "uppdatera-80" },
        layout: [{ id: "jar", at }],
        holders: [{ id: "jar-pegs", method: "pegs", holds: ["jar"] }],
      });

    test("holds a plain cylinder with three pegs round it, within its play", () => {
      // The jar's radius is 45. The peg in front touches it: its back face is at y = 196, 45 mm
      // from the centre. The two behind are 2 mm short of touching at their nearest corners,
      // (303, 284) and (337, 284): √(17² + 43²) − 45 = 1.24 mm.
      const p = plan(board([320, 241]), BED);
      expect(p.things[0].pegs!.held).toBe(true);
      expect(p.holders[0].pegs.map((peg) => [peg.x, peg.y, Number(peg.gap.toFixed(2))])).toEqual([
        [320, 190, 0],
        [300, 290, 1.24],
        [340, 290, 1.24],
      ]);
      expect(p.holders[0].issues).toEqual([]);
    });

    test("says when pegs can't hold a thing where it is", () => {
      const p = plan(board([361, 250]), BED);
      expect(p.things[0].pegs!.held).toBe(false);
      expect(texts(p.holders[0].issues).join()).toMatch(/^Pegs can't hold jar here/);
    });
  });
});

describe("specSheet", () => {
  test("says what a custom holder holds and the space it has", () => {
    const p = plan(coffee(), BED);
    const sheet = specSheet(p, p.holders.find((h) => h.id === "glass-cradles-front")!, "Coffee and tableware");
    expect(sheet).toContain("# Glass cradles front: custom holder spec");
    expect(sheet).toContain("Purpose: Hold two glasses on their sides so they can't roll or slide.");
    expect(sheet).toContain("- Glass: cylinder Ø70 × 160 mm, lying, turned 90°; centre at (200, 198); top at 70 mm.");
  });
});
