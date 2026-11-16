import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import Module, { type CrossSection, type Manifold } from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  boardCounts, check, drawerOverlays, drawerShape, exportDrawer, GRID, gridFit, holeAt, latchProfile, latchSeat, latchShape, layoutBoard, layoutOverlay, load, pegboard, plan, printable,
  printLatch, seatedLatch, socketOf, strainPerMm, stressConcentration, tileSolid, UPPDATERA, withSpares, type Drawer, type OverlayLayout, type OverlaySpec,
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

/**
 * A latch measured on its mesh against an UPPDATERA slot's solid, moved by `offset` and grown by
 * `grow` from nominal, with nothing from the latch's own seat model: how far each leg must be
 * pushed in to pass the skin, how far it stays pushed in once seated, and how far past that it
 * would have to go to let go.
 */
function measure(latch: Manifold, root: number, offset: readonly [number, number], grow: number) {
  const { Manifold, CrossSection } = wasm;
  const [L, W] = [UPPDATERA.slot[0] + grow, UPPDATERA.slot[1] + grow];
  const { skin, thickness: T } = UPPDATERA;
  const [cupW, cupD] = UPPDATERA.cup;
  const opening = CrossSection.union([
    CrossSection.square([L - W, W], true),
    ...[-1, 1].map((side) => CrossSection.circle(W / 2, 96).translate((side * (L - W)) / 2, 0)),
  ]).translate(offset[0], offset[1]);
  const big = 40;
  const skinLayer = Manifold.cube([big, big, skin], true).translate([0, 0, -skin / 2]).subtract(Manifold.extrude(opening, skin + 2).translate([0, 0, -skin - 1]));
  const under = Manifold.cube([big, big, T + 5], true).translate([0, 0, -skin - (T + 5) / 2]).subtract(Manifold.cylinder(T - skin + 1, cupW / 2, cupW / 2, 96).translate([offset[0], offset[1], -T]));
  const cut = (x0: number, x1: number, z0: number, z1: number) => latch.intersect(Manifold.cube([x1 - x0, big, z1 - z0]).translate([x0, -big / 2, z0]));
  const sides = [-1, 1].map((side) => {
    const [x0, x1] = side < 0 ? [-big, -0.01] : [0.01, big];
    const leg = cut(x0, x1, -big, root);
    const inward = (s: number) => [-side * s, 0, 0] as [number, number, number];
    /** The least inward push, to 0.005 mm, at which `clear` holds. */
    const least = (clear: (s: number) => boolean) => {
      if (clear(0)) return 0;
      let [lo, hi] = [0, 6];
      while (hi - lo > 0.005) {
        const mid = (lo + hi) / 2;
        if (clear(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    const outside = (plan: CrossSection, s: number) => plan.translate(-side * s, 0).subtract(opening).area() < 1e-8;
    const below = cut(x0, x1, -big, 0).project();
    const underSkin = cut(x0, x1, -big, -skin).project();
    const nose = leg.boundingBox().min[2];
    const tip = cut(x0, x1, nose, nose + 0.3).project();
    const insertion = least((s) => outside(below, s));
    const held = least((s) => leg.translate(inward(s)).intersect(skinLayer).volume() < 1e-8);
    const release = least((s) => outside(underSkin, s));
    return {
      enters: outside(tip, 0),
      insertion,
      held,
      overlap: release - held,
      inCup: leg.translate(inward(held)).intersect(under).volume() < 1e-8,
    };
  });
  return {
    enters: sides.every((s) => s.enters),
    insertion: Math.max(...sides.map((s) => s.insertion)),
    held: Math.max(...sides.map((s) => s.held)),
    overlap: Math.min(...sides.map((s) => s.overlap)),
    inCup: sides.every((s) => s.inCup),
  };
}

describe("a latch", () => {
  const shape = latchShape();
  const { tolerance, size } = GRID.latch;
  const steps = (t: number) => [-t, 0, t];

  test("seats, measured on its mesh, with the slot moved up to the tolerance along, across or diagonally, in slots that much bigger or smaller", () => {
    const latch = seatedLatch(wasm, shape);
    const per = strainPerMm(shape);
    for (const grow of steps(size)) {
      for (const dx of steps(tolerance)) {
        for (const dy of steps(tolerance)) {
          const at = `slot ${grow >= 0 ? "+" : ""}${grow} mm, moved [${dx}, ${dy}]`;
          const m = measure(latch, shape.root, [dx, dy], grow);
          expect(m.enters, at).toBe(true);
          expect(m.inCup, at).toBe(true);
          expect(m.overlap, at).toBeGreaterThanOrEqual(GRID.latch.hold - 0.02);
          expect(m.insertion * per, at).toBeLessThanOrEqual(GRID.latch.strain);
          expect(m.held * per, at).toBeLessThanOrEqual(GRID.latch.held);
        }
      }
    }
  }, 120_000);

  test("doesn't seat with a smaller slot moved 1 mm diagonally, past the tolerance it's made for", () => {
    const m = measure(seatedLatch(wasm, shape), shape.root, [1, 1], -size);
    expect(m.enters).toBe(false);
  });

  test("the design model agrees with the mesh", () => {
    const latch = seatedLatch(wasm, shape);
    for (const offset of [[0, 0], [tolerance, tolerance]] as const) {
      const m = measure(latch, shape.root, offset, 0);
      const seat = latchSeat(shape, offset);
      expect(seat.deflection).toBeCloseTo(m.insertion, 1);
      expect(seat.held).toBeCloseTo(m.held, 1);
    }
  });

  test("keeps its fillets: the leg and bar roots are rounded", () => {
    const flat = latchShape();
    const profile = wasm.CrossSection.union(latchProfile(flat).map((p) => wasm.CrossSection.ofPolygons([p])));
    const printed = printLatch(wasm, flat);
    const extra = printed.volume() - profile.area() * flat.width;
    // Four fillets of radius r each add (1 − π/4) r² of profile.
    expect(extra).toBeCloseTo(4 * (1 - Math.PI / 4) * flat.fillet ** 2 * flat.width, 1);
    expect(stressConcentration(flat)).toBeGreaterThan(1);
  });

  test("prints flat on its side, with no overhang steeper than 45°", () => {
    const latch = printLatch(wasm, shape);
    expect(latch.status()).toBe("NoError");
    expect(latch.decompose().length).toBe(1);
    expect(overhangs(latch.getMesh())).toBe(0);
    const { min, max } = latch.boundingBox();
    expect(min[2]).toBeCloseTo(0, 6);
    // Lying on its side: it stands only its width across the slot.
    expect(max[2] - min[2]).toBeCloseTo(shape.width, 6);
  });

  test("takes its stiffness and catch from the printer's latch fit", () => {
    const stiff = latchShape({ ...GRID.fit.latch, leg: 1.6, catch: 30 });
    expect(stiff.leg).toBe(1.6);
    expect(stiff.catch).toBe(30);
    expect(gridFit({ latch: { leg: 1.6 } }).latch).toEqual({ ...GRID.fit.latch, leg: 1.6 });
  });
});

/** Every point of an overlay, a millimetre apart, and how far it is from the nearest latch. */
function farthest(layout: OverlayLayout): number {
  let worst = 0;
  for (let x = layout.box.x0; x <= layout.box.x1; x += 1) {
    for (let y = layout.box.y0; y <= layout.box.y1; y += 1) {
      worst = Math.max(worst, Math.min(...layout.latches.map(({ at }) => Math.hypot(at[0] - x, at[1] - y))));
    }
  }
  return worst;
}

describe("laying out an overlay", () => {
  const cases: [string, OverlayLayout][] = [];
  beforeAll(() => {
    cases.push(["the coffee drawer's", drawerOverlays(coffee())[0]!]);
    cases.push(["a 2 × 2-tile", overlay({ holes: [16, 16] }, [90, 90, 90])]);
    cases.push(["a whole board", overlay({ holes: [71, 52] })]);
  });

  test("puts every latch over one of the board's slots", () => {
    for (const [name, layout] of cases) {
      expect(layout.problems, name).toEqual([]);
      for (const { at } of layout.latches) expect(BOARD.holes.some(([x, y]) => x === at[0] && y === at[1]), name).toBe(true);
    }
  });

  test("gives every tile two latches, the overlay three not in a line, and leaves no point more than 120 mm from one", () => {
    for (const [name, layout] of cases) {
      for (const [index] of layout.tiles.entries()) expect(layout.latches.filter((l) => l.tile === index).length, name).toBeGreaterThanOrEqual(2);
      expect(layout.latches.length, name).toBeGreaterThanOrEqual(3);
      const [a, b] = [layout.latches[0]!.at, layout.latches[1]!.at];
      const offLine = layout.latches.some(({ at: c }) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1);
      expect(offLine, name).toBe(true);
      expect(farthest(layout), name).toBeLessThanOrEqual(GRID.overlay.reach);
    }
  });

  test("keeps each latch's pad inside its tile, clear of the joiners at its edges", () => {
    const { pad } = socketOf([latchShape()]);
    for (const [name, layout] of cases) {
      for (const { at: [x, y], tile } of layout.latches) {
        const box = layout.tiles[tile]!.box;
        expect(x - pad[0] / 2 - box.x0, name).toBeGreaterThanOrEqual(GRID.overlay.edge_room - 1e-9);
        expect(box.x1 - x - pad[0] / 2, name).toBeGreaterThanOrEqual(GRID.overlay.edge_room - 1e-9);
        expect(y - pad[1] / 2 - box.y0, name).toBeGreaterThanOrEqual(GRID.overlay.edge_room - 1e-9);
        expect(box.y1 - y - pad[1] / 2, name).toBeGreaterThanOrEqual(GRID.overlay.edge_room - 1e-9);
      }
    }
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
    // At [85, 0] on the board: its front edge is on the board's, and the rest face the pegboard.
    expect(layout.free).toEqual(["left", "right", "back"]);
    for (const [x, y] of layout.joiners) {
      expect(x > layout.box.x0 && x < layout.box.x1 && y > layout.box.y0 && y < layout.box.y1).toBe(true);
    }
  });

  test("reports an overlay that runs off the board", () => {
    expect(overlay({ at: [600, 0], holes: [16, 16] }).problems.map((p) => p.at)).toEqual([["base", "overlays", 0]]);
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
  test("prints face down without supports, its latch sockets in solid pads, with the holes over them closed", () => {
    // Clear of the board's edges, so every outer edge is free and chamfered.
    const layout = overlay({ at: [20, 20], holes: [16, 16] }, [90, 90, 90]);
    expect(layout.free).toEqual(["left", "right", "front", "back"]);
    const t = layout.tiles[0]!;
    const solid = tileSolid(wasm, layout, t);
    expect(solid.status()).toBe("NoError");
    expect(overhangs(printable(solid).getMesh())).toBe(0);

    const own = layout.closed.map((hole) => holeAt(layout, hole)).filter(([x, y]) => x > t.box.x0 && x < t.box.x1 && y > t.box.y0 && y < t.box.y1);
    expect(own.length).toBeGreaterThan(0);
    for (const [x, y] of own) expect(solidDown(solid, x, y)).toBeGreaterThan(0);
    // A hole away from every latch goes right through.
    const open = [...Array(t.size[0]).keys()].flatMap((i) => [...Array(t.size[1]).keys()].map((j) => [t.first[0] + i, t.first[1] + j] as const))
      .find((hole) => !layout.closed.some(([i, j]) => i === hole[0] && j === hole[1]))!;
    expect(solidDown(solid, ...holeAt(layout, open))).toBe(0);

    // Each latch's pocket is open from below, in a pad that's solid round it.
    const { pad, pocket } = socketOf([latchShape()]);
    for (const { at: [x, y] } of layout.latches.filter((l) => l.tile === 0)) {
      expect(solid.intersect(wasm.Manifold.cube([1, 1, 1], true).translate([x, y, 1])).volume()).toBe(0);
      const wall = (pad[0] + pocket[0]) / 4;
      expect(solid.intersect(wasm.Manifold.cube([0.2, 0.2, 1], true).translate([x + wall, y, 1])).volume()).toBeGreaterThan(0);
    }
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
    })).problems;
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
  const BED = [90, 90, 90] as const;

  test("plates its tiles, and the latches with spares, and lists the latches and closed holes", async () => {
    const drawer = (load(SMALL) as { drawer: Drawer }).drawer;
    expect(check(SMALL, { bed: BED }).problems).toEqual([]);
    const [layout] = drawerOverlays(drawer, { bed: BED });
    expect(layout!.tiles.length).toBe(4);
    const files = exportDrawer(await Module(), drawer, { bed: [256, 256, 256] });
    const names = files.map((f) => f.name);
    expect(names.filter((n) => n.startsWith("overlay-patch-tile-"))).toHaveLength(1);

    const big = drawerOverlays(drawer, { bed: [256, 256, 256] });
    const counts = boardCounts(drawer, big);
    expect(counts.latches).toBe(withSpares(big[0]!.latches.length));
    const plate = unzipSync(files.find((f) => f.name === "plate.3mf")!.data);
    const model = strFromU8(plate["3D/3dmodel.model"]!);
    expect(model.match(/<item /g)?.length).toBe(counts.joiners + counts.pegs + counts.latches);
    expect(model).toContain('name="latch"');

    const parts = strFromU8(files.find((f) => f.name === "parts.md")!.data);
    expect(parts).toContain(`${counts.latches} spring latches`);
    expect(parts).toContain(`${counts.closed} holes are closed`);
    const calibration = strFromU8(unzipSync(files.find((f) => f.name === "calibration.3mf")!.data)["3D/3dmodel.model"]!);
    expect(calibration).toContain("latch-strip-");
  }, 120_000);
});
