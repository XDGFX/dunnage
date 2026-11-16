import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { GRID, type BoardLayout, type Fit } from "../core/index.ts";
import type { BoardJob, BoardMesh, BoardPart, BoardReply } from "./boardWorker.ts";

// A grid board for the 3D view: one group that outlives the scene around it, with a block for each
// tile and bumper that a few workers replace with its solid as it's built. The same layout and fits
// aren't built twice, so moving things about leaves the board alone.

const COLOURS = { tile: 0x3a3a40, bumper: 0x55555c };
const MOST_WORKERS = 6;

export const partKey = (part: BoardPart) => `${part.kind}-${part.index}`;

export interface Board {
  /** The board, for the scene to add to its root; null with no board to show. */
  group: RefObject<THREE.Group | null>;
  /** How the build is going, or null once it's done. */
  status: string | null;
}

/** Builds the board for `layout`, calling `redraw` as each part arrives. */
export function useBoard(layout: BoardLayout | undefined, fit: Fit, redraw: RefObject<(() => void) | null>): Board {
  const group = useRef<THREE.Group | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const key = layout?.tiles.length ? JSON.stringify([layout, fit]) : "";

  useEffect(() => {
    if (!layout || !key) return setStatus(null);
    const board = new THREE.Group();
    const solid = { tile: new THREE.MeshStandardMaterial({ color: COLOURS.tile, roughness: 0.75 }), bumper: new THREE.MeshStandardMaterial({ color: COLOURS.bumper, roughness: 0.75 }) };
    const pending = { tile: new THREE.MeshStandardMaterial({ color: COLOURS.tile, transparent: true, opacity: 0.35 }), bumper: new THREE.MeshStandardMaterial({ color: COLOURS.bumper, transparent: true, opacity: 0.35 }) };
    // Bumpers are quick, so they come first.
    const parts: BoardPart[] = [
      ...layout.bumpers.map((_, index) => ({ kind: "bumper" as const, index })),
      ...layout.tiles.map((_, index) => ({ kind: "tile" as const, index })),
    ];
    const height = GRID.thickness;
    for (const part of parts) {
      const box = part.kind === "tile" ? layout.tiles[part.index].box : layout.bumpers[part.index].floor;
      const block = new THREE.Mesh(new THREE.BoxGeometry(box.x1 - box.x0, height, box.y1 - box.y0), pending[part.kind]);
      // Drawer x, y, z to three.js x, z, -y.
      block.position.set((box.x0 + box.x1) / 2, height / 2, -(box.y0 + box.y1) / 2);
      block.name = partKey(part);
      board.add(block);
    }
    group.current = board;

    let built = 0;
    const progress = () => setStatus(built < parts.length ? `Building the board: ${built} of ${parts.length} parts` : null);
    progress();
    const count = Math.max(1, Math.min(parts.length, (navigator.hardwareConcurrency || 4) - 1, MOST_WORKERS));
    const workers: Worker[] = [];
    const stop = () => workers.forEach((worker) => worker.terminate());
    const fail = (why: string) => {
      stop();
      setStatus(`Couldn't build the board in 3D: ${why}`);
    };
    for (let w = 0; w < count; w++) {
      const share = parts.filter((_, k) => k % count === w);
      let left = share.length;
      const worker = new Worker(new URL("./boardWorker.ts", import.meta.url), { type: "module" });
      worker.onerror = (event) => fail(event.message || "the worker stopped");
      worker.onmessage = (event: MessageEvent<BoardReply>) => {
        if ("error" in event.data) return fail(event.data.error);
        swap(board, event.data, solid[event.data.kind]);
        built++;
        if (--left === 0) worker.terminate();
        progress();
        redraw.current?.();
      };
      const job: BoardJob = { layout, fit, parts: share };
      worker.postMessage(job);
      workers.push(worker);
    }

    return () => {
      stop();
      board.parent?.remove(board);
      board.traverse((object) => object instanceof THREE.Mesh && object.geometry.dispose());
      for (const material of [...Object.values(solid), ...Object.values(pending)]) material.dispose();
      if (group.current === board) group.current = null;
    };
    // The key stands for the layout and fits, which are new objects after every edit.
  }, [key]);

  return { group, status };
}

/** Puts a built part in place of its block. */
function swap(board: THREE.Group, part: BoardMesh, material: THREE.Material) {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
  indexed.setIndex(new THREE.BufferAttribute(part.indices, 1));
  // Unshared vertices give flat faces, not normals smoothed round every edge.
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  const block = board.getObjectByName(partKey(part));
  if (block instanceof THREE.Mesh) {
    block.geometry.dispose();
    board.remove(block);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  board.add(mesh);
}
