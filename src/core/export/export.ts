import { strToU8, zipSync } from "fflate";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { drawerShape } from "../drawers.ts";
import { joinerSolid, pegSolid, printable, bumperSolid, tileSolid } from "../grid/board.ts";
import { roundOne, roundTwo, type Part } from "../grid/calibration.ts";
import { boardHole, layoutBoard, type BoardLayout } from "../grid/layout.ts";
import { GRID, gridFit, type Fit } from "../grid/parameters.ts";
import { onBed } from "../grid/tile.ts";
import { METHODS, plan, pretty } from "../plan.ts";
import { PRINTER_PRESETS, type Drawer } from "../schema.ts";
import { specSheet } from "../spec.ts";
import { fixingsOf, holderSide } from "./fixings.ts";
import { LIBRARY, type Library } from "./library.ts";
import { plates, type PlateItem } from "./plates.ts";
import { to3mf, type PlacedPart } from "./threemf.ts";

// `dunnage export`: what to print for the base, and what to fetch or build for the holders (#6 §9).

export interface ExportOptions {
  /** The printer's bed. Default: the Bambu P1S's. */
  bed?: readonly [number, number, number];
  /** The printer's grid fits, over the calibrated defaults. */
  fit?: Partial<Fit>;
  library?: Library;
  /** Called before each slow step, with what it is. */
  progress?: (step: string) => void;
}

export interface ExportedFile {
  /** A path relative to the export folder, such as `specs/cradle.md`. */
  name: string;
  data: Uint8Array;
}

/** Spare joiners and pegs, as a share of those needed, rounded up. */
export const SPARES = 0.1;
/** Space between parts on a plate, and between them and the bed's edge, in mm. */
export const PLATE_GAP = 4;
const PLATE_MARGIN = GRID.tile.bed_margin / 2;
/** PETG, g/cm³, for a rough weight before the scales say otherwise. */
const PETG = 1.27;

export const withSpares = (n: number) => Math.ceil(n * (1 + SPARES));

/** What a grid board takes besides tiles and bumpers. */
export function boardCounts(drawer: Drawer, layout: BoardLayout) {
  const fixings = fixingsOf(drawer.holders ?? [], layout);
  const pins = fixings.filter((f) => f.by === "pin").length;
  return {
    joiners: withSpares(layout.joiners.length),
    pegs: withSpares(pins),
    holderScrews: fixings.length - pins,
    floorScrews: layout.countersinks.length,
  };
}

/**
 * Builds every file `dunnage export` writes, with `manifold` making a fresh, set-up manifold-3d
 * instance each time it's called. Throws if the board can't be laid out; check the drawer first.
 */
