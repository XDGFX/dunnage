// Built-in drawers, and how a drawer file's shape fields resolve against them. Numbers are mm and
// degrees; walls slope outward from vertical.

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

// IKEA MAXIMERA (#6 §4): floors from drawer mats and published Gridfinity baseplates, sides sloping
// about 20°, and the nominal side heights of low, medium and high drawers.
const MAXIMERA_FLOORS: Record<string, [number, number]> = {
  "40x60": [281, 505],
  "60x60": [481, 505],
  "80x60": [681, 505],
  "40x37": [281, 309],
  "60x37": [481, 309],
  "80x37": [681, 309],
  "us-18": [335, 504],
};
const MAXIMERA_HEIGHTS = { low: 78, medium: 144, high: 212 };

export const DRAWER_PRESETS: Record<string, DrawerPreset> = Object.fromEntries(
  Object.entries(MAXIMERA_FLOORS).flatMap(([size, [w, d]]) =>
    Object.entries(MAXIMERA_HEIGHTS).map(([height, h]) => [
      `ikea-maximera-${size}-${height}`,
      { inside: [w, d, h], walls: { left: 20, right: 20, front: 0, back: 0 }, corner_radius: 0, floor_edge: 2, unverified: true },
    ]),
  ),
);

/** A drawer's shape: its preset's, with any field the file sets laid over it. Undefined when nothing gives an `inside`. */
export function drawerShape(fields: ShapeFields): DrawerShape | undefined {
  const preset = fields.preset === undefined ? undefined : DRAWER_PRESETS[fields.preset];
  const inside = fields.inside ?? preset?.inside;
  if (!inside) return undefined;
  const w = fields.walls ?? {};
  const base = preset?.walls ?? { left: 0, right: 0, front: 0, back: 0 };
  return {
    inside: [...inside],
    walls: {
      left: w.left ?? w.sides ?? base.left,
      right: w.right ?? w.sides ?? base.right,
      front: w.front ?? w.ends ?? base.front,
      back: w.back ?? w.ends ?? base.back,
    },
    corner_radius: fields.corner_radius ?? preset?.corner_radius ?? 0,
    floor_edge: fields.floor_edge ?? preset?.floor_edge ?? 0,
  };
}
