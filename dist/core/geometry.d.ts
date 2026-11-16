import { RAD, type Part } from "./shape.ts";
export type Point = readonly [number, number];
export interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}
export { RAD };
/** The point (u, v) in a frame centred at `centre` and turned by `angle`. */
export declare function turn([cx, cy]: Point, u: number, v: number, angle: number): [number, number];
export declare function boxOf(parts: Part[]): Box;
export declare function unionOf(boxes: Box[]): Box;
export declare const grow: (b: Box, by: number) => Box;
export declare const shift: (b: Box, dx: number, dy: number) => Box;
/** Rounds to the half millimetre, as files write positions. */
export declare const half: (v: number) => number;
/** Whether two spans overlap by more than half a millimetre. */
export declare const spansOverlap: (a0: number, a1: number, b0: number, b1: number) => boolean;
export declare const boxesOverlap: (a: Box, b: Box) => boolean;
export declare const boxPart: (b: Box) => Part;
export declare function movePart(part: Part, dx: number, dy: number): Part;
/** A part as a polygon, anticlockwise. A circle becomes a polygon just outside it, so pushing polygons apart clears the circle too. */
export declare function polygon(part: Part, sides?: number): Point[];
/** The shortest push that moves convex polygon P off Q, or null when they don't overlap. */
export declare function push(P: Point[], Q: Point[]): {
    x: number;
    y: number;
    depth: number;
} | null;
