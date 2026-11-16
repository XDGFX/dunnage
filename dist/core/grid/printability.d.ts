import { type TriangleMesh } from "./stl.ts";
/** How many triangles would need support, printed as the mesh lies, with the bed at z = 0. */
export declare function overhangs(mesh: TriangleMesh): number;
