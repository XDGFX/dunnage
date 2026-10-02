import Type, {} from "typebox";
import { FORMATS } from "./format.js";
// The drawer/0.2 and printer/0.2 formats, as JSON Schema. docs/format/ holds the same schemas
// written out (`bun run schema`), and the spec beside them explains each field.
/** Lower case letters, digits and hyphens. */
export const ID = "^[a-z0-9][a-z0-9-]*$";
const Id = Type.String({ pattern: ID, description: "Lower case letters, digits and hyphens." });
const Length = Type.Number({ exclusiveMinimum: 0, description: "mm" });
const Size2 = Type.Tuple([Length, Length]);
const Size3 = Type.Tuple([Length, Length, Length]);
const Point = Type.Tuple([Type.Number(), Type.Number()], { description: "[x, y] in mm" });
const Status = Type.Union([Type.Literal("open"), Type.Literal("closed")]);
function strict(properties, description) {
    return Type.Object(properties, { additionalProperties: false, ...(description ? { description } : {}) });
}
function map(value, description) {
    return Type.Record(Type.String({ pattern: ID }), value, { additionalProperties: false, description });
}
const Tilt = strict({ tilt: Type.Number({ exclusiveMinimum: 0, exclusiveMaximum: 90 }) }, "Raised by this many degrees: a cylinder from lying, a box from flat towards upright.");
const BoxPose = Type.Union([Type.Literal("flat"), Type.Literal("upright"), Type.Literal("side"), Tilt]);
const CylinderPose = Type.Union([Type.Literal("upright"), Type.Literal("lying"), Tilt]);
export const Pose = Type.Union([Type.Literal("flat"), Type.Literal("upright"), Type.Literal("side"), Type.Literal("lying"), Tilt]);
const itemFields = {
    name: Type.String(),
    nest: Type.Optional(Type.Number({ minimum: 0, description: "How much each extra one adds to a stack, in mm." })),
    outlet: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Diameter of a hole through its base, in mm." })),
};
const BoxItem = strict({
    ...itemFields,
    box: Type.Tuple([Length, Length, Length], { description: "[width, depth, height] as it sits flat." }),
    poses: Type.Optional(Type.Array(BoxPose, { minItems: 1 })),
});
const Protrusion = Type.Tuple([Length, Length], { description: "[width, reach] in mm." });
const CylinderItem = strict({
    ...itemFields,
    cylinder: Type.Tuple([Length, Length], { description: "[diameter, height] as it stands upright." }),
    handle: Type.Optional(Protrusion),
    spout: Type.Optional(Protrusion),
    poses: Type.Optional(Type.Array(CylinderPose, { minItems: 1 })),
});
export const Item = Type.Union([BoxItem, CylinderItem]);
const Thing = strict({
    id: Id,
    item: Type.Optional(Id),
    zone: Type.Optional(Id),
    at: Point,
    pose: Type.Optional(Pose),
    rotate: Type.Optional(Type.Number({ description: "Degrees, anticlockwise seen from above." })),
    stack: Type.Optional(Type.Integer({ minimum: 1 })),
    aside: Type.Optional(Type.Boolean()),
    why: Type.Optional(Type.String()),
});
const Lock = strict({
    at: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "The date it was built." }),
    tool: Type.String({ description: "The dunnage version that made it." }),
    shape: strict({ at: Point, size: Size2, height: Length, rotate: Type.Optional(Type.Number()) }),
    export: Type.String(),
    sha256: Type.String({ pattern: "^[0-9a-f]+$" }),
});
const holderFields = {
    id: Id,
    holds: Type.Array(Id, { minItems: 1 }),
    floor: Type.Optional(Type.Boolean()),
    lock: Type.Optional(Lock),
    why: Type.Optional(Type.String()),
};
function holder(method, extra) {
    return strict({ ...holderFields, method: Type.Literal(method), ...extra });
}
export const Holder = Type.Union([
    holder("well", {}),
    holder("posts", {}),
    holder("slot", {}),
    holder("peg", { peg: Type.Optional(strict({ diameter: Length, height: Length })) }),
    holder("gridfinity", {}),
    holder("pegs", {
        fit: Type.Optional(strict({ play: Type.Optional(Type.Number({ minimum: 0 })), spring: Type.Optional(Type.Number({ minimum: 0 })) })),
    }),
    holder("ply", {}),
    holder("custom", {
        spec: strict({
            purpose: Type.String(),
            contact: Type.Optional(Type.String()),
            clearance: Type.Optional(Type.Number({ minimum: 0 })),
            build: Type.Optional(Type.String()),
        }),
    }),
]);
const Base = Type.Union([
    strict({ kind: Type.Literal("bare") }),
    strict({ kind: Type.Literal("gridfinity"), pitch: Type.Optional(Length) }),
    strict({ kind: Type.Literal("pegboard"), preset: Type.Union([Type.Literal("uppdatera-80"), Type.Literal("uppdatera-60")]) }),
]);
const Review = strict({
    questions: Type.Optional(Type.Array(strict({ id: Id, ask: Type.String(), answer: Type.Optional(Type.String()), status: Status }))),
    assumptions: Type.Optional(Type.Array(Type.String())),
    concerns: Type.Optional(Type.Array(strict({
        id: Id,
        on: Type.Array(Id, { minItems: 1 }),
        says: Type.String(),
        suggest: Type.Optional(Type.String()),
        act: Type.Optional(strict({ aside: Type.Optional(Type.Array(Id, { minItems: 1 })) })),
        status: Status,
    }))),
    comments: Type.Optional(Type.Array(strict({ on: Id, says: Type.String(), status: Status }))),
});
export const Drawer = strict({
    format: Type.Literal(`drawer/${FORMATS.drawer}`),
    name: Type.String(),
    printer: Type.Optional(Type.String({ description: "A printer profile, <printer>.printer.yml beside this file." })),
    drawer: strict({
        inside: Type.Tuple([Length, Length, Length], { description: "[width, depth, height] in mm." }),
        obstructions: Type.Optional(Type.Array(strict({ name: Type.Optional(Type.String()), at: Point, size: Size2, height: Type.Optional(Length) }))),
    }),
    base: Type.Optional(Base),
    rules: Type.Optional(strict({
        edge_margin: Type.Optional(Type.Number({ minimum: 0 })),
        gap: Type.Optional(Type.Number({ minimum: 0 })),
        angle_step: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 90 })),
    })),
    items: map(Item, "What each thing is, by item id."),
    zones: Type.Optional(map(strict({ name: Type.String(), why: Type.Optional(Type.String()) }), "Named parts of the layout.")),
    layout: Type.Array(Thing),
    holders: Type.Optional(Type.Array(Holder)),
    review: Type.Optional(Review),
});
/** Beds of common printers, [x, y, z] in mm. A printer file names one or gives its own bed. */
export const PRINTER_PRESETS = {
    "bambu-a1": [256, 256, 256],
    "bambu-a1-mini": [180, 180, 180],
    "bambu-p1s": [256, 256, 256],
    "bambu-x1c": [256, 256, 256],
    "prusa-mk4": [250, 210, 220],
};
export const Printer = strict({
    format: Type.Literal(`printer/${FORMATS.printer}`),
    preset: Type.Optional(Type.Union(Object.keys(PRINTER_PRESETS).map((key) => Type.Literal(key)))),
    bed: Type.Optional(Size3),
    clearance: Type.Optional(Type.Number({ minimum: 0 })),
    colour: Type.Optional(Type.String()),
});
/** A format's schema as a standalone JSON Schema document, as published in docs/format/. */
export function jsonSchema(kind) {
    const name = `${kind}-${FORMATS[kind]}.schema.json`;
    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: `https://raw.githubusercontent.com/XDGFX/dunnage/main/docs/format/${name}`,
        title: `dunnage ${kind}/${FORMATS[kind]}`,
        description: `A dunnage ${kind} file. docs/format/${kind}.md explains each field, and the checks a schema can't express.`,
        ...(kind === "drawer" ? Drawer : Printer),
    };
}
