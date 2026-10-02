import { useState, type FormEvent, type ReactNode } from "react";
import {
  addComment, answerQuestion, BASES, closeConcern, fitOf, holdTogether, lower, METHODS, posesOf, pretty, roundAllOver, samePose, seatOnPegs, setAside, setBase, setFit,
  setMethod, setPose, setPoses, setRotate, setRule, worst, wrap,
  type BaseKey, type Drawer, type Issue, type Method, type Plan, type PlannedThing, type Pose, type Problem,
} from "../core/index.ts";
import { Icon } from "./icons.tsx";
import { MethodPicker, unavailable } from "./MethodPicker.tsx";

// The side panel shows only what's selected: one thing and everything about it, several things,
// or with nothing selected, the drawer itself.

export interface PanelProps {
  plan: Plan;
  drawer: Drawer;
  issues: Map<string, Issue[]>;
  general: Problem[];
  sels: string[];
  select: (ids: string[]) => void;
  apply: (edit: (text: string) => string) => void;
  onLock: (holderId: string) => void;
  onSpec: (holderId: string) => void;
  onAddThing: () => void;
  onRemove: (id: string) => void;
  onPutBack: (id: string) => void;
  /** Opens the file, at a line if given, with the selection highlighted. */
  onShowFile: (line?: number) => void;
}

export function Panel(props: PanelProps) {
  const things = props.sels.map((id) => props.plan.things.find((t) => t.id === id)).filter((t): t is PlannedThing => !!t);
  if (things.length === 1) return <Inspector {...props} t={things[0]} />;
  if (things.length > 1) return <Several {...props} things={things} />;
  return <Overview {...props} />;
}

