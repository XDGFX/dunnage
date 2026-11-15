import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { type Variant } from "./tile.ts";
export interface Part {
    name: string;
    solid: Manifold;
    /** How many to print. */
    copies: number;
    /** What it tests and how to read it. */
    note: string;
}
export declare const PILOT_HOLES: number[];
/** The boss walls to compare, and the variant each becomes. */
export declare const WALLS: [number, Variant][];
/**
 * Radial clearance of a joiner's rings over the bosses; negative is interference. Round two's first
 * try, -0.05 to 0.15, was far too tight: at 0.15 a joiner went on only 1 mm.
 */
export declare const JOINER_FITS: number[];
/**
 * How much smaller a peg is than its hole, across the diameter. A peg the hole's size wasn't close to
 * going in: the hole prints small and the peg big.
 */
export declare const PEG_CLEARANCES: number[];
export declare const variantList: Variant[];
export declare function roundOne(wasm: ManifoldToplevel): Part[];
export interface Choice {
    variant: Variant;
    hole: number;
    skin: number;
}
export declare function roundTwo(wasm: ManifoldToplevel, choices: Choice[]): Part[];
export declare function roundThree(wasm: ManifoldToplevel, choices: (Choice & {
    fit: number;
})[]): Part[];
export declare function describeFit(fit: number): string;
/**
 * A joiner turned over to print: its flat side, flush with the back in use, on the bed, and its rings
 * standing up. The webs are too small for dots, so `notches` V-notches round the end of one ring
 * label it.
 */
export declare function printJoiner(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number, notches?: number): Manifold;
