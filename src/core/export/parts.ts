import { boardHole } from "../grid/layout.ts";
import type { Board } from "../grid/overlay.ts";
import { GRID, type Fit, type Variant } from "../grid/parameters.ts";
import { METHODS, pretty, type Plan } from "../plan.ts";
import { hasSpecSheet, specPath } from "../spec.ts";
import { boardFor, fixingsOf, holderSide, SCREW } from "./fixings.ts";
import type { Library } from "./library.ts";

// The parts list: what to print, what to buy, and where each holder comes from.

export type PartKind = "tile" | "bumper" | "joiner" | "peg" | "latch" | "calibration";

export interface PrintedFile {
  file: string;
  /** How many of each kind of part it carries. */
  kinds: Partial<Record<PartKind, number>>;
  grams: number;
  /** A tile's label and size in holes, for its row. */
  tile?: { label: string; size: [number, number]; overlay?: string };
}

export interface BoardCounts {
  joiners: number;
  pegs: number;
  holderScrews: number;
  floorScrews: number;
  /** An overlay's spring latches, spares included. */
  latches: number;
  /** Holes closed over a latch's socket. */
  closed: number;
  /** Joiners and pegs by the variant they're sized for, spares included. */
  variants: Partial<Record<Variant, { joiners: number; pegs: number }>>;
}

export interface BoardSummary {
  /** The grid board, or each overlay on a pegboard. */
  layouts: Board[];
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
  latch: ["latch", "latches"],
  calibration: ["calibration part", "calibration parts"],
};

function describe(printed: PrintedFile): string {
  if (printed.tile) return `${printed.tile.overlay ? `Overlay ${printed.tile.overlay}, tile` : "Tile"} ${printed.tile.label}, ${printed.tile.size[0]} × ${printed.tile.size[1]} holes`;
  if (printed.kinds.calibration) return "Calibration print (docs/grid-calibration.md): screw pilot holes, boss walls, joiner and peg fits, and the latch strip when there are overlays";
  return (Object.entries(printed.kinds) as [PartKind, number][]).map(([kind, count]) => `${count} ${NAMES[kind][count === 1 ? 0 : 1]}`).join(", ");
}

/** A line saying what a board or overlay is. */
function boardLine(layout: Board): string {
  const size = `${layout.variant}, ${layout.holes[0]} × ${layout.holes[1]} holes`;
  return layout.kind === "overlay" ? `- Overlay ${layout.id}: ${size}, ${layout.latches.length} latches, ${layout.closed.length} holes closed over their sockets.` : `Grid board, ${size}.`;
}

export function partsList({ name, bed, plan: drawerPlan, fit, library, board, spares, density }: PartsListInput): string {
  const lines = [`# ${name}: parts list`, ""];
  if (board) {
    const { layouts, counts, printed, weights } = board;
    const overlaid = layouts.some((layout) => layout.kind === "overlay");
    lines.push(
      ...(overlaid ? ["Grid overlays on the UPPDATERA pegboard:", "", ...layouts.map(boardLine), ""] : [boardLine(layouts[0]!)]),
      `For a ${bed[0]} × ${bed[1]} mm bed. Print in PETG without supports, as plated. Weights are estimates at ${density} g/cm³.`,
      "",
      "## Printed",
      "",
      "| File | What | Est. weight |",
      "|---|---|---|",
      ...printed.map((row) => `| \`${row.file}\` | ${describe(row)} | ${Math.round(row.grams)} g |`),
      "",
      `${overlaid ? "Joiners, pegs and latches" : "Joiners and pegs"} include ${Math.round(spares * 100)}% spares, rounded up.`,
    );
    if (overlaid) {
      lines.push(
        "",
        "## Latches",
        "",
        `- ${counts.latches} spring latches. Press one into each socket under the tiles, clip the tiles together, lay the overlay roughly in place and press it down.`,
        `- ${counts.closed} holes are closed over the latches' sockets: a holder can't be screwed or pinned there.`,
      );
    }
    if (weights.length > 0) {
      lines.push(
        "",
        "## Board weight by variant",
        "",
        "| Variant | Est. weight |",
        "|---|---|",
        ...weights.map(({ variant, grams }) => `| ${variant}${variant === layouts[0]!.variant ? " (this board)" : ""} | ${Math.round(grams)} g |`),
        "",
        "The other variants are scaled from this board's tiles by the volume of a sample tile in each.",
      );
    }
    lines.push("", "## Hardware", "", `- ${counts.holderScrews} × ${SCREW} wood screws (or M${SCREW} machine screws), to fix holders.`);
    if (counts.floorScrews > 0) lines.push(`- ${counts.floorScrews} × countersunk screws to fix the board to the drawer floor, heads up to ${GRID.countersink.head} mm.`);
  }
  lines.push("", "## Holders", "", "| Holder | Method | Fixings | Get it |", "|---|---|---|---|");
  for (const holder of drawerPlan.holders) {
    const fixings = board ? fixingsOf([holder.source], board.layouts) : [];
    const where = holder.source.on ? ` of overlay ${holder.source.on}` : "";
    const fixed = fixings.map((fixing) => `${fixing.by} in [${fixing.hole.join(", ")}]${where}`).join(", ") || "none";
    const part = library[holder.method];
    const get = hasSpecSheet(holder.method) ? `build it: [\`${specPath(holder.id)}\`](${specPath(holder.id)})`
      : !METHODS[holder.method].printed ? "nothing to print"
      : part ? `[${part.name}](${part.url})`
      : "not in the library yet";
    lines.push(`| ${pretty(holder.id)} | ${METHODS[holder.method].name} | ${fixed} | ${get} |`);
  }
  const pinned = board ? drawerPlan.holders.map((holder) => boardFor(board.layouts, holder.source)).find((layout, k) => layout && drawerPlan.holders[k]!.source.fix?.length) : undefined;
  if (pinned) {
    lines.push(
      "",
      `A holder fixed by screw needs ${holderSide("screw", pinned, fit)}.`,
      `One fixed by pin needs ${holderSide("pin", pinned, fit)}; the peg stays in the holder and lifts out of the board's ${boardHole(pinned.variant, fit)} mm hole.`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
