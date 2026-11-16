import { strToU8, zipSync } from "fflate";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { collect, freeAll } from "./collect.ts";
import { drawerShape } from "../drawers.ts";
import { bumperSolid, joinerSolid, pegSolid, printable, tileSolid } from "../grid/board.ts";
import { roundOne, roundTwo } from "../grid/calibration.ts";
import { boardHole, layoutBoard, type BoardLayout } from "../grid/layout.ts";
import { drawerOverlays, type Board } from "../grid/overlay.ts";
import { GRID, gridFit, VARIANT_NAMES, type Fit, type PrinterFit, type Variant } from "../grid/parameters.ts";
import { onBed, tile } from "../grid/tile.ts";
import { plan } from "../plan.ts";
import { PRINTER_PRESETS, type Drawer } from "../schema.ts";
import { hasSpecSheet, specPath, specSheet } from "../spec.ts";
import { fixingsOf } from "./fixings.ts";
import { LIBRARY, type Library } from "./library.ts";
import { partsList, type BoardCounts, type BoardSummary, type PartKind, type PrintedFile } from "./parts.ts";
import { plates, type PlateItem } from "./plates.ts";
import { to3mf, type PlacedPart } from "./threemf.ts";

// `dunnage export`: what to print for the base, and what to fetch or build for the holders.

