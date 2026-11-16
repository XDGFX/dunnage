import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
import { UPPDATERA } from "../pegboard.ts";
import { GRID, type LatchFit } from "./parameters.ts";

// The spring latch that holds an overlay down on an UPPDATERA board (#13 §2). It's one flat
// profile, so it prints lying on its side with no overhang, and its legs bend along the layers.
//
// In use, x runs along the slot, z up from the board's top face, centred on the latch. A bar
// across the top carries two legs; a plug on the bar presses into a socket under the overlay. Each
// leg ends in a barb whose sloped catch bears on the slot's end just under the board's skin, so the
// legs are always sprung inward: that centres the latch, takes up play, and holds it down.

const RAD = Math.PI / 180;

/** The slot a latch is made for: UPPDATERA's, unless a test says otherwise. */
export interface Slot {
  /** Along x, and across. */
  length: number;
  width: number;
  /** The board's top skin, which the barbs catch under. */
  skin: number;
  /** The open cup under the slot: its width, and its depth below the skin. */
  cup: [number, number];
}

export const UPPDATERA_SLOT: Slot = { length: UPPDATERA.slot[0], width: UPPDATERA.slot[1], skin: UPPDATERA.skin, cup: UPPDATERA.cup };

/** Every number of one latch, worked out from the slot, the latch parameters and the printer's latch fit. */
export interface LatchShape {
  /** Across the slot (y): the profile's thickness as printed. */
  width: number;
  /** The legs' and bar's thickness. */
  leg: number;
  /** The legs' outer faces, either side of the centre, at rest. */
  span: number;
  /** The bar's underside, where the legs start. */
  root: number;
  /** The plug on the bar, [along x, the height of its top]: its top bears on the socket's, which sets how the latch sits. */
  plug: [number, number];
  /** The right barb's tip, and the outer corner of the right leg's nose; the left are mirrored. */
  tip: [number, number];
  nose: [number, number];
  /** Where the catch meets the skin's underside with the leg at rest: the farthest slot end it holds without play. */
  reach: number;
  catch: number;
  slot: Slot;
}

export function latchShape(fit: LatchFit = GRID.fit.latch, slot: Slot = UPPDATERA_SLOT): LatchShape {
  const p = GRID.latch;
  const half = slot.length / 2;
  const slope = Math.tan(fit.catch * RAD);
  // The farthest a slot end may be, and the nearest, with the slot moved by the tolerance.
  const reach = half + p.tolerance;
  const nearest = half - p.tolerance;
  const tip: [number, number] = [reach + p.hold, -slot.skin - p.hold * slope];
  const noseX = nearest - p.entry;
  const nose: [number, number] = [noseX, tip[1] - (tip[0] - noseX) / Math.tan(p.lead_in * RAD)];
  // The catch runs up from the tip to meet the leg at the board's top face.
  const span = Math.max(noseX, reach - slot.skin / slope);
  return { width: slot.width - 2 * p.side, leg: fit.leg, span, root: p.root, plug: [p.plug[0], p.plug[1]], tip, nose, reach, catch: fit.catch, slot };
}

/** The latch's profile in (x, z), as it sits in use: the bar and plug, and two legs with their barbs. */
export function latchProfile(s: LatchShape): Vec2[][] {
  const { span: a, leg: t, root, plug, tip, nose } = s;
  const right: Vec2[] = [
    [a - t, root + 0.01],
    [a - t, 0],
    [nose[0] - t, nose[1]],
    nose,
    tip,
    [a, 0],
    [a, root + 0.01],
  ];
  const left = right.map(([x, z]): Vec2 => [-x, z]).reverse();
  const bar: Vec2[] = [[-a, root], [a, root], [a, root + t], [plug[0] / 2, root + t], [plug[0] / 2, plug[1]], [-plug[0] / 2, plug[1]], [-plug[0] / 2, root + t], [-a, root + t]];
  return [bar, right, left];
}

function profileSection(wasm: ManifoldToplevel, s: LatchShape, notches: readonly [number, number]): CrossSection {
  const { CrossSection } = wasm;
  let section = CrossSection.union(latchProfile(s).map((polygon) => CrossSection.ofPolygons([polygon])));
  // V notches along the bar's top, counted out from the plug on each side, to tell test latches apart.
  const v = 0.6;
  const top = s.root + s.leg;
  const cuts = notches.flatMap((count, side) =>
    Array.from({ length: count }, (_, n) => {
      const x = (side === 0 ? -1 : 1) * (s.plug[0] / 2 + 0.8 + n * 1.1);
      return CrossSection.ofPolygons([[[x - v / 2, top + 0.01], [x, top - v / 2], [x + v / 2, top + 0.01]]]);
    }),
  );
  if (cuts.length > 0) section = section.subtract(CrossSection.union(cuts));
  return section;
}

