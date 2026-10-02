/** The file formats this copy of dunnage reads, each at the version it writes. */
export const FORMATS = {
    drawer: "0.2",
    printer: "0.2",
};
/** Steps from each older version of a format to the next, keyed by the version they start from. */
export const MIGRATIONS = {
// None yet: drawer/0.2 and printer/0.2 are the first published formats.
};
/**
 * Reads a drawer or printer file's `format: kind/version` line. A file newer than this copy of
 * dunnage is refused rather than guessed at; an older one is left for `migrate`.
 */
export function readHeader(document) {
    const format = document?.format;
    if (typeof format !== "string")
        throw new Error("no `format:` line, so this is not a dunnage file");
    const [kind, version = ""] = format.split("/");
    if (!Object.hasOwn(FORMATS, kind) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`unknown format ${format}: dunnage reads ${Object.entries(FORMATS).map(([k, v]) => `${k}/${v}`).join(" and ")}`);
    }
    const current = FORMATS[kind];
    if (compareVersions(version, current) > 0) {
        throw new Error(`${format} is newer than this copy of dunnage, which reads up to ${kind}/${current}. Update dunnage to read it.`);
    }
    return { kind: kind, version };
}
/** Steps a document written at `version` up to the current format. A current document is returned as it is. */
export function migrate(document, kind, version, migrations = MIGRATIONS) {
    let at = version;
    let migrated = document;
    while (at !== FORMATS[kind]) {
        const step = migrations[kind]?.[at];
        if (!step) {
            throw new Error(`${kind}/${version} is older than this copy of dunnage can read: there is no migration from ${kind}/${at}`);
        }
        migrated = step.up(migrated);
        at = step.to;
    }
    return at === version ? document : { ...migrated, format: `${kind}/${at}` };
}
/** Compares two `major.minor` versions numerically, so 0.10 is newer than 0.2. */
function compareVersions(a, b) {
    const [aMajor, aMinor] = a.split(".").map(Number);
    const [bMajor, bMinor] = b.split(".").map(Number);
    return aMajor - bMajor || aMinor - bMinor;
}
