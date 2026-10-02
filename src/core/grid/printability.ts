import { normal, triangle, type TriangleMesh } from "./stl.ts";

// Every part prints without supports: nothing may face further down than 45° from vertical,
// except the faces lying on the bed at z = 0.

const BED = 1e-4;
// Faces at exactly 45° (chamfers, cone dots) pass despite float error.
const SLACK = 1e-3;

/** How many triangles would need support, printed as the mesh lies, with the bed at z = 0. */
export function overhangs(mesh: TriangleMesh): number {
  const limit = -Math.cos(Math.PI / 4) - SLACK;
  let count = 0;
  for (let t = 0; t < mesh.triVerts.length / 3; t++) {
    const [a, b, c] = triangle(mesh, t);
    if (Math.max(a[2], b[2], c[2]) < BED) continue;
    if (normal(a, b, c)[2] < limit) count++;
  }
  return count;
}
