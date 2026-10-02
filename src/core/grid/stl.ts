// Binary STL: an 80-byte header, a triangle count, then 50 bytes per triangle (normal, three
// vertices, a spare 16-bit field). Millimetres, by convention.

/** The parts of a manifold-3d Mesh that geometry here reads. */
export interface TriangleMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export function toStl(mesh: TriangleMesh, header = "dunnage"): Uint8Array {
  const count = mesh.triVerts.length / 3;
  const bytes = new Uint8Array(84 + 50 * count);
  const view = new DataView(bytes.buffer);
  // ASCII only: the core has no TextEncoder.
  for (let i = 0; i < Math.min(header.length, 80); i++) bytes[i] = header.charCodeAt(i) & 0x7f;
  view.setUint32(80, count, true);
  for (let t = 0; t < count; t++) {
    const [a, b, c] = triangle(mesh, t);
    const n = normal(a, b, c);
    const at = 84 + 50 * t;
    [n, a, b, c].forEach((v, i) => v.forEach((value, axis) => view.setFloat32(at + i * 12 + axis * 4, value, true)));
  }
  return bytes;
}

export type Vec3 = [number, number, number];

export function triangle(mesh: TriangleMesh, t: number): [Vec3, Vec3, Vec3] {
  const vertex = (i: number): Vec3 => {
    const at = mesh.triVerts[3 * t + i]! * mesh.numProp;
    return [mesh.vertProperties[at]!, mesh.vertProperties[at + 1]!, mesh.vertProperties[at + 2]!];
  };
  return [vertex(0), vertex(1), vertex(2)];
}

/** The unit normal of a counter-clockwise triangle, or zero for a degenerate one. */
export function normal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const length = Math.hypot(...n);
  return length === 0 ? [0, 0, 0] : [n[0] / length, n[1] / length, n[2] / length];
}
