import { parse } from "yaml";
import { read } from "./check.ts";
import { half } from "./geometry.ts";
import { BASES, plan, type BaseKey, type Method } from "./plan.ts";
import type { Drawer, Holder, Pose } from "./schema.ts";
import { posesOf, samePose } from "./shape.ts";
import { seat } from "./snap.ts";
import { appendIn, deleteIn, removeIn, setIn } from "./source.ts";

// What you can do to a drawer, as edits to its file. Each takes the file's text and returns the
// new text, touching only the lines it must, so the UI and an agent edit the same file the same
// way and the result reads as if written by hand.

type Lock = NonNullable<Holder["lock"]>;
type ItemShape = { cylinder: [number, number] } | { box: [number, number, number] };

function drawerOf(text: string): Drawer {
  return parse(text) as Drawer;
}

function indexOf(text: string, section: "layout" | "holders", id: string): number {
  const list = (drawerOf(text)[section] ?? []) as { id: string }[];
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`no ${section === "layout" ? "thing" : "holder"} ${id}`);
  return index;
}

/** Sets, or with `undefined` removes, a field on a thing or a holder. */
function setField(text: string, section: "layout" | "holders", id: string, field: string, value: unknown): string {
  const path = [section, indexOf(text, section, id), field];
  return value === undefined ? deleteIn(text, path) : setIn(text, path, value);
}
const setThing = (text: string, id: string, field: string, value: unknown) => setField(text, "layout", id, field, value);
const setHolder = (text: string, id: string, field: string, value: unknown) => setField(text, "holders", id, field, value);

/** A thing in the layout, by id. */
function thingOf(drawer: Drawer, id: string) {
  const thing = drawer.layout.find((t) => t.id === id);
  if (!thing) throw new Error(`no thing ${id}`);
  return thing;
}

/** Ids of things and holders, which share one set. */
const idsIn = (drawer: Drawer) => new Set([...drawer.layout.map((t) => t.id), ...(drawer.holders ?? []).map((h) => h.id)]);

// --- Things ----------------------------------------------------------------------------------

/** Moves things by [id, dx, dy]. A locked holder's shape moves with what it holds, once. */
export function moveThings(text: string, moves: [string, number, number][]): string {
  const drawer = drawerOf(text);
  const shifted = new Map<string, [number, number]>();
  for (const [id, dx, dy] of moves) {
    const thing = thingOf(drawer, id);
    text = setThing(text, id, "at", [half(thing.at[0] + dx), half(thing.at[1] + dy)]);
    const locked = drawer.holders?.find((h) => h.lock && h.holds.includes(id));
    if (locked && !shifted.has(locked.id)) shifted.set(locked.id, [dx, dy]);
  }
  for (const [id, [dx, dy]] of shifted) {
    const at = drawer.holders!.find((h) => h.id === id)!.lock!.shape.at;
    text = setIn(text, ["holders", indexOf(text, "holders", id), "lock", "shape", "at"], [half(at[0] + dx), half(at[1] + dy)]);
  }
  return text;
}

/** Puts a thing at a spot, by its centre. */
export const placeThing = (text: string, id: string, at: readonly [number, number]) => setThing(text, id, "at", [half(at[0]), half(at[1])]);

/** Takes a thing out of the drawer for now, or puts it back at `at`. */
export function setAside(text: string, id: string, aside: boolean, at?: readonly [number, number]): string {
  text = setThing(text, id, "aside", aside ? true : undefined);
  return at ? placeThing(text, id, at) : text;
}

/** How a thing sits. Its item's first pose is the default, so it isn't written. */
export function setPose(text: string, id: string, pose: Pose): string {
  const drawer = drawerOf(text);
  const thing = thingOf(drawer, id);
  const first = posesOf(drawer.items[thing.item ?? thing.id])[0];
  return setThing(text, id, "pose", samePose(pose, first) ? undefined : pose);
}

export const setRotate = (text: string, id: string, angle: number) => setThing(text, id, "rotate", angle ? angle : undefined);

