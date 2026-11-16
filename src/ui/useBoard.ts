import { useEffect, useState } from "react";
import * as THREE from "three";
import type { BoardLayout } from "../core/index.ts";
import type { BoardJob, BoardMesh, BoardPart } from "./boardWorker.ts";

// A grid board's solids for the 3D view, built by a few workers and arriving a part at a time.
// The same layout isn't built twice, so moving things about leaves the board alone.

export interface BoardSolids {
  /** Built parts, by `tile-<index>` or `bumper-<index>`. */
  geometries: Map<string, THREE.BufferGeometry>;
  total: number;
}

export const partKey = (part: BoardPart) => `${part.kind}-${part.index}`;

export function useBoard(layout: BoardLayout | undefined): BoardSolids | null {
  const key = layout ? JSON.stringify(layout) : "";
  const [solids, setSolids] = useState<BoardSolids | null>(null);

  useEffect(() => {
    if (!layout || !layout.tiles.length) return setSolids(null);
    // Bumpers are quick, so they come first; tiles share the workers round-robin.
    const parts: BoardPart[] = [
      ...layout.bumpers.map((_, index) => ({ kind: "bumper" as const, index })),
      ...layout.tiles.map((_, index) => ({ kind: "tile" as const, index })),
    ];
    const count = Math.max(1, Math.min(parts.length, (navigator.hardwareConcurrency || 4) - 1, 6));
    const geometries = new Map<string, THREE.BufferGeometry>();
    setSolids({ geometries, total: parts.length });
    const workers = Array.from({ length: count }, (_, w) => {
      const worker = new Worker(new URL("./boardWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<BoardMesh>) => {
        const { positions, indices } = event.data;
        const shared = new THREE.BufferGeometry();
        shared.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        shared.setIndex(new THREE.BufferAttribute(indices, 1));
        // Unshared vertices give flat faces, not normals smoothed round every edge.
        const geometry = shared.toNonIndexed();
        shared.dispose();
        geometry.computeVertexNormals();
        geometries.set(partKey(event.data), geometry);
        setSolids({ geometries, total: parts.length });
      };
      const job: BoardJob = { layout, parts: parts.filter((_, k) => k % count === w) };
      worker.postMessage(job);
      return worker;
    });
    return () => {
      for (const worker of workers) worker.terminate();
      for (const geometry of geometries.values()) geometry.dispose();
    };
    // The key stands for the layout, which is a new object after every edit.
  }, [key]);

  return solids;
}