export async function exportDrawer(manifold: () => Promise<ManifoldToplevel>, drawer: Drawer, options: ExportOptions = {}): Promise<ExportedFile[]> {
  const bed = options.bed ?? PRINTER_PRESETS["bambu-p1s"];
  const fit = gridFit(options.fit);
  const say = options.progress ?? (() => {});
  const name = drawer.name ?? "Drawer";
  const files: ExportedFile[] = [];
  const printed: { file: string; what: string; grams: number }[] = [];

  /** Packs parts onto plates and writes one 3MF per plate. */
  const plated = (stem: string, title: string, parts: { key: string; solid: Manifold; copies: number }[]) => {
    const items: PlateItem[] = parts.map(({ key, solid, copies }) => {
      const { max } = solid.boundingBox();
      return { key, size: [max[0], max[1]], copies };
    });
    const laid = plates(items, bed, PLATE_MARGIN, PLATE_GAP);
    return laid.map((plate, n) => {
      const file = laid.length === 1 ? `${stem}.3mf` : `${stem}-${n + 1}.3mf`;
      const placed: PlacedPart[] = parts
        .map(({ key, solid }) => ({ name: key, mesh: solid.getMesh(), at: plate.filter((p) => p.key === key).map((p) => [p.at[0], p.at[1], 0] as const) }))
        .filter((part) => part.at.length > 0);
      files.push({ name: file, data: to3mf(placed, `${name}: ${title}`) });
      const grams = parts.reduce((sum, { key, solid }) => sum + weight(solid) * plate.filter((p) => p.key === key).length, 0);
      const counts = parts.map(({ key }) => [key, plate.filter((p) => p.key === key).length] as const).filter(([, c]) => c > 0);
      return { file, counts, grams };
    });
  };

  const base = drawer.base?.kind === "grid" ? drawer.base : undefined;
  let layout: BoardLayout | undefined;
  let counts: ReturnType<typeof boardCounts> | undefined;
  if (base) {
    layout = layoutBoard(drawerShape(drawer.drawer)!, base, { bed, fit });
    if (layout.problems.length > 0) throw new Error(layout.problems.map((p) => `${p.at.join(".")}: ${p.message}`).join("\n"));
    counts = boardCounts(drawer, layout);

    for (const t of layout.tiles) {
      say(`tile ${t.label}`);
      // The grid code doesn't free what it makes along the way, so each tile gets its own WASM heap.
      const solid = printable(tileSolid(await manifold(), layout, t, fit));
      const { max } = solid.boundingBox();
      const file = `tile-${t.label}.3mf`;
      const at = [(bed[0] - max[0]) / 2, (bed[1] - max[1]) / 2, 0] as const;
      files.push({ name: file, data: to3mf([{ name: `tile ${t.label}`, mesh: solid.getMesh(), at: [at] }], `${name}: tile ${t.label}`) });
      printed.push({ file, what: `Tile ${t.label}, ${t.size[0]} × ${t.size[1]} holes`, grams: weight(solid) });
    }
    const wasm = await manifold();

    say("bumpers, joiners and pegs");
    const parts = [
      ...layout.bumpers.map((b) => ({ key: `bumper ${b.side} ${b.index + 1}`, solid: printable(bumperSolid(wasm, layout!, b, fit)), copies: 1 })),
      { key: "joiner", solid: onBed(joinerSolid(wasm, layout, fit)), copies: counts.joiners },
      { key: "peg", solid: onBed(pegSolid(wasm, layout, fit)), copies: counts.pegs },
    ].filter((part) => part.copies > 0);
    for (const plate of plated("plate", "bumpers, joiners and pegs", parts)) {
      const tally = (key: string) => plate.counts.filter(([k]) => k === key || k.startsWith(`${key} `)).reduce((sum, [, c]) => sum + c, 0);
      const what = [["bumper", "bumpers"], ["joiner", "joiners"], ["peg", "pegs"]]
        .map(([key, plural]) => [tally(key!), plural] as const)
        .filter(([c]) => c > 0)
        .map(([c, plural]) => `${c} ${plural}`)
        .join(", ");
      printed.push({ file: plate.file, what, grams: plate.grams });
    }

    say("calibration print");
    const choice = { variant: layout.variant, hole: boardHole(layout.variant, fit), skin: GRID.face };
    const calibration: Part[] = [...roundOne(wasm), ...roundTwo(wasm, [choice])];
    for (const plate of plated("calibration", "calibration print", calibration.map((p) => ({ key: p.name, solid: onBed(p.solid), copies: p.copies })))) {
      printed.push({ file: plate.file, what: "Calibration print (docs/grid-calibration.md): screw pilot holes, boss walls, joiner and peg fits", grams: plate.grams });
    }
  }

  const p = plan(drawer, bed);
  const board = layout ? { layout, fit } : undefined;
  const sheets = p.holders.filter((h) => h.method === "custom" || h.method === "ply");
  for (const h of sheets) files.push({ name: `specs/${h.id}.md`, data: strToU8(specSheet(p, h, name, board)) });

  const library = options.library ?? LIBRARY;
  const lines = [`# ${name}: parts list`, ""];
  if (layout && counts) {
    const board = printed.filter((row) => !row.file.startsWith("calibration")).reduce((sum, row) => sum + row.grams, 0);
    lines.push(
      `Grid board, ${layout.variant}, ${layout.holes[0]} × ${layout.holes[1]} holes, for a ${bed[0]} × ${bed[1]} mm bed. Print in PETG without supports, as plated. Weights are estimates at ${PETG} g/cm³.`,
      "",
      "## Printed",
      "",
      "| File | What | Est. weight |",
      "|---|---|---|",
      ...printed.map((row) => `| \`${row.file}\` | ${row.what} | ${Math.round(row.grams)} g |`),
      "",
      `The board weighs about ${Math.round(board)} g. Joiners and pegs include ${Math.round(SPARES * 100)}% spares, rounded up.`,
      "",
      "## Hardware",
      "",
      `- ${counts.holderScrews} × 4×12 wood screws (or M4×12 machine screws), to fix holders.`,
    );
    if (counts.floorScrews > 0) lines.push(`- ${counts.floorScrews} × countersunk screws to fix the board to the drawer floor, heads up to ${GRID.countersink.head} mm.`);
  }
  lines.push("", "## Holders", "", "| Holder | Method | Fixings | Get it |", "|---|---|---|---|");
  for (const h of p.holders) {
    const fixings = layout ? fixingsOf([h.source], layout) : [];
    const fixed = fixings.map((f) => `${f.by} in [${f.hole.join(", ")}]`).join(", ") || "none";
    const part = library[h.method];
    const get =
      h.method === "custom" || h.method === "ply" ? `build it: [\`specs/${h.id}.md\`](specs/${h.id}.md)`
      : !METHODS[h.method].printed ? "nothing to print"
      : part ? `[${part.name}](${part.url})`
      : "not in the library yet";
    lines.push(`| ${pretty(h.id)} | ${METHODS[h.method].name} | ${fixed} | ${get} |`);
  }
  if (layout && p.holders.some((h) => h.source.fix?.length)) {
    lines.push(
      "",
      `A holder fixed by screw needs ${holderSide("screw", layout, fit)}.`,
      `One fixed by pin needs ${holderSide("pin", layout, fit)}; the peg stays in the holder and lifts out of the board's ${boardHole(layout.variant, fit)} mm hole.`,
    );
  }
  lines.push("");
  files.push({ name: "parts.md", data: strToU8(lines.join("\n")) });
  return files;
}

/** Every exported file in one zip, for a browser to download. */
export function zipExport(files: readonly ExportedFile[]): Uint8Array {
  // 3MFs are zips already, so they're stored rather than squeezed again.
  return zipSync(Object.fromEntries(files.map((f) => [f.name, [f.data, { level: f.name.endsWith(".3mf") ? 0 : 6 }]])));
}

const weight = (solid: Manifold) => (solid.volume() / 1000) * PETG;
