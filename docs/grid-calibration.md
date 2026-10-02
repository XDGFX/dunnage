# Grid base calibration

Test prints that settle the open numbers in the `grid` base spec ([#6](https://github.com/XDGFX/dunnage/issues/6)),
for [#7](https://github.com/XDGFX/dunnage/issues/7). The geometry is in `src/core/grid/`, so #8 can build on it.

The values found here are for one printer, filament and slicer profile. They become the `bambu-p1s`
preset's `fit:` defaults; anyone else prints the same calibration and sets their own.

## The design under test

Right way up, as it sits in the drawer:

- **Top face:** always closed. It's what you see: a grid of holes, each with a small lead-in.
- **Bottom:** always open, to save plastic. A boss runs down round every hole.
- **Joining:** every tile has a rebate round the edge of its bottom, one pitch wide and
  2.4 mm deep, in which the edge bosses stop as 2 mm stubs. A **plate** covering 2 × 2 holes
  presses up over the stubs of two neighbouring tiles, flush with the bottom. It fits at any
  pair of edge holes on any edge, or where four tiles meet. It's out of sight once the board is
  in, and its holes keep the grid usable: screws and pins go through it.

`light` has thin bosses (0.9 mm wall) and no ribs; `standard` has 1.6 mm walls and ribs every 4
holes; `light-thick` is `light` with a 1.2 mm wall. All three have the same 1.2 mm top face.

## Printing

```sh
bun scripts/grid-calibration.ts round-1
# then, with round one's answers (negative fit is interference):
bun scripts/grid-calibration.ts round-2 --variant light,3.3,0.05 --variant standard,3.4,0
```

STLs and a parts list (`README.md`, with copies to print and estimated weights) go to
`out/grid-calibration/<round>/`. Every part is exported as it prints, top face down: don't rotate
them. Labels are cone dots on the top face (the bed side). Count them.

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

Parts: two each of `holes-standard`, `holes-light` and `holes-light-thick`; one each of
`plates-standard`, `plates-light` and `plates-light-thick`.

### Screw pilot holes

Each variant's piece has 1 (standard), 2 (light) or 3 (light-thick) dots at the back-left corner.
The columns with 1–5 dots under them are 3.0, 3.2, 3.4, 3.6 and 3.8 mm. The middle two rows are
ordinary bosses; the outer rows are edge bosses, which end in stubs. Drive a 4×12 wood screw into
each. Keep the smallest that goes in without splitting the boss and bites hard.

| Variant | 3.0 | 3.2 | 3.4 | 3.6 | 3.8 | Chosen |
|---|---|---|---|---|---|---|
| standard | | | | | | |
| light | | | | | | |
| light-thick | | | | | | |

(Per cell: splits / bites hard / bites / spins.)

### Plates

Lay a variant's two pieces bottom up, long edges together. Its plates are numbered 1–5 by the dots
on their outer face:

| Dots | Fit over the stubs |
|---|---|
| 1 | 0.05 mm interference |
| 2 | line-to-line |
| 3 | 0.05 mm clearance |
| 4 | 0.10 mm clearance |
| 5 | 0.15 mm clearance |

Press each over the join (three fit along the long edge at once). Keep the one that presses on
firmly, holds the join without play, keeps the pieces together when lifted by one end, and can
still be prised off.

| Variant | 1 | 2 | 3 | 4 | 5 | Chosen |
|---|---|---|---|---|---|---|
| standard | | | | | | |
| light | | | | | | |
| light-thick | | | | | | |

Note too whether the stubs survive a few fittings, and whether 2.4 mm feels like the right depth.

## Round two

Run with the variants that survived round one, each with its chosen hole and plate fit. Parts per
variant: `pins-<variant>`, `pegs-<variant>`, 4 × `tile-8x8-<variant>`, `tile-25x25-<variant>` and
`plates-<variant>` (10: 2 along each join of the 2 × 2 set, 1 where the four tiles meet, a spare).
Shared: one `test-holder` per variant.

### Pin interference

As in #6 §6, every hole is the chosen size and the pegs are bigger by the interference:
0.00–0.25 mm in 0.05 mm steps. Pegs are round with one flat, printed lying on it so their layers
run along their length; they're counted by the 1–6 dots on the flat, two of each. Press the peg with
n dots into the column with n dots. Keep the one that's hard to pull out by hand.

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
| `tile-25x25` weight (estimate: light 163 g, standard 252 g) | | | |

### Outcome

- Variants kept, and the default:
- `fit:` for the `bambu-p1s` preset: `grid_hole`, `pin_interference` and the plate fit, per variant
  where they differ.

Then update #6 with the final values and close its open questions on the clip and the `light`
boss wall. It also needs these changes, from the design decided here:

- §2: every variant has a closed top face (`light` loses its web of bars), and the weights.
- §3: plates over stubs in an edge rebate replace the clip pockets, so any tile joins to any
  other at any edge hole, from below.
- §6: pegs are round with a flat, printed lying down, not upright.
- §1's tile size: 25 × 25 (237.5 mm) fits a 256 mm bed with 10 mm of margin in total, not 10 mm a
  side.
