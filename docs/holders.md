# Holder design guide

How dunnage builds holders, so that every holder in the library is built the same way. This
guide doesn't say how a particular thing must be held. That depends on the thing, and the
`method` in the drawer file chooses it. The guide gives the methods a shared set of parts and
a shared look. It grows as holders get built.

Every number here has a status:

- **settled**: decided, and either in the code or in a spec.
- **default**: a starting value from research. It stays until a print or a road test shows it
  is wrong.
- **open**: not yet decided.

Research behind the defaults:
[Toolgrid and printed tool retention](https://github.com/XDGFX/hailey/blob/main/docs/reference/toolgrid-holders.md)
and
[drawer tool prior art](https://github.com/XDGFX/hailey/blob/main/docs/reference/drawer-tool-prior-art.md).
None of the published designs were tested in a vehicle, so **no default here has been
road-tested**.

## Principles

- **Hold, don't fill.** The README already says this. A holder touches a thing where it must
  and leaves the rest open.
- **No hold-down by default.** Plates, bowls, mugs and cutlery sit in a well or between posts.
  Their walls stop them sliding, and their own weight stops them hopping out. Add a hold-down
  only when a thing would otherwise leave its holder on a rough road.
- **Use a named primitive before `custom`.** If the primitives below don't fit, use `custom`
  with a spec sheet. If the same custom fix comes up twice, make it a primitive.
- **dunnage advises; it doesn't enforce.** Its checks raise warnings and never block a plan.

## Holder to base

All of this is **settled** elsewhere. It is summarised here so the guide reads on its own.

| Base | How a holder stays put | Where |
|---|---|---|
| Bare floor | Holders hold each other by touching. Gaps under `FILL` (40 mm) are closed, and a holder that can slide more than `HELD` (1.5 mm) gets a warning | `src/core/plan.ts` |
| UPPDATERA | Planar form closure from the pegs; `pegs` takes `fit: { play, spring }` | `src/core/plan.ts`, [format](format/drawer.md) |
| Grid board | Located by pins and screwed down, with bumpers holding the board in the drawer. Toolgrid does the same: pins locate, one thread-forming screw holds | #6 |
| Overlay on UPPDATERA | Push-in spring latches | #13 |
| Gridfinity | Parked | — |

## Hold-down primitives

These are used only where a thing needs one. "Resists" names the movements each one stops,
besides the sideways slide that any wall stops.

| Primitive | Resists | Use for | Parameters | Status |
|---|---|---|---|---|
| **Walls** | Slide, turn | Almost everything: wells, posts, slots | Clearance 0.3/side from the printer profile; 1 for `custom`; 1.5 for glass cradles | settled |
| **V-walls** | Slide, across a range of thicknesses | Pliers, things that come in several thicknesses | Angle | open |
| **Stud** | Slide, turn; light lift by friction | Things with a bore: sockets, reels, tape | 0.25 under the bore's nominal size | default |
| **Crush ribs** | Rattle, light lift | Upgrading walls or a stud to a light grip | 3–4 ribs, 0.2 proud; a 2° taper if it comes out often | default |
| **Tilt** | Hop (gravity seats it), roll | Spanners, long round things, anything that can lean | Angle | open |
| **Snap lip** | Hop | Things that must not lift and can take a push | A nub 0.4 proud with ramped ends. Arm length 5–8 times its thickness, printed flat | default |
| **Twist lock** | Hop | Round things with a bore | A dovetail stud you turn 45° to lock, 0.2 clearance on the dovetail | default |
| **Gate** | Hop, slide | Irregular things a lip can't catch | A retaining arm or bar that swings or slides over the thing | open |
| **Ceiling** | Hop | Anything in a closed drawer with little headroom | How close the top of the thing sits to whatever is above it | open |

Not in the library:

- **TPU**: out of scope.
- **Magnets**: they need gluing, and they only grip steel.
- **Mats and adhesive**: never adopted.

Use `custom` for any of these.

## Design language

### Finger access

- Every holder that a thing is lifted out of needs room for fingers to reach it. **settled**
- The two ways to give that room:
  - a **scoop**: a fillet where the floor meets the wall, taken from Gridfinity Rebuilt;
  - a **notch**: a cut-out in a wall, down to a set depth. **default**
- A notch must not remove the wall a hold-down depends on. Put it on a wall that only stops a
  slide. **settled**
- Notch size: **open**.

### Walls, edges and printing

- Minimum wall 1.2 mm, three perimeters at 0.4. **default**
- Fillet the root of any arm or lip. **default**
- Print orientation belongs to the primitive, not to the holder. **settled**
  - Flexing arms and lips are printed flat, so they bend along the layers.
  - Studs and pegs are printed upright.
- Edge treatment, meaning chamfer or fillet sizes on top edges and at the base: **open**.

### Labels

- Plain black PETG on a printer with no AMS, so no colour coding. **settled**
- Text is embossed or debossed on a tab the thing can't cover. Toolgrid's stickers sit where
  the socket hides them, so don't copy that. **default**
- Text size and font: **open**.

### Look

- **Open.** One shared profile for walls and posts, with consistent heights; Gridfinity
  Rebuilt uses steps of 7 mm. Settle this with the first real holders (#3).
