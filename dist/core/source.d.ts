export type Path = (string | number)[];
/** A value as the files write it: lists and maps in flow style, strings quoted only when they must be. */
export declare function flow(value: unknown): string;
/** Sets the value at `path`, adding it, and any maps on the way, if it isn't there. */
export declare function setIn(text: string, path: Path, value: unknown): string;
/** Removes the field at `path`. A missing field leaves the file as it is. */
export declare function deleteIn(text: string, path: Path): string;
/** Adds `value` to the end of the list at `path`, starting the list if it isn't there. */
export declare function appendIn(text: string, path: Path, value: unknown): string;
/** Removes the entry at `path` from its list. */
export declare function removeIn(text: string, path: Path): string;
/** The lines, counting from 1, that the entry at `path` spans; null when it isn't there. */
export declare function linesOf(text: string, path: Path): [number, number] | null;
