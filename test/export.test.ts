import { unzipSync, strFromU8 } from "fflate";
import Module from "manifold-3d";
import { beforeAll, describe, expect, test } from "vitest";
import {
  boardCounts, drawerShape, exportDrawer, holeAt, holderSide, layoutBoard, load, MODEL_PATH, plan, plates, specSheet, to3mf, withSpares,
  type Drawer, type GridBase,
} from "../src/core/index.ts";
import { collect, freeAll } from "../src/core/export/collect.ts";
import { gridFit, VARIANT_NAMES } from "../src/core/grid/parameters.ts";

// `exportDrawer` takes over the instance it's given, so each export gets its own.
let wasm: Awaited<ReturnType<typeof Module>>;
beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

const BED = [256, 256, 256] as const;

/** A small grid drawer: four little tiles, a custom holder on a pin and a ply holder on a screw. */
const SMALL = `
format: drawer/0.4
name: Small grid
drawer: { inside: [120, 120, 40] }
base: { kind: grid, tile: [6, 6], countersinks: [[0, 0]] }
items:
  cup: { name: Cup, cylinder: [30, 30] }
  board: { name: Board, box: [40, 20, 10] }
layout:
  - { id: cup, at: [30, 30] }
  - { id: board, at: [80, 80] }
holders:
  - id: cup-cradle
    method: custom
    holds: [cup]
    spec: { purpose: Hold the cup }
    fix: [{ hole: [1, 1], by: pin }, { hole: [3, 1], by: pin }]
  - id: board-block
    method: ply
    holds: [board]
    fix: [{ hole: [8, 8], by: screw }]
`;

function small(): Drawer {
  const file = load(SMALL);
  if (file.kind !== "drawer") throw new Error("not a drawer");
  return file.drawer;
}

/** A 3MF's model, read back from the zip with nothing of the writer's. */
function readModel(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const xml = strFromU8(entries[MODEL_PATH]!);
  const objects = [...xml.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)].map(([, id, body]) => ({
    id,
    vertices: [...body!.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]),
    triangles: [...body!.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].length,
  }));
  const items = [...xml.matchAll(/<item objectid="(\d+)" transform="([^"]+)"\/>/g)].map(([, id, t]) => ({ id, transform: t!.split(" ").map(Number) }));
  return { entries, xml, objects, items };
}

describe("to3mf", () => {
  test("writes the three parts of a 3MF package, in mm, with every vertex, triangle and copy", () => {
    const cube = wasm.Manifold.cube([10, 20, 30]).getMesh();
    const tetra = wasm.Manifold.tetrahedron().getMesh();
    const bytes = to3mf([{ name: "cube", mesh: cube, at: [[5, 6, 0], [40, 6, 0]] }, { name: "tetra & co", mesh: tetra, at: [[80, 80, 1]] }], "Test");
    const { entries, xml, objects, items } = readModel(bytes);

    expect(Object.keys(entries).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
    expect(strFromU8(entries["[Content_Types].xml"]!)).toContain('Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"');
    expect(strFromU8(entries["_rels/.rels"]!)).toContain(`Target="/${MODEL_PATH}"`);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('name="tetra &amp; co"');

    expect(objects.map((o) => [o.vertices.length, o.triangles])).toEqual([
      [cube.vertProperties.length / cube.numProp, cube.triVerts.length / 3],
      [tetra.vertProperties.length / tetra.numProp, tetra.triVerts.length / 3],
    ]);
    expect(Math.max(...objects[0]!.vertices.map((v) => v[2]!))).toBe(30);
    expect(items).toEqual([
      { id: "1", transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 6, 0] },
      { id: "1", transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 40, 6, 0] },
      { id: "2", transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, 80, 80, 1] },
    ]);
  });
});

describe("collect", () => {
  test("frees what static functions and methods return, and nothing made before", async () => {
    const fresh = await Module();
    fresh.setup();
    const before = fresh.Manifold.cube([1, 1, 1]);
    collect(fresh);
    const cube = fresh.Manifold.cube([1, 1, 1]);
    const moved = cube.translate([1, 0, 0]);
    const section = fresh.CrossSection.circle(1, 8).translate([1, 1]);
    const parts = fresh.Manifold.union([cube, moved]).decompose();
    freeAll();
    // Embind gives every handle `isDeleted`; manifold-3d's types leave it out.
    const deleted = (handle: object) => (handle as { isDeleted(): boolean }).isDeleted();
    for (const handle of [cube, moved, section, ...parts]) expect(deleted(handle)).toBe(true);
    expect(deleted(before)).toBe(false);
  });
});

describe("plates", () => {
  const overlaps = (a: { at: number[]; size: readonly number[] }, b: { at: number[]; size: readonly number[] }) =>
    a.at[0]! < b.at[0]! + b.size[0]! && b.at[0]! < a.at[0]! + a.size[0]! && a.at[1]! < b.at[1]! + b.size[1]! && b.at[1]! < a.at[1]! + a.size[1]!;

  test("lays copies inside the margin, apart, and starts a new plate when one is full", () => {
    const items = [
      { key: "long", size: [200, 60] as const, copies: 4 },
      { key: "small", size: [20, 10] as const, copies: 30 },
    ];
    const [margin, gap] = [5, 4];
    const laid = plates(items, BED, margin, gap);
    expect(laid.length).toBe(2);
    expect(laid.flat().filter((p) => p.key === "long").length).toBe(4);
    expect(laid.flat().filter((p) => p.key === "small").length).toBe(30);
    for (const plate of laid) {
      const boxes = plate.map((p) => ({ at: p.at, size: items.find((i) => i.key === p.key)!.size }));
      for (const [n, box] of boxes.entries()) {
        expect(box.at[0]).toBeGreaterThanOrEqual(margin);
        expect(box.at[1]).toBeGreaterThanOrEqual(margin);
        expect(box.at[0] + box.size[0]).toBeLessThanOrEqual(BED[0] - margin);
        expect(box.at[1] + box.size[1]).toBeLessThanOrEqual(BED[1] - margin);
        for (const other of boxes.slice(0, n)) expect(overlaps({ at: box.at, size: [box.size[0] + gap, box.size[1] + gap] }, other)).toBe(false);
      }
    }
  });

  test("refuses a part bigger than the bed", () => {
    expect(() => plates([{ key: "huge", size: [300, 10], copies: 1 }], BED, 5, 4)).toThrow(/huge/);
  });
});

