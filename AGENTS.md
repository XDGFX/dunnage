# AGENTS.md

dunnage designs 3D-printable holders for the things in a drawer. Start with `README.md` for
what it does and the drawer file format.

## Layout

| Path | What |
|---|---|
| `src/core/` | The core. Runs in the browser and in Node, so no DOM and no Node APIs (`tsconfig.core.json` enforces it). |
| `src/cli/` | The `dunnage` bin, on top of the core. Node only. |
| `src/ui/` | The React app, built by Vite and deployed to GitHub Pages. |
| `fixtures/` | Real drawer and printer files. CI runs `dunnage check` over all of them. |
| `docs/format/` | The drawer and printer format specs, and their JSON Schemas (generated from `src/core/schema.ts`). |
| `scripts/` | Dev scripts, run with Bun. |
| `test/` | Vitest. |

three.js draws; manifold-3d (WASM, browser and Node) makes holder geometry.

## Commands

Bun is the package manager and runtime. The built CLI still runs on Node, so consumers can
use either.

```sh
bun install
bun run dev         # the UI
bun run typecheck   # core, CLI and UI, each against its own tsconfig
bun run test        # Vitest, on Bun (plain `bun test` is Bun's own runner: don't use it)
bun run build       # dist/ (core and CLI) and dist-site/ (the UI)
bun run validate    # dunnage check over fixtures/
bun run schema      # rewrite docs/format/*.schema.json after changing src/core/schema.ts
```

## Releases

Cal never thinks about releases, so every commit has to.

- **A commit that changes behaviour bumps `version` in `package.json`** in the same commit.
  While on 0.x: minor for a feature, patch for a fix. Docs, tests, CI and refactors that
  change nothing for a user don't bump.
- When `main` carries a version that has no tag, CI builds `dist/`, commits it on top of that
  commit (off `main`; `dist/` stays out of `main`), and tags the result `vX.Y.Z`. It then
  installs the tag with npm and with Bun and runs the `dunnage` bin, deleting the tag if either
  fails. Consumers such as Hailey pin `github:XDGFX/dunnage#vX.Y.Z`. Don't tag by hand.
- Only tags are installable: a branch or `main` has no `dist/`.
- Every push to `main` deploys the UI to GitHub Pages.
