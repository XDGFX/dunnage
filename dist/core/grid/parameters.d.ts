import parameters from "./parameters.json";
export type Variant = keyof typeof parameters.variants;
/** Calibrated fits: what a printer file's `fit:` sets, and the defaults it falls back to. */
export interface Fit {
    /** Board hole diameter, by variant. */
    grid_hole: Partial<Record<Variant, number>>;
    /** How much smaller a peg is than the board hole, across the diameter. */
    peg: number;
    /** How much smaller a peg is than a holder's hole, for a peg that stays put. */
    peg_fixed: number;
    /** Radial clearance of a joiner's rings over the bosses. */
    joiner: number;
}
export declare const GRID: Omit<typeof parameters, "variant" | "fit"> & {
    variant: Variant;
    fit: Fit;
};
export declare const VARIANT_NAMES: Variant[];
/** The printer's fits over the calibrated defaults, a variant's hole size merged rather than replaced. */
export declare function gridFit(printer?: Partial<Fit>): Fit;
