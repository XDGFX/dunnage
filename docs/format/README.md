# File formats

dunnage reads two kinds of YAML file. Each is a public contract with its own version, separate
from dunnage's.

| Format | File | Spec | JSON Schema |
|---|---|---|---|
| `drawer/0.2` | `<name>.drawer.yml` | [drawer.md](drawer.md) | [drawer-0.2.schema.json](drawer-0.2.schema.json) |
| `printer/0.2` | `<name>.printer.yml` | [printer.md](printer.md) | [printer-0.2.schema.json](printer-0.2.schema.json) |

Every file starts with a `format: <kind>/<version>` line.

## Versions

A format version is `major.minor`, compared as numbers, so `0.10` is newer than `0.2`.

- **Older files are migrated when they're read.** dunnage steps the file up one version at a
  time to the version it writes. A file older than the oldest migration is refused.
- **Newer files are refused**, not guessed at. Update dunnage to read them.
- The format version changes only when the file changes. A dunnage release that reads and writes
  the same files leaves it alone.

`drawer/0.2` and `printer/0.2` are the first published formats, so there are no migrations yet.
They're kept in `MIGRATIONS` in `src/core/format.ts`.

## Checking a file

```sh
dunnage check drawers/coffee.drawer.yml drawers/p1s.printer.yml
```

Each problem is one line: the file, line and column, the path to the field, and what's wrong.

```text
drawers/coffee.drawer.yml:94:5: layout[2].item: coastr is not an item. Items are: kettle, scales, …
drawers/coffee.drawer.yml: 1 problem
```

`--json` prints the same as a JSON array of `{ file, format, migratedFrom?, problems: [{ path,
message, line?, column? }] }`. Paths are written `layout[3].at`, the empty path meaning the
whole file. The command exits 1 if any file has a problem.

A check runs in three stages, and stops at the first that finds a problem:

1. **YAML**: the file parses, with no duplicate keys.
2. **Schema**: the file matches its JSON Schema. Unknown fields are refused, so a misspelt field
   is reported, not ignored.
3. **The rest**: what a schema can't express, listed under *Checks* in each spec.

In code, `check(text)` returns the same result, and `load(text)` returns the file migrated to
the current format, or throws a `FormatError` carrying the problems. Both come from the
`dunnage` package and run in the browser and in Node.

## Editors

The YAML language server (VS Code's YAML extension, among others) validates as you type with a
first line such as:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/XDGFX/dunnage/main/docs/format/drawer-0.2.schema.json
```

## Changing a format

The schemas are written in TypeScript in `src/core/schema.ts`; the JSON files here are generated
from them with `bun run schema`, and a test fails if they're out of date. A change to a format
bumps its version, adds a migration from the old version, and updates the spec here.
