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
/**
 * Reads a drawer or printer file's `format: kind/version` line. A file newer than this copy of
 * dunnage is refused rather than guessed at.
 */
export declare function readHeader(text: string): Header;
