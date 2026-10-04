# Grid base calibration

Test prints that settle the open numbers in the `grid` base spec ([#6](https://github.com/XDGFX/dunnage/issues/6)),
for [#7](https://github.com/XDGFX/dunnage/issues/7). The geometry is in `src/core/grid/`, so #8 can build on it.

The values found here are for one printer, filament and slicer profile. They become the `bambu-p1s`
preset's `fit:` defaults; anyone else prints the same calibration and sets their own.

## The design under test

Right way up, as it sits in the drawer:

- **Top face:** always closed. It's what you see: a grid of holes, each with a small lead-in.
- **Bottom:** always open, to save plastic. Every hole has a full-height boss, and a band runs round
  the edge. A low **web**, 0.8 mm wide and 3 mm up from the top face, runs along every row and
  column of holes, tying each boss to its neighbours.
- **Joining:** a **joiner** is four rings tied by webs. Its rings slide over the ends of the four
  bosses round a join and stop on the web, flush with the bottom. The band is cut away only where a
  joiner's rings and webs pass through it, so a joiner fits at any pair of edge holes on any edge, or
  where four tiles meet, and the edge bosses stay whole.

The variants differ in boss wall, which sets most of the weight along with the top face:

| Variant | Boss wall | Band |
|---|---|---|
| `standard` | 1.6 mm | 3 mm |
| `light-thick` | 1.2 mm | 1.2 mm |
| `light` | 0.9 mm (2 lines) | 1.2 mm |
| `light-thin` | 0.5 mm (1 line) | 1.2 mm |

## Printing

```sh
bun scripts/grid-calibration.ts round-1
bun scripts/grid-calibration.ts round-2 --variant light,3.3,0.6       # variant, hole, skin
bun scripts/grid-calibration.ts round-3 --variant light,3.3,0.6,0.3   # and the joiner fit
```

STLs and a parts list (`README.md`, with estimated weights) go to `out/grid-calibration/<round>/`.
Every part is exported as it prints: don't rotate them. Labels are cone dots on the top face (the
bed side), or notches on a joiner's ring: count them. Pegs are told apart by length.

Record the setup, since every number below depends on it:

| Setting | Value |
|---|---|
| Printer, nozzle | P1S, 0.4 mm |
| Filament (brand, colour) | |
| Bambu Studio process profile | e.g. 0.20 mm Standard @BBL P1S |
| Wall loops | default (2) |
| Supports, brim | off, off |

In the slicer preview, check that the 0.5 mm wall slices as 1 line, the 0.9 mm as 2, and the 0.6 mm
top face as 3 solid layers.

## Round one: hole and wall

Two strips, about 3 g in all.

- **`screw-holes`:** 5 holes in a 0.9 mm wall, 3.0, 3.2, 3.4, 3.6 and 3.8 mm by the 1–5 dots
  beside them, under a 1.2 mm top face. Drive a 4×12 wood screw into each. Keep the smallest that
  goes in without splitting the boss and bites hard.
- **`boss-walls`:** 3 bosses round a 3.3 mm hole, 0.5, 0.9 and 1.2 mm walls by the 1–3 dots,
  under a 0.6 mm top face. Drive a screw into each, take it out and put it back. Keep the thinnest
  that doesn't split and still bites.

Between them the strips also show both top faces. The parts list estimates a full 25 × 25 tile for
each wall and skin, to weigh against how they feel.

| Hole | 3.0 | 3.2 | 3.4 | 3.6 | 3.8 |
|---|---|---|---|---|---|
| Result | grips firmly, too tight to drive through | **chosen** | | | grips only once threaded in, not at the bottom |

| Wall | 0.5 | 0.9 | 1.2 |
|---|---|---|---|
| Result | **chosen**: bends most easily, didn't break | bends, didn't break | bends, didn't break |

**Chosen:** a 3.2 mm hole and a 0.5 mm wall (`light-thin`). Every boss bent, so each now flares out
at its root with a 1 mm 45° chamfer onto the top face, to stiffen it. Round two goes ahead with a
0.6 mm top face, the lightest.

## Round two: joiner fit and pegs

For the chosen variant: two small `joiner-tile`s, five `joiners` at different fits, and `pegs`. The
joiner's fit depends on the wall, so it waits for round one. The pegs go in the joiner tiles' holes.

The first try was far too tight on both counts, and the pegs' dots couldn't be read:

- **Joiners**, from 0.05 mm interference to 0.15 mm clearance: none fitted. The loosest went on
  about 1 mm.
- **Pegs**, from the hole's size to 0.25 mm over it: none came close to going in.

The second try, below, is looser all round, and labels the pegs by length.

### Joiner fit

The notches round the end of one ring count the fit, the radial clearance over the bosses:

| Notches | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Clearance | 0.2 mm | 0.3 mm | 0.4 mm | 0.5 mm | 0.6 mm |
| Result | Stuck a third of the way on | Almost right; a little loose on some bosses | | | |

Lay the two tiles back up, long edges together, and press each joiner over the join. Keep the one
that goes on firmly, holds without play, keeps the tiles together when lifted by one, and can still
be prised off. Try the joiners before the pegs: a peg that splits a boss spoils the tile.

**Chosen: 0.28 mm**, a fifth of the way from 2 notches towards 1, to take up the looseness on some
bosses. Round three checks it.

### Peg fit

As in #6 §6, every hole is the chosen size and only the peg changes, here smaller than the hole
across its diameter. Pegs are round with one flat, printed lying on it so their layers run along
their length. There are two of each, and each size is 2 mm longer than the last, so they sort by
eye: the shortest is the tightest.

| Length | 12 mm | 14 mm | 16 mm | 18 mm | 20 mm | 22 mm |
|---|---|---|---|---|---|---|
| Smaller by | 0.3 mm | 0.4 mm | 0.5 mm | 0.6 mm | 0.7 mm | 0.8 mm |
| Result | | | Interference: presses in, hard to get out | Tight: hard to pull out | Clearance, a slight wiggle | |

Press each into a hole. Keep the one that goes in by hand and is hard to pull out.

**Chosen: 0.6 mm smaller** (a 2.6 mm peg in the 3.2 mm hole): it holds, and a holder can still be
lifted off the board. 0.5 mm is a press fit for good. So a separate peg pressed into a holder's own
hole, to stay there, wants that hole 0.5 mm bigger than the peg, not 0.6: 3.1 mm for a 2.6 mm peg.

## Round three: the whole thing

For the chosen variant and fit: four `tile-8x8`s and their `joiners` (10: 2 along each join, 1
where the four tiles meet, a spare), a `tile-25x25` to weigh, and a `test-holder`.

| Check (#6 §10) | Result |
|---|---|
| No boss splits at the chosen hole | |
| Test holder on one 4×12 resists a firm hand pull | |
| A screw refits 5 times in one hole and still bites | |
| The 2 × 2 set lifts as one piece by a corner | |
| Holder on one screw with 1 kg doesn't move when shaken | |
| `tile-25x25` weight, estimated / weighed | |

## Outcome

These are working values: round three hasn't been printed yet, and they stand until it has.

- The variant, and the default: `light-thin`, with a 0.6 mm top face.
- `fit:` for the `bambu-p1s` preset: `grid_hole` 3.2 mm, `peg` 0.6 mm smaller than the hole (#6
  first called it `pin_interference`; it turned out to be a clearance), `peg_fixed` 0.5 mm for a
  peg pressed into a holder's hole to stay, and `joiner` 0.28 mm.

#6 has these values, and these changes from the design decided here:

- §2: every variant has a closed top face (the spec's `light` had none), the skin thickness chosen
  here, the variants kept, the low web along every row and column in place of ribs, and the weights.
- §3: joiners over the edge bosses replace the clip pockets, so any tile joins to any other at any
  edge hole, from below.
- §6: pegs are round with a flat, printed lying down, not upright.
- §1's tile size: 25 × 25 (237.5 mm) fits a 256 mm bed with 10 mm of margin in total, not 10 mm a
  side.
