import { type Box, type Point } from "./geometry.ts";
import type { Drawer, Holder, Item, Pose } from "./schema.ts";
import { type Part } from "./shape.ts";
export type Level = "bad" | "warn";
export interface Issue {
    level: Level;
    text: string;
}
export type Method = Holder["method"];
/** The library of holding methods. `pad` is how far a holder reaches round what it holds; `floor` how far it lifts it. */
export declare const METHODS: Record<Method, {
    name: string;
    short: string;
    makes: string;
    pad: number;
    floor: number;
    height: number;
    printed: boolean;
    about: string;
}>;
export type BaseKey = "bare" | "gridfinity" | "uppdatera-60" | "uppdatera-80";
export declare const BASES: Record<BaseKey, {
    name: string;
    base: NonNullable<Drawer["base"]>;
    z: number;
    board?: [number, number];
}>;
/** UPPDATERA: holes are slots running across the drawer, and pegs are 12 × 6 mm, set across them. */
export declare const PEG: {
    size: readonly [6, 12];
    height: number;
};
export declare const SLOT: readonly [16, 7];
/** Gaps between holders on a bare floor narrower than this are closed; wider ones are left on purpose. */
export declare const FILL = 40;
/** A holder that can slide no further than this is held. */
export declare const HELD = 1.5;
export interface Base {
    key: BaseKey;
    name: string;
    /** How far the base lifts what sits on it. */
    z: number;
    grid?: {
        pitch: number;
        nx: number;
        ny: number;
        ox: number;
        oy: number;
    };
    board?: {
        x0: number;
        y0: number;
        width: number;
        depth: number;
        holes: Point[];
    };
}
export interface Shape {
    round: boolean;
    /** Footprint before turning, [x, y]. A round thing's is its body's diameter. */
    size: Point;
    height: number;
    handle?: Point;
    spout?: Point;
    /** A cylinder on its side, raised by `tilt`. */
    lying: boolean;
    tilt: number;
}
export interface PegFit {
    held: boolean;
    play: number;
    spring: number;
    /** Walls it rests on within its play. */
    walls: string[];
    /** How far past its play each peg that can't reach it is. */
    far: number[];
}
export interface PlannedThing {
    id: string;
    index: number;
    itemId: string;
    item: Item;
    name: string;
    pose: Pose;
    stack: number;
    rotate: number;
    /** Where it's drawn: its place in the drawer, or on the counter when it's set aside. */
    x: number;
    y: number;
    aside: boolean;
    zone?: string;
    why?: string;
    shape: Shape;
    /** Its outline: body and handle. */
    parts: Part[];
    /** A spout: high up, so it may reach over a neighbour. */
    overhang: Part[];
    /** Everything, spout included. */
    box: Box;
    /** What a holder holds: the outline without the spout. */
    holdBox: Box;
    /** The space it takes with its holder's padding. */
    claim: Box;
    holder: PlannedHolder | null;
    /** The height its bottom sits at: the base and its holder's floor. */
    z0: number;
    issues: Issue[];
    pegs?: PegFit;
}
export interface Peg {
    x: number;
    y: number;
    /** Distance from the peg to the thing; negative pushes into it. */
    gap: number;
    /** Where it touches the thing, and the direction from the thing to the peg. */
    at: Point;
    normal: Point;
    ok: boolean;
    of: string;
    through?: boolean;
}
export interface Travel {
    L: number;
    R: number;
    F: number;
    B: number;
    by: Partial<Record<"L" | "R" | "F" | "B", PlannedHolder>>;
}
export interface PlannedHolder {
    id: string;
    index: number;
    method: Method;
    holds: string[];
    things: PlannedThing[];
    locked: boolean;
    source: Holder;
    /** Its own footprint, from what it holds and its method, or as built when locked. */
    shape: Box | null;
    /** Its footprint once gaps are closed. */
    rect: Box | null;
    cells?: [number, number, number, number];
    posts: Point[];
    pegs: Peg[];
    height: number;
    issues: Issue[];
    travel?: Travel;
    slide?: number;
}
export interface Plan {
    width: number;
    depth: number;
    height: number;
    rules: {
        edge_margin: number;
        gap: number;
        angle_step: number;
    };
    base: Base;
    bed: readonly [number, number, number];
    things: PlannedThing[];
    placed: PlannedThing[];
    holders: PlannedHolder[];
    obstructions: {
        name: string;
        box: Box;
        part: Part;
    }[];
    /** How deep the counter in front of the drawer is, to fit what's set aside. */
    counterDepth: number;
}
export declare const baseKey: (base: Drawer["base"]) => BaseKey;
/** Works out the plan for a drawer, for a printer with this bed. */
export declare function plan(drawer: Drawer, bed: readonly [number, number, number]): Plan;
export declare const mm: (v: number) => string;
export declare const lower: (id: string) => string;
export declare const pretty: (id: string) => string;
export declare const worst: (issues: Issue[]) => Level | null;
/** The thing's outline at (x, y), body and handle, grown by `extra` all round. */
export declare function partsAt(t: PlannedThing, x: number, y: number, rotate?: number, extra?: number): Part[];
/** Whether two outlines overlap by more than rounding. */
export declare const partsHit: (a: Part[], b: Part[]) => boolean;
export declare const roundAllOver: (t: PlannedThing) => boolean;
/** How a thing sits between its pegs: how far it may wander, and how far it pushes stock pegs out. */
export declare function fitOf(holder: Holder | undefined): {
    play: number;
    spring: number;
};
/** Whether pegs hold the thing with its centre at (x, y). */
export declare function heldByPegs(p: Plan, t: PlannedThing, x: number, y: number): boolean;
/** How far a holder's footprint can slide each way before a wall or another holder stops it. */
export declare function travel(p: Plan, r: Box, id: string): Travel;
