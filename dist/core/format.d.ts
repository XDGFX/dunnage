/** The file formats this copy of dunnage reads, each at the version it writes. */
export declare const FORMATS: {
    readonly drawer: "0.2";
    readonly printer: "0.2";
};
export type FormatKind = keyof typeof FORMATS;
export interface Header {
    kind: FormatKind;
    version: string;
}
type Document = Record<string, unknown>;
/** One step from a format version to the next. */
export interface Migration {
    to: string;
    up: (document: Document) => Document;
}
export type Migrations = Partial<Record<FormatKind, Record<string, Migration>>>;
/** Steps from each older version of a format to the next, keyed by the version they start from. */
export declare const MIGRATIONS: Migrations;
/**
 * Reads a drawer or printer file's `format: kind/version` line. A file newer than this copy of
 * dunnage is refused rather than guessed at; an older one is left for `migrate`.
 */
export declare function readHeader(document: unknown): Header;
/** Steps a document written at `version` up to the current format. A current document is returned as it is. */
export declare function migrate(document: Document, kind: FormatKind, version: string, migrations?: Partial<Record<"drawer" | "printer", Record<string, Migration>>>): Document;
export {};
