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
  /** An overlay's spring latches, from the latch test strip. */
  latch: LatchFit;
}

export interface LatchFit {
  /** Leg and bar thickness, which sets how stiff the latch is. */
  leg: number;
  /** The barb's catch, in degrees up from flat: 0 is square, more lets go sooner. */
  catch: number;
  /** How much tighter a latch's plug is than its socket, a side. */
  press: number;
}

/** What a printer file's `fit:` may set: any field, and any of a latch's fields. */
export type PrinterFit = Partial<Omit<Fit, "latch">> & { latch?: Partial<LatchFit> };

export const GRID: Omit<typeof parameters, "variant" | "fit"> & { variant: Variant; fit: Fit } = parameters as typeof parameters & { variant: Variant };

export const VARIANT_NAMES = Object.keys(GRID.variants) as Variant[];

/** The printer's fits over the calibrated defaults, a variant's hole size and the latch's fields merged rather than replaced. */
export function gridFit(printer?: PrinterFit): Fit {
  return {
    ...GRID.fit,
    ...printer,
    grid_hole: { ...GRID.fit.grid_hole, ...printer?.grid_hole },
    latch: { ...GRID.fit.latch, ...printer?.latch },
  };
}
