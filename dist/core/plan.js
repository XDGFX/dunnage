import { boxesOverlap, boxOf, boxPart, grow, polygon, push, RAD, spansOverlap, turn, unionOf } from "./geometry.js";
import { footprint, outline, overlap, posesOf, rectangle, samePose } from "./shape.js";
/** The library of holding methods. `pad` is how far a holder reaches round what it holds; `floor` how far it lifts it. */
export const METHODS = {
    well: { name: "Printed well", short: "Well", makes: "a 3MF", pad: 4, floor: 2, height: 15, printed: true, about: "A printed tray with a pocket shaped to the thing, which sits down into it. Good for anything with a flat base: mugs, tins, jars." },
    posts: { name: "Printed posts", short: "Posts", makes: "a 3MF", pad: 8, floor: 2, height: 30, printed: true, about: "A thin printed base with three or four posts round the thing. Less plastic than a well, and your fingers fit between the posts. Good for stacks and big round things." },
    slot: { name: "Printed slot", short: "Slot", makes: "a 3MF", pad: 4, floor: 2, height: 50, printed: true, about: "Two printed walls with the thing stood on edge between them. For flat things stored upright: scales, filters, boards." },
    peg: { name: "Printed peg", short: "Peg", makes: "a 3MF", pad: 5, floor: 4, height: 4, printed: true, about: "A printed base with one peg that goes up through a hole in the thing, like a V60's outlet. Holds it with nothing round the outside." },
    gridfinity: { name: "Gridfinity bin", short: "Gridfinity", makes: "a 3MF", pad: 0, floor: 2, height: 21, printed: true, about: "A Gridfinity bin in whole cells. The baseplate holds the bin; the bin holds the thing. Several things can share one bin." },
    pegs: { name: "IKEA pegs", short: "IKEA pegs", makes: "a list of holes", pad: 0, floor: 0, height: 132, printed: false, about: "IKEA UPPDATERA pegs in the board's fixed holes, resting against the thing. Nothing to print, and the pegs move when the layout does." },
    ply: { name: "Routed ply", short: "Routed ply", makes: "a template 3MF and a cut sheet", pad: 5, floor: 6, height: 12, printed: false, about: "Plywood with the thing's shape routed part-way in, cut against a printed template. For big things that would take hours to print." },
    custom: { name: "Custom", short: "Custom", makes: "a spec sheet", pad: 4, floor: 0, height: 0, printed: false, about: "Something dunnage can't make, like a cradle for a glass on its side. You get a spec sheet to build it in Fusion or Blender." },
};
export const BASES = {
    bare: { name: "Bare drawer floor", base: { kind: "bare" }, z: 0 },
    gridfinity: { name: "Gridfinity baseplate", base: { kind: "gridfinity" }, z: 5 },
    // The drawer height is measured from the top of a pegboard, so the board takes none of it.
    "uppdatera-60": { name: "UPPDATERA pegboard, 60 cm", base: { kind: "pegboard", preset: "uppdatera-60" }, z: 0, board: [475, 500] },
    "uppdatera-80": { name: "UPPDATERA pegboard, 80 cm", base: { kind: "pegboard", preset: "uppdatera-80" }, z: 0, board: [675, 500] },
};
/** UPPDATERA: holes are slots running across the drawer, and pegs are 12 × 6 mm, set across them. */
export const PEG = { size: [6, 12], height: 132 };
export const SLOT = [16, 7];
/** Gaps between holders on a bare floor narrower than this are closed; wider ones are left on purpose. */
export const FILL = 40;
/** A holder that can slide no further than this is held. */
export const HELD = 1.5;
export const baseKey = (base) => !base || base.kind === "bare" ? "bare" : base.kind === "gridfinity" ? "gridfinity" : base.preset;
/** Works out the plan for a drawer, for a printer with this bed. */
export function plan(drawer, bed) {
    const [width, depth, height] = drawer.drawer.inside;
    const rules = { edge_margin: 0, gap: 0, angle_step: 15, ...drawer.rules };
    const base = baseOf(drawer, width, depth, rules.edge_margin);
    const things = [];
    for (const [index, thing] of drawer.layout.entries()) {
        const itemId = thing.item ?? thing.id;
        const item = drawer.items[itemId];
        if (!item)
            continue;
        const pose = thing.pose ?? posesOf(item)[0];
        if (!posesOf(item).some((p) => samePose(p, pose)))
            continue;
        const stack = thing.stack ?? 1;
        things.push({
            id: thing.id, index, itemId, item, pose, stack,
            name: item.name + (stack > 1 ? ` ×${stack}` : ""),
            rotate: thing.rotate ?? 0,
            x: thing.at[0], y: thing.at[1],
            aside: !!thing.aside, zone: thing.zone, why: thing.why,
            shape: shapeOf(item, pose, stack),
            parts: [], overhang: [], box: none(), holdBox: none(), claim: none(),
            holder: null, z0: base.z, issues: [],
        });
    }
    // Things set aside wait on the counter in front of the drawer, in rows.
    let cx = 0;
    let row = 0;
    let rowDepth = 0;
    for (const t of things.filter((t) => t.aside)) {
        const b = boxOf(partsAt(t, 0, 0));
        const w = b.x1 - b.x0;
        const d = b.y1 - b.y0;
        if (cx + w > width && cx > 0) {
            cx = 0;
            row += rowDepth + 20;
            rowDepth = 0;
        }
        t.x = cx - b.x0;
        t.y = -40 - row - b.y1;
        cx += w + 20;
        rowDepth = Math.max(rowDepth, d);
    }
    for (const t of things) {
        const shape = outline(placedAs(t, t.x, t.y), t.item);
        t.parts = shape.parts;
        t.overhang = shape.overhang;
        t.box = boxOf([...shape.parts, ...shape.overhang]);
        t.holdBox = boxOf(shape.parts);
    }
    const placed = things.filter((t) => !t.aside);
    const holders = (drawer.holders ?? []).map((source, index) => ({
        id: source.id, index, source,
        method: source.method,
        holds: source.holds,
        things: [],
        locked: !!source.lock,
        shape: null, rect: null, posts: [], pegs: [], height: 0, issues: [],
    }));
    for (const t of things)
        t.holder = holders.find((h) => h.holds.includes(t.id)) ?? null;
    const obstructions = (drawer.drawer.obstructions ?? []).map((o, index) => {
        const box = { x0: o.at[0], y0: o.at[1], x1: o.at[0] + o.size[0], y1: o.at[1] + o.size[1] };
        return { name: o.name ?? `Obstruction ${index + 1}`, box, part: boxPart(box) };
    });
    const result = {
        width, depth, height, rules, base, bed, things, placed, holders, obstructions,
        counterDepth: Math.max(110, row + rowDepth + 64),
    };
    for (const h of holders)
        shapeHolder(result, h);
    for (const t of placed) {
        const h = t.holder;
        const method = h ? METHODS[h.method] : null;
        t.claim = h?.method === "gridfinity" ? t.holdBox : grow(t.holdBox, method?.pad ?? 4);
        const floor = !h || h.source.floor === false ? 0 : method.floor;
        t.z0 = base.z + floor;
        const top = t.z0 + t.shape.height;
        if (t.z0 > 0 && top > height + 0.01) {
            const under = [base.z ? `the base (${base.z} mm)` : "", floor ? `the holder's floor (${floor} mm)` : ""].filter(Boolean).join(" and ");
            t.issues.push({ level: "bad", text: `Too tall: ${Math.round(top)} mm in a ${height} mm drawer, counting ${under}` });
        }
        if (!h)
            t.issues.push({ level: "warn", text: "Not held yet" });
    }
    checkHolders(result);
    return result;
}
const none = () => ({ x0: 0, y0: 0, x1: 0, y1: 0 });
export const mm = (v) => (v < 9.95 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));
export const lower = (id) => id.replace(/-/g, " ");
export const pretty = (id) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
export const worst = (issues) => (issues.some((i) => i.level === "bad") ? "bad" : issues.length ? "warn" : null);
function shapeOf(item, pose, stack) {
    const { size, round, height } = footprint(item, pose, stack);
    const cylinder = "cylinder" in item;
    return {
        round, size, height,
        handle: cylinder && round ? item.handle : undefined,
        spout: cylinder && round ? item.spout : undefined,
        lying: cylinder && !round,
        tilt: typeof pose === "object" ? pose.tilt : 0,
    };
}
/** The layout entry for a thing at (x, y), turned by `rotate`. */
function placedAs(t, x, y, rotate = t.rotate) {
    return { id: t.id, at: [x, y], pose: t.pose, rotate, stack: t.stack };
}
/** The thing's outline at (x, y), body and handle, grown by `extra` all round. */
export function partsAt(t, x, y, rotate = t.rotate, extra = 0) {
    return outline(placedAs(t, x, y, rotate), t.item, extra).parts;
}
/** Whether two outlines overlap by more than rounding. */
export const partsHit = (a, b) => a.some((p) => b.some((q) => overlap(p, q) > 0.01));
function baseOf(drawer, width, depth, margin) {
    const key = baseKey(drawer.base);
    const base = { key, name: BASES[key].name, z: BASES[key].z };
    if (drawer.base?.kind === "gridfinity") {
        const pitch = drawer.base.pitch ?? 42;
        const nx = Math.floor((width - 2 * margin) / pitch);
        const ny = Math.floor((depth - 2 * margin) / pitch);
        base.grid = { pitch, nx, ny, ox: (width - nx * pitch) / 2, oy: (depth - ny * pitch) / 2 };
    }
    const board = BASES[key].board;
    if (board) {
        // Holes on a 40 mm grid plus the same grid offset 20 mm both ways: a cross pattern.
        const [bw, bd] = board;
        const x0 = (width - bw) / 2;
        const y0 = (depth - bd) / 2;
        const na = Math.floor((bw - 50) / 20);
        const nb = Math.floor((bd - 50) / 20);
        const ex = (bw - na * 20) / 2;
        const ey = (bd - nb * 20) / 2;
        const holes = [];
        for (let a = 0; a <= na; a++)
            for (let b = 0; b <= nb; b++)
                if ((a + b) % 2 === 0)
                    holes.push([x0 + ex + a * 20, y0 + ey + b * 20]);
        base.board = { x0, y0, width: bw, depth: bd, holes };
    }
    return base;
}
/** Works out a holder's shape from its method and what it holds. A locked holder keeps the shape it was built with. */
function shapeHolder(p, h) {
    const ts = p.things.filter((t) => h.holds.includes(t.id) && !t.aside);
    const method = METHODS[h.method];
    h.things = ts;
    h.height = method.height;
    const lock = h.source.lock;
    if (lock) {
        const { at, size, height } = lock.shape;
        h.shape = { x0: at[0], y0: at[1], x1: at[0] + size[0], y1: at[1] + size[1] };
        h.height = height;
        return;
    }
    if (!ts.length)
        return;
    const around = unionOf(ts.map((t) => t.holdBox));
    const grid = p.base.grid;
    if (h.method === "gridfinity" && grid) {
        const { pitch, ox, oy } = grid;
        const cells = [
            Math.floor((around.x0 - 1 - ox) / pitch),
            Math.floor((around.y0 - 1 - oy) / pitch),
            Math.ceil((around.x1 + 1 - ox) / pitch),
            Math.ceil((around.y1 + 1 - oy) / pitch),
        ];
        h.cells = cells;
        h.shape = { x0: ox + cells[0] * pitch, y0: oy + cells[1] * pitch, x1: ox + cells[2] * pitch, y1: oy + cells[3] * pitch };
    }
    else if (h.method === "pegs" && p.base.board) {
        for (const t of ts)
            h.pegs.push(...choosePegs(p, t));
        h.shape = around;
    }
    else {
        h.shape = grow(around, method.pad);
    }
    if (h.method === "posts") {
        for (const t of ts) {
            if (t.shape.round)
                for (let k = 0; k < 3; k++)
                    h.posts.push(turn([t.x, t.y], 0, t.shape.size[0] / 2 + 5, t.rotate + 60 + k * 120));
            else
                for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
                    h.posts.push(turn([t.x, t.y], u * (t.shape.size[0] / 2 + 4), v * (t.shape.size[1] / 2 + 4), t.rotate));
        }
    }
}
const pegPart = (x, y) => rectangle([x, y], PEG.size);
/** The gap between a thing's part and a peg: the distance, the point on the part, and the direction from it to the peg. */
function gapTo(part, peg) {
    if (part.kind === "circle") {
        const [cx, cy] = part.centre;
        const r = part.radius;
        const xs = peg.map((q) => q[0]);
        const ys = peg.map((q) => q[1]);
        const px = Math.max(Math.min(...xs), Math.min(Math.max(...xs), cx));
        const py = Math.max(Math.min(...ys), Math.min(Math.max(...ys), cy));
        const length = Math.hypot(px - cx, py - cy);
        if (length < 1e-6)
            return { gap: -r, at: [cx, cy], normal: [0, 0] };
        const n = [(px - cx) / length, (py - cy) / length];
        return { gap: length - r, at: [cx + n[0] * r, cy + n[1] * r], normal: n };
    }
    const P = part.points;
    const m = push(P, peg);
    if (m) {
        const c = [peg.reduce((a, q) => a + q[0], 0) / peg.length, peg.reduce((a, q) => a + q[1], 0) / peg.length];
        return { gap: -m.depth, at: c, normal: [-m.x / m.depth, -m.y / m.depth] };
    }
    let best = { gap: Infinity, at: [0, 0], normal: [0, 0] };
    const nearest = (pt, a, b) => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        return [a[0] + t * dx, a[1] + t * dy];
    };
    // The normal comes from the edge in contact (polygons wind anticlockwise, so an edge's
    // outward normal is (dy, -dx)); that stays well defined when the two just touch.
    const outward = (E, i) => {
        const [x1, y1] = E[i];
        const [x2, y2] = E[(i + 1) % E.length];
        const length = Math.hypot(x2 - x1, y2 - y1);
        return [(y2 - y1) / length, -(x2 - x1) / length];
    };
    for (const [A, B, flip] of [[P, peg, false], [peg, P, true]]) {
        for (const v of A) {
            for (let i = 0; i < B.length; i++) {
                const c = nearest(v, B[i], B[(i + 1) % B.length]);
                const d = Math.hypot(v[0] - c[0], v[1] - c[1]);
                if (d < best.gap - 1e-9) {
                    const e = outward(B, i);
                    best = flip ? { gap: d, at: c, normal: e } : { gap: d, at: v, normal: [-e[0], -e[1]] };
                }
            }
        }
    }
    return best;
}
export const roundAllOver = (t) => t.shape.round && !t.shape.handle && !t.shape.spout;
/** Whether a set of contacts leaves the thing no way to move. */
function closes(contacts, cx, cy, round) {
    const usable = contacts.filter((c) => Math.hypot(c.normal[0], c.normal[1]) > 0.5);
    if (usable.length < (round ? 3 : 4))
        return false; // the least that can hold: 3 round, 4 otherwise
    const w = usable.map((c) => (round ? [c.normal[0], c.normal[1], 0] : [c.normal[0], c.normal[1], ((c.at[0] - cx) * c.normal[1] - (c.at[1] - cy) * c.normal[0]) / 100]));
    const free = (v) => {
        const length = Math.hypot(...v);
        if (length < 1e-9)
            return false;
        return w.every((r) => (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / length <= 1e-4);
    };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const candidates = [];
    if (round)
        for (const r of w)
            candidates.push([-r[1], r[0], 0], [r[1], -r[0], 0]);
    else {
        for (let i = 0; i < w.length; i++)
            for (let j = i + 1; j < w.length; j++) {
                const c = cross(w[i], w[j]);
                candidates.push(c, c.map((x) => -x));
            }
        for (const r of w)
            for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
                const c = cross(r, axis);
                candidates.push(c, c.map((x) => -x));
            }
    }
    return !candidates.some(free);
}
function wallContacts(p, parts, play) {
    const out = [];
    for (const part of parts) {
        const points = part.kind === "circle"
            ? [[part.centre[0] - part.radius, part.centre[1]], [part.centre[0] + part.radius, part.centre[1]], [part.centre[0], part.centre[1] - part.radius], [part.centre[0], part.centre[1] + part.radius]]
            : part.points;
        for (const v of points) {
            if (v[0] <= play)
                out.push({ at: v, normal: [-1, 0], wall: "left" });
            if (v[0] >= p.width - play)
                out.push({ at: v, normal: [1, 0], wall: "right" });
            if (v[1] <= play)
                out.push({ at: v, normal: [0, -1], wall: "front" });
            if (v[1] >= p.depth - play)
                out.push({ at: v, normal: [0, 1], wall: "back" });
        }
    }
    return out;
}
/** Every peg that could touch the thing at this spot. */
function pegCandidates(p, t, parts, play, spring, slack = 0) {
    const bb = grow(boxOf(parts), 8 + play + slack);
    const others = p.placed.filter((o) => o.id !== t.id);
    const out = [];
    for (const [x, y] of p.base.board?.holes ?? []) {
        if (x < bb.x0 || x > bb.x1 || y < bb.y0 || y > bb.y1)
            continue;
        const peg = pegPart(x, y);
        const Q = polygon(peg);
        let best = null;
        for (const part of parts) {
            const g = gapTo(part, Q);
            if (!best || g.gap < best.gap)
                best = g;
        }
        if (!best || best.gap < -spring - 0.01 || best.gap > play + slack)
            continue;
        if (others.some((o) => o.parts.some((q) => overlap(peg, q) > 0.01)))
            continue; // a peg there would hit a neighbour
        out.push({ x, y, gap: best.gap, at: best.at, normal: best.normal, ok: best.gap <= play });
    }
    return out;
}
/** How a thing sits between its pegs: how far it may wander, and how far it pushes stock pegs out. */
export function fitOf(holder) {
    const fit = holder?.method === "pegs" ? holder.fit ?? {} : {};
    return { play: fit.play ?? 2, spring: fit.spring ?? 0 };
}
/** How far a thing with an outlet can sit off a hole and still drop over a peg through it. */
const outletReach = (outlet) => outlet / 2 - Math.hypot(...PEG.size) / 2;
/** Whether pegs hold the thing with its centre at (x, y). */
export function heldByPegs(p, t, x, y) {
    const { play, spring } = fitOf(t.holder?.source);
    const holes = p.base.board?.holes ?? [];
    if (t.item.outlet) {
        const reach = outletReach(t.item.outlet);
        return holes.some(([hx, hy]) => Math.hypot(hx - x, hy - y) <= reach);
    }
    const parts = partsAt(t, x, y);
    const ok = pegCandidates(p, t, parts, play, spring).filter((c) => c.ok).sort((a, b) => a.gap - b.gap);
    return closes([...wallContacts(p, parts, play), ...ok.slice(0, 12)], x, y, roundAllOver(t));
}
/**
 * The fewest pegs that hold the thing where it is. When nothing holds it there, still the pegs
 * that would, best effort, with the ones too far off marked, so you can see how it's held
 * wherever it is.
 */
