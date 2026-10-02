# printer/0.2

A printer profile says what fits on a printer. It's user data, kept beside the drawer files
that name it (`printer: p1s` in a drawer means `p1s.printer.yml` in the same folder), not a
setting inside dunnage.

The JSON Schema is [printer-0.2.schema.json](printer-0.2.schema.json). The worked example is
[`fixtures/p1s.printer.yml`](../../fixtures/p1s.printer.yml).

```yaml
format: printer/0.2
preset: bambu-p1s
bed: [256, 256, 256]
```

| Field | Default | What |
|---|---|---|
| `format` | | `printer/0.2` |
| `preset` | | A common printer, which fills in `bed`. |
| `bed` | the preset's | Usable `[x, y, z]` in mm. Holders bigger than this are split or flagged. |
| `clearance` | 0.3 | Added per side, in mm, where printed walls meet a thing. |
| `colour` | black | Only for drawing the preview. |

A file needs a `bed`, a `preset`, or both; a `bed` overrides the preset's.

## Presets

| `preset` | `bed` |
|---|---|
| `bambu-a1` | 256 × 256 × 256 |
| `bambu-a1-mini` | 180 × 180 × 180 |
| `bambu-p1s` | 256 × 256 × 256 |
| `bambu-x1c` | 256 × 256 × 256 |
| `prusa-mk4` | 250 × 210 × 220 |

For anything else, leave `preset` out and set `bed` by hand.