/** The ways a thing's item may sit. Its first pose is how its shape is written, so it stays first. */
export function setPoses(text: string, itemId: string, poses: Pose[]): string {
  return setIn(text, ["items", itemId, "poses"], poses);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "thing";

function unique(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Adds a thing to the drawer, set aside until it's placed. It reuses an item with the same name
 * and shape, or adds one.
 */
export function addThing(text: string, item: { name: string } & ItemShape): { text: string; id: string } {
  const drawer = drawerOf(text);
  const items = drawer.items ?? {};
  const same = Object.entries(items).find(([, i]) => i.name === item.name && JSON.stringify("box" in i ? i.box : i.cylinder) === JSON.stringify("box" in item ? item.box : item.cylinder));
  const id = unique(slug(item.name), idsIn(drawer));
  let itemId = same?.[0];
  if (!itemId) {
    itemId = unique(slug(item.name), new Set(Object.keys(items)));
    text = setIn(text, ["items", itemId], item);
  }
  text = appendIn(text, ["layout"], { id, ...(itemId === id ? {} : { item: itemId }), at: [0, 0], aside: true });
  return { text, id };
}

/** Takes a thing out of the file altogether, and out of its holder. */
export function removeThing(text: string, id: string): string {
  text = releaseFromHolders(text, [id]);
  return removeIn(text, ["layout", indexOf(text, "layout", id)]);
}

// --- Holders ---------------------------------------------------------------------------------

/** Takes things out of whatever holds them, removing holders left holding nothing. */
function releaseFromHolders(text: string, ids: string[]): string {
  for (const h of drawerOf(text).holders ?? []) {
    const rest = h.holds.filter((x) => !ids.includes(x));
    if (rest.length === h.holds.length) continue;
    text = rest.length ? setHolder(text, h.id, "holds", rest) : removeIn(text, ["holders", indexOf(text, "holders", h.id)]);
  }
  return text;
}

/** The fields a holder needs for its method, beyond the ones every holder has. */
function needs(text: string, method: Method, holds: string[]): Record<string, unknown> {
  if (method !== "custom") return {};
  const drawer = drawerOf(text);
  const names = holds.map((id) => {
    const thing = drawer.layout.find((t) => t.id === id);
    return `the ${(drawer.items[thing?.item ?? id]?.name ?? id).toLowerCase()}`;
  });
  return { spec: { purpose: `Hold ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}.` } };
}

function addHolder(text: string, id: string, method: Method, holds: string[]): string {
  return appendIn(text, ["holders"], { id, method, holds, ...needs(text, method, holds) });
}

/** Holds things together in one new holder, taking them out of the ones they were in. */
export function holdTogether(text: string, ids: string[], method: Method): { text: string; id: string } {
  const drawer = drawerOf(text);
  const name = ids.length === 1 ? `${ids[0]}-${method}` : ids.length === 2 ? `${ids[0]}-and-${ids[1]}` : `${ids[0]}-group`;
  const id = unique(name, idsIn(drawer));
  text = releaseFromHolders(text, ids);
  return { text: addHolder(text, id, method, ids), id };
}

/** Splits a holder into one for each thing it holds, each with its method. */
export function splitHolder(text: string, id: string): string {
  const old = drawerOf(text).holders!.find((h) => h.id === id)!;
  text = removeIn(text, ["holders", indexOf(text, "holders", id)]);
  for (const thing of old.holds) {
    const hid = unique(`${thing}-${old.method}`, idsIn(drawerOf(text)));
    text = addHolder(text, hid, old.method, [thing]);
  }
  return text;
}

const METHOD_FIELDS = ["peg", "fit", "spec"];

/** Changes how a holder holds, dropping the fields only its old method used. */
export function setMethod(text: string, id: string, method: Method): string {
  const old = drawerOf(text).holders!.find((h) => h.id === id)!;
  text = setHolder(text, id, "method", method);
  for (const field of METHOD_FIELDS) if (field in old) text = setHolder(text, id, field, undefined);
  for (const [field, value] of Object.entries(needs(text, method, old.holds))) text = setHolder(text, id, field, value);
  return text;
}

/**
 * Settles things held by pegs onto the nearest seat where their pegs hold them, if they aren't
 * held where they are, as after moving them on a pegboard. Needs the printer's bed to plan.
 */
export function seatOnPegs(text: string, ids: string[], bed: readonly [number, number, number]): string {
  const file = read(text).file;
  if (file?.kind !== "drawer") return text;
  const p = plan(file.drawer, bed);
  if (!p.base.board) return text;
  const moves: [string, number, number][] = [];
  for (const id of ids) {
    const t = p.placed.find((x) => x.id === id);
    if (!t || t.holder?.method !== "pegs" || t.pegs?.held) continue;
    const spot = seat(p, t, t.x, t.y, 40);
    if (spot) moves.push([id, spot[0] - t.x, spot[1] - t.y]);
  }
  return moves.length ? moveThings(text, moves) : text;
}

/** How a thing sits between its pegs: play and spring. */
export const setFit = (text: string, id: string, fit: { play?: number; spring?: number }) => setHolder(text, id, "fit", fit);

/** Freezes a holder as built. */
export const lockHolder = (text: string, id: string, lock: Lock) => setHolder(text, id, "lock", lock);
export const unlockHolder = (text: string, id: string) => setHolder(text, id, "lock", undefined);

// --- The drawer ------------------------------------------------------------------------------

export function setBase(text: string, key: BaseKey): string {
  const base = BASES[key].base;
  if (!drawerOf(text).base) return setIn(text, ["base"], base);
  text = setIn(text, ["base", "kind"], base.kind);
  for (const field of ["pitch", "preset"]) text = deleteIn(text, ["base", field]);
  return "preset" in base ? setIn(text, ["base", "preset"], base.preset) : text;
}

export const setRule = (text: string, rule: "edge_margin" | "gap" | "angle_step", value: number) => setIn(text, ["rules", rule], value);

// --- The review ------------------------------------------------------------------------------

function reviewIndex(text: string, section: "questions" | "concerns", id: string): number {
  const index = (drawerOf(text).review?.[section] ?? []).findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`no ${section === "questions" ? "question" : "concern"} ${id}`);
  return index;
}

export function answerQuestion(text: string, id: string, answer: string): string {
  const index = reviewIndex(text, "questions", id);
  text = setIn(text, ["review", "questions", index, "answer"], answer);
  return setIn(text, ["review", "questions", index, "status"], "closed");
}

/** Closes a concern. Accepting it does what it suggests first. */
export function closeConcern(text: string, id: string, accept: boolean): string {
  const index = reviewIndex(text, "concerns", id);
  const concern = drawerOf(text).review!.concerns![index];
  if (accept) for (const thing of concern.act?.aside ?? []) text = setAside(text, thing, true);
  return setIn(text, ["review", "concerns", index, "status"], "closed");
}

export const addComment = (text: string, on: string, says: string) => appendIn(text, ["review", "comments"], { on, says, status: "open" });

