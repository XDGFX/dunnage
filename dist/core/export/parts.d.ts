import { type BoardLayout } from "../grid/layout.ts";
import { type Fit, type Variant } from "../grid/parameters.ts";
import { type Plan } from "../plan.ts";
import type { Library } from "./library.ts";
export type PartKind = "tile" | "bumper" | "joiner" | "peg" | "calibration";
export interface PrintedFile {
    file: string;
    /** How many of each kind of part it carries. */
    kinds: Partial<Record<PartKind, number>>;
    grams: number;
    /** A tile's label and size in holes, for its row. */
    tile?: {
        label: string;
        size: [number, number];
    };
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
    weights: {
        variant: Variant;
        grams: number;
    }[];
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
export declare function partsList({ name, bed, plan: drawerPlan, fit, library, board, spares, density }: PartsListInput): string;
