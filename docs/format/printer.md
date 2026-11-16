# printer/0.3

A printer profile says what fits on a printer, and how its prints fit together. It's user data,
kept beside the drawer files that name it (`printer: p1s` in a drawer means `p1s.printer.yml` in
the same folder), not a setting inside dunnage.

The JSON Schema is [printer-0.3.schema.json](printer-0.3.schema.json). The worked example is
[`fixtures/p1s.printer.yml`](../../fixtures/p1s.printer.yml).

```yaml
format: printer/0.3
preset: bambu-p1s
bed: [256, 256, 256]
fit: { joiner: 0.3 }
```

| Field | Default | What |
|---|---|---|
| `format` | | `printer/0.3` |
| `preset` | | A common printer, which fills in `bed`. |
| `bed` | the preset's | Usable `[x, y, z]` in mm. Holders bigger than this are split or flagged. |
| `clearance` | 0.3 | Added per side, in mm, where printed walls meet a thing. |
| `colour` | black | Only for drawing the preview. |
| `fit` | the grid parameters' | Calibrated fits for the `grid` base. See below. |

A file needs a `bed`, a `preset`, or both; a `bed` overrides the preset's.

## `fit`

The fits depend on the printer and filament, not the drawer, so they live here. Print the
calibration ([grid-calibration.md](../grid-calibration.md)) and set what yours changed. Each field
left out takes the value in the grid parameters file (`src/core/grid/parameters.json`), which was
calibrated on a P1S in PETG. Those defaults apply to every printer, not only the `bambu-p1s` preset.
`dunnage check` warns about a grid variant the parameters file has no hole size for.

| Field | What |
|---|---|
| `grid_hole` | Board hole diameter in mm, by variant: `{ light-thin: 3.2 }`. A variant set here is merged over the defaults. |
| `peg` | How much smaller a peg is than a board hole, across the diameter, in mm. |
| `peg_fixed` | How much smaller a peg is than a holder's own hole, for a peg that stays put, in mm. |
| `joiner` | Radial clearance of a joiner's rings over the bosses, in mm. Negative is interference. |

## Presets

| `preset` | `bed` |
|---|---|
| `bambu-a1` | 256 × 256 × 256 |
| `bambu-a1-mini` | 180 × 180 × 180 |
| `bambu-p1s` | 256 × 256 × 256 |
| `bambu-x1c` | 256 × 256 × 256 |
| `prusa-mk4` | 250 × 210 × 220 |

For anything else, leave `preset` out and set `bed` by hand.
