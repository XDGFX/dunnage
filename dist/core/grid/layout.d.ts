import type { DrawerShape, Side } from "../drawers.ts";
import type { Box } from "../geometry.ts";
import { type Drawer } from "../schema.ts";
import { type Fit, type Variant } from "./parameters.ts";
export type GridBase = Omit<Extract<NonNullable<Drawer["base"]>, {
    kind: "grid";
}>, "variant"> & {
    variant?: Variant;
};
export type Hole = readonly [number, number];
type Path = (string | number)[];
export interface BoardTile {
    /** Counted from the front (row) and the left (col), from 0. */
    row: number;
    col: number;
    /** `row-col`, from 1, as debossed on the face. */
    label: string;
    /** The tile's front-left hole, in board holes. */
    first: Hole;
    /** In holes. */
    size: [number, number];
    box: Box;
}
export interface BoardBumper {
    /** The wall it fills out to. */
    side: Side;
    /** Along its wall: the tile column (front, back) or row (left, right) it runs beside. */
    index: number;
    /** Its footprint on the floor. */
    floor: Box;
    /** Its footprint at the board's face, wider where it meets a sloping wall. */
    top: Box;
    /** The walls it bears on: its own, and the front or back where a side bumper runs past a corner. */
    walls: Side[];
    /** The lap tab's footprint: along its foot, under the tile's edge band. */
    tab: Box;
}
export interface BoardLayout {
    variant: Variant;
    shape: DrawerShape;
    /** Clearance to each wall, at the floor. */
    fit: number;
    /** The whole board, in holes. */
    holes: [number, number];
    /** The board's front-left corner, where hole [0, 0]'s cell starts. */
    origin: [number, number];
    /** Each side's bumper thickness at the floor: board to wall, less the clearance, before the floor edge's chamfer. */
    gap: Record<Side, number>;
    /** How far the bumpers' lap tabs reach under the tiles. */
    lapTab: number;
    tiles: BoardTile[];
    bumpers: BoardBumper[];
    /** Where each joiner is centred, on the corner between its four bosses. */
    joiners: [number, number][];
    /** Holes a rounded drawer corner cuts, left out of their tile. */
    dropped: Hole[];
    countersinks: Hole[];
    /** The radius rounded drawer corners are cut to, round the corner's own centre; absent when the corners are square. */
    corner?: {
        radius: number;
        cut: number;
    };
    /** What stops the board being laid out as asked, by the drawer file field it's about. */
    problems: {
        at: Path;
        message: string;
    }[];
}
export interface LayoutOptions {
    /** The printer's bed. Default: the Bambu P1S's. */
    bed?: readonly [number, number, number];
    /** The printer's fits over the calibrated defaults. */
    fit?: Partial<Fit>;
}
/** Each wall's outward direction on the floor. */
export declare const OUTWARD: Record<Side, readonly [number, number]>;
/** A box with its edge on `side` moved outward by `by`. */
export declare function stretch(box: Box, side: Side, by: number): Box;
/** The joiner's reach from the line between a tile and a bumper: half a pitch to the boss, then the ring. */
export declare function joinerReach(variant: Variant, fit: Fit): number;
/** The board hole for a variant; one never calibrated takes the default variant's, as a stand-in. */
export declare function boardHole(variant: Variant, fit: Fit): number;
/** The lap tab's reach under a tile: the set depth, or less where the edge bosses come closer, so its rebate leaves them whole. */
export declare function lapTabDepth(variant: Variant, fit: Fit): number;
export declare function layoutBoard(shape: DrawerShape, base: GridBase, options?: LayoutOptions): BoardLayout;
/** Whether a point on the floor is in what a rounded corner cuts away. */
export declare function cornerCuts(shape: DrawerShape, corner: {
    radius: number;
    cut: number;
}, x: number, y: number): boolean;
/** Where a hole's centre is on the floor. */
export declare function holeAt(layout: BoardLayout, [i, j]: Hole): [number, number];
/** Why a hole can't take a fixing, or undefined when it can. */
export declare function holeProblem(layout: BoardLayout, hole: Hole): string | undefined;
export {};
