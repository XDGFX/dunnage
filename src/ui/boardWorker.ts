import Module, { type Manifold } from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { bumperSolid, tileSolid, type BoardLayout, type Fit } from "../core/index.ts";

// Builds grid board parts off the main thread: a full tile takes manifold several seconds.

export type BoardPart = { kind: "tile" | "bumper"; index: number };
export interface BoardJob { layout: BoardLayout; fit: Fit; parts: BoardPart[] }
/** One part's triangles, already in three.js axes: x right, y up, z towards the front. */
export interface BoardMesh extends BoardPart { positions: Float32Array; indices: Uint32Array }
export type BoardReply = BoardMesh | { error: string };

const ready = Module({ locateFile: () => wasmUrl }).then((wasm) => {
  wasm.setup();
  return wasm;
});

const post = (reply: BoardReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);

self.onmessage = async (event: MessageEvent<BoardJob>) => {
  const { layout, fit, parts } = event.data;
  try {
    const wasm = await ready;
    for (const part of parts) {
      const solid: Manifold = part.kind === "tile" ? tileSolid(wasm, layout, layout.tiles[part.index], fit) : bumperSolid(wasm, layout, layout.bumpers[part.index], fit);
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
      post({ ...part, positions, indices }, [positions.buffer, indices.buffer]);
    }
  } catch (error) {
    post({ error: error instanceof Error ? error.message : String(error) });
  }
};
