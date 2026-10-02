# Grid base calibration

Test prints that settle the open numbers in the `grid` base spec ([#6](https://github.com/XDGFX/dunnage/issues/6)),
for [#7](https://github.com/XDGFX/dunnage/issues/7). The geometry is in `src/core/grid/`, so #8 can build on it.

The values found here are for one printer, filament and slicer profile. They become the `bambu-p1s`
preset's `fit:` defaults; anyone else prints the same calibration and sets their own.

## Printing

```sh
bun scripts/grid-calibration.ts round-1
# then, with round one's answers:
bun scripts/grid-calibration.ts round-2 --variant light=3.3 --variant standard=3.4 --clip bow-tie:3 --clearance 0.1
```

STLs and a parts list (`README.md`, with estimated weights) go to `out/grid-calibration/<round>/`.
Every part is exported face-down, as it prints: drop the STLs in and don't rotate them. Labels are cone
dots on the face (the bed side). Count them.

Record the setup, since every number below depends on it:

| Setting | Value |
|---|---|
| Printer, nozzle | P1S, 0.4 mm |
| Filament (brand, colour) | |
| Bambu Studio process profile | e.g. 0.20 mm Standard @BBL P1S |
| Wall loops | default (2) |
| Supports, brim | off, off |

Check the slicer preview of the `light` bosses: the 0.9 mm wall should slice as 2 walls, not 1 wall
and gap fill. If it doesn't, note what it does.

## Round one

Parts: `holes-standard`, `holes-light`, `holes-light-thick`, `clip-coupon-left`, `clip-coupon-right`, `clips`.

### Screw pilot holes

Each variant's piece has 1 (standard), 2 (light) or 3 (light-thick) dots at the back-left corner.
`light-thick` is `light` with a 1.2 mm boss wall instead of 0.9 mm (OD 5.8). It answers whether the
thin wall is enough.

The columns with 1–5 dots under them are 3.0, 3.2, 3.4, 3.6 and 3.8 mm, 4 holes each. Drive a 4×12 wood
screw into each. Keep the smallest that goes in without splitting the boss and bites hard.

| Variant | 3.0 | 3.2 | 3.4 | 3.6 | 3.8 | Chosen |
|---|---|---|---|---|---|---|
| standard | | | | | | |
| light | | | | | | |
| light-thick | | | | | | |

(Per cell: splits / bites hard / bites / spins.)

### Clips

The coupons lie back up, edge to edge. Each has 4 pockets, numbered by the dots beside them:

| Dots | Shape | Pocket depth |
|---|---|---|
| 1 | bow-tie | 3 mm |
| 2 | bow-tie | 4 mm |
| 3 | bar | 2.5 mm |
| 4 | bar | 3.5 mm |

- **Bow-tie:** round heads in the gap squares either side of the join, and a neck between the edge
  bosses. Its shape holds the tiles together; friction holds it in.
- **Bar:** a bar across the join with a leg at each end. The legs drop into notches and snap a barb
  into a groove. Printed on its side, so the legs flex along the layers.

Each clip has its type's dots at one end and its clearance's at the other. The clearances are 0.05,
0.10, 0.15 and 0.20 mm, under 1–4 dots. For each type, keep the clearance that:

- holds the join without play;
- stays in when the joined coupons are picked up and turned back down (the bow-tie has no snap, so
  this is friction alone; the bar should click);
- can still be prised out.

The coupons are `light` only. A pocket is cut into its own solid cup, the same in every variant, so
the fit doesn't depend on the variant. Round two's 2 × 2 sets check the chosen clip in each variant.

The pockets reach 9.5 mm into the tile, past the 3 mm perimeter band in #6 §3: a clip head sits in the
gap between four bosses, because there's no room for it between the edge bosses and the edge.

| Type | 0.05 | 0.10 | 0.15 | 0.20 | Notes |
|---|---|---|---|---|---|
| 1 bow-tie 3 | | | | | |
| 2 bow-tie 4 | | | | | |
| 3 bar 2.5 | | | | | |
| 4 bar 3.5 | | | | | |

**Chosen:** shape, depth, clearance.

## Round two

Run with the variants that survived round one, each with its chosen hole. Parts per variant:
`pins-<variant>`, `pegs-<variant>`, 4 × `tile-8x8-<variant>` and `tile-25x25-<variant>`. Shared:
`clips` (10 per 2 × 2 set) and one `test-holder` per variant.

### Pin interference

As in #6 §6, every hole is the chosen size and the pegs are bigger by the interference: 0.00–0.25 mm
in 0.05 mm steps. The pegs are counted by the 1–6 rings at their top, two of each. Press the peg with
n rings, rings up, into the column with n dots. Keep the one that's hard to pull out by hand.

| Variant | 0.00 | 0.05 | 0.10 | 0.15 | 0.20 | 0.25 | Chosen |
|---|---|---|---|---|---|---|---|
| standard | | | | | | | |
| light | | | | | | | |
| light-thick | | | | | | | |

### Print checks (#6 §10)

| Check | standard | light | light-thick |
|---|---|---|---|
| No boss splits at the chosen hole | | | |
| Test holder on one 4×12 resists a firm hand pull | | | |
| A screw refits 5 times in one hole and still bites | | | |
| The 2 × 2 set lifts as one piece by a corner | | | |
| Holder on one screw with 1 kg doesn't move when shaken | | | |
| `tile-25x25` weight (estimate: light 124 g, light-thick 154 g, standard 265 g) | | | |

### Outcome

- Variants kept, and the default:
- `fit:` for the `bambu-p1s` preset: `grid_hole`, `pin_interference` (per variant, if they differ),
  `clip_clearance`.

Then update #6 with the final values and close its open questions on clip shape and the `light`
boss wall. Also:

- §2's weights;
- §3's pockets, which sit past the band (above);
- §1's tile size: 25 × 25 (237.5 mm) fits a 256 mm bed with 10 mm of margin in total, not 10 mm a
  side.
