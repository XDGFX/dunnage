import type { ManifoldToplevel } from "manifold-3d";

// Frees every manifold and cross-section an export makes. manifold-3d's own lib/garbage-collector
// wraps methods on a prototype its instances don't use, so it frees nothing a method returns.

interface Handle {
  delete(): void;
  isDeleted(): boolean;
}

const made = new Set<Handle>();
const collected = new WeakSet<ManifoldToplevel>();

const isHandle = (value: unknown): value is Handle =>
  typeof value === "object" && value !== null && typeof (value as Handle).delete === "function" && typeof (value as Handle).isDeleted === "function";

/** Wraps every function on `owner`, and those it inherits, to note each handle it returns. */
function wrap(owner: Record<string, unknown>) {
  const methods = new Map<string, (...args: unknown[]) => unknown>();
  for (let level: object | null = owner; level && level !== Object.prototype && level !== Function.prototype; level = Object.getPrototypeOf(level)) {
    for (const name of Object.getOwnPropertyNames(level)) {
      const value = Object.getOwnPropertyDescriptor(level, name)?.value;
      if (typeof value === "function" && !methods.has(name) && !["constructor", "delete", "isDeleted", "deleteLater"].includes(name)) methods.set(name, value);
    }
  }
  for (const [name, original] of methods) {
    owner[name] = function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      for (const value of Array.isArray(result) ? result : [result]) if (isHandle(value)) made.add(value);
      return result;
    };
  }
}

/** From now on, notes every handle made on this instance, for `freeAll`. */
export function collect(wasm: ManifoldToplevel): void {
  if (collected.has(wasm)) return;
  collected.add(wasm);
  wasm.setup();
  const { Manifold, CrossSection } = wasm;
  const manifold = Manifold.cube([1, 1, 1]);
  const section = CrossSection.square([1, 1]);
  wrap(Object.getPrototypeOf(manifold));
  wrap(Object.getPrototypeOf(section));
  manifold.delete();
  section.delete();
  wrap(Manifold as unknown as Record<string, unknown>);
  wrap(CrossSection as unknown as Record<string, unknown>);
}

/** Deletes every handle noted since the last call. */
export function freeAll(): void {
  for (const handle of made) if (!handle.isDeleted()) handle.delete();
  made.clear();
}
