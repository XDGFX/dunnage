import type { Method } from "../plan.ts";

// Where each holder method's library part, and the overlay's lock pin, is downloaded from (ADR
// 0001). There's no library index yet, so this table stands in for one; a part without an entry
// isn't in the library yet.

export interface LibraryPart {
  name: string;
  url: string;
}

export type Library = Partial<Record<Method | "lock-pin", LibraryPart>>;

export const LIBRARY: Library = {};
