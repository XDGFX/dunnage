import { type BaseKey, type Method } from "./plan.ts";
import type { Holder, Pose } from "./schema.ts";
type Lock = NonNullable<Holder["lock"]>;
type ItemShape = {
    cylinder: [number, number];
} | {
    box: [number, number, number];
};
/** Moves things by [id, dx, dy]. A locked holder's shape moves with what it holds, once. */
export declare function moveThings(text: string, moves: [string, number, number][]): string;
/** Puts a thing at a spot, by its centre. */
export declare const placeThing: (text: string, id: string, at: readonly [number, number]) => string;
/** Takes a thing out of the drawer for now, or puts it back at `at`. */
export declare function setAside(text: string, id: string, aside: boolean, at?: readonly [number, number]): string;
/** How a thing sits. Its item's first pose is the default, so it isn't written. */
export declare function setPose(text: string, id: string, pose: Pose): string;
export declare const setRotate: (text: string, id: string, angle: number) => string;
/** The ways a thing's item may sit. Its first pose is how its shape is written, so it stays first. */
export declare function setPoses(text: string, itemId: string, poses: Pose[]): string;
/**
 * Adds a thing to the drawer, set aside until it's placed. It reuses an item with the same name
 * and shape, or adds one.
 */
export declare function addThing(text: string, item: {
    name: string;
} & ItemShape): {
    text: string;
    id: string;
};
/** Takes a thing out of the file altogether, and out of its holder. */
export declare function removeThing(text: string, id: string): string;
/** Holds things together in one new holder, taking them out of the ones they were in. */
export declare function holdTogether(text: string, ids: string[], method: Method): {
    text: string;
    id: string;
};
/** Splits a holder into one for each thing it holds, each with its method. */
export declare function splitHolder(text: string, id: string): string;
/** Changes how a holder holds, dropping the fields only its old method used. */
export declare function setMethod(text: string, id: string, method: Method): string;
/**
 * Settles things held by pegs onto the nearest seat where their pegs hold them, if they aren't
 * held where they are, as after moving them on a pegboard. Needs the printer's bed to plan.
 */
export declare function seatOnPegs(text: string, ids: string[], bed: readonly [number, number, number]): string;
/** How a thing sits between its pegs: play and spring. */
export declare const setFit: (text: string, id: string, fit: {
    play?: number;
    spring?: number;
}) => string;
/** Freezes a holder as built. */
export declare const lockHolder: (text: string, id: string, lock: Lock) => string;
export declare const unlockHolder: (text: string, id: string) => string;
export declare function setBase(text: string, key: BaseKey): string;
export declare const setRule: (text: string, rule: "edge_margin" | "gap" | "angle_step", value: number) => string;
export declare function answerQuestion(text: string, id: string, answer: string): string;
/** Closes a concern. Accepting it does what it suggests first. */
export declare function closeConcern(text: string, id: string, accept: boolean): string;
export declare const addComment: (text: string, on: string, says: string) => string;
export {};