/** A latch as it prints: its profile on the bed, `width` tall, with notches on the bar's left and right halves to label it. */
export function printLatch(wasm: ManifoldToplevel, s: LatchShape, notches: readonly [number, number] = [0, 0]): Manifold {
  const solid = wasm.Manifold.extrude(profileSection(wasm, s, notches), s.width);
  const { min } = solid.boundingBox();
  return solid.translate([-min[0], -min[1], 0]);
}

/** A latch in use, centred on its slot: x along the slot, z up from the board's top face. */
export function seatedLatch(wasm: ManifoldToplevel, s: LatchShape): Manifold {
  return wasm.Manifold.extrude(profileSection(wasm, s, [0, 0]), s.width).translate([0, 0, -s.width / 2]).rotate([90, 0, 0]);
}

/** The socket a latch presses into, under the overlay: its pad's footprint, and the room cut in it. */
export interface Socket {
  /** The solid pad's footprint, centred on the latch. */
  pad: [number, number];
  /** The room for the bar and legs, from the overlay's underside up to `ceiling`. */
  pocket: [number, number];
  ceiling: number;
  /** The plug's socket, above the pocket, up to `top`, which the plug's top bears on. */
  socket: [number, number];
  top: number;
}

/** A socket for these latches: one, or every latch on a test strip, which share it. */
export function socketOf(latches: LatchShape | readonly LatchShape[], fit: LatchFit = GRID.fit.latch): Socket {
  const all: readonly LatchShape[] = Array.isArray(latches) ? latches : [latches as LatchShape];
  const { room, wall, bow } = GRID.latch;
  const span = Math.max(...all.map((s) => s.span));
  const pocket: [number, number] = [2 * (span + room), all[0]!.width + 2 * room];
  return {
    pad: [pocket[0] + 2 * wall, pocket[1] + 2 * wall],
    pocket,
    ceiling: Math.max(...all.map((s) => s.root + s.leg)) + bow,
    socket: [all[0]!.plug[0] - 2 * fit.press, all[0]!.width - 2 * fit.press],
    top: all[0]!.plug[1],
  };
}

/** The room cut under an overlay for one latch, in its own frame, z up from the underside: the pocket, and the plug's socket above it. */
export function socketVoid(wasm: ManifoldToplevel, socket: Socket): Manifold {
  const { Manifold } = wasm;
  const [px, py] = socket.pocket;
  return Manifold.union([
    Manifold.cube([px, py, socket.ceiling + 1]).translate([-px / 2, -py / 2, -1]),
    Manifold.cube([socket.socket[0], socket.socket[1], socket.top - socket.ceiling + 0.01]).translate([-socket.socket[0] / 2, -socket.socket[1] / 2, socket.ceiling - 0.01]),
  ]);
}

/** How a latch takes a slot moved by `offset` from where it's expected. */
export interface Seat {
  /** Each nose clears the skin's top as it comes down, and the legs fit across the slot. */
  enters: boolean;
  /** The most either barb is pushed in on the way through, and the strain that puts in it. */
  deflection: number;
  strain: number;
  /** How far each barb reaches past its slot end once seated: the least of the two. */
  overlap: number;
  /** The barbs stay inside the cup under the skin, and clear of the drawer floor. */
  inCup: boolean;
}

export function latchSeat(s: LatchShape, offset: readonly [number, number], slot: Slot = s.slot): Seat {
  const [dx, dy] = offset;
  const ends = [slot.length / 2 - dx, slot.length / 2 + dx];
  const enters = ends.every((end) => s.nose[0] < end) && s.width / 2 + Math.abs(dy) <= slot.width / 2;
  const deflection = Math.max(0, ...ends.map((end) => s.tip[0] - end));
  // Seated, the catch bears on the skin's corner: the leg is pushed in until the catch meets it.
  const seatedIn = ends.map((end) => Math.max(0, s.reach - end));
  const overlap = Math.min(...ends.map((end, k) => s.tip[0] - seatedIn[k]! - end));
  const cupEdges = [slot.cup[0] / 2 - dx, slot.cup[0] / 2 + dx];
  const inCup = ends.every((_, k) => s.tip[0] - seatedIn[k]! <= cupEdges[k]!) && s.nose[1] >= -(slot.skin + slot.cup[1]) + GRID.latch.clear;
  return { enters, deflection, strain: deflection * strainPerMm(s), overlap, inCup };
}

/**
 * The bending strain at the root of a leg or the bar for each mm a barb is pushed in. The leg is a
 * cantilever from the bar, loaded at the barb's tip; the bar's half from the plug to the leg turns
 * under the same moment and adds to the deflection.
 */
export function strainPerMm(s: LatchShape): number {
  const t = s.leg;
  const inertia = (s.width * t ** 3) / 12;
  const below = -s.tip[1];
  const shaft = s.root;
  const moment = shaft + t / 2 + below;
  const bar = s.span - t / 2 - s.plug[0] / 2;
  const compliance = ((shaft + below) ** 3 - below ** 3) / (3 * inertia) + (moment ** 2 * bar) / inertia;
  return (moment * t) / 2 / inertia / compliance;
}
