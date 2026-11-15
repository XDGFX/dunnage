import parameters from "./parameters.json" with { type: "json" };

// The grid parameters file is JSON so a Fusion script can load it with Python's standard library.

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

export const GRID: Omit<typeof parameters, "variant" | "fit"> & { variant: Variant; fit: Fit } = parameters as typeof parameters & { variant: Variant };

export const VARIANT_NAMES = Object.keys(GRID.variants) as Variant[];

/** The printer's fits over the calibrated defaults, a variant's hole size merged rather than replaced. */
export function gridFit(printer?: Partial<Fit>): Fit {
  return { ...GRID.fit, ...printer, grid_hole: { ...GRID.fit.grid_hole, ...printer?.grid_hole } };
}
