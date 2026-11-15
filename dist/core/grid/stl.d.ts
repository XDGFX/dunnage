/** The parts of a manifold-3d Mesh that geometry here reads. */
export interface TriangleMesh {
    numProp: number;
    vertProperties: Float32Array;
    triVerts: Uint32Array;
}
export declare function toStl(mesh: TriangleMesh, header?: string): Uint8Array;
export type Vec3 = [number, number, number];
export declare function triangle(mesh: TriangleMesh, t: number): [Vec3, Vec3, Vec3];
/** The unit normal of a counter-clockwise triangle, or zero for a degenerate one. */
export declare function normal(a: Vec3, b: Vec3, c: Vec3): Vec3;
export declare function area(a: Vec3, b: Vec3, c: Vec3): number;
