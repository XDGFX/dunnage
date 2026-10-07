---
status: accepted
---

# Holder parts come from a library; only the base is generated

dunnage still decides what goes in the drawer, where it sits and how it's held. But the parts that do the holding (posts, pegs, slots, bins) are designed in Fusion, test-printed, and kept in a library. Make links to their files and does not generate them. Generated geometry is a new, untested design on every run, and it reaches the user as a mesh they can't edit. A library part is printed and checked once, and anyone can open its Fusion source to change it.

The base is the exception. Grid tiles, joiners and the edge pieces that fill out to the drawer wall stay generated in code (manifold-3d), because a drawer can be any size and the edges can be any width. A pre-made 3MF for every combination makes no sense. A Fusion master of the grid is kept for reference only.

## Consequences

- **One parameters file defines the grid.** It sets the pitch, hole size, joiner fit and calibrated clearances. The code reads it, and a Fusion script loads it into the grid master, so the two can't drift.
- **The holes are the contract between the base and the library.** Library parts are designed against the hole values in that parameters file.
- **Make produces two things:** a generated base 3MF, and the library parts with links to download them.
- **Each holder is designed in Fusion** under its own ticket. This ADR doesn't settle what any holder looks like.

## Considered options

- **Generate everything with manifold-3d.** This was the original plan. Rejected because the parts are untested and can't be edited.
- **Make Fusion the engine and drive it through its API or MCP.** Rejected: Fusion is a desktop app that needs a licence and can't run in CI, the browser or Node.
- **Pre-make the base too.** Rejected because there are too many drawer sizes, and edge widths should be free.
