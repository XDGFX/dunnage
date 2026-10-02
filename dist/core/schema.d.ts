import Type, { type Static } from "typebox";
/** Lower case letters, digits and hyphens. */
export declare const ID = "^[a-z0-9][a-z0-9-]*$";
export declare const Pose: Type.TUnion<[Type.TLiteral<"flat">, Type.TLiteral<"upright">, Type.TLiteral<"side">, Type.TLiteral<"lying">, Type.TObject<{
    tilt: Type.TNumber;
}>]>;
export declare const Item: Type.TUnion<[Type.TObject<{
    name: Type.TString;
    nest: Type.TOptional<Type.TNumber>;
    outlet: Type.TOptional<Type.TNumber>;
    box: Type.TTuple<[Type.TNumber, Type.TNumber, Type.TNumber]>;
    poses: Type.TOptional<Type.TArray<Type.TUnion<[Type.TLiteral<"flat">, Type.TLiteral<"upright">, Type.TLiteral<"side">, Type.TObject<{
        tilt: Type.TNumber;
    }>]>>>;
}>, Type.TObject<{
    name: Type.TString;
    nest: Type.TOptional<Type.TNumber>;
    outlet: Type.TOptional<Type.TNumber>;
    cylinder: Type.TTuple<[Type.TNumber, Type.TNumber]>;
    handle: Type.TOptional<Type.TTuple<[Type.TNumber, Type.TNumber]>>;
    spout: Type.TOptional<Type.TTuple<[Type.TNumber, Type.TNumber]>>;
    poses: Type.TOptional<Type.TArray<Type.TUnion<[Type.TLiteral<"upright">, Type.TLiteral<"lying">, Type.TObject<{
        tilt: Type.TNumber;
    }>]>>>;
}>]>;
export declare const Holder: Type.TUnion<[Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"well">;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"posts">;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"slot">;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"peg">;
} & {
    peg: Type.TOptional<Type.TObject<{
        diameter: Type.TNumber;
        height: Type.TNumber;
    }>>;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"gridfinity">;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"pegs">;
} & {
    fit: Type.TOptional<Type.TObject<{
        play: Type.TOptional<Type.TNumber>;
        spring: Type.TOptional<Type.TNumber>;
    }>>;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"ply">;
}>, Type.TObject<{
    id: Type.TString;
    holds: Type.TArray<Type.TString>;
    floor: Type.TOptional<Type.TBoolean>;
    lock: Type.TOptional<Type.TObject<{
        at: Type.TString;
        tool: Type.TString;
        shape: Type.TObject<{
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TNumber;
            rotate: Type.TOptional<Type.TNumber>;
        }>;
        export: Type.TString;
        sha256: Type.TString;
    }>>;
    why: Type.TOptional<Type.TString>;
    method: Type.TLiteral<"custom">;
} & {
    spec: Type.TObject<{
        purpose: Type.TString;
        contact: Type.TOptional<Type.TString>;
        clearance: Type.TOptional<Type.TNumber>;
        build: Type.TOptional<Type.TString>;
    }>;
}>]>;
export declare const Drawer: Type.TObject<{
    format: Type.TLiteral<"drawer/0.2">;
    name: Type.TString;
    printer: Type.TOptional<Type.TString>;
    drawer: Type.TObject<{
        inside: Type.TTuple<[Type.TNumber, Type.TNumber, Type.TNumber]>;
        obstructions: Type.TOptional<Type.TArray<Type.TObject<{
            name: Type.TOptional<Type.TString>;
            at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
            height: Type.TOptional<Type.TNumber>;
        }>>>;
    }>;
    base: Type.TOptional<Type.TUnion<[Type.TObject<{
        kind: Type.TLiteral<"bare">;
    }>, Type.TObject<{
        kind: Type.TLiteral<"gridfinity">;
        pitch: Type.TOptional<Type.TNumber>;
    }>, Type.TObject<{
        kind: Type.TLiteral<"pegboard">;
        preset: Type.TUnion<[Type.TLiteral<"uppdatera-80">, Type.TLiteral<"uppdatera-60">]>;
    }>]>>;
    rules: Type.TOptional<Type.TObject<{
        edge_margin: Type.TOptional<Type.TNumber>;
        gap: Type.TOptional<Type.TNumber>;
        angle_step: Type.TOptional<Type.TNumber>;
    }>>;
    items: Type.TRecord<"^.*$", Type.TUnion<[Type.TObject<{
        name: Type.TString;
        nest: Type.TOptional<Type.TNumber>;
        outlet: Type.TOptional<Type.TNumber>;
        box: Type.TTuple<[Type.TNumber, Type.TNumber, Type.TNumber]>;
        poses: Type.TOptional<Type.TArray<Type.TUnion<[Type.TLiteral<"flat">, Type.TLiteral<"upright">, Type.TLiteral<"side">, Type.TObject<{
            tilt: Type.TNumber;
        }>]>>>;
    }>, Type.TObject<{
        name: Type.TString;
        nest: Type.TOptional<Type.TNumber>;
        outlet: Type.TOptional<Type.TNumber>;
        cylinder: Type.TTuple<[Type.TNumber, Type.TNumber]>;
        handle: Type.TOptional<Type.TTuple<[Type.TNumber, Type.TNumber]>>;
        spout: Type.TOptional<Type.TTuple<[Type.TNumber, Type.TNumber]>>;
        poses: Type.TOptional<Type.TArray<Type.TUnion<[Type.TLiteral<"upright">, Type.TLiteral<"lying">, Type.TObject<{
            tilt: Type.TNumber;
        }>]>>>;
    }>]>>;
    zones: Type.TOptional<Type.TRecord<"^.*$", Type.TObject<{
        name: Type.TString;
        why: Type.TOptional<Type.TString>;
    }>>>;
    layout: Type.TArray<Type.TObject<{
        id: Type.TString;
        item: Type.TOptional<Type.TString>;
        zone: Type.TOptional<Type.TString>;
        at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
        pose: Type.TOptional<Type.TUnion<[Type.TLiteral<"flat">, Type.TLiteral<"upright">, Type.TLiteral<"side">, Type.TLiteral<"lying">, Type.TObject<{
            tilt: Type.TNumber;
        }>]>>;
        rotate: Type.TOptional<Type.TNumber>;
        stack: Type.TOptional<Type.TInteger>;
        aside: Type.TOptional<Type.TBoolean>;
        why: Type.TOptional<Type.TString>;
    }>>;
    holders: Type.TOptional<Type.TArray<Type.TUnion<[Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"well">;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"posts">;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"slot">;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"peg">;
    } & {
        peg: Type.TOptional<Type.TObject<{
            diameter: Type.TNumber;
            height: Type.TNumber;
        }>>;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"gridfinity">;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"pegs">;
    } & {
        fit: Type.TOptional<Type.TObject<{
            play: Type.TOptional<Type.TNumber>;
            spring: Type.TOptional<Type.TNumber>;
        }>>;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"ply">;
    }>, Type.TObject<{
        id: Type.TString;
        holds: Type.TArray<Type.TString>;
        floor: Type.TOptional<Type.TBoolean>;
        lock: Type.TOptional<Type.TObject<{
            at: Type.TString;
            tool: Type.TString;
            shape: Type.TObject<{
                at: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                size: Type.TTuple<[Type.TNumber, Type.TNumber]>;
                height: Type.TNumber;
                rotate: Type.TOptional<Type.TNumber>;
            }>;
            export: Type.TString;
            sha256: Type.TString;
        }>>;
        why: Type.TOptional<Type.TString>;
        method: Type.TLiteral<"custom">;
    } & {
        spec: Type.TObject<{
            purpose: Type.TString;
            contact: Type.TOptional<Type.TString>;
            clearance: Type.TOptional<Type.TNumber>;
            build: Type.TOptional<Type.TString>;
        }>;
    }>]>>>;
    review: Type.TOptional<Type.TObject<{
        questions: Type.TOptional<Type.TArray<Type.TObject<{
            id: Type.TString;
            ask: Type.TString;
            answer: Type.TOptional<Type.TString>;
            status: Type.TUnion<[Type.TLiteral<"open">, Type.TLiteral<"closed">]>;
        }>>>;
        assumptions: Type.TOptional<Type.TArray<Type.TString>>;
        concerns: Type.TOptional<Type.TArray<Type.TObject<{
            id: Type.TString;
            on: Type.TArray<Type.TString>;
            says: Type.TString;
            suggest: Type.TOptional<Type.TString>;
            act: Type.TOptional<Type.TObject<{
                aside: Type.TOptional<Type.TArray<Type.TString>>;
            }>>;
            status: Type.TUnion<[Type.TLiteral<"open">, Type.TLiteral<"closed">]>;
        }>>>;
        comments: Type.TOptional<Type.TArray<Type.TObject<{
            on: Type.TString;
            says: Type.TString;
            status: Type.TUnion<[Type.TLiteral<"open">, Type.TLiteral<"closed">]>;
        }>>>;
    }>>;
}>;
/** Beds of common printers, [x, y, z] in mm. A printer file names one or gives its own bed. */
export declare const PRINTER_PRESETS: {
    readonly "bambu-a1": readonly [256, 256, 256];
    readonly "bambu-a1-mini": readonly [180, 180, 180];
    readonly "bambu-p1s": readonly [256, 256, 256];
    readonly "bambu-x1c": readonly [256, 256, 256];
    readonly "prusa-mk4": readonly [250, 210, 220];
};
export declare const Printer: Type.TObject<{
    format: Type.TLiteral<"printer/0.2">;
    preset: Type.TOptional<Type.TUnion<Type.TLiteral<string>[]>>;
    bed: Type.TOptional<Type.TTuple<[Type.TNumber, Type.TNumber, Type.TNumber]>>;
    clearance: Type.TOptional<Type.TNumber>;
    colour: Type.TOptional<Type.TString>;
}>;
export type Drawer = Static<typeof Drawer>;
export type Printer = Static<typeof Printer>;
export type Item = Static<typeof Item>;
export type Pose = Static<typeof Pose>;
export type Holder = Static<typeof Holder>;
export type Thing = Drawer["layout"][number];
/** A format's schema as a standalone JSON Schema document, as published in docs/format/. */
export declare function jsonSchema(kind: "drawer" | "printer"): object;
