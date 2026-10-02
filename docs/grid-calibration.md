# Grid base calibration

Test prints that settle the open numbers in the `grid` base spec ([#6](https://github.com/XDGFX/dunnage/issues/6)),
for [#7](https://github.com/XDGFX/dunnage/issues/7). The geometry is in `src/core/grid/`, so #8 can build on it.

The values found here are for one printer, filament and slicer profile. They become the `bambu-p1s`
preset's `fit:` defaults; anyone else prints the same calibration and sets their own.

## The design under test

Right way up, as it sits in the drawer:

- **Top face:** always closed. It's what you see: a grid of holes, each with a small lead-in.
- **Bottom:** always open, to save plastic. A boss runs down round every hole, and a band runs round
  the edge.
- **Joining:** the edge bosses stop 1.6 mm short of the bottom. A **plate** covering 2 × 2 holes
  across a join sits on their ends, flush with the bottom, and its four **sleeves** slide 5 mm down
  the outside of the bosses. It fits at any pair of edge holes on any edge, or where four tiles meet,
  out of sight. Its holes keep the grid usable: screws and pins go through it.

Every variant has a low **web**, 0.8 mm wide and 3 mm up from the top face, along every row and
column of holes, tying each boss to its neighbours. Round the edge bosses it's notched for the
plates' sleeves.

The variants differ in boss wall, which sets most of the weight along with the top face:

| Variant | Boss wall | Band |
|---|---|---|
| `standard` | 1.6 mm | 3 mm |
| `light-thick` | 1.2 mm | 1.2 mm |
| `light` | 0.9 mm (2 lines) | 1.2 mm |
| `light-thin` | 0.5 mm (1 line) | 1.2 mm |

The wall is the same whatever the hole size. Each variant is printed with a 0.6 mm (3 layers) and a
1.2 mm (6 layers) top face.

## Printing

```sh
bun scripts/grid-calibration.ts round-1
# then, with round one's answers (negative fit is interference):
bun scripts/grid-calibration.ts round-2 --variant light,3.3,0.05,0.6 --variant standard,3.4,0,1.2
```

STLs and a parts list (`README.md`) go to `out/grid-calibration/<round>/`. The parts list gives each
part's estimated weight, and for round one, what a full 25 × 25 tile of each variant and skin would
weigh. Every part is exported as it prints, top face down: don't rotate them. Labels are cone dots on
the top face (the bed side). Count them.

Record the setup, since every number below depends on it:

| Setting | Value |
|---|---|
| Printer, nozzle | P1S, 0.4 mm |
| Filament (brand, colour) | |
| Bambu Studio process profile | e.g. 0.20 mm Standard @BBL P1S |
| Wall loops | default (2) |
| Supports, brim | off, off |

In the slicer preview, check that `light` bosses slice as 2 walls and `light-thin` as 1, and that
the 0.6 mm top face gets 3 solid layers.

## Round one

Parts: `holes-<variant>-skin-0.6` and `holes-<variant>-skin-1.2` for each of the four variants, and
`plates-<variant>` for each.

### Weighing

Weigh every `holes-` piece and compare it with the estimate in the parts list. The two pieces of a
variant differ only in their top face, so they show what the skin costs; the variants show what the
boss wall costs.

| Variant | 0.6 skin: est. / weighed | 1.2 skin: est. / weighed |
|---|---|---|
| standard | | |
| light-thick | | |
| light | | |
| light-thin | | |

### Screw pilot holes

The variant's dots are at the back left (1 standard, 2 light-thick, 3 light, 4 light-thin), the
skin's at the back right (1 = 0.6 mm, 2 = 1.2 mm). In the middle row, the holes above 1–5 dots
are 3.0, 3.2, 3.4, 3.6 and 3.8 mm: one of each per piece, two per variant. The edge holes are the
nominal size, for the plates. Drive a 4×12
wood screw into each test hole. Keep the smallest that goes in without splitting the boss and bites
hard.

| Variant | 3.0 | 3.2 | 3.4 | 3.6 | 3.8 | Chosen |
|---|---|---|---|---|---|---|
| standard | | | | | | |
| light-thick | | | | | | |
| light | | | | | | |
| light-thin | | | | | | |

(Per cell: splits / bites hard / bites / spins.)

Also judge the top faces: does 0.6 mm look and feel good enough, flex between bosses, or show the
bosses through?

### Plates

Lay a variant's two pieces bottom up, long edges together. Its plates are numbered 1–5 by the dots
on their flat face:

| Dots | Sleeve fit over the bosses |
|---|---|
| 1 | 0.05 mm interference |
| 2 | line-to-line |
| 3 | 0.05 mm clearance |
| 4 | 0.10 mm clearance |
| 5 | 0.15 mm clearance |

Press each over the join, sleeves down (three fit along the long edge at once). Keep the one that
presses on firmly, holds the join without play, keeps the pieces together when lifted by one end,
and can still be prised off.

| Variant | 1 | 2 | 3 | 4 | 5 | Chosen |
|---|---|---|---|---|---|---|
| standard | | | | | | |
| light-thick | | | | | | |
| light | | | | | | |
| light-thin | | | | | | |

Note whether the thin bosses survive a few fittings.

## Round two

Run with the variants that survived round one, each with its chosen hole, plate fit and skin. Parts
per variant: `pins-<variant>`, `pegs-<variant>`, 4 × `tile-8x8-<variant>`, `tile-25x25-<variant>`
and `plates-<variant>` (10: 2 along each join of the 2 × 2 set, 1 where the four tiles meet, a
spare). Shared: one `test-holder` per variant.

### Pin interference

As in #6 §6, every hole is the chosen size and the pegs are bigger by the interference:
0.00–0.25 mm in 0.05 mm steps. Pegs are round with one flat, printed lying on it so their layers
run along their length; they're counted by the 1–6 dots on the flat, two of each. Press the peg with
n dots into the column with n dots. Keep the one that's hard to pull out by hand.

| Variant | 0.00 | 0.05 | 0.10 | 0.15 | 0.20 | 0.25 | Chosen |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
| | | | | | | | |

### Print checks (#6 §10)

| Check | | |
|---|---|---|
| Variant | | |
| No boss splits at the chosen hole | | |
| Test holder on one 4×12 resists a firm hand pull | | |
| A screw refits 5 times in one hole and still bites | | |
| The 2 × 2 set lifts as one piece by a corner | | |
| Holder on one screw with 1 kg doesn't move when shaken | | |
| `tile-25x25` weight, estimated / weighed | | |

### Outcome

- Variants kept, and the default:
- `fit:` for the `bambu-p1s` preset: `grid_hole`, `pin_interference` and the plate fit, per variant
  where they differ.

Then update #6 with the final values and close its open questions on the clip and the `light`
boss wall. It also needs these changes, from the design decided here:

- §2: every variant has a closed top face (`light` loses its web of bars), the skin thickness
  chosen here, the variants kept, the low web along every row and column in place of ribs, and the
  weights.
- §3: sleeved plates on the edge bosses replace the clip pockets, so any tile joins to any other at
  any edge hole, from below.
- §6: pegs are round with a flat, printed lying down, not upright.
- §1's tile size: 25 × 25 (237.5 mm) fits a 256 mm bed with 10 mm of margin in total, not 10 mm a
  side.