function choosePegs(p, t) {
    const { play, spring } = fitOf(t.holder?.source);
    const { x: cx, y: cy } = t;
    const holes = p.base.board?.holes ?? [];
    if (t.item.outlet) {
        // One peg up through a hole in its base.
        const reach = outletReach(t.item.outlet);
        const [hole, d] = holes.map((h) => [h, Math.hypot(h[0] - cx, h[1] - cy)]).sort((a, b) => a[1] - b[1])[0] ?? [[cx, cy], Infinity];
        t.pegs = { held: d <= reach, play, spring, walls: [], far: d <= reach ? [] : [d - reach] };
        return [{ x: hole[0], y: hole[1], gap: d - reach + play, at: [cx, cy], normal: [0, 0], ok: d <= reach, of: t.id, through: true }];
    }
    const round = roundAllOver(t);
    const walls = wallContacts(p, t.parts, play);
    const pool = pegCandidates(p, t, t.parts, play, spring, 15);
    const ok = pool.filter((c) => c.ok).sort((a, b) => a.gap - b.gap).slice(0, 12);
    const held = closes([...walls, ...ok], cx, cy, round);
    t.pegs = { held, play, spring, walls: [...new Set(walls.map((w) => w.wall))], far: [] };
    const pick = (C, most, score) => {
        let best = null;
        for (let k = 1; k <= Math.min(most, C.length); k++) {
            const visit = (start, set) => {
                if (set.length === k) {
                    const s = score(set);
                    if (s !== null && (!best || s < best.score))
                        best = { set: [...set], score: s };
                    return;
                }
                for (let i = start; i < C.length; i++) {
                    set.push(C[i]);
                    visit(i + 1, set);
                    set.pop();
                }
            };
            visit(0, []);
            if (best && held)
                break; // held: the fewest pegs win
        }
        return best?.set ?? [];
    };
    let set;
    if (held)
        set = pick(ok, 6, (S) => (closes([...walls, ...S], cx, cy, round) ? S.reduce((a, c) => a + c.gap, 0) : null));
    else {
        // The set that would hold it if the far pegs were closer; failing that, the best spread.
        const C = [...pool].sort((a, b) => a.gap - b.gap).slice(0, 10);
        const need = round ? 3 : 4;
        const spread = (S) => {
            const a = S.map((c) => Math.atan2(c.normal[1], c.normal[0]) / RAD).sort((x, y) => x - y);
            let most = 360 - a[a.length - 1] + a[0];
            for (let i = 1; i < a.length; i++)
                most = Math.max(most, a[i] - a[i - 1]);
            return most;
        };
        set = pick(C, need + 1, (S) => (closes([...walls, ...S], cx, cy, round) ? 0 : 1000 + spread(S) + (need - Math.min(need, S.length)) * 200) +
            S.reduce((a, c) => a + Math.max(0, c.gap - play), 0) + S.length * 0.5);
        t.pegs.far = set.filter((c) => !c.ok).map((c) => c.gap - play);
    }
    return set.map((c) => ({ x: c.x, y: c.y, gap: c.gap, at: c.at, normal: c.normal, ok: c.ok, of: t.id }));
}
// --- Holders against each other -----------------------------------------------------------
/** How far a holder's footprint can slide each way before a wall or another holder stops it. */
export function travel(p, r, id) {
    const T = { L: r.x0, R: p.width - r.x1, F: r.y0, B: p.depth - r.y1, by: {} };
    const near = (k, v, o) => {
        if (v < T[k]) {
            T[k] = v;
            T.by[k] = o;
        }
    };
    for (const o of p.holders) {
        if (o.id === id || !o.rect || o.method === "pegs")
            continue;
        const b = o.rect;
        if (spansOverlap(r.y0, r.y1, b.y0, b.y1)) {
            if (b.x1 <= r.x0 + 0.5)
                near("L", r.x0 - b.x1, o);
            if (b.x0 >= r.x1 - 0.5)
                near("R", b.x0 - r.x1, o);
        }
        if (spansOverlap(r.x0, r.x1, b.x0, b.x1)) {
            if (b.y1 <= r.y0 + 0.5)
                near("F", r.y0 - b.y1, o);
            if (b.y0 >= r.y1 - 0.5)
                near("B", b.y0 - r.y1, o);
        }
    }
    for (const k of ["L", "R", "F", "B"])
        T[k] = Math.max(0, T[k]);
    return T;
}
/**
 * On a bare floor, holders hold each other by touching, so small gaps close: each holder grows
 * to meet its neighbour halfway, or a wall all the way. Gaps wider than FILL are left as space
 * on purpose, and show as slides. Locked, custom and peg holders don't grow.
 */
