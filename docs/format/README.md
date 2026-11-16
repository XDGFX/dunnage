# File formats

dunnage reads two kinds of YAML file. Each is a public contract with its own version, separate
from dunnage's.

| Format | File | Spec | JSON Schema |
|---|---|---|---|
| `drawer/0.4` | `<name>.drawer.yml` | [drawer.md](drawer.md) | [drawer-0.4.schema.json](drawer-0.4.schema.json) |
| `printer/0.3` | `<name>.printer.yml` | [printer.md](printer.md) | [printer-0.3.schema.json](printer-0.3.schema.json) |

The older schemas stay here for files that still name them.

Every file starts with a `format: <kind>/<version>` line.

## Versions

A format version is `major.minor`, compared as numbers, so `0.10` is newer than `0.2`.

- **Older files are migrated when they're read.** dunnage steps the file up one version at a
  time to the version it writes. A file older than the oldest migration is refused.
- **Newer files are refused**, not guessed at. Update dunnage to read them.
- The format version changes only when the file changes. A dunnage release that reads and writes
  the same files leaves it alone.

Migrations are kept in `MIGRATIONS` in `src/core/format.ts`.

| From | To | What changed |
|---|---|---|
| `drawer/0.2` | `drawer/0.3` | Added the drawer's shape (`preset`, `walls`, `corner_radius`, `floor_edge`; `inside` may come from a preset), `base.kind: grid`, and holders' `fix`. Nothing to rewrite. |
| `printer/0.2` | `printer/0.3` | Added `fit`. Nothing to rewrite. |
| `drawer/0.3` | `drawer/0.4` | Added a pegboard's `overlays`, and holders' `on`. Nothing to rewrite. |

## Checking a file

```sh
dunnage check drawers/coffee.drawer.yml drawers/p1s.printer.yml
```

Each problem is one line: the file, line and column, the path to the field, and what's wrong.

```text
drawers/coffee.drawer.yml:94:5: layout[2].item: coastr is not an item. Items are: kettle, scales, …
drawers/coffee.drawer.yml: 1 problem
```

A warning is something worth knowing that isn't wrong, such as a built-in drawer nobody has
measured yet. It's printed the same way, marked `warning:`, and doesn't fail the check.

`--json` prints the same as a JSON array of `{ file, format, migratedFrom?, problems: [{ path,
message, line?, column? }], warnings? }`, `warnings` shaped like `problems`. Paths are written
`layout[3].at`, the empty path meaning the whole file. The command exits 1 if any file has a
problem.

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
# yaml-language-server: $schema=https://raw.githubusercontent.com/XDGFX/dunnage/main/docs/format/drawer-0.4.schema.json
```

## Changing a format

The schemas are written in TypeScript in `src/core/schema.ts`; the JSON files here are generated
from them with `bun run schema`, and a test fails if they're out of date. A change to a format
bumps its version, adds a migration from the old version, and updates the spec here.