describe("boardCounts", () => {
  test("adds spares to joiners and pegs, and counts screws by fixing", () => {
    const drawer = small();
    const layout = layoutBoard(drawerShape(drawer.drawer)!, drawer.base as GridBase);
    expect(layout.joiners.length).toBeGreaterThan(0);
    const [joiners, pegs] = [withSpares(layout.joiners.length), withSpares(2)];
    expect(boardCounts(drawer, [layout])).toEqual({ joiners, pegs, holderScrews: 1, floorScrews: 1, latches: 0, closed: 0, variants: { [layout.variant]: { joiners, pegs } } });
    expect(withSpares(2)).toBe(3);
  });
});

describe("specSheet with a board", () => {
  test("a ply holder's sheet gives each fixing's hole, where it is, and what the holder needs", () => {
    const drawer = small();
    const layout = layoutBoard(drawerShape(drawer.drawer)!, drawer.base as GridBase);
    const fit = gridFit();
    const p = plan(drawer, BED);
    const sheet = specSheet(p, p.holders.find((h) => h.id === "board-block")!, "Small grid", { layouts: [layout], fit });
    const [x, y] = holeAt(layout, [8, 8]).map((v) => Number(v.toFixed(2)));
    expect(sheet).toContain("# Board block: ply holder spec");
    expect(sheet).toContain(`- Screw in hole [8, 8], centre at (${x}, ${y}): ${holderSide("screw", layout, fit)}.`);
  });
});

describe("exportDrawer", () => {
  test("writes a 3MF per tile, plates, the calibration print, a parts list and spec sheets", async () => {
    const drawer = small();
    const files = exportDrawer(await Module(), drawer, { bed: BED });
    const layout = layoutBoard(drawerShape(drawer.drawer)!, drawer.base as GridBase);
    const names = files.map((f) => f.name);

    expect(names.filter((n) => n.startsWith("tile-")).sort()).toEqual(layout.tiles.map((t) => `tile-${t.label}.3mf`).sort());
    expect(names).toContain("plate.3mf");
    expect(names).toContain("calibration.3mf");
    expect(names).toContain("parts.md");
    expect(names).toContain("specs/cup-cradle.md");
    expect(names).toContain("specs/board-block.md");

    // Every 3MF is a package with a model, and every copy lies on the bed.
    for (const file of files.filter((f) => f.name.endsWith(".3mf"))) {
      const { objects, items } = readModel(file.data);
      expect(items.length, file.name).toBeGreaterThan(0);
      for (const item of items) {
        const object = objects.find((o) => o.id === item.id)!;
        const [tx, ty, tz] = item.transform.slice(9);
        for (const [vx, vy, vz] of object.vertices) {
          expect(vx! + tx!).toBeGreaterThanOrEqual(0);
          expect(vy! + ty!).toBeGreaterThanOrEqual(0);
          expect(vz! + tz!).toBeGreaterThanOrEqual(-1e-3);
          expect(vx! + tx!).toBeLessThanOrEqual(BED[0]);
          expect(vy! + ty!).toBeLessThanOrEqual(BED[1]);
        }
      }
    }

    // The plate carries every bumper, the joiners and the pegs with their spares.
    const counts = boardCounts(drawer, [layout]);
    const plate = readModel(files.find((f) => f.name === "plate.3mf")!.data);
    expect(plate.items.length).toBe(layout.bumpers.length + counts.joiners + counts.pegs);

    // The parts list weighs the board in every variant.
    const parts = strFromU8(files.find((f) => f.name === "parts.md")!.data);
    for (const variant of VARIANT_NAMES) expect(parts).toMatch(new RegExp(`^\\| ${variant}( \\(this board\\))? \\| \\d+ g \\|$`, "m"));
  }, 60_000);

  test("refuses to split the calibration print over plates", async () => {
    // Every calibration part fits this bed, but not all of them at once.
    const tiny: Drawer = { ...small(), drawer: { inside: [60, 60, 40] }, base: { kind: "grid" }, holders: [] };
    const fresh = await Module();
    expect(() => exportDrawer(fresh, tiny, { bed: [120, 70, 100] })).toThrow(/calibration print takes \d+ plates/);
  }, 60_000);

  test("the parts list links a library holder and points the others at their spec sheets", async () => {
    const drawer: Drawer = {
      ...small(),
      base: { kind: "bare" },
      holders: [
        { id: "cup-posts", method: "posts", holds: ["cup"] },
        { id: "board-block", method: "ply", holds: ["board"] },
      ],
    };
    const library = { posts: { name: "Posts, 30 mm", url: "https://example.org/posts" } };
    const parts = strFromU8(exportDrawer(await Module(), drawer, { bed: BED, library }).find((f) => f.name === "parts.md")!.data);
    expect(parts).toContain("[Posts, 30 mm](https://example.org/posts)");
    expect(parts).toContain("(specs/board-block.md)");
  });
});
