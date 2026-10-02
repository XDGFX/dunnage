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
| `test/` | Vitest. |

three.js draws; manifold-3d (WASM, browser and Node) makes holder geometry.

## Commands

```sh
npm run dev         # the UI
npm run typecheck   # core, CLI and UI, each against its own tsconfig
npm test            # Vitest
npm run build       # dist/ (core and CLI) and dist-site/ (the UI)
npm run validate    # dunnage check over fixtures/
```

## Releases

Cal never thinks about releases, so every commit has to.

- **A commit that changes behaviour bumps `version` in `package.json`** in the same commit.
  While on 0.x: minor for a feature, patch for a fix. Docs, tests, CI and refactors that
  change nothing for a user don't bump.
- When `main` carries a version that has no tag, CI tags `vX.Y.Z` and checks that
  `github:XDGFX/dunnage#vX.Y.Z` installs and its `dunnage` bin runs. Consumers such as Hailey
  pin those tags. Don't tag by hand.
- Every push to `main` deploys the UI to GitHub Pages.
