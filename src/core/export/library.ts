import type { Method } from "../plan.ts";

// Where each holder method's library part is downloaded from (ADR 0001). There's no library index
// yet, so this table stands in for one; a method without an entry isn't in the library yet.

export interface LibraryPart {
  name: string;
  url: string;
}

export type Library = Partial<Record<Method, LibraryPart>>;

export const LIBRARY: Library = {};
