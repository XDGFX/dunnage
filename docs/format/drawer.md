# drawer/0.3

A drawer file describes one drawer: what's in it, where each thing sits, and how each thing is
held. It's the source of truth. The UI edits it by direct manipulation and an agent edits it from
a description, so every field is meant to be read and written by hand.

The JSON Schema is [drawer-0.3.schema.json](drawer-0.3.schema.json). The worked examples are
[`fixtures/coffee.drawer.yml`](../../fixtures/coffee.drawer.yml), and
[`fixtures/tool-chest.drawer.yml`](../../fixtures/tool-chest.drawer.yml) for a grid base.

## Conventions

- **Units** are millimetres and degrees.
- **Origin** is the front-left corner of the drawer floor. x runs left to right, y runs front
  (your side) to back, z up.
- **Rotation** is anticlockwise, seen from above.
- **Ids** are lower case letters, digits and hyphens (`mug-large`, `glass-1`).
- **`why`** is optional free text on most entries: the reason for a choice, written for the
  next person or agent to read.
- A rectangle given as `at` and `size` (obstructions, a lock's shape) has `at` at its
  front-left corner. A thing's `at` is its centre.

## Top level

| Field | Required | What |
|---|---|---|
| `format` | yes | `drawer/0.3` |
| `name` | yes | What the drawer is called. |
| `printer` | no | A printer profile, `<printer>.printer.yml` in the same folder. See [printer.md](printer.md). |
| `drawer` | yes | The drawer's inside. |
| `base` | no | What holders sit on. Defaults to `{ kind: bare }`. |
| `rules` | no | Layout rules. |
| `items` | yes | What each thing is. |
| `zones` | no | Named parts of the layout, to explain it. |
| `layout` | yes | Where each thing sits. |
| `holders` | no | How things are held. |
| `review` | no | The conversation between you and the agent. |

## `drawer`

```yaml
drawer:
  inside: [700, 500, 150]          # width, depth, height
  obstructions:
    - { name: Runner bracket, at: [0, 470], size: [700, 30], height: 12 }
```

- `inside`: `[width, depth, height]` of the space inside the drawer: the floor's width and depth,
  and the usable height.
- `obstructions`: things in the drawer that aren't yours to move, each a rectangle with an
  optional `name` and `height`.

The drawer's shape, from the floor up. Each is optional; the board and bumpers of a `grid` base
follow it.

| Field | Default | What |
|---|---|---|
| `preset` | | A built-in drawer, which fills in the fields below. Any of them can still be set to override it. |
| `walls` | 0 | Each wall's slope in degrees, outward from vertical: `{ sides, ends, left, right, front, back }`. `sides` sets left and right, `ends` front and back, and a single wall overrides either. |
| `corner_radius` | 0 | The radius of the vertical corners, seen from above. |
| `floor_edge` | 0 | The size of the fillet or chamfer where the floor meets the walls. |

A drawer needs an `inside`, a `preset`, or both; an `inside` overrides the preset's.

```yaml
drawer:
  preset: ikea-maximera-80x60-low
  walls: { left: 18 }              # measured: overrides the preset's 20°
```

### Built-in drawers

IKEA MAXIMERA, as `ikea-maximera-<size>-<height>`. Each has its sides sloping 20°, its ends
vertical, square corners and a 2 mm `floor_edge`.

| `<size>` | Floor (w × d) |
|---|---|
| `40x60` | 281 × 505 |
| `60x60` | 481 × 505 |
| `80x60` | 681 × 505 |
| `40x37` | 281 × 309 |
| `60x37` | 481 × 309 |
| `80x37` | 681 × 309 |
| `us-18` | 335 × 504 |

| `<height>` | Height |
|---|---|
| `low` | 78 |
| `medium` | 144 |
| `high` | 212 |

These come from drawer mats, published Gridfinity baseplates and inserts, not from a drawer, so
every one is **unverified** and `dunnage check` warns when a file uses one. Measure the drawer and
set any field that differs.

A metal tool chest has no preset, as they vary too much by brand. Measure `inside` at the floor (on
top of any liner), set `corner_radius` for the folded steel and `floor_edge` for the bend at the
floor, and leave `walls` at 0. `fixtures/tool-chest.drawer.yml` is one.

## `base`

One base per drawer. A drawer with both a grid and a pegboard is two drawers in this format's eyes.

| `kind` | Fields | What |
|---|---|---|
| `bare` | | Holders sit on the drawer floor. |
| `gridfinity` | `pitch` (default 42) | A grid of whole cells, as many as fit, centred in the drawer. Each Gridfinity holder claims the smallest block of cells that covers what it holds. |
| `pegboard` | `preset`: `uppdatera-80` or `uppdatera-60` | IKEA UPPDATERA, 675 × 500 or 475 × 500. The drawer height is measured from the top of the board. |
| `grid` | See below | A printed board of holes on a 9.5 mm pitch, in tiles joined from the back, wedged against the walls by bumpers. Holders screw or pin into its holes. |

### `grid`

```yaml
base:
  kind: grid
  variant: light-thin
  tile: [24, 17]
  bumpers: { split: even, fit: 0.3 }
  countersinks: [[0, 0], [69, 51]]
```

| Field | Default | What |
|---|---|---|
| `variant` | `light-thin` | The board's build: `standard`, `light-thick`, `light` or `light-thin`, which differ in boss wall. |
| `tile` | the largest that fits the bed | `[x, y]`, the largest tile, in holes. Each axis is split into as few tiles as fit under it, balanced so none is more than a hole bigger than another. |
| `bumpers.split` | `even` | How the gap to the walls is shared between the bumpers on each axis: `even`, or `{ x, y }` with `x` one of `even`, `left` or `right`, and `y` one of `even`, `front` or `back`. A named side takes all it can, up to the thickest bumper (10 mm), and the other side the rest, at least the thinnest (5 mm). |
| `bumpers.fit` | 0.3 | Clearance to the wall per side, in mm. |
| `countersinks` | none | Holes to countersink for a screw into the drawer floor, by hole. |

Holes are numbered `[i, j]` from the drawer's origin hole, the one nearest the front-left corner.

Each axis takes as many holes as leave a bumper of 5–10 mm either side, after `bumpers.fit`.
There's one bumper per outside tile edge; the left and right ones run past the corners to the front
and back walls. A bumper's outer face follows its wall's slope, and its bottom outer edge is
chamfered by `floor_edge`. Rounded corners are cut with room for the `fit` and the `floor_edge`,
and a hole whose boss that cuts is dropped. A bumper is joined to its tiles only where it's thick
enough to keep a joiner's rings clear of the wall and the floor edge; a thinner one is held by
wedging alone.
The pitch, hole sizes and every other grid number come from the grid parameters file and the
printer's `fit` ([printer.md](printer.md)), not from the drawer.

## `rules`

| Field | Default | What |
|---|---|---|
| `edge_margin` | 0 | Keep things this far off the walls. |
| `gap` | 0 | Between neighbouring holders on a bare floor; 0 means they touch. |
| `angle_step` | 15 | Rotations snap to multiples of this, and always to square. |

## `items`

What each thing is, keyed by item id, with no positions. An item is a box or a cylinder, written
as it sits in its first pose.

```yaml
items:
  kettle: { name: Kettle, cylinder: [85, 145], handle: [30, 70], spout: [10, 80], poses: [upright] }
  scales: { name: Scales, box: [150, 130, 20], poses: [flat, upright] }
  plate:  { name: Plate,  cylinder: [250, 20], nest: 8 }
```

| Field | Shape | What |
|---|---|---|
| `name` | both | What it's called. |
| `box` | box | `[width, depth, height]`, sitting flat. |
| `cylinder` | cylinder | `[diameter, height]`, standing upright. |
| `handle` | cylinder | `[width, reach]`, at the front at rotation 0, reaching that far past the body. |
| `spout` | cylinder | `[width, reach]`, at the back at rotation 0. A spout is high up, so it may overhang a neighbour, but not a wall. |
| `nest` | both | How much each extra one adds to a stack. Defaults to its full height. |
| `outlet` | both | Diameter of a hole through its base. A `peg` holder goes through it. |
| `poses` | both | The ways it may sit. Defaults to its first pose alone. |

### Poses

The first pose is the one the shape is written in, so it must be `flat` for a box and
`upright` for a cylinder.

| Pose | Box `[w, d, h]` | Cylinder `[D, h]` |
|---|---|---|
| `flat` | footprint w × d, h tall | |
| `upright` | stood on the edge along its width: footprint w × h, d tall | footprint a circle of diameter D, h tall |
| `side` | stood on the edge along its depth: footprint d × h, w tall | |
| `lying` | | on its side, running front to back: footprint D × h, D tall |
| `{ tilt: a }` | tipped a° from flat towards upright: footprint w × (d cos a + h sin a), d sin a + h cos a tall | raised by a° from lying: footprint D × (h cos a + D sin a), h sin a + D cos a tall |

Footprints are given at rotation 0, as x × y. Only the first pose stacks. Write a box with its
longer side as `w` and `upright` is on its long edge, `side` on its short one.

## `zones`

```yaml
zones:
  brew: { name: Brew line, why: "Along the front in the order you make a coffee, left to right." }
```

A zone explains part of the layout. It holds nothing.

## `layout`

One entry per thing in the drawer. Things are placed one by one, never in a group.

```yaml
layout:
  - id: scales
    zone: brew
    pose: upright
    rotate: 90
    at: [117, 79]
    why: Stood on edge it takes 20 mm of width instead of 150 × 130.
  - { id: plates, item: plate, stack: 4, at: [140, 367] }
```

| Field | Default | What |
|---|---|---|
| `id` | | Names the thing. |
| `item` | the `id` | Which item it is. |
| `at` | | `[x, y]` of the centre of its footprint. For a cylinder, the centre of its body. |
| `pose` | the item's first | How it sits; one of the item's poses. |
| `rotate` | 0 | Degrees, anticlockwise. |
| `stack` | 1 | How many, one on another. |
| `zone` | | The zone it belongs to. |
| `aside` | false | Out of the drawer for now. It stays in the file and is skipped by the checks and the export. |

## `holders`

How things are held. A holder names the thing or things it holds; grouping happens only here.
dunnage works out each holder's shape from its method and what it holds; only a locked holder
stores its shape.

```yaml
holders:
  - { id: mug-tray, method: well, holds: [mug-large, mug-small] }
  - id: v60-peg
    method: peg
    holds: [v60]
    peg: { diameter: 18, height: 30 }
```

| Field | What |
|---|---|
| `id` | Names the holder. Things and holders share one set of ids. |
| `method` | One of the methods below. |
| `holds` | The ids of the things it holds, from `layout`. |
| `floor` | `false` for a holder with no floor under the thing. |
| `fix` | On a `grid` base, how it's fixed, hole by hole: `[{ hole: [i, j], by: screw }]`. `by` is `screw` (a 4×12 wood screw through the holder) or `pin` (a printed peg, so the holder lifts off). |
| `lock` | Set once it's built. See below. |

| `method` | Makes | Extra fields |
|---|---|---|
| `well` | A printed tray shaped to what it holds | |
| `posts` | Printed posts or fingers round it | |
| `slot` | A printed slot for something on edge | |
| `peg` | A printed peg through the thing's `outlet` | `peg: { diameter, height }` |
| `gridfinity` | A Gridfinity bin (gridfinity base only) | |
| `pegs` | IKEA pegs in fixed holes (pegboard base only) | `fit: { play, spring }`: play is how far the thing may wander inside its pegs (default 2); spring how far it pushes stock pegs outwards (default 0). |
| `ply` | Routed ply, cut against a printed template | |
| `custom` | A spec sheet, to build in Fusion or Blender | `spec: { purpose, contact, clearance, build }`, of which `purpose` is required |

### `lock`

A locked holder has been built. It's frozen as built, even when dunnage is upgraded, and later
layouts design around it.

```yaml
lock:
  at: 2026-09-24                   # the date it was built
  tool: 0.1.0                      # the dunnage version that made it
  shape: { at: [488, 5], size: [130, 125], height: 4, rotate: 0 }
  export: locked/v60-peg.3mf
  sha256: 4be1c0a37e9d2f61
```

## `review`

The conversation between you and the agent. It lives in the file so it travels with the
drawer. Dealt-with entries are closed, not deleted, so git keeps the history.

| Field | Entries |
|---|---|
| `questions` | `{ id, ask, answer?, status }`: the agent's questions for you. |
| `assumptions` | Plain strings: what the agent assumed. |
| `concerns` | `{ id, on, says, suggest?, act?, status }`: problems the agent sees. `on` lists the ids it's about; `act: { aside: [ids] }` is what accepting the suggestion does. |
| `comments` | `{ on, says, status }`: yours, on any id in the file. |

`status` is `open` or `closed`.

## Checks

Beyond the schema, `dunnage check` reports:

- **Ids resolve.** Each thing's `item` (or its `id`, when it names no item) is an item; each
  `zone` is a zone; each holder's `holds` names a thing in the layout, not an item or a holder;
  a concern's `on` and a comment's `on` name an id in the file; a concern's `act.aside` names a
  thing.
- **Ids are unique.** Things and holders share one set of ids; questions and concerns share
  another.
- **Poses.** An item's first pose is the one its shape is written in. A thing's `pose` is one
  of its item's poses, and only the first pose stacks.
- **Things fit in the drawer.** Each thing's outline, turned by `rotate` and including its handle
  and spout, stays inside the walls less the `edge_margin`. Its height, stack included, is no
  more than the drawer's. It doesn't overlap an obstruction or another thing; a spout may
  overhang a neighbour or an obstruction. Things set `aside` are skipped.
- **The drawer's shape.** It has an `inside`, from the file or its `preset`. A preset that's
  unverified gets a warning, which doesn't fail the check.
- **Holders.** A thing is held by at most one holder. `gridfinity` holders need a gridfinity base
  and `pegs` holders a pegboard. A `peg` holder holds only things with an `outlet`. `fix` needs a
  grid base.
- **The grid board.** It lays out in the drawer, in tiles and bumpers that fit the printer's bed
  (the CLI reads the bed from the named printer profile; otherwise a P1S's). Every `fix` and
  `countersinks` hole is on the board and not cut away by a rounded corner.
- **The printer profile** named by `printer` is beside the file (the CLI checks this; the core
  can't see files).

Not checked yet, because they depend on holder shapes dunnage doesn't make yet: holder floors in
the height check, the `gap` rule, locked holders' shapes, holders fitting the printer's bed, and
Gridfinity and pegboard placement. `angle_step` is a snapping rule for the UI, not a check.
