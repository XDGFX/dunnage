import type { Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
import { type Variant } from "./parameters.ts";
export type { Variant };
export declare const PITCH: number;
export declare const THICKNESS: number;
/** A low web along every row and column of holes, tying each boss to its neighbours; `height` is from the top face. */
export declare const WEB: {
    width: number;
    height: number;
};
/** A 45° flare where each boss meets the top face, to stiffen it where it bends. */
export declare const BOSS_CHAMFER: number;
/** Where hole `i` sits along an axis: half a pitch in from the tile's edge, then every pitch. */
export declare const holeCentre: (i: number) => number;
/** `wall` is the boss wall round the hole, `band` the solid edge of the tile. */
export declare const VARIANTS: Record<Variant, {
    wall: number;
    band: number;
}>;
/** The rings' wall round the bosses, and the webs tying the rings together, flush with the back. */
export declare const JOINER: {
    wall: number;
    webWidth: number;
    webHeight: number;
};
/** Room left in the band round a joiner's rings: more than the loosest joiner fit in the calibration print. */
export declare const RING_ROOM: number;
/** A row of debossed cone dots on the face, read by counting. */
export interface Dots {
    at: Vec2;
    count: number;
    along?: "x" | "y";
    spacing?: number;
}
type ByHole = number | ((i: number, j: number) => number);
export interface TileOptions {
    variant: Variant;
    nx: number;
    ny: number;
    /** Hole diameter, for every hole or by hole `(i, j)`. */
    hole: ByHole;
    /** Boss wall, if not the variant's. */
    wall?: ByHole;
    /** The top face's thickness. */
    skin?: number;
    /** Cut the band for joiners at the edge holes. A test piece that never joins can leave it whole. */
    joiners?: boolean;
    dots?: readonly Dots[];
}
export declare function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold;
/**
 * A joiner as it sits in the tiles: centred on the corner between 4 holes (a join, and the gap line
 * between two edge holes), flush with the back. `hole` and `wall` are the tiles' edge bosses; `fit`
 * is the radial clearance of the rings over them, and negative is interference.
 */
export declare function seatedJoiner(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number, wall?: number): Manifold;
/** Dots debossed into the face (the bed side). */
export declare function faceDots(wasm: ManifoldToplevel, { at, count, along, spacing }: Dots): Manifold;
/** Lay a part on the bed at the origin. */
export declare function onBed(m: Manifold): Manifold;
