import { boardHole, type BoardLayout } from "../grid/layout.ts";
import { GRID, type Fit, type Variant } from "../grid/parameters.ts";
import { METHODS, pretty, type Plan } from "../plan.ts";
import { hasSpecSheet, specPath } from "../spec.ts";
import { fixingsOf, holderSide, SCREW } from "./fixings.ts";
import type { Library } from "./library.ts";

// The parts list: what to print, what to buy, and where each holder comes from.

export type PartKind = "tile" | "bumper" | "joiner" | "peg" | "calibration";

export interface PrintedFile {
  file: string;
  /** How many of each kind of part it carries. */
  kinds: Partial<Record<PartKind, number>>;
  grams: number;
  /** A tile's label and size in holes, for its row. */
  tile?: { label: string; size: [number, number] };
}

export interface BoardCounts {
  joiners: number;
  pegs: number;
  holderScrews: number;
  floorScrews: number;
}

export interface BoardSummary {
  layout: BoardLayout;
  counts: BoardCounts;
  printed: PrintedFile[];
  /** The board's estimated weight in each variant. */
  weights: { variant: Variant; grams: number }[];
}

export interface PartsListInput {
  name: string;
  bed: readonly [number, number, number];
  plan: Plan;
  fit: Fit;
  library: Library;
  board?: BoardSummary;
  /** Joiners' and pegs' spares, as a share. */
  spares: number;
  /** g/cm³. */
  density: number;
}

const NAMES: Record<PartKind, [string, string]> = {
  tile: ["tile", "tiles"],
  bumper: ["bumper", "bumpers"],
  joiner: ["joiner", "joiners"],
  peg: ["peg", "pegs"],
  calibration: ["calibration part", "calibration parts"],
};

function describe(printed: PrintedFile): string {
  if (printed.tile) return `Tile ${printed.tile.label}, ${printed.tile.size[0]} × ${printed.tile.size[1]} holes`;
  if (printed.kinds.calibration) return "Calibration print (docs/grid-calibration.md): screw pilot holes, boss walls, joiner and peg fits";
  return (Object.entries(printed.kinds) as [PartKind, number][]).map(([kind, count]) => `${count} ${NAMES[kind][count === 1 ? 0 : 1]}`).join(", ");
}

export function partsList({ name, bed, plan: drawerPlan, fit, library, board, spares, density }: PartsListInput): string {
  const lines = [`# ${name}: parts list`, ""];
  if (board) {
    const { layout, counts, printed, weights } = board;
    lines.push(
      `Grid board, ${layout.variant}, ${layout.holes[0]} × ${layout.holes[1]} holes, for a ${bed[0]} × ${bed[1]} mm bed. Print in PETG without supports, as plated. Weights are estimates at ${density} g/cm³.`,
      "",
      "## Printed",
      "",
      "| File | What | Est. weight |",
      "|---|---|---|",
      ...printed.map((row) => `| \`${row.file}\` | ${describe(row)} | ${Math.round(row.grams)} g |`),
      "",
      `Joiners and pegs include ${Math.round(spares * 100)}% spares, rounded up.`,
      "",
      "## Board weight by variant",
      "",
      "| Variant | Est. weight |",
      "|---|---|",
      ...weights.map(({ variant, grams }) => `| ${variant}${variant === layout.variant ? " (this board)" : ""} | ${Math.round(grams)} g |`),
      "",
      "The other variants are scaled from this board's tiles by the volume of a sample tile in each.",
      "",
      "## Hardware",
      "",
      `- ${counts.holderScrews} × ${SCREW} wood screws (or M${SCREW} machine screws), to fix holders.`,
    );
    if (counts.floorScrews > 0) lines.push(`- ${counts.floorScrews} × countersunk screws to fix the board to the drawer floor, heads up to ${GRID.countersink.head} mm.`);
  }
  lines.push("", "## Holders", "", "| Holder | Method | Fixings | Get it |", "|---|---|---|---|");
  for (const holder of drawerPlan.holders) {
    const fixings = board ? fixingsOf([holder.source], board.layout) : [];
    const fixed = fixings.map((fixing) => `${fixing.by} in [${fixing.hole.join(", ")}]`).join(", ") || "none";
    const part = library[holder.method];
    const get = hasSpecSheet(holder.method) ? `build it: [\`${specPath(holder.id)}\`](${specPath(holder.id)})`
      : !METHODS[holder.method].printed ? "nothing to print"
      : part ? `[${part.name}](${part.url})`
      : "not in the library yet";
    lines.push(`| ${pretty(holder.id)} | ${METHODS[holder.method].name} | ${fixed} | ${get} |`);
  }
  if (board && drawerPlan.holders.some((holder) => holder.source.fix?.length)) {
    lines.push(
      "",
      `A holder fixed by screw needs ${holderSide("screw", board.layout, fit)}.`,
      `One fixed by pin needs ${holderSide("pin", board.layout, fit)}; the peg stays in the holder and lifts out of the board's ${boardHole(board.layout.variant, fit)} mm hole.`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
