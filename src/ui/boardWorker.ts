import Module, { type Manifold } from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { bumperSolid, tileSolid, type BoardLayout } from "../core/index.ts";

// Builds grid board parts off the main thread: a full tile takes manifold several seconds.

export type BoardPart = { kind: "tile" | "bumper"; index: number };
export interface BoardJob { layout: BoardLayout; parts: BoardPart[] }
/** One part's triangles, already in three.js axes: x right, y up, z towards the front. */
export interface BoardMesh extends BoardPart { positions: Float32Array; indices: Uint32Array }

const ready = Module({ locateFile: () => wasmUrl }).then((wasm) => {
  wasm.setup();
  return wasm;
});

self.onmessage = async (event: MessageEvent<BoardJob>) => {
  const wasm = await ready;
  const { layout, parts } = event.data;
  for (const part of parts) {
    const solid: Manifold = part.kind === "tile" ? tileSolid(wasm, layout, layout.tiles[part.index]) : bumperSolid(wasm, layout, layout.bumpers[part.index]);
    const mesh = solid.getMesh();
    solid.delete();
    const count = mesh.vertProperties.length / mesh.numProp;
    const positions = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      const at = v * mesh.numProp;
      positions[3 * v] = mesh.vertProperties[at];
      positions[3 * v + 1] = mesh.vertProperties[at + 2];
      positions[3 * v + 2] = -mesh.vertProperties[at + 1];
    }
    const indices = new Uint32Array(mesh.triVerts);
    const out: BoardMesh = { ...part, positions, indices };
    (self as unknown as Worker).postMessage(out, [positions.buffer, indices.buffer]);
  }
};
