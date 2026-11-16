import parameters from "./parameters.json" with { type: "json" };
export const GRID = parameters;
export const VARIANT_NAMES = Object.keys(GRID.variants);
/** The printer's fits over the calibrated defaults, a variant's hole size merged rather than replaced. */
export function gridFit(printer) {
    return { ...GRID.fit, ...printer, grid_hole: { ...GRID.fit.grid_hole, ...printer?.grid_hole } };
}
