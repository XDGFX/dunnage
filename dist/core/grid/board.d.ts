import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { type BoardBumper, type BoardLayout, type BoardTile } from "./layout.ts";
import { type Fit } from "./parameters.ts";
/** Every part of the board: one solid per tile and bumper in place, and one joiner and one peg as they print. */
export interface BoardParts {
    tiles: {
        tile: BoardTile;
        solid: Manifold;
    }[];
    bumpers: {
        bumper: BoardBumper;
        solid: Manifold;
    }[];
    joiner: Manifold;
    peg: Manifold;
}
export declare function buildBoard(wasm: ManifoldToplevel, layout: BoardLayout, fit?: Partial<Fit>): BoardParts;
/** A part turned face down onto the bed, at the origin. */
export declare function printable(part: Manifold): Manifold;
/** Where a `row-col` label's dots sit on a tile's face, in the tile's own coordinates: the row's dots, a gap, then the column's. */
export declare function labelDots(layout: BoardLayout, t: BoardTile): {
    at: [number, number];
    count: number;
}[];
export declare function tileSolid(wasm: ManifoldToplevel, layout: BoardLayout, t: BoardTile, fit?: Partial<Fit>): Manifold;
export declare function bumperSolid(wasm: ManifoldToplevel, layout: BoardLayout, b: BoardBumper, fit?: Partial<Fit>): Manifold;
/** One joiner, as it prints. */
export declare function joinerSolid(wasm: ManifoldToplevel, layout: BoardLayout, fit?: Partial<Fit>): Manifold;
/** One peg, as it prints: smaller than the board hole by the calibrated peg fit. */
export declare function pegSolid(wasm: ManifoldToplevel, layout: BoardLayout, fit?: Partial<Fit>): Manifold;