function closeGaps(p, live) {
    const growing = live.filter((h) => !h.locked && h.method !== "custom" && h.method !== "pegs");
    for (const axis of ["x", "y"]) {
        const moves = growing.map((h) => {
            const tv = travel(p, h.rect, h.id);
            const [lo, hi] = axis === "x" ? ["L", "R"] : ["F", "B"];
            const share = (k) => (tv[k] > FILL ? 0 : tv.by[k] && growing.includes(tv.by[k]) ? tv[k] / 2 : tv[k]);
            return [h, share(lo), share(hi)];
        });
        for (const [h, lo, hi] of moves) {
            if (axis === "x")
                h.rect = { ...h.rect, x0: h.rect.x0 - lo, x1: h.rect.x1 + hi };
            else
                h.rect = { ...h.rect, y0: h.rect.y0 - lo, y1: h.rect.y1 + hi };
        }
    }
}
function checkHolders(p) {
    const { base, rules, width, depth, bed } = p;
    const live = p.holders.filter((h) => h.shape);
    for (const h of live)
        h.rect = { ...h.shape };
    if (base.key === "bare")
        closeGaps(p, live);
    for (const h of live) {
        const method = METHODS[h.method];
        const say = (level, text) => h.issues.push({ level, text });
        if (base.grid && !["gridfinity", "ply", "custom"].includes(h.method))
            say("warn", "Not a Gridfinity bin, so it won't lock to the grid");
        if (base.board && h.method !== "pegs" && h.method !== "custom")
            say("warn", "Loose on the pegboard: hold it with pegs, or print a peg adapter");
        if (h.method === "gridfinity" && base.grid && h.cells) {
            const [i0, j0, i1, j1] = h.cells;
            if (i0 < 0 || j0 < 0 || i1 > base.grid.nx || j1 > base.grid.ny)
                say("bad", "Runs off the grid");
        }
        if (h.method === "pegs" && base.board) {
            for (const t of h.things) {
                const fit = t.pegs;
                if (!fit.held && fit.far.length && !t.item.outlet) {
                    say("bad", `Pegs can't hold ${lower(t.id)} here: ${fit.far.length === 1 ? "one peg is" : `${fit.far.length} pegs are`} too far off (${fit.far.map((v) => `${mm(v)} mm`).join(", ")} past its ${fit.play} mm of play)`);
                }
                else if (!fit.held) {
                    say("bad", t.item.outlet ? `${pretty(t.id)} isn't over a hole, so no peg goes through it` : roundAllOver(t) ? `Pegs can't hold ${lower(t.id)} here: it can still slide one way` : `Pegs can't hold ${lower(t.id)} here: it can still slide or turn`);
                }
                const loosest = partsAt(t, t.x, t.y, t.rotate, fit.play + fit.spring);
                const near = p.placed.find((o) => o !== t && partsHit(loosest, o.parts));
                if (near)
                    say("warn", `With ${fit.play} mm of play it could touch ${lower(near.id)}`);
            }
        }
        const clash = live.find((o) => o !== h && o.method !== "pegs" && h.method !== "pegs" && boxesOverlap(h.shape, o.shape));
        if (clash)
            say("bad", `${h.method === "gridfinity" && clash.method === "gridfinity" ? "Shares grid cells" : "Clashes"} with ${lower(clash.id)}`);
        const r = h.rect;
        const w = r.x1 - r.x0;
        const d = r.y1 - r.y0;
        if (method.printed && !h.locked && (Math.max(w, d) > Math.max(bed[0], bed[1]) || Math.min(w, d) > Math.min(bed[0], bed[1]))) {
            say("bad", `${Math.round(w)} × ${Math.round(d)} mm is bigger than the ${bed[0]} mm bed: split it or route it in ply`);
        }
        const margin = rules.edge_margin;
        if (margin > 0 && h.method !== "pegs" && (r.x0 < margin - 0.5 || r.y0 < margin - 0.5 || r.x1 > width - margin + 0.5 || r.y1 > depth - margin + 0.5)) {
            say("warn", `Inside the ${margin} mm edge margin`);
        }
        if (base.key === "bare" && h.method !== "pegs") {
            h.travel = travel(p, r, h.id);
            h.slide = Math.max(h.travel.L + h.travel.R, h.travel.F + h.travel.B);
            if (h.slide > HELD)
                say("warn", `Slides ${Math.round(h.slide)} mm: nothing it touches stops it`);
        }
    }
}
