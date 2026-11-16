import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
import { UPPDATERA } from "../pegboard.ts";
import { GRID, type LatchFit } from "./parameters.ts";

// The spring latch that holds an overlay down on an UPPDATERA board (#13 §2). It's one flat
// profile, so it prints lying on its side with no overhang, and its legs bend along the layers.
//
// In use, x runs along the slot, z up from the board's top face, centred on the latch. A bar
// across the top carries two legs; a plug on the bar presses into a socket under the overlay. Each
// leg ends in a barb whose sloped catch bears on the slot's end just under the board's skin.
// Slots are stadiums, so the end a leg meets depends on how far across the slot it is.

const RAD = Math.PI / 180;

/** The slot a latch is made for: UPPDATERA's, unless a test says otherwise. */
export interface Slot {
  /** Along x, and across; the ends are semicircles of half the width. */
  length: number;
  width: number;
  /** The board's top skin, which the barbs catch under. */
  skin: number;
  /** The open cup under the slot: its width, and its depth below the skin. */
  cup: [number, number];
}

export const UPPDATERA_SLOT: Slot = { length: UPPDATERA.slot[0], width: UPPDATERA.slot[1], skin: UPPDATERA.skin, cup: UPPDATERA.cup };

/** A stadium slot's end, along x from its centre, at `y` across from its centre line; undefined outside it. */
export function slotEnd(slot: Pick<Slot, "length" | "width">, y: number): number | undefined {
  const r = slot.width / 2;
  return Math.abs(y) >= r ? undefined : (slot.length - slot.width) / 2 + Math.sqrt(r * r - y * y);
}

/** The nearest and farthest slot end a latch `width` wide meets, along x, with the slot `dy` across from it. */
function endsAcross(slot: Pick<Slot, "length" | "width">, width: number, dy: number): { near?: number; far?: number } {
  const edge = Math.abs(dy) + width / 2;
  const middle = Math.max(0, Math.abs(dy) - width / 2);
  return { near: slotEnd(slot, edge), far: slotEnd(slot, middle) };
}

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
  /** The radius filleting the legs into the bar and the bar into the plug. */
  fillet: number;
  /** The right barb's tip, and the outer corner of the right leg's nose; the left are mirrored. */
  tip: [number, number];
  nose: [number, number];
  /** Where the catch meets the skin's underside with the leg at rest: a slot end here holds with no play and no spring. */
  reach: number;
  catch: number;
  slot: Slot;
}

/** Sized so the nose clears the nearest slot end its edge can meet, and the barb reaches `hold` past the farthest, over the tolerances. */
export function latchShape(fit: LatchFit = GRID.fit.latch, slot: Slot = UPPDATERA_SLOT): LatchShape {
  const p = GRID.latch;
  const slope = Math.tan(fit.catch * RAD);
  const small = { length: slot.length - p.size, width: slot.width - p.size };
  const large = { length: slot.length + p.size, width: slot.width + p.size };
  const nearest = endsAcross(small, p.width, p.tolerance).near! - p.tolerance;
  const farthest = endsAcross(large, p.width, 0).far! + p.tolerance;
  const reach = slot.length / 2;
  const tipX = farthest + p.hold;
  const tip: [number, number] = [tipX, -slot.skin - (tipX - reach) * slope];
  const noseX = nearest - p.entry;
  const nose: [number, number] = [noseX, tip[1] - (tipX - noseX) / Math.tan(p.lead_in * RAD)];
  // The catch runs up from the tip to meet the leg's outer face at the board's top, or the leg drops straight from the nose.
  const span = Math.max(noseX, reach - slot.skin / slope);
  return { width: p.width, leg: fit.leg, span, root: p.root, plug: [p.plug[0], p.plug[1]], fillet: p.fillet, tip, nose, reach, catch: fit.catch, slot };
}

/** The latch's profile in (x, z), as it sits in use: the bar and plug, two legs with their barbs, and the fillets between them. */
export function latchProfile(s: LatchShape): Vec2[][] {
  const { span: a, leg: t, root, plug, tip, nose } = s;
  // The catch keeps its angle up from the tip until it meets the leg's outer face.
  const meets = Math.min(0, -s.slot.skin + (s.reach - a) * Math.tan(s.catch * RAD));
  const right: Vec2[] = [
    [a - t, root + 0.01],
    [a - t, 0],
    [nose[0] - t, nose[1]],
    nose,
    tip,
    [a, meets],
    [a, root + 0.01],
  ];
  const left = right.map(([x, z]): Vec2 => [-x, z]).reverse();
  const bar: Vec2[] = [[-a, root], [a, root], [a, root + t], [plug[0] / 2, root + t], [plug[0] / 2, plug[1]], [-plug[0] / 2, plug[1]], [-plug[0] / 2, root + t], [-a, root + t]];
  return [bar, right, left];
}

