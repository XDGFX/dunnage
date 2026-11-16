export type Side = "left" | "right" | "front" | "back";
type Size3 = [number, number, number];
export interface DrawerShape {
    /** The floor's width and depth, and the usable height. */
    inside: Size3;
    walls: Record<Side, number>;
    corner_radius: number;
    floor_edge: number;
}
export interface DrawerPreset extends DrawerShape {
    /** Not yet checked against a real drawer, so `dunnage check` warns. */
    unverified: boolean;
}
/** The fields of a drawer file's `drawer:` that describe its shape. */
export interface ShapeFields {
    preset?: string;
    inside?: Size3;
    walls?: Partial<Record<Side | "sides" | "ends", number>>;
    corner_radius?: number;
    floor_edge?: number;
}
export declare const DRAWER_PRESETS: Record<string, DrawerPreset>;
/** A built-in drawer's name to show: `ikea-maximera-80x60-low` as `MAXIMERA 80 × 60, low`. */
export declare function presetName(preset: string): string;
/** The fewest `walls` fields that give these leans: a pair as `sides` or `ends` where both match, and none for upright walls. */
export declare function wallFields(walls: Record<Side, number>): NonNullable<ShapeFields["walls"]>;
/** A drawer's shape: its preset's, with any field the file sets laid over it. Undefined when nothing gives an `inside`. */
export declare function drawerShape(fields: ShapeFields): DrawerShape | undefined;
export {};
