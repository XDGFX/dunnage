import { boardHole } from "../grid/layout.js";
import { GRID } from "../grid/parameters.js";
import { METHODS, pretty } from "../plan.js";
import { hasSpecSheet, specPath } from "../spec.js";
import { fixingsOf, holderSide, SCREW } from "./fixings.js";
const NAMES = {
    tile: ["tile", "tiles"],
    bumper: ["bumper", "bumpers"],
    joiner: ["joiner", "joiners"],
    peg: ["peg", "pegs"],
    calibration: ["calibration part", "calibration parts"],
};
function describe(printed) {
    if (printed.tile)
        return `Tile ${printed.tile.label}, ${printed.tile.size[0]} × ${printed.tile.size[1]} holes`;
    if (printed.kinds.calibration)
        return "Calibration print (docs/grid-calibration.md): screw pilot holes, boss walls, joiner and peg fits";
    return Object.entries(printed.kinds).map(([kind, count]) => `${count} ${NAMES[kind][count === 1 ? 0 : 1]}`).join(", ");
}
export function partsList({ name, bed, plan: drawerPlan, fit, library, board, spares, density }) {
    const lines = [`# ${name}: parts list`, ""];
    if (board) {
        const { layout, counts, printed, weights } = board;
        lines.push(`Grid board, ${layout.variant}, ${layout.holes[0]} × ${layout.holes[1]} holes, for a ${bed[0]} × ${bed[1]} mm bed. Print in PETG without supports, as plated. Weights are estimates at ${density} g/cm³.`, "", "## Printed", "", "| File | What | Est. weight |", "|---|---|---|", ...printed.map((row) => `| \`${row.file}\` | ${describe(row)} | ${Math.round(row.grams)} g |`), "", `Joiners and pegs include ${Math.round(spares * 100)}% spares, rounded up.`, "", "## Board weight by variant", "", "| Variant | Est. weight |", "|---|---|", ...weights.map(({ variant, grams }) => `| ${variant}${variant === layout.variant ? " (this board)" : ""} | ${Math.round(grams)} g |`), "", "The other variants are scaled from this board's tiles by the volume of a sample tile in each.", "", "## Hardware", "", `- ${counts.holderScrews} × ${SCREW} wood screws (or M${SCREW} machine screws), to fix holders.`);
        if (counts.floorScrews > 0)
            lines.push(`- ${counts.floorScrews} × countersunk screws to fix the board to the drawer floor, heads up to ${GRID.countersink.head} mm.`);
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
        lines.push("", `A holder fixed by screw needs ${holderSide("screw", board.layout, fit)}.`, `One fixed by pin needs ${holderSide("pin", board.layout, fit)}; the peg stays in the holder and lifts out of the board's ${boardHole(board.layout.variant, fit)} mm hole.`);
    }
    lines.push("");
    return lines.join("\n");
}
