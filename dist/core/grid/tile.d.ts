import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
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
    /** Holes left out, bosses and all: those a rounded drawer corner cuts. */
    drop?: (i: number, j: number) => boolean;
    /** Holes countersunk in the face for a screw into the drawer floor. */
    countersink?: (i: number, j: number) => boolean;
    /** Keep only this region, in the tile's own coordinates, with a band along its new edge. */
    clip?: CrossSection;
}
export declare function tile(wasm: ManifoldToplevel, options: TileOptions): Manifold;
/**
 * A joiner as it sits in the tiles: centred on the corner between 4 holes (a join, and the gap line
 * between two edge holes), flush with the back. `hole` and `wall` are the tiles' edge bosses; `fit`
 * is the radial clearance of the rings over them, and negative is interference.
 */
export declare function seatedJoiner(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number, wall?: number): Manifold;
/**
 * The room a seated joiner needs in a solid part, such as a bumper, centred like `seatedJoiner`:
 * round each of the four bosses down to the web, and slots for its webs. The bosses stay.
 */
export declare function joinerRoom(wasm: ManifoldToplevel, variant: Variant, hole: number): Manifold;
/**
 * A joiner turned over to print: its flat side, flush with the back in use, on the bed, and its rings
 * standing up. The webs are too small for dots, so `notches` V-notches round the end of one ring
 * label it.
 */
export declare function printJoiner(wasm: ManifoldToplevel, variant: Variant, hole: number, fit: number, notches?: number): Manifold;
/**
 * A round peg with one flat, chamfered at both ends, lying on the flat so its layers run along its
 * length.
 */
export declare function peg(wasm: ManifoldToplevel, diameter: number, length?: number): Manifold;
/** Dots debossed into the face (the bed side). */
export declare function faceDots(wasm: ManifoldToplevel, { at, count, along, spacing }: Dots): Manifold;
/** Lay a part on the bed at the origin. */
export declare function onBed(m: Manifold): Manifold;
