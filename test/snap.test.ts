import { describe, expect, test } from "vitest";
import { arrange, partsHit, plan, putBackSpot, seat, snapAngle, solve, type Drawer } from "../src/core/index.ts";

const BED: [number, number, number] = [256, 256, 256];

function drawer(extra: Partial<Drawer>): Drawer {
  return {
    format: "drawer/0.2",
    name: "Test",
    drawer: { inside: [600, 400, 150] },
    items: {
      box: { name: "Box", box: [100, 60, 40] },
      jar: { name: "Jar", cylinder: [90, 100] },
    },
    layout: [],
    ...extra,
  };
}

/** Two boxes in wells, a at the left and b well to the right. */
const pair = (extra: Partial<Drawer> = {}) =>
  plan(
    drawer({
      layout: [{ id: "a", item: "box", at: [100, 200] }, { id: "b", item: "box", at: [400, 200] }],
      holders: [{ id: "a-well", method: "well", holds: ["a"] }, { id: "b-well", method: "well", holds: ["b"] }],
      ...extra,
    }),
    BED,
  );

describe("solve", () => {
  test("stops a thing pushed into a neighbour against it", () => {
    const p = pair();
    // Drag b 250 mm left, 50 mm into a. Bodies are 100 wide, so b stops with its centre 100 mm from a's.
    const move = solve(p, ["b"], -250, 0, true)!;
    const b = p.things[1];
    expect(b.x + move.dx).toBeGreaterThanOrEqual(200);
    expect(b.x + move.dx).toBeLessThan(201);
  });

  test("pulls a thing so its holder touches a neighbour's", () => {
    const p = pair();
    // Wells reach 4 mm round each box, so they touch when b's centre is 108 mm right of a's.
    const move = solve(p, ["b"], -180, 0, false)!;
    expect(p.things[1].x + move.dx).toBe(208);
    expect(move.x?.kind).toBe("touch");
  });

  test("moves freely, without pulls, when asked", () => {
    const move = solve(pair(), ["b"], -180, 0, true)!;
    expect(move.dx).toBe(-180);
    expect(move.x).toBeNull();
  });

  test("keeps things inside the walls", () => {
    const move = solve(pair(), ["a"], -500, 0, true)!;
    expect(100 + move.dx).toBe(50);
  });

  test("centres a thing in whole Gridfinity cells", () => {
    // 14 × 9 cells of 42 mm, 6 mm in from the sides and 11 from the front: a 90 mm jar takes 3 × 3.
    const p = plan(drawer({ base: { kind: "gridfinity" }, layout: [{ id: "jar", at: [100, 100] }], holders: [{ id: "jar-bin", method: "gridfinity", holds: ["jar"] }] }), BED);
    const move = solve(p, ["jar"], 5, 3, false)!;
    // Cell edges run at 6 + 42k; centres of 3-cell blocks land on 6 + 21k across.
    expect([100 + move.dx, 100 + move.dy]).toEqual([111, 95]);
  });

  test("never leaves the moved thing overlapping a neighbour", () => {
    const p = pair();
    for (const dx of [-310, -290, -250, -230]) {
      const move = solve(p, ["b"], dx, 7, false);
      if (!move) continue;
      const b = p.things[1];
      const moved = plan(drawer({
        layout: [{ id: "a", item: "box", at: [100, 200] }, { id: "b", item: "box", at: [b.x + move.dx, b.y + move.dy] }],
      }), BED);
      expect(partsHit(moved.things[0].parts, moved.things[1].parts)).toBe(false);
    }
  });
});

describe("snapAngle", () => {
  const p = pair();
  const a = p.things[0];
  test("snaps to square nearby, otherwise to the rotation step", () => {
    expect(snapAngle(p, a, 84, false)).toEqual({ angle: 90, why: "Square" });
    expect(snapAngle(p, a, 37, false)).toEqual({ angle: 30, why: "15° steps" });
  });

  test("turns freely when asked", () => {
    expect(snapAngle(p, a, 37.4, true)).toEqual({ angle: 37, why: null });
  });
});

describe("seat", () => {
  test("finds the nearest spot where pegs hold a thing", () => {
    const p = plan(
      drawer({
        drawer: { inside: [700, 500, 150] },
        base: { kind: "pegboard", preset: "uppdatera-80" },
        layout: [{ id: "jar", at: [323, 245] }],
        holders: [{ id: "jar-pegs", method: "pegs", holds: ["jar"] }],
      }),
      BED,
    );
    expect(p.things[0].pegs!.held).toBe(false);
    // (320, 241) is a seat (see the plan tests), so there's one within 3 mm of (321, 242).
    const [x, y] = seat(p, p.things[0], 321, 242, 10)!;
    expect(Math.hypot(x - 321, y - 242)).toBeLessThanOrEqual(3);
    const there = plan(drawer({
      drawer: { inside: [700, 500, 150] },
      base: { kind: "pegboard", preset: "uppdatera-80" },
      layout: [{ id: "jar", at: [x, y] }],
      holders: [{ id: "jar-pegs", method: "pegs", holds: ["jar"] }],
    }), BED);
    expect(there.things[0].pegs!.held).toBe(true);
  });
});

describe("putBackSpot", () => {
  test("finds the first free spot, front to back", () => {
    const p = plan(drawer({ layout: [{ id: "a", item: "box", at: [50, 30] }, { id: "b", item: "box", at: [0, 0], aside: true }] }), BED);
    expect(putBackSpot(p, p.things[1])).toEqual([150, 30]);
  });
});

describe("arrange", () => {
  test("lines things up by the left edges of their holders", () => {
    const p = plan(
      drawer({
        layout: [{ id: "a", item: "box", at: [100, 100] }, { id: "b", item: "box", at: [160, 250] }],
        holders: [{ id: "a-well", method: "well", holds: ["a"] }, { id: "b-well", method: "well", holds: ["b"] }],
      }),
      BED,
    );
    expect(arrange(p, ["a", "b"], "left")).toEqual([["a", 0, 0], ["b", -60, 0]]);
  });

  test("closes the gaps between them", () => {
    const p = pair();
    expect(arrange(p, ["a", "b"], "pack-x")).toEqual([["a", 0, 0], ["b", -192, 0]]);
  });
});