function Head({ eyebrow, title, sub, onClose }: { eyebrow?: string; title: string; sub?: string; onClose?: () => void }) {
  return (
    <div className="panel-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {onClose && (
        <button type="button" className="btn icon sm" onClick={onClose} aria-label="Clear selection">
          <Icon.close />
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Issues({ list }: { list: Issue[] }) {
  if (!list.length) return null;
  return (
    <div className="issues">
      {list.map((issue, k) => <p key={k} className={`issue ${issue.level}`}>{issue.text}</p>)}
    </div>
  );
}

/** A number field that edits on change, not on every keystroke. */
function NumberField({ id, value, min, max, step, onCommit, label, disabled, width }: { id: string; value: number; min?: number; max?: number; step?: number; onCommit: (v: number) => void; label?: string; disabled?: boolean; width?: number }) {
  return (
    <input
      key={value}
      id={id}
      className="field num"
      type="number"
      defaultValue={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      style={width ? { width } : undefined}
      onBlur={(e) => Number(e.target.value) !== value && e.target.value !== "" && onCommit(Number(e.target.value))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Ask({ placeholder, action, onSubmit }: { placeholder: string; action: string; onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
  };
  return (
    <form className="ask" onSubmit={submit}>
      <input className="field" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn sm" type="submit">{action}</button>
    </form>
  );
}

type Concern = NonNullable<NonNullable<Drawer["review"]>["concerns"]>[number];

function ConcernCard({ concern, about, apply }: { concern: Concern; about?: boolean; apply: PanelProps["apply"] }) {
  return (
    <div className="concern">
      {about && <div className="who">About {concern.on.map(lower).join(", ")}</div>}
      <p>{concern.says}</p>
      {concern.suggest && <p className="muted">Suggests: {concern.suggest}</p>}
      <div className="actions">
        <button type="button" className="btn sm primary" onClick={() => apply((text) => closeConcern(text, concern.id, true))}>
          {concern.act?.aside ? `Set ${concern.act.aside.map(lower).join(" and ")} aside` : "Accept"}
        </button>
        <button type="button" className="btn sm" onClick={() => apply((text) => closeConcern(text, concern.id, false))}>Keep as is</button>
      </div>
    </div>
  );
}

const POSES_BOX: Pose[] = ["flat", "upright", "side"];
const POSES_CYLINDER: Pose[] = ["upright", "lying"];
const poseLabel = (pose: Pose) => (typeof pose === "object" ? `Tilted ${pose.tilt}°` : pretty(pose));

// --- One thing ---------------------------------------------------------------------------

function Inspector({ plan: p, drawer, issues, t, select, apply, onLock, onSpec, onRemove, onPutBack, onShowFile }: PanelProps & { t: PlannedThing }) {
  const h = t.holder;
  const locked = !!h?.locked;
  const zone = t.zone ? drawer.zones?.[t.zone] : undefined;
  const list = t.aside ? [] : [...(issues.get(t.id) ?? []), ...(h ? issues.get(h.id) ?? [] : [])];
  const dims = "cylinder" in t.item ? `Ø${t.item.cylinder[0]} × ${t.item.cylinder[1]} mm` : `${t.item.box.join(" × ")} mm`;
  const poses = posesOf(t.item);
  const concerns = (drawer.review?.concerns ?? []).filter((c) => c.status === "open" && c.on.includes(t.id));
  const comments = (drawer.review?.comments ?? []).filter((c) => c.on === t.id);
  const all = [...("cylinder" in t.item ? POSES_CYLINDER : POSES_BOX), ...(poses.some((q) => typeof q === "object") ? [] : [{ tilt: 45 }])];
  for (const pose of poses) if (!all.some((q) => samePose(q, pose))) all.push(pose);
  const fit = fitOf(h?.source);

  const pick = (method: Method) => {
    if (h) apply((text) => seatOnPegs(setMethod(text, h.id, method), h.holds, p.bed));
    else apply((text) => seatOnPegs(holdTogether(text, [t.id], method).text, [t.id], p.bed));
  };

  return (
    <div className="panel-body">
      <Head eyebrow={zone?.name ?? (t.aside ? "Set aside" : undefined)} title={t.name} sub={`${dims}${t.aside ? "" : ` · top at ${Math.round(t.z0 + t.shape.height)} of ${p.height} mm`}`} onClose={() => select([])} />
      <Issues list={list} />

      <Section title="How it sits">
        <div className="pill sm" role="group" aria-label="Pose">
          {poses.map((pose) => (
            <button key={poseLabel(pose)} type="button" aria-pressed={samePose(pose, t.pose)} disabled={locked || poses.length < 2} onClick={() => apply((text) => setPose(text, t.id, pose))}>
              {poseLabel(pose)}
            </button>
          ))}
        </div>
        <div className="line">
          <label className="angle" title="Rotation, degrees anticlockwise">
            <Icon.turn />
            <NumberField id="rotate" value={t.rotate} step={p.rules.angle_step} label="Rotation in degrees" disabled={locked} onCommit={(v) => apply((text) => setRotate(text, t.id, wrap(v)))} />°
            <button type="button" disabled={locked} onClick={() => apply((text) => setRotate(text, t.id, wrap(t.rotate + 90)))}>+90</button>
          </label>
          <span className="muted">{Math.round(t.shape.height)} mm tall</span>
        </div>
        <details className="more">
          <summary>Ways a {t.item.name.toLowerCase()} can sit</summary>
          <div className="checks">
            {all.map((pose, k) => {
              const on = poses.some((q) => samePose(q, pose));
              return (
                <label key={poseLabel(pose)} className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={k === 0 || samePose(pose, t.pose) || locked}
                    onChange={() => apply((text) => setPoses(text, t.itemId, on ? poses.filter((q) => !samePose(q, pose)) : [...poses, pose]))}
                  />
                  {poseLabel(pose)}
                  {k === 0 && <small>as its size is written</small>}
                  {k > 0 && samePose(pose, t.pose) && <small>how it sits now</small>}
                </label>
              );
            })}
          </div>
        </details>
      </Section>

      {!t.aside && (
        <Section title="Held by">
          <MethodPicker plan={p} current={h?.method ?? null} disabled={locked} onPick={pick} />
          {h && (
            <>
              <div className="line">
                <span className="tag">Makes {METHODS[h.method].makes}</span>
                {h.holds.length > 1 && <span className="note">Shares <b>{pretty(h.id)}</b> with {h.holds.filter((x) => x !== t.id).map(lower).join(", ")}.</span>}
                {h.holds.length > 1 && !locked && <button type="button" className="link" onClick={() => apply((text) => holdTogether(text, [t.id], h.method).text)}>Hold it alone</button>}
              </div>
              {h.method === "pegs" && p.base.board && t.pegs && (
                <>
                  {t.pegs.held && (
                    <p className="note ok">
                      {t.item.outlet
                        ? "One peg up through its outlet holds it."
                        : `Held by ${h.pegs.filter((peg) => peg.of === t.id).length} pegs${t.pegs.walls.length ? ` and the ${t.pegs.walls.join(" and ")} wall` : ""}${roundAllOver(t) ? "" : ", which also stop it turning"}.`}
                    </p>
                  )}
                  <div className="kv">
                    <label htmlFor="fit-play">Play<small>How far it may wander between its pegs</small></label>
                    <NumberField id="fit-play" value={t.pegs.play} min={0} step={0.5} onCommit={(v) => apply((text) => seatOnPegs(setFit(text, h.id, { ...fit, play: Math.max(0, v) }), h.holds, p.bed))} />
                    <label htmlFor="fit-spring">Spring<small>How far it pushes stock pegs out; 0 for most things</small></label>
                    <NumberField id="fit-spring" value={t.pegs.spring} min={0} step={0.5} onCommit={(v) => apply((text) => seatOnPegs(setFit(text, h.id, { ...fit, spring: Math.max(0, v) }), h.holds, p.bed))} />
                  </div>
                </>
              )}
              {h.method === "custom" && h.rect && <div><button type="button" className="btn sm" onClick={() => onSpec(h.id)}><Icon.file />Spec sheet</button></div>}
              <div className={`lock-row ${locked ? "on" : ""}`}>
                {locked ? (
                  <div><b>Locked</b> since {h.source.lock!.at}. Its shape and <span className="mono">{h.source.lock!.export}</span> are frozen; it moves as one piece and later layouts design round it.</div>
                ) : (
                  <div>Lock it once it's built, so its shape and file freeze.</div>
                )}
                <button type="button" className={`btn sm ${locked ? "" : "lock"}`} onClick={() => onLock(h.id)}>
                  {locked ? <><Icon.unlock />Unlock</> : <><Icon.lock />Lock</>}
                </button>
              </div>
            </>
          )}
        </Section>
      )}

      <Section title="Why it's here">
        <p className="why">{t.why ?? "No reason given."}</p>
        {concerns.map((c) => <ConcernCard key={c.id} concern={c} apply={apply} />)}
        {comments.map((c, k) => <p key={k} className="note">You asked: {c.says} <span className="muted">({c.status})</span></p>)}
        <Ask placeholder="Ask the agent to change something" action="Ask" onSubmit={(says) => apply((text) => addComment(text, t.id, says))} />
      </Section>

      <div className="actions">
        <button type="button" className="btn sm" disabled={locked} onClick={() => (t.aside ? onPutBack(t.id) : apply((text) => setAside(text, t.id, true)))}>
          {t.aside ? <><Icon.back />Put back</> : <><Icon.aside />Set aside</>}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => onShowFile()}><Icon.file />In the file</button>
        <span className="spacer" />
        <button type="button" className="btn sm ghost danger" disabled={locked} onClick={() => onRemove(t.id)}><Icon.trash />Remove</button>
      </div>
    </div>
  );
}

// --- Several things ----------------------------------------------------------------------

function Several({ plan: p, things, select, apply }: PanelProps & { things: PlannedThing[] }) {
  const defaultMethod: Method = p.base.grid ? "gridfinity" : p.base.board ? "pegs" : "well";
  const [method, setMethodChoice] = useState<Method>(defaultMethod);
  const chosen = unavailable(method, p) ? defaultMethod : method;
  const locked = things.some((t) => t.holder?.locked);
  const placed = things.filter((t) => !t.aside);
  return (
    <div className="panel-body">
      <Head title={`${things.length} things`} sub={things.map((t) => t.name).join(", ")} onClose={() => select([])} />
      <Section title="Hold them together">
        <p className="note">One holder for all of them: one print, one board, or shared Gridfinity cells.</p>
        <MethodPicker plan={p} current={chosen} disabled={locked} onPick={setMethodChoice} />
        <div className="line">
          <button type="button" className="btn sm primary" disabled={locked || !placed.length} onClick={() => apply((text) => seatOnPegs(holdTogether(text, placed.map((t) => t.id), chosen).text, placed.map((t) => t.id), p.bed))}>
            Hold together as {METHODS[chosen].name.toLowerCase()}
          </button>
        </div>
        {locked && <p className="note">One of them is in a locked holder; unlock it first.</p>}
      </Section>
      <Section title="Arrange">
        <p className="note">Use the toolbar over the plan to line them up, space them evenly or close the gaps between them. Drag any one to move them all.</p>
      </Section>
      <div className="actions">
        <button type="button" className="btn sm" disabled={locked} onClick={() => apply((text) => things.reduce((acc, t) => setAside(acc, t.id, true), text))}><Icon.aside />Set them aside</button>
      </div>
    </div>
  );
}

// --- Nothing selected: the drawer --------------------------------------------------------

function Overview({ plan: p, drawer, issues, general, select, apply, onAddThing, onShowFile }: PanelProps) {
  const review = drawer.review ?? {};
  const flagged = [
    ...p.things.filter((t) => !t.aside && worst(issues.get(t.id) ?? []) === "bad").map((t) => ({ id: t.id, text: issues.get(t.id)!.find((i) => i.level === "bad")!.text, sel: [t.id] })),
    ...p.holders.filter((h) => worst(issues.get(h.id) ?? []) === "bad").map((h) => ({ id: h.id, text: issues.get(h.id)!.find((i) => i.level === "bad")!.text, sel: h.holds.filter((id) => p.things.some((t) => t.id === id && !t.aside)) })),
    ...p.placed.filter((t) => !t.holder).map((t) => ({ id: t.id, text: "Not held yet", sel: [t.id] })),
  ];
  const concerns = (review.concerns ?? []).filter((c) => c.status === "open");
  const questions = (review.questions ?? []).filter((q) => q.status === "open");
  const aside = p.things.filter((t) => t.aside);
  const baseText: Record<BaseKey, string> = {
    bare: "Holders sit on the floor and hold each other by touching.",
    gridfinity: `${p.base.grid?.nx ?? 0} × ${p.base.grid?.ny ?? 0} cells of ${p.base.grid?.pitch ?? 42} mm, centred. Each bin claims the cells its things cover.`,
    "uppdatera-60": "Things rest against IKEA pegs in fixed holes.",
    "uppdatera-80": "Things rest against IKEA pegs in fixed holes.",
  };
  const rules = p.rules;
  return (
    <div className="panel-body">
      <Head eyebrow="Drawer" title={drawer.name} sub={`${p.width} × ${p.depth} × ${p.height} mm inside · ${p.placed.length} things · ${p.holders.filter((h) => h.rect).length} holders`} />
      <p className="note">Click a thing on the plan to see and change everything about it.</p>

      <Section title={flagged.length || general.length ? `Needs attention (${flagged.length + general.length})` : "Nothing needs attention"}>
        {general.map((problem, k) => (
          <button key={`g${k}`} type="button" className="flag" onClick={() => onShowFile(problem.line)}>
            <b>{problem.path || "The file"}{problem.line ? `, line ${problem.line}` : ""}</b>
            <span>{problem.message}</span>
          </button>
        ))}
        {flagged.map((f) => (
          <button key={f.id + f.text} type="button" className="flag" onClick={() => select(f.sel)}>
            <b>{pretty(f.id)}</b>
            <span>{f.text}</span>
          </button>
        ))}
      </Section>

      {(concerns.length > 0 || questions.length > 0) && (
        <Section title="From the agent">
          {concerns.map((c) => <ConcernCard key={c.id} concern={c} about apply={apply} />)}
          {questions.map((q) => (
            <div key={q.id} className="question">
              <p>{q.ask}</p>
              <Ask placeholder="Answer" action="Answer" onSubmit={(answer) => apply((text) => answerQuestion(text, q.id, answer))} />
            </div>
          ))}
        </Section>
      )}

      <Section title="What's in it">
        <p className="note">
          {p.things.length} things{aside.length ? `, ${aside.length} of them set aside on the counter` : ""}. Add one and it waits on the counter until you drag it in.
        </p>
        <div><button type="button" className="btn sm" onClick={onAddThing}><Icon.plus />Add a thing</button></div>
      </Section>

      <Section title="Base">
        <select className="select" aria-label="Base" value={p.base.key} onChange={(e) => apply((text) => setBase(text, e.target.value as BaseKey))}>
          {Object.entries(BASES).map(([key, base]) => <option key={key} value={key}>{base.name}</option>)}
        </select>
        <p className="note">{baseText[p.base.key]}</p>
        <details className="more">
          <summary>Layout rules: {rules.edge_margin} mm edge margin, {rules.gap} mm gap, {rules.angle_step}° steps</summary>
          <div className="kv">
            <label htmlFor="r-margin">Edge margin<small>Keep holders this far off the walls</small></label>
            <NumberField id="r-margin" value={rules.edge_margin} min={0} onCommit={(v) => apply((text) => setRule(text, "edge_margin", Math.max(0, v)))} />
            <label htmlFor="r-gap">Gap between holders<small>0 means they touch and hold each other</small></label>
            <NumberField id="r-gap" value={rules.gap} min={0} onCommit={(v) => apply((text) => setRule(text, "gap", Math.max(0, v)))} />
            <label htmlFor="r-angle">Rotation steps<small>Turning snaps to these, and always to square</small></label>
            <NumberField id="r-angle" value={rules.angle_step} min={1} max={90} onCommit={(v) => apply((text) => setRule(text, "angle_step", Math.max(1, Math.min(90, v))))} />
          </div>
        </details>
      </Section>
    </div>
  );
}
