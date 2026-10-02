import type { Item, Pose, Thing } from "./schema.ts";
type Point = readonly [number, number];
export type Part = {
    kind: "circle";
    centre: Point;
    radius: number;
} | {
    kind: "polygon";
    points: Point[];
};
export interface Outline {
    /** Everything that touches the floor or sits low enough to hit a neighbour. */
    parts: Part[];
    /** A spout is high up and overhangs, so it must clear the walls but may reach over a neighbour. */
    overhang: Part[];
    height: number;
}
/** The pose an item is written in: its shape's numbers describe it sitting this way. */
export declare const writtenPose: (item: Item) => Pose;
export declare const posesOf: (item: Item) => Pose[];
export declare const samePose: (a: Pose, b: Pose) => boolean;
export declare const poseName: (pose: Pose) => string;
/** A w × d rectangle centred at `centre` plus `offset` (in the thing's own frame), turned by `angle`. */
export declare function rectangle(centre: Point, [w, d]: Point, angle?: number, offset?: Point): Part;
export declare function outline(thing: Thing, item: Item): Outline;
export declare function bounds(parts: Part[]): {
    left: number;
    right: number;
    front: number;
    back: number;
};
/** How far two convex parts overlap, along the axis that separates them soonest; 0 if they don't. */
export declare function overlap(a: Part, b: Part): number;
export {};