/** A fillet of radius `r` in the inside corner at `corner`, its legs running `dx` along x and `dz` along z from it. */
function fillet(wasm: ManifoldToplevel, corner: Vec2, dx: number, dz: number, r: number): CrossSection {
  const { CrossSection } = wasm;
  const square = CrossSection.square([r, r]).translate(Math.min(0, dx * r), Math.min(0, dz * r));
  const round = CrossSection.circle(r, 32).translate(dx * r, dz * r);
  return square.subtract(round).translate(corner[0], corner[1]);
}

function profileSection(wasm: ManifoldToplevel, s: LatchShape, notches: readonly [number, number]): CrossSection {
  const { CrossSection } = wasm;
  const { span: a, leg: t, root, plug, fillet: r } = s;
  let section = CrossSection.union([
    ...latchProfile(s).map((polygon) => CrossSection.ofPolygons([polygon])),
    // Where each leg meets the bar's underside, and where the bar meets the plug: the roots that bend most.
    ...[-1, 1].flatMap((side) => [
      fillet(wasm, [side * (a - t), root], -side, -1, r),
      fillet(wasm, [side * (plug[0] / 2), root + t], side, 1, r),
    ]),
  ]);
  // V notches along the bar's top, counted out from the plug on each side, to tell test latches apart.
  const { size: v, first, spacing } = GRID.latch.notch;
  const top = root + t;
  const cuts = notches.flatMap((count, side) =>
    Array.from({ length: count }, (_, n) => {
      const x = (side === 0 ? -1 : 1) * (plug[0] / 2 + r + first + n * spacing);
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
export function socketOf(latches: readonly LatchShape[], fit: LatchFit = GRID.fit.latch): Socket {
  const { room, wall, bow } = GRID.latch;
  const span = Math.max(...latches.map((s) => s.span));
  const first = latches[0]!;
  const pocket: [number, number] = [2 * (span + room), first.width + 2 * room];
  return {
    pad: [pocket[0] + 2 * wall, pocket[1] + 2 * wall],
    pocket,
    ceiling: Math.max(...latches.map((s) => s.root + s.leg)) + bow,
    socket: [first.plug[0] - 2 * fit.press, first.width - 2 * fit.press],
    top: first.plug[1],
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

/** How a latch takes a slot, as the design sizes it: see test/overlay.test.ts for the same, measured on the meshes. */
export interface Seat {
  /** Each nose clears the skin's top as it comes down, and the legs fit across the slot. */
  enters: boolean;
  /** The most either barb is pushed in on the way through, and the peak strain that puts in it. */
  deflection: number;
  strain: number;
  /** The most either barb stays pushed in once seated, and the peak strain it holds. */
  held: number;
  heldStrain: number;
  /** How far each barb reaches past its slot end once seated: the least of the two. */
  overlap: number;
  /** The barbs stay inside the cup under the skin, and clear of the drawer floor. */
  inCup: boolean;
}

export function latchSeat(s: LatchShape, offset: readonly [number, number], slot: Slot = s.slot): Seat {
  const [dx, dy] = offset;
  const { near, far } = endsAcross(slot, s.width, dy);
  if (near === undefined || far === undefined) return { enters: false, deflection: Infinity, strain: Infinity, held: 0, heldStrain: 0, overlap: 0, inCup: false };
  const nearEnds = [near - dx, near + dx];
  const enters = nearEnds.every((end) => s.nose[0] < end);
  const deflection = Math.max(0, ...nearEnds.map((end) => s.tip[0] - end));
  // Seated, the catch bears on the skin where the slot's end comes nearest, at the latch's edge: the
  // leg is pushed in until they meet, and lets go only once its tip clears that corner too.
  const seatedIn = nearEnds.map((end) => Math.max(0, s.reach - end));
  const overlap = Math.min(...nearEnds.map((end) => s.tip[0] - Math.max(end, s.reach)));
  const farEnds = [far - dx, far + dx];
  const cupEdges = [slot.cup[0] / 2 - dx, slot.cup[0] / 2 + dx];
  const inCup = farEnds.every((_, k) => s.tip[0] - seatedIn[k]! <= cupEdges[k]!) && s.nose[1] >= -(slot.skin + slot.cup[1]) + GRID.latch.clear;
  const per = strainPerMm(s);
  const held = Math.max(...seatedIn);
  return { enters, deflection, strain: deflection * per, held, heldStrain: held * per, overlap, inCup };
}

/** The stress concentration at a filleted root, from a fit to Peterson's chart for a shouldered flat bar in bending. */
export const stressConcentration = (s: LatchShape) => 1 + 0.32 / Math.sqrt(s.fillet / s.leg);

/** Peak bending strain, Kt included, per mm a barb is pushed in: a leg cantilevered from a bar half that turns under the same moment. */
export function strainPerMm(s: LatchShape): number {
  const t = s.leg;
  const inertia = (s.width * t ** 3) / 12;
  const below = -s.tip[1];
  const shaft = s.root;
  const moment = shaft + t / 2 + below;
  const bar = s.span - t / 2 - s.plug[0] / 2;
  const compliance = ((shaft + below) ** 3 - below ** 3) / (3 * inertia) + (moment ** 2 * bar) / inertia;
  return ((moment * t) / 2 / inertia / compliance) * stressConcentration(s);
}
