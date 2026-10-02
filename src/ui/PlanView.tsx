import { useEffect, useReducer, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  boxesOverlap, HELD, lower, METHODS, mm, moveThings, partsAt, partsHit, PEG, seat, seatOnPegs, setAside, setRotate, SLOT, snapAngle, solve, turn, unionOf, worst, wrap,
  type Box, type Issue, type Move, type Plan, type PlannedHolder, type PlannedThing, type Point, type Snap,
} from "../core/index.ts";

// The plan: the drawer from above, with the counter in front of it. It's the interface: drag a
// thing to move it, drag it onto the counter to set it aside, turn it by its knob. Moves are
// pulled towards a tidy layout and glide into place; every drop edits the file.

interface Props {
  plan: Plan;
  issues: Map<string, Issue[]>;
  sels: string[];
  select: (ids: string[], add?: boolean) => void;
  apply: (edit: (text: string) => string) => void;
}

type Target = Move & { seat?: boolean; noSeat?: boolean };

type Gesture =
  | {
      kind: "move";
      ids: string[];
      start: Point;
      fromCounter: boolean;
      toCounter: boolean;
      moved: boolean;
      target: Target;
      shown: { dx: number; dy: number };
      /** One thing held by pegs: it jumps between seats as it's dragged. */
      pegLive: boolean;
      lastSeat: Target | null;
    }
  | { kind: "turn"; id: string; angle: number; why: string | null; hit: string | null }
  | { kind: "turn-group"; ids: string[]; centre: Point; angle: number; hit: string | null }
  | { kind: "marquee"; start: Point; box: Box | null; add: boolean };

/** Stay on a peg seat until the pointer is this far from it, so it doesn't flicker between near-equal seats. */
const STICK = 9;
const PAD = 40;

