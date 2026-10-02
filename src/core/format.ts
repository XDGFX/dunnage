import { parse } from "yaml";

/** The file formats this copy of dunnage reads, each at the version it writes. */
export const FORMATS = {
  drawer: "0.2",
  printer: "0.2",
} as const;

export type FormatKind = keyof typeof FORMATS;

export interface Header {
  kind: FormatKind;
  version: string;
}

/**
 * Reads a drawer or printer file's `format: kind/version` line. A file newer than this copy of
 * dunnage is refused rather than guessed at.
 */
export function readHeader(text: string): Header {
  const document: unknown = parse(text);
  const format = (document as { format?: unknown } | null)?.format;
  if (typeof format !== "string") throw new Error("no `format:` line, so this is not a dunnage file");

  const [kind, version] = format.split("/");
  if (!Object.hasOwn(FORMATS, kind)) throw new Error(`unknown format ${format}`);
  const supported = FORMATS[kind as FormatKind];
  if (version !== supported) {
    throw new Error(`format ${format} is not supported: this copy of dunnage reads ${kind}/${supported}`);
  }
  return { kind: kind as FormatKind, version };
}
