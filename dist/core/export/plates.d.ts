export interface PlateItem {
    key: string;
    /** Footprint on the bed, x and y, in mm. */
    size: readonly [number, number];
    copies: number;
}
export interface Placement {
    key: string;
    /** The footprint's front-left corner on the bed. */
    at: [number, number];
}
/**
 * Lays copies out on as many plates as they take, inside `margin` of the bed's edge and `gap` apart.
 * Throws when one part is bigger than the bed.
 */
export declare function plates(items: readonly PlateItem[], bed: readonly [number, number, ...number[]], margin: number, gap: number): Placement[][];