export interface ExportOptions {
  /** The printer's bed. Default: the Bambu P1S's. */
  bed?: readonly [number, number, number];
  /** The printer's grid fits, over the calibrated defaults. */
  fit?: PrinterFit;
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
/** The sample tile each variant's weight is scaled by, in holes a side. */
const SAMPLE = 6;

export const withSpares = (n: number) => Math.ceil(n * (1 + SPARES));

/** What a grid board, or a pegboard's overlays, take besides tiles and bumpers. */
export function boardCounts(drawer: Drawer, all: readonly Board[]): BoardCounts {
  const holders = drawer.holders ?? [];
  const fixings = fixingsOf(holders, all);
  const pins = fixings.filter((fixing) => fixing.by === "pin").length;
  const sum = (count: (layout: Board) => number) => all.reduce((total, layout) => total + count(layout), 0);
  // Joiners and pegs are sized to a variant's bosses and holes, so each variant's are counted apart.
  const variants: BoardCounts["variants"] = {};
  for (const variant of new Set(all.map((layout) => layout.variant))) {
    const own = all.filter((layout) => layout.variant === variant);
    const ownPins = fixingsOf(holders, own).filter((fixing) => fixing.by === "pin").length;
    variants[variant] = { joiners: withSpares(own.reduce((total, layout) => total + layout.joiners.length, 0)), pegs: withSpares(ownPins) };
  }
  return {
    joiners: Object.values(variants).reduce((total, v) => total + v.joiners, 0),
    pegs: Object.values(variants).reduce((total, v) => total + v.pegs, 0),
    holderScrews: fixings.length - pins,
    floorScrews: sum((layout) => layout.countersinks.length),
    strips: sum((layout) => (layout.kind === "overlay" ? layout.bumpers.length : 0)),
    stripPegs: sum((layout) => (layout.kind === "overlay" ? layout.bumpers.reduce((n, b) => n + (b.pegs?.length ?? 0), 0) : 0)),
    variants,
  };
}

interface Solid {
  key: string;
  kind: PartKind;
  solid: Manifold;
  copies: number;
}

/**
 * Builds every file `dunnage export` writes. It takes over `wasm`: every manifold made on it is
 * freed once its part is written, so the caller keeps none. Throws if the board can't be laid out
 * (check the drawer first), or if the calibration print doesn't fit on one plate.
 */
export function exportDrawer(wasm: ManifoldToplevel, drawer: Drawer, options: ExportOptions = {}): ExportedFile[] {
  collect(wasm);
  const bed = options.bed ?? PRINTER_PRESETS["bambu-p1s"];
  const fit = gridFit(options.fit);
  const say = options.progress ?? (() => {});
  const name = drawer.name ?? "Drawer";
  const files: ExportedFile[] = [];

  /** Packs parts onto plates and writes a 3MF per plate, then frees them. */
  const plated = (stem: string, title: string, build: () => Solid[], one = false): PrintedFile[] => freed(() => {
    const parts = build();
    const items: PlateItem[] = parts.map(({ key, solid, copies }) => {
      const { max } = solid.boundingBox();
      return { key, size: [max[0], max[1]], copies };
    });
    const laid = plates(items, bed, PLATE_MARGIN, PLATE_GAP);
    if (one && laid.length > 1) throw new Error(`${title} takes ${laid.length} plates on a ${bed[0]} × ${bed[1]} mm bed, and must print as one`);
    return laid.map((plate, n) => {
      const file = laid.length === 1 ? `${stem}.3mf` : `${stem}-${n + 1}.3mf`;
      const copiesOf = (key: string) => plate.filter((placement) => placement.key === key);
      const placed: PlacedPart[] = parts
        .filter(({ key }) => copiesOf(key).length > 0)
        .map(({ key, solid }) => ({ name: key, mesh: solid.getMesh(), at: copiesOf(key).map(({ at }) => [at[0], at[1], 0] as const) }));
      files.push({ name: file, data: to3mf(placed, `${name}: ${title}`) });
      const kinds: PrintedFile["kinds"] = {};
      let grams = 0;
      for (const { key, kind, solid } of parts) {
        const count = copiesOf(key).length;
        if (count > 0) kinds[kind] = (kinds[kind] ?? 0) + count;
        grams += weight(solid) * count;
      }
      return { file, kinds, grams };
    });
  });

  let board: BoardSummary | undefined;
  const layouts: Board[] = drawer.base?.kind === "grid" ? [layoutBoard(drawerShape(drawer.drawer)!, drawer.base, { bed, fit })] : drawerOverlays(drawer, { bed, fit });
  if (layouts.length > 0) {
    const problems = layouts.flatMap((layout) => layout.problems);
    if (problems.length > 0) throw new Error(problems.map((problem) => `${problem.at.join(".")}: ${problem.message}`).join("\n"));
    const counts = boardCounts(drawer, layouts);
    const printed: PrintedFile[] = [];

    for (const layout of layouts) {
      const id = layout.kind === "overlay" ? layout.id : undefined;
      for (const boardTile of layout.tiles) {
        const label = id ? `overlay ${id} tile ${boardTile.label}` : `tile ${boardTile.label}`;
        say(label);
        printed.push(freed(() => {
          const solid = printable(tileSolid(wasm, layout, boardTile, fit));
          const { max } = solid.boundingBox();
          const file = `${id ? `overlay-${id}-` : ""}tile-${boardTile.label}.3mf`;
          const at = [(bed[0] - max[0]) / 2, (bed[1] - max[1]) / 2, 0] as const;
          files.push({ name: file, data: to3mf([{ name: label, mesh: solid.getMesh(), at: [at] }], `${name}: ${label}`) });
          return { file, kinds: { tile: 1 }, grams: weight(solid), tile: { label: boardTile.label, size: boardTile.size, ...(id ? { overlay: id } : {}) } };
        }));
      }
    }

    const overlaid = layouts.some((layout) => layout.kind === "overlay");
    const extras = overlaid ? "edge strips, joiners and pegs" : "bumpers, joiners and pegs";
    say(extras);
    const variants = Object.entries(counts.variants) as [Variant, { joiners: number; pegs: number }][];
    const named = (key: string, variant: Variant) => (variants.length > 1 ? `${key} ${variant}` : key);
    printed.push(...plated("plate", extras, () => [
      ...layouts.flatMap((layout) => layout.bumpers.map((bumper): Solid => {
        const key = layout.kind === "overlay" ? `strip ${layout.id} ${bumper.side} ${bumper.index + 1}` : `bumper ${bumper.side} ${bumper.index + 1}`;
        return { key, kind: layout.kind === "overlay" ? "strip" : "bumper", solid: printable(bumperSolid(wasm, layout, bumper, fit)), copies: 1 };
      })),
      ...variants.flatMap(([variant, own]): Solid[] => {
        const layout = layouts.find((l) => l.variant === variant)!;
        return [
          { key: named("joiner", variant), kind: "joiner", solid: onBed(joinerSolid(wasm, layout, fit)), copies: own.joiners },
          { key: named("peg", variant), kind: "peg", solid: onBed(pegSolid(wasm, layout, fit)), copies: own.pegs },
        ];
      }),
    ].filter((part) => part.copies > 0)));

    say("calibration print");
    const choices = [...new Set(layouts.map((layout) => layout.variant))].map((variant) => ({ variant, hole: boardHole(variant, fit), skin: GRID.face }));
    const calibration = plated("calibration", "calibration print", () =>
      [...roundOne(wasm), ...roundTwo(wasm, choices)]
        .map((part): Solid => ({ key: part.name, kind: "calibration", solid: onBed(part.solid), copies: part.copies })), true);

    say("weights");
    // Weights by variant scale one variant's tiles, so they're left out when boards differ.
    const weights = choices.length === 1 ? variantWeights(wasm, layouts[0]!, fit, printed) : [];
    board = { layouts, counts, printed: [...printed, ...calibration], weights };
  }

  const drawerPlan = plan(drawer, bed, fit);
  const sheetBoard = board ? { layouts: board.layouts, fit } : undefined;
  for (const holder of drawerPlan.holders.filter((holder) => hasSpecSheet(holder.method))) {
    files.push({ name: specPath(holder.id), data: strToU8(specSheet(drawerPlan, holder, name, sheetBoard)) });
  }
  const list = partsList({ name, bed, plan: drawerPlan, fit, library: options.library ?? LIBRARY, board, spares: SPARES, density: PETG });
  files.push({ name: "parts.md", data: strToU8(list) });
  return files;
}

/** The board's weight in every variant: its own tiles scaled by a sample tile's volume in each, plus the rest. */
function variantWeights(wasm: ManifoldToplevel, layout: BoardLayout, fit: Fit, printed: PrintedFile[]): BoardSummary["weights"] {
  const tiles = printed.filter((row) => row.tile).reduce((sum, row) => sum + row.grams, 0);
  const rest = printed.filter((row) => !row.tile).reduce((sum, row) => sum + row.grams, 0);
  const sample = (variant: (typeof VARIANT_NAMES)[number]) => freed(() => tile(wasm, { variant, nx: SAMPLE, ny: SAMPLE, hole: boardHole(variant, fit), skin: GRID.face }).volume());
  const own = sample(layout.variant);
  return VARIANT_NAMES.map((variant) => ({ variant, grams: (tiles * sample(variant)) / own + rest }));
}

/** Runs a step, then frees every manifold made since the last one. */
function freed<T>(step: () => T): T {
  try {
    return step();
  } finally {
    freeAll();
  }
}

/** Every exported file in one zip, for a browser to download. */
export function zipExport(files: readonly ExportedFile[]): Uint8Array {
  // 3MFs are zips already, so they're stored rather than squeezed again.
  return zipSync(Object.fromEntries(files.map((file) => [file.name, [file.data, { level: file.name.endsWith(".3mf") ? 0 : 6 }]])));
}

const weight = (solid: Manifold) => (solid.volume() / 1000) * PETG;
