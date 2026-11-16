import { boardHole, holeAt } from "../grid/layout.js";
import { GRID } from "../grid/parameters.js";
/** The holder screw, as it's sold: `4×12`. */
export const SCREW = `${GRID.screw.diameter}×${GRID.screw.length}`;
/** To the hundredth of a mm, for text. */
export const round = (mm) => Number(mm.toFixed(2));
export function fixingsOf(holders, layout) {
    return holders.flatMap((holder) => (holder.fix ?? []).map(({ hole, by }) => ({ holder: holder.id, hole, by, at: holeAt(layout, hole) })));
}
/** A printed peg's diameter: smaller than the board hole by the calibrated peg fit. */
export const pegDiameter = (layout, fit) => boardHole(layout.variant, fit) - fit.peg;
/** What the holder needs at a fixing, in a sentence. */
export function holderSide(by, layout, fit) {
    if (by === "screw")
        return `a ${GRID.screw.clearance} mm clearance hole through a flange at least ${GRID.screw.flange} mm thick, for a ${SCREW} wood screw`;
    const peg = pegDiameter(layout, fit);
    return `a ${round(peg + fit.peg_fixed)} mm hole that a printed ${round(peg)} mm peg presses into`;
}
