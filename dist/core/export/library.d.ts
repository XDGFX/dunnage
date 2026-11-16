import type { Method } from "../plan.ts";
export interface LibraryPart {
    name: string;
    url: string;
}
export type Library = Partial<Record<Method, LibraryPart>>;
export declare const LIBRARY: Library;
