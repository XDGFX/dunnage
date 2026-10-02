import { type Box, type Point } from "./geometry.ts";
import { type Plan, type PlannedThing } from "./plan.ts";
/** A pull the move gave in to, to explain it on the plan. */
export interface Snap {
    kind: "touch" | "align" | "centre";
    /** Where the moving body's leading edge (x0 or y0) ends up. */
    at: number;
    /** What it touches or lines up with; null for a wall. */
    ref: {
        id: string;
        box: Box;
        shared: boolean;
    } | null;
    /** For a touch, whether it's the body's low edge (left or front). */
    lead?: boolean;
    /** For an align, which edge: 0 low, 1 high, 0.5 centre. */
    edge?: number;
    /** For a centre, the space it's centred in. */
    lo?: number;
    hi?: number;
}
export interface Move {
    dx: number;
    dy: number;
    x: Snap | null;
    y: Snap | null;
}
/** The things being moved, as one: their claimed space, and their real outline. */
export interface Body {
    ids: string[];
    things: PlannedThing[];
    /** The space they claim with their holders' padding. */
    box: Box;
    /** Their outline's bounds. */
    raw: Box;
    zone: string | null;
}
export declare function bodyOf(p: Plan, ids: string[]): Body;
/**
 * Where a body ends up when dragged by (rdx, rdy): pulled by the rules unless `free`, then
 * pushed out of the walls and its neighbours on their real outlines. Null when it can't get free.
 */
export declare function solve(p: Plan, ids: string[], rdx: number, rdy: number, free: boolean): Move | null;
/** Wraps an angle into (-180, 180]. */
export declare const wrap: (a: number) => number;
/** The angle a thing turned towards `raw` settles on: square, parallel to a turned neighbour, or the rotation step. */
export declare function snapAngle(p: Plan, t: PlannedThing, raw: number, free: boolean): {
    angle: number;
    why: string | null;
};
/**
 * The nearest spot within `reach` of (x, y) where pegs hold the thing. Holes are fixed, so this
 * is how a pegboard snaps: to a seat, not to a grid. A thing with an outlet seats straight onto a hole.
 */
export declare function seat(p: Plan, t: PlannedThing, x: number, y: number, reach?: number): Point | null;
/** Somewhere to put a set-aside thing back: the first spot, front to back, where it fits. */
export declare function putBackSpot(p: Plan, t: PlannedThing): Point;
export type ArrangeOp = "left" | "hmid" | "right" | "front" | "vmid" | "back" | "dist-x" | "dist-y" | "pack-x" | "pack-y";
/** Lines up, spaces out or packs things by the space they claim. Returns how far to move each, [id, dx, dy]. */
export declare function arrange(p: Plan, ids: string[], op: ArrangeOp): [string, number, number][];
