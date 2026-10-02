import { Drawer, Printer } from "./schema.ts";
/** Something wrong with a file: where it is, as a path such as `layout[3].at` and a line, and what to fix. */
export interface Problem {
    path: string;
    message: string;
    line?: number;
    column?: number;
}
export interface CheckResult {
    /** The format the file is in once read, such as `drawer/0.2`. Absent when the format line is unreadable. */
    format?: string;
    /** The format the file was written in, when it was older and has been migrated. */
    migratedFrom?: string;
    problems: Problem[];
}
export type LoadedPrinter = Printer & {
    bed: [number, number, number];
};
export type DunnageFile = {
    kind: "drawer";
    drawer: Drawer;
} | {
    kind: "printer";
    printer: LoadedPrinter;
};
export declare class FormatError extends Error {
    readonly problems: Problem[];
    constructor(problems: Problem[]);
}
export interface CheckOptions {
    /**
     * Whether the printer profile a drawer names, `<name>.printer.yml`, is beside it. The core
     * can't look at files, so without this the name goes unchecked.
     */
    printerExists?: (name: string) => boolean;
}
/** Reads a drawer or printer file and reports everything wrong with it. */
export declare function check(text: string, options?: CheckOptions): CheckResult;
/** Reads a drawer or printer file, migrated to the current format. Throws a `FormatError` if anything is wrong. */
export declare function load(text: string): DunnageFile;
/**
 * Reads a drawer or printer file for editing: everything wrong with it, and the file itself
 * whenever its shape is right, so a drawer with things overlapping can still be shown and fixed.
 */
export declare function read(text: string, options?: CheckOptions): CheckResult & {
    file?: DunnageFile;
};
