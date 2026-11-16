import { type BoardLayout, type Hole } from "../grid/layout.ts";
import { type Fit } from "../grid/parameters.ts";
import type { Holder } from "../schema.ts";
export type FixBy = "screw" | "pin";
export interface Fixing {
    holder: string;
    hole: Hole;
    by: FixBy;
    /** The hole's centre on the drawer floor, in mm. */
    at: [number, number];
}
/** The holder screw, as it's sold: `4×12`. */
export declare const SCREW: string;
/** To the hundredth of a mm, for text. */
export declare const round: (mm: number) => number;
export declare function fixingsOf(holders: readonly Holder[], layout: BoardLayout): Fixing[];
/** A printed peg's diameter: smaller than the board hole by the calibrated peg fit. */
export declare const pegDiameter: (layout: BoardLayout, fit: Fit) => number;
/** What the holder needs at a fixing, in a sentence. */
export declare function holderSide(by: FixBy, layout: BoardLayout, fit: Fit): string;