export function PlanView({ plan: p, issues, sels, select, apply }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const frame = useRef(0);
  const g = gesture.current;

  const W = p.width;
  const D = p.depth;
  const Y = (y: number) => D - y;
  const thing = (id: string) => p.things.find((t) => t.id === id);
  const isSel = (id: string) => sels.includes(id);

  const toMM = (e: { clientX: number; clientY: number }): Point => {
    const el = svg.current!;
    const point = el.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const q = point.matrixTransform(el.getScreenCTM()!.inverse());
    return [q.x, D - q.y];
  };

  /** Follows the pointer until it's let go. */
  const track = (move: (e: PointerEvent) => void, up: (e: PointerEvent) => void) => {
    const end = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      up(e);
      gesture.current = null;
      redraw();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // The moved things glide towards where the move is going.
  const glide = () => {
    const m = gesture.current;
    if (m?.kind !== "move") return;
    const { shown, target } = m;
    shown.dx += (target.dx - shown.dx) * 0.35;
    shown.dy += (target.dy - shown.dy) * 0.35;
    if (Math.abs(target.dx - shown.dx) < 0.05) shown.dx = target.dx;
    if (Math.abs(target.dy - shown.dy) < 0.05) shown.dy = target.dy;
    redraw();
    frame.current = shown.dx !== target.dx || shown.dy !== target.dy ? requestAnimationFrame(glide) : 0;
  };
  const kick = () => {
    if (!frame.current) frame.current = requestAnimationFrame(glide);
  };

  const startMove = (e: ReactPointerEvent, t: PlannedThing) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) return select([t.id], true);
    // Drag the selection if this thing is in it. A locked holder's things move together.
    let ids = isSel(t.id) && sels.length > 1 ? sels.filter((id) => thing(id)?.aside === t.aside) : [t.id];
    for (const id of [...ids]) {
      const h = thing(id)?.holder;
      if (h?.locked) ids.push(...h.holds.filter((x) => thing(x) && !thing(x)!.aside));
    }
    ids = [...new Set(ids)];
    const pegLive = ids.length === 1 && !!p.base.board && t.holder?.method === "pegs" && !t.aside;
    const still: Target = { dx: 0, dy: 0, x: null, y: null };
    gesture.current = {
      kind: "move", ids, start: toMM(e), fromCounter: t.aside, toCounter: t.aside, moved: false,
      target: still, shown: { dx: 0, dy: 0 }, pegLive, lastSeat: pegLive && t.pegs?.held ? { ...still, seat: true } : null,
    };
    let seatQueued = false;
    let pending: Target | null = null;
    track(
      (ev) => {
        const m = gesture.current;
        if (m?.kind !== "move") return;
        const [x, y] = toMM(ev);
        if (!m.moved && Math.hypot(x - m.start[0], y - m.start[1]) < 3) return;
        if (!m.moved) {
          m.moved = true;
          if (!isSel(t.id)) select([t.id]);
        }
        const rdx = x - m.start[0];
        const rdy = y - m.start[1];
        m.toCounter = y < -20;
        if (m.toCounter) m.target = { dx: rdx, dy: rdy, x: null, y: null };
        else {
          const move = solve(p, m.ids, rdx, rdy, ev.altKey);
          if (move) m.target = move;
          if (m.pegLive && move) {
            // Seats are worked out once a frame: it's the slowest part of a drag.
            pending = move;
            if (!seatQueued) {
              seatQueued = true;
              requestAnimationFrame(() => {
                seatQueued = false;
                const q = pending!;
                const last = m.lastSeat;
                if (last && Math.hypot(q.dx - last.dx, q.dy - last.dy) < STICK) m.target = last;
                else {
                  const spot = seat(p, t, t.x + q.dx, t.y + q.dy, 20);
                  if (spot && last && Math.hypot(spot[0] - t.x - last.dx, spot[1] - t.y - last.dy) < 5) m.target = last;
                  else if (spot) m.lastSeat = m.target = { dx: spot[0] - t.x, dy: spot[1] - t.y, x: null, y: null, seat: true };
                  else m.target = { ...q, x: null, y: null, noSeat: true };
                }
                kick();
              });
            }
          }
        }
        kick();
      },
      () => {
        const m = gesture.current;
        if (m?.kind !== "move") return;
        if (!m.moved) return select([t.id]);
        const { ids: moving, target } = m;
        if (m.toCounter) {
          if (!m.fromCounter) apply((text) => moving.reduce((acc, id) => setAside(acc, id, true), text));
          return;
        }
        if (m.fromCounter) {
          apply((text) => moving.reduce((acc, id) => { const x = thing(id)!; return setAside(acc, id, false, [x.x + target.dx, x.y + target.dy]); }, text));
          return;
        }
        // A thing held by pegs can't be dropped where nothing holds it: it goes back to its last seat, or stays put.
        const final = m.pegLive && target.noSeat ? m.lastSeat : target;
        if (!final || (!final.dx && !final.dy)) return;
        apply((text) => {
          const next = moveThings(text, moving.map((id) => [id, final.dx, final.dy]));
          return p.base.board && !m.pegLive ? seatOnPegs(next, moving, p.bed) : next;
        });
      },
    );
    redraw();
  };

  const startTurn = (e: ReactPointerEvent, t: PlannedThing) => {
    e.stopPropagation();
    const others = t.aside ? [] : p.placed.filter((o) => o !== t);
    gesture.current = { kind: "turn", id: t.id, angle: t.rotate, why: null, hit: null };
    // Turning is never blocked: an overlap is shown, and you move it.
    track(
      (ev) => {
        const m = gesture.current;
        if (m?.kind !== "turn") return;
        const [x, y] = toMM(ev);
        const s = snapAngle(p, t, (Math.atan2(y - t.y, x - t.x) * 180) / Math.PI - 90, ev.shiftKey);
        m.angle = s.angle;
        m.why = s.why;
        m.hit = others.find((o) => partsHit(partsAt(t, t.x, t.y, s.angle), o.parts))?.id ?? null;
        redraw();
      },
      () => {
        const m = gesture.current;
        if (m?.kind === "turn" && m.angle !== t.rotate) apply((text) => setRotate(text, t.id, m.angle));
      },
    );
    redraw();
  };

  const startTurnGroup = (e: ReactPointerEvent, group: PlannedThing[], centre: Point) => {
    e.stopPropagation();
    const step = p.rules.angle_step || 15;
    gesture.current = { kind: "turn-group", ids: group.map((t) => t.id), centre, angle: 0, hit: null };
    const others = p.placed.filter((o) => !group.includes(o));
    track(
      (ev) => {
        const m = gesture.current;
        if (m?.kind !== "turn-group") return;
        const [x, y] = toMM(ev);
        const raw = wrap((Math.atan2(y - centre[1], x - centre[0]) * 180) / Math.PI - 90);
        m.angle = ev.shiftKey ? Math.round(raw) : Math.round(raw / step) * step;
        // Turning is never blocked: an overlap is shown, and you move them.
        const turned = group.map((t) => {
          const [nx, ny] = turn(centre, t.x - centre[0], t.y - centre[1], m.angle);
          return partsAt(t, nx, ny, t.rotate + m.angle);
        });
        m.hit = others.find((o) => turned.some((parts) => partsHit(parts, o.parts)))?.id ?? null;
        redraw();
      },
      () => {
        const m = gesture.current;
        if (m?.kind !== "turn-group" || !m.angle) return;
        const angle = m.angle;
        apply((text) =>
          group.reduce((acc, t) => {
            const [nx, ny] = turn(centre, t.x - centre[0], t.y - centre[1], angle);
            const moved = moveThings(acc, [[t.id, nx - t.x, ny - t.y]]);
            return setRotate(moved, t.id, wrap(t.rotate + angle));
          }, text),
        );
      },
    );
    redraw();
  };

  const startMarquee = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    gesture.current = { kind: "marquee", start: toMM(e), box: null, add: e.shiftKey };
    track(
      (ev) => {
        const m = gesture.current;
        if (m?.kind !== "marquee") return;
        const [x, y] = toMM(ev);
        if (!m.box && Math.hypot(x - m.start[0], y - m.start[1]) < 4) return;
        m.box = { x0: Math.min(x, m.start[0]), y0: Math.min(y, m.start[1]), x1: Math.max(x, m.start[0]), y1: Math.max(y, m.start[1]) };
        redraw();
      },
      () => {
        const m = gesture.current;
        if (m?.kind !== "marquee") return;
        if (!m.box) {
          if (!m.add) select([]);
          return;
        }
        const box = m.box;
        const hit = p.things.filter((t) => boxesOverlap(t.box, box)).map((t) => t.id);
        select(m.add ? [...new Set([...sels, ...hit])] : hit);
      },
    );
  };

  // --- Drawing --------------------------------------------------------------------------

  const CD = p.counterDepth;
  const selHolders = new Set(sels.map((id) => thing(id)?.holder?.id).filter(Boolean) as string[]);
  const moving = g?.kind === "move" ? g : null;
  const order = [...p.things].sort((a, b) => Number(isSel(a.id) || !!moving?.ids.includes(a.id)) - Number(isSel(b.id) || !!moving?.ids.includes(b.id)));
  const group = sels.map(thing).filter((t): t is PlannedThing => !!t && !t.aside);
  const groupBox = group.length > 1 && !group.some((t) => t.holder?.locked) ? unionOf(group.map((t) => t.box)) : null;
  const anyAside = p.things.some((t) => t.aside);

  return (
    <svg
      ref={svg}
      className="plan"
      viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${D + CD + PAD * 2}`}
      role="application"
      aria-label="Plan of the drawer from above, with the counter in front of it"
    >
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="hatch-line" />
        </pattern>
      </defs>

      <rect className={`counter ${moving?.toCounter && !moving.fromCounter ? "hot" : ""}`} x={0} y={D + 22} width={W} height={CD - 10} rx={10} onPointerDown={startMarquee} />
      <text className="counter-label" x={14} y={D + CD + 2}>
        {anyAside ? "Set aside: out of the drawer, still in the file" : "Drag a thing here to take it out of the drawer"}
      </text>

      <rect className="floor" x={0} y={0} width={W} height={D} rx={4} onPointerDown={startMarquee} />
      <BaseLayer p={p} Y={Y} />
      {p.obstructions.map((o) => (
        <g key={o.name} className="obstruction">
          <rect x={o.box.x0} y={Y(o.box.y1)} width={o.box.x1 - o.box.x0} height={o.box.y1 - o.box.y0} />
          {o.box.x1 - o.box.x0 > 80 && <text x={o.box.x0 + 6} y={Y(o.box.y1) + 14}>{o.name}</text>}
        </g>
      ))}
      {p.rules.edge_margin > 0 && <rect className="margin" x={p.rules.edge_margin} y={p.rules.edge_margin} width={W - 2 * p.rules.edge_margin} height={D - 2 * p.rules.edge_margin} />}
      <rect className="wall" x={0} y={0} width={W} height={D} rx={4} />
      <text className="front" x={W / 2} y={D + 15} textAnchor="middle">Front of the drawer</text>
      <text className="dims" x={W} y={-14} textAnchor="end">{`${W} × ${D} × ${p.height} mm inside · ${p.base.name}`}</text>

      <g>
        {p.holders.map((h) => h.rect && <HolderShape key={h.id} p={p} h={h} Y={Y} selected={selHolders.has(h.id)} issues={issues.get(h.id) ?? []} />)}
      </g>

      <g>
        {order.map((t) => {
          const lifted = moving?.ids.includes(t.id) ? moving.shown : null;
          const turning = g?.kind === "turn" && g.id === t.id ? g.angle : t.rotate;
          const level = t.aside ? null : worst(issues.get(t.id) ?? []);
          const groupTurn = g?.kind === "turn-group" && g.ids.includes(t.id) ? `rotate(${-g.angle} ${g.centre[0]} ${Y(g.centre[1])})` : "";
          return (
            <g
              key={t.id}
              className={["thing", isSel(t.id) && "sel", lifted && moving?.moved && "dragging", level === "bad" && "bad", t.aside && "aside"].filter(Boolean).join(" ")}
              transform={lifted ? `translate(${lifted.dx} ${-lifted.dy})` : groupTurn || undefined}
              tabIndex={0}
              role="button"
              aria-label={t.name}
              aria-pressed={isSel(t.id)}
              onPointerDown={(e) => startMove(e, t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select([t.id], e.shiftKey);
                }
              }}
            >
              <ThingShape t={t} Y={Y} rotate={turning} selected={isSel(t.id)} />
              {isSel(t.id) && sels.length === 1 && !t.holder?.locked && !moving?.moved && (
                <g className="knob-handle">
                  <line className="handle-line" x1={t.x} y1={Y(t.box.y1) - 6} x2={t.x} y2={Y(t.box.y1) - 24} />
                  <circle className="knob" cx={t.x} cy={Y(t.box.y1) - 31} r={7} onPointerDown={(e) => startTurn(e, t)} aria-label="Turn" />
                </g>
              )}
            </g>
          );
        })}
      </g>

      {groupBox && !moving?.moved && (() => {
        const centre: Point = [(groupBox.x0 + groupBox.x1) / 2, (groupBox.y0 + groupBox.y1) / 2];
        const turnAngle = g?.kind === "turn-group" ? g.angle : 0;
        return (
          <g transform={`rotate(${-turnAngle} ${centre[0]} ${Y(centre[1])})`}>
            <line className="handle-line" x1={centre[0]} y1={Y(groupBox.y1) - 4} x2={centre[0]} y2={Y(groupBox.y1) - 22} />
            <circle className="knob" cx={centre[0]} cy={Y(groupBox.y1) - 29} r={7} onPointerDown={(e) => startTurnGroup(e, group, centre)} aria-label="Turn them together" />
          </g>
        );
      })()}

      <g className="guides">
        {p.base.key === "bare" && !moving?.moved &&
          (selHolders.size ? p.holders.filter((h) => selHolders.has(h.id)) : p.holders).map((h) => h.rect && h.travel && <Gaps key={h.id} r={h.rect} h={h} Y={Y} />)}
        {moving?.moved && <MoveGuides p={p} g={moving} thing={thing} Y={Y} />}
        {g?.kind === "turn" && (() => {
          const t = thing(g.id)!;
          return <Chip x={t.x} y={Y(t.y)} text={`${g.angle}°${g.why ? ` · ${g.why}` : ""}${g.hit ? ` · overlaps ${lower(g.hit)}` : ""}`} tone={g.hit ? "bad" : "touch"} />;
        })()}
        {g?.kind === "turn-group" && <Chip x={g.centre[0]} y={Y(g.centre[1]) + 18} text={`${g.angle}° together${g.hit ? ` · overlaps ${lower(g.hit)}` : ""}`} tone={g.hit ? "bad" : "touch"} />}
        {g?.kind === "marquee" && g.box && <rect className="marquee" x={g.box.x0} y={Y(g.box.y1)} width={g.box.x1 - g.box.x0} height={g.box.y1 - g.box.y0} />}
      </g>
    </svg>
  );
}

function BaseLayer({ p, Y }: { p: Plan; Y: (y: number) => number }) {
  const { grid, board } = p.base;
  const W = p.width;
  const D = p.depth;
  if (grid) {
    const x1 = grid.ox + grid.nx * grid.pitch;
    const y1 = grid.oy + grid.ny * grid.pitch;
    // Where the baseplate doesn't reach, hatched.
    const bare = [[0, 0, W, Y(y1)], [0, Y(grid.oy), W, grid.oy], [0, Y(y1), grid.ox, y1 - grid.oy], [x1, Y(y1), W - x1, y1 - grid.oy]];
    const cells = [];
    for (let i = 0; i < grid.nx; i++) for (let j = 0; j < grid.ny; j++) cells.push([i, j]);
    return (
      <g className="base">
        {bare.map(([x, y, w, h], k) => w > 0 && h > 0 && <rect key={k} className="nobase" x={x} y={y} width={w} height={h} />)}
        {cells.map(([i, j]) => <rect key={`${i}-${j}`} className="cell" x={grid.ox + i * grid.pitch + 2} y={Y(grid.oy + (j + 1) * grid.pitch) + 2} width={grid.pitch - 4} height={grid.pitch - 4} rx={5} />)}
      </g>
    );
  }
  if (board) {
    return (
      <g className="base">
        <rect className="board" x={board.x0} y={Y(board.y0 + board.depth)} width={board.width} height={board.depth} rx={3} />
        {board.holes.map(([x, y]) => <rect key={`${x}-${y}`} className="hole" x={x - SLOT[0] / 2} y={Y(y) - SLOT[1] / 2} width={SLOT[0]} height={SLOT[1]} rx={SLOT[1] / 2} />)}
      </g>
    );
  }
  const lines = [];
  for (let x = 50; x < W; x += 50) lines.push(<line key={`x${x}`} className="grid" x1={x} y1={0} x2={x} y2={D} />);
  for (let y = 50; y < D; y += 50) lines.push(<line key={`y${y}`} className="grid" x1={0} y1={Y(y)} x2={W} y2={Y(y)} />);
  return <g className="base">{lines}</g>;
}

function HolderShape({ p, h, Y, selected, issues }: { p: Plan; h: PlannedHolder; Y: (y: number) => number; selected: boolean; issues: Issue[] }) {
  const r = h.rect!;
  const level = worst(issues);
  const cls = ["hold", h.method, h.locked && "locked", level, selected && "sel"].filter(Boolean).join(" ");
  const grid = p.base.grid;
  return (
    <g>
      {h.method !== "pegs" && <rect className={cls} x={r.x0} y={Y(r.y1)} width={r.x1 - r.x0} height={r.y1 - r.y0} rx={h.method === "gridfinity" ? 6 : 8} />}
      {h.method === "gridfinity" && h.cells && grid && (
        <>
          {Array.from({ length: h.cells[2] - h.cells[0] - 1 }, (_, k) => grid.ox + (h.cells![0] + k + 1) * grid.pitch).map((x) => <line key={`x${x}`} className="cell" x1={x} y1={Y(r.y1) + 3} x2={x} y2={Y(r.y0) - 3} />)}
          {Array.from({ length: h.cells[3] - h.cells[1] - 1 }, (_, k) => grid.oy + (h.cells![1] + k + 1) * grid.pitch).map((y) => <line key={`y${y}`} className="cell" x1={r.x0 + 3} y1={Y(y)} x2={r.x1 - 3} y2={Y(y)} />)}
        </>
      )}
      {h.posts.map(([x, y], k) => <circle key={k} className="post" cx={x} cy={Y(y)} r={4} />)}
      {h.method === "pegs" && h.things.map((t) => t.shape.round && !t.item.outlet && t.pegs && <circle key={t.id} className="play" cx={t.x} cy={Y(t.y)} r={t.shape.size[0] / 2 + t.pegs.play} />)}
      {h.pegs.map((peg, k) => (
        <g key={k}>
          {!peg.ok && (
            <>
              <line className="gap" x1={peg.x} y1={Y(peg.y)} x2={peg.at[0]} y2={Y(peg.at[1])} />
              <text className="dim gap-label" x={peg.x + 8} y={Y(peg.y) - 8}>{`+${mm(peg.gap - (h.things.find((t) => t.id === peg.of)?.pegs?.play ?? 0))}`}</text>
            </>
          )}
          <rect className={`peg-pin ${peg.ok ? "" : "far"}`} x={peg.x - PEG.size[0] / 2} y={Y(peg.y) - PEG.size[1] / 2} width={PEG.size[0]} height={PEG.size[1]} rx={1.5} />
        </g>
      ))}
      {h.method !== "pegs" && r.x1 - r.x0 > 60 && (
        <text className="holder-label" x={r.x0 + 6} y={Y(r.y0) - 5}>{(h.locked ? "Locked · " : "") + (h.method === "custom" ? "Custom, spec only" : METHODS[h.method].name)}</text>
      )}
    </g>
  );
}

function ThingShape({ t, Y, rotate, selected }: { t: PlannedThing; Y: (y: number) => number; rotate: number; selected: boolean }) {
  const s = t.shape;
  const cy = Y(t.y);
  const r = s.size[0] / 2;
  const width = t.box.x1 - t.box.x0;
  const depth = t.box.y1 - t.box.y0;
  return (
    <>
      <g transform={`rotate(${-rotate} ${t.x} ${cy})`}>
        {s.round ? (
          <>
            {s.handle && <rect className="body" x={t.x - s.handle[0] / 2} y={cy + r - 8} width={s.handle[0]} height={s.handle[1] + 8} rx={s.handle[0] / 2.4} />}
            {s.spout && <path className="body" d={`M${t.x - s.spout[0]} ${cy - r + 6} L${t.x - s.spout[0] / 3} ${cy - r - s.spout[1]} L${t.x + s.spout[0] / 3} ${cy - r - s.spout[1]} L${t.x + s.spout[0]} ${cy - r + 6} Z`} />}
            <circle className="body" cx={t.x} cy={cy} r={r} />
            {t.stack > 1
              ? Array.from({ length: Math.min(t.stack, 4) - 1 }, (_, k) => <circle key={k} className="detail" cx={t.x} cy={cy} r={r - (k + 1) * Math.max(3, r * 0.1)} />)
              : r > 30 && <circle className="detail" cx={t.x} cy={cy} r={r * 0.72} />}
            {t.item.outlet && <circle className="detail" cx={t.x} cy={cy} r={t.item.outlet / 2} />}
          </>
        ) : (
          <>
            <rect className="body" x={t.x - s.size[0] / 2} y={cy - s.size[1] / 2} width={s.size[0]} height={s.size[1]} rx={s.lying ? s.size[0] * 0.2 : Math.min(6, s.size[0] / 4)} />
            {s.lying && <line className="detail" x1={t.x - s.size[0] / 2 + 5} y1={cy - s.size[1] / 2 + 9} x2={t.x + s.size[0] / 2 - 5} y2={cy - s.size[1] / 2 + 9} />}
            {(s.size[1] < 30 || s.size[0] < 30) && <line className="detail" x1={t.x - s.size[0] / 2 + 3} y1={cy} x2={t.x + s.size[0] / 2 - 3} y2={cy} />}
          </>
        )}
      </g>
      {width > 64 && depth > 36 && <text className={`label ${selected ? "sel" : ""}`} x={t.x} y={cy}>{t.name}</text>}
    </>
  );
}

function Gaps({ r, h, Y }: { r: Box; h: PlannedHolder; Y: (y: number) => number }) {
  const tv = h.travel!;
  const my = (r.y0 + r.y1) / 2;
  const mx = (r.x0 + r.x1) / 2;
  const marks: [number, number, number, number, number, number, number][] = [
    [r.x0 - tv.L, my, r.x0, my, tv.L, r.x0 - tv.L / 2, my + 6],
    [r.x1, my, r.x1 + tv.R, my, tv.R, r.x1 + tv.R / 2, my + 6],
    [mx, r.y0 - tv.F, mx, r.y0, tv.F, mx + 16, r.y0 - tv.F / 2 - 4],
    [mx, r.y1, mx, r.y1 + tv.B, tv.B, mx + 16, r.y1 + tv.B / 2 - 4],
  ];
  return (
    <>
      {marks.map(([x1, y1, x2, y2, v, tx, ty], k) =>
        v > HELD && (
          <g key={k}>
            <line className="gap" x1={x1} y1={Y(y1)} x2={x2} y2={Y(y2)} />
            <text className="dim gap-label" x={tx} y={Y(ty)} textAnchor="middle">{Math.round(v)}</text>
          </g>
        ),
      )}
    </>
  );
}

function Chip({ x, y, text, tone = "" }: { x: number; y: number; text: string; tone?: string }) {
  const w = text.length * 6.3 + 16;
  return (
    <g className="chip">
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} />
      <text className={tone} x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central">{text}</text>
    </g>
  );
}

function MoveGuides({ p, g, thing, Y }: { p: Plan; g: Extract<Gesture, { kind: "move" }>; thing: (id: string) => PlannedThing | undefined; Y: (y: number) => number }) {
  const t = thing(g.ids[0])!;
  const { target, shown } = g;
  const body = unionOf(g.ids.map((id) => { const x = thing(id)!; return x.aside ? x.box : x.claim; }));
  const bx = body.x0 + target.dx;
  const by = body.y0 + target.dy;
  const w = body.x1 - body.x0;
  const d = body.y1 - body.y0;
  if (g.toCounter) return g.fromCounter ? null : <Chip x={bx + w / 2 - target.dx + shown.dx} y={Y(by + d / 2 - target.dy + shown.dy)} text="Set aside" />;
  if (target.seat) return <Chip x={t.x + target.dx} y={Y(t.y + target.dy)} text="Held by pegs" tone="touch" />;
  if (target.noSeat) return <Chip x={t.x + shown.dx} y={Y(t.y + shown.dy)} text={g.lastSeat ? "No seat here, it goes back to the last one" : "No seat here"} tone="bad" />;
  const name = (s: Snap) => (!s.ref ? (p.rules.edge_margin ? `${p.rules.edge_margin} mm off the wall` : "On the wall") : `${s.ref.shared ? "Sharing a holder with" : "Holders touching"} ${lower(s.ref.id)}`);
  const out = [];
  for (const [axis, s] of [["x", target.x], ["y", target.y]] as const) {
    if (!s) continue;
    if (s.kind === "touch") {
      if (axis === "x") {
        const ex = s.lead ? bx : bx + w;
        out.push(<line key="tx" className="g-touch" x1={ex} y1={Y(by + 6)} x2={ex} y2={Y(by + d - 6)} />, <Chip key="cx" x={ex} y={Y(by + d / 2)} text={name(s)} tone="touch" />);
      } else {
        const ey = s.lead ? by : by + d;
        out.push(<line key="ty" className="g-touch" x1={bx + 6} y1={Y(ey)} x2={bx + w - 6} y2={Y(ey)} />, <Chip key="cy" x={bx + w / 2} y={Y(ey)} text={name(s)} tone="touch" />);
      }
    } else if (s.kind === "align" && s.ref) {
      const r = s.ref.box;
      const what = `${s.edge === 0.5 ? "Centred on" : "In line with"} ${lower(s.ref.id)}`;
      if (axis === "x") {
        const lx = bx + w * s.edge!;
        const y0 = Math.min(by, r.y0);
        const y1 = Math.max(by + d, r.y1);
        out.push(<line key="ax" className="g-align" x1={lx} y1={Y(y0) + 6} x2={lx} y2={Y(y1) - 6} />, <Chip key="cax" x={lx} y={Y(y1) - 18} text={what} />);
      } else {
        const ly = by + d * s.edge!;
        const x0 = Math.min(bx, r.x0);
        const x1 = Math.max(bx + w, r.x1);
        out.push(<line key="ay" className="g-align" x1={x0 - 6} y1={Y(ly)} x2={x1 + 6} y2={Y(ly)} />, <Chip key="cay" x={(x0 + x1) / 2} y={Y(ly) - 14} text={what} />);
      }
    } else if (s.kind === "centre") {
      if (axis === "x") {
        const my = Y(by + d / 2);
        out.push(<line key="c1" className="g-centre" x1={s.lo} y1={my} x2={bx} y2={my} />, <line key="c2" className="g-centre" x1={bx + w} y1={my} x2={s.hi} y2={my} />, <Chip key="cc" x={bx + w / 2} y={Y(by) + 18} text={`Centred, ${Math.round(bx - s.lo!)} each side`} />);
      } else {
        const mx = bx + w / 2;
        out.push(<line key="c3" className="g-centre" x1={mx} y1={Y(s.lo!)} x2={mx} y2={Y(by)} />, <line key="c4" className="g-centre" x1={mx} y1={Y(by + d)} x2={mx} y2={Y(s.hi!)} />, <Chip key="cd" x={mx} y={Y(by + d) - 16} text={`Centred, ${Math.round(by - s.lo!)} each side`} />);
      }
    }
  }
  return <>{out}</>;
}
