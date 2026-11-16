import type { TriangleMesh } from "../grid/stl.ts";
export interface PlacedPart {
    name: string;
    mesh: TriangleMesh;
    /** Where each copy's origin goes on the bed, in mm. */
    at: readonly (readonly [number, number, number])[];
}
export declare const MODEL_PATH = "3D/3dmodel.model";
export declare function model(parts: readonly PlacedPart[], title: string): string;
/** A 3MF package, zipped. */
export declare function to3mf(parts: readonly PlacedPart[], title: string): Uint8Array;
