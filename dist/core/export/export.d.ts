import type { ManifoldToplevel } from "manifold-3d";
import { type BoardLayout } from "../grid/layout.ts";
import { type Fit } from "../grid/parameters.ts";
import { type Drawer } from "../schema.ts";
import { type Library } from "./library.ts";
import { type BoardCounts } from "./parts.ts";
export interface ExportOptions {
    /** The printer's bed. Default: the Bambu P1S's. */
    bed?: readonly [number, number, number];
    /** The printer's grid fits, over the calibrated defaults. */
    fit?: Partial<Fit>;
    library?: Library;
    /** Called before each slow step, with what it is. */
    progress?: (step: string) => void;
}
export interface ExportedFile {
    /** A path relative to the export folder, such as `specs/cradle.md`. */
    name: string;
    data: Uint8Array;
}
/** Spare joiners and pegs, as a share of those needed, rounded up. */
export declare const SPARES = 0.1;
/** Space between parts on a plate, and between them and the bed's edge, in mm. */
export declare const PLATE_GAP = 4;
export declare const withSpares: (n: number) => number;
/** What a grid board takes besides tiles and bumpers. */
export declare function boardCounts(drawer: Drawer, layout: BoardLayout): BoardCounts;
/**
 * Builds every file `dunnage export` writes. It takes over `wasm`: every manifold made on it is
 * freed once its part is written, so the caller keeps none. Throws if the board can't be laid out
 * (check the drawer first), or if the calibration print doesn't fit on one plate.
 */
export declare function exportDrawer(wasm: ManifoldToplevel, drawer: Drawer, options?: ExportOptions): ExportedFile[];
/** Every exported file in one zip, for a browser to download. */
export declare function zipExport(files: readonly ExportedFile[]): Uint8Array;
