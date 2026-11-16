import type { Point } from "./geometry.ts";
import { GRID } from "./grid/parameters.ts";

// IKEA UPPDATERA, the slotted pegboard: its numbers, and where its slots fall in a drawer.

export type PegboardPreset = keyof typeof GRID.uppdatera.boards;

/** The UPPDATERA numbers, in mm; those listed in `unverified` are best guesses until measured (#13 §5). */
export const UPPDATERA = GRID.uppdatera as unknown as Omit<typeof GRID.uppdatera, "boards" | "slot" | "cup" | "lock_pin"> & {
  boards: Record<PegboardPreset, [number, number]>;
  /** Length along x, and width. Slots all run across the drawer. */
  slot: [number, number];
  /** The open cup under each slot: its width, and its depth below the skin. */
  cup: [number, number];
  /** The library's lock pin: where it locks, from the slot's centre, and how far a hole may be from there, [along, across]. */
  lock_pin: { at: [number, number]; tolerance: [number, number] };
};

export const PEGBOARD_PRESETS = Object.keys(UPPDATERA.boards) as PegboardPreset[];

export interface Pegboard {
  /** The board's front-left corner in the drawer: it's centred. */
  x0: number;
  y0: number;
  width: number;
  depth: number;
  /** Each slot's centre, in the drawer. */
  holes: Point[];
}

/**
 * Where a board sits in a drawer and where its slots are: rows `row` apart, slots `pitch` apart
 * along a row, alternate rows shifted half a pitch, centred with at least `edge` to the board's edge.
 */
export function pegboard(preset: PegboardPreset, width: number, depth: number): Pegboard {
  const [bw, bd] = UPPDATERA.boards[preset];
  const { pitch, row, edge } = UPPDATERA;
  const step = pitch / 2;
  const x0 = (width - bw) / 2;
  const y0 = (depth - bd) / 2;
  const na = Math.floor((bw - 2 * edge) / step);
  const nb = Math.floor((bd - 2 * edge) / row);
  const ex = (bw - na * step) / 2;
  const ey = (bd - nb * row) / 2;
  const holes: Point[] = [];
  for (let a = 0; a <= na; a++) for (let b = 0; b <= nb; b++) if ((a + b) % 2 === 0) holes.push([x0 + ex + a * step, y0 + ey + b * row]);
  return { x0, y0, width: bw, depth: bd, holes };
}
