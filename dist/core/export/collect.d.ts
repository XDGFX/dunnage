import type { ManifoldToplevel } from "manifold-3d";
/** From now on, notes every handle made on this instance, for `freeAll`. */
export declare function collect(wasm: ManifoldToplevel): void;
/** Deletes every handle noted since the last call. */
export declare function freeAll(): void;
