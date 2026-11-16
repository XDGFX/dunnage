import { boardHole, holeAt, type BoardLayout, type Hole } from "../grid/layout.ts";
import { GRID, type Fit } from "../grid/parameters.ts";
import type { Holder } from "../schema.ts";

// How a holder is fixed to the grid, hole by hole, and what its own side needs: dunnage lists
// these and the library part carries them out.

export type FixBy = "screw" | "pin";

export interface Fixing {
  holder: string;
  hole: Hole;
  by: FixBy;
  /** The hole's centre on the drawer floor, in mm. */
  at: [number, number];
}

/** The holder screw, as it's sold: `4×12`. */
export const SCREW = `${GRID.screw.diameter}×${GRID.screw.length}`;

/** To the hundredth of a mm, for text. */
export const round = (mm: number) => Number(mm.toFixed(2));

export function fixingsOf(holders: readonly Holder[], layout: BoardLayout): Fixing[] {
  return holders.flatMap((holder) => (holder.fix ?? []).map(({ hole, by }) => ({ holder: holder.id, hole, by, at: holeAt(layout, hole) })));
}

/** A printed peg's diameter: smaller than the board hole by the calibrated peg fit. */
export const pegDiameter = (layout: BoardLayout, fit: Fit) => boardHole(layout.variant, fit) - fit.peg;

/** What the holder needs at a fixing, in a sentence. */
export function holderSide(by: FixBy, layout: BoardLayout, fit: Fit): string {
  if (by === "screw") return `a ${GRID.screw.clearance} mm clearance hole through a flange at least ${GRID.screw.flange} mm thick, for a ${SCREW} wood screw`;
  const peg = pegDiameter(layout, fit);
  return `a ${round(peg + fit.peg_fixed)} mm hole that a printed ${round(peg)} mm peg presses into`;
}
