import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { addThing, linesOf, METHODS, pretty, specSheet, worst, type Issue, type Plan, type PlannedHolder, type Problem } from "../core/index.ts";
import { Icon } from "./icons.tsx";

// Sheets: dialogs over the plan, for what doesn't fit beside it.

export function Sheet({ title, sub, wide, onClose, children, actions }: { title: string; sub?: ReactNode; wide?: boolean; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`sheet ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label={title}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {sub && <p className="sub">{sub}</p>}
          </div>
          <button type="button" className="btn icon sm" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        {children}
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </dialog>
  );
}

// --- Make: what comes out of the plan ----------------------------------------------------

function output(h: PlannedHolder): string {
  if (h.locked) return `${h.source.lock!.export} (frozen)`;
  if (h.method === "pegs") return `${h.pegs.length} pegs in the board`;
  if (h.method === "custom") return `specs/${h.id}.md`;
  if (h.method === "ply") return `exports/${h.id}-template.3mf and a cut sheet`;
  return `exports/${h.id}.3mf`;
}

export function MakeSheet({ plan: p, issues, onSpec, onClose }: { plan: Plan; issues: Map<string, Issue[]>; onSpec: (id: string) => void; onClose: () => void }) {
  const holders = p.holders.filter((h) => h.rect);
  return (
    <Sheet
      title="Make"
      sub={<>One output per holder: a 3MF for each print (bed {p.bed[0]} × {p.bed[1]} mm), a template and cut sheet for routed ply, a hole list for pegs, and a spec sheet for custom holders. Locked holders keep the file they were built from; things set aside are skipped.</>}
      onClose={onClose}
      actions={<button type="button" className="btn" onClick={onClose}>Close</button>}
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Holder</th><th>Method</th><th className="num">mm</th><th /></tr>
          </thead>
          <tbody>
            {holders.map((h) => {
              const level = worst(issues.get(h.id) ?? []);
              const r = h.rect!;
              return (
                <tr key={h.id}>
                  <td>
                    {pretty(h.id)}
                    <br />
                    {h.method === "custom" ? <button type="button" className="link mono" onClick={() => onSpec(h.id)}>{output(h)}</button> : <span className="mono muted">{output(h)}</span>}
                  </td>
                  <td>{METHODS[h.method].name}</td>
                  <td className="num mono">{Math.round(r.x1 - r.x0)} × {Math.round(r.y1 - r.y0)}</td>
                  <td>{h.locked ? <span className="tag lock">Locked</span> : level === "bad" ? <span className="tag bad">Fix first</span> : <span className="tag ok">Ready</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Writing these files is <span className="mono">dunnage export</span>'s job, which isn't built yet. Until then, a custom holder's spec sheet can be read and copied from here.
      </p>
    </Sheet>
  );
}

export function SpecSheet({ plan, holder, drawerName, onClose }: { plan: Plan; holder: PlannedHolder; drawerName: string; onClose: () => void }) {
  const text = specSheet(plan, holder, drawerName);
  const [copied, setCopied] = useState(false);
  return (
    <Sheet
      title={`Spec sheet: ${pretty(holder.id)}`}
      sub={<>dunnage can't make this holder, so this is everything needed to build it elsewhere. It's written as <span className="mono">specs/{holder.id}.md</span>.</>}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <pre className="spec">{text}</pre>
    </Sheet>
  );
}

// --- The file ----------------------------------------------------------------------------

/** The drawer file, with the selection highlighted and problems marked. It can be edited here too. */
export function FileSheet({ name, text, problems, highlight, line, onApply, onClose }: { name: string; text: string; problems: Problem[]; highlight: (string | number)[][]; line?: number; onApply: (text: string) => void; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const lines = text.split("\n");
  const marked = useMemo(() => {
    const set = new Set<number>();
    for (const path of highlight) {
      const span = linesOf(text, path);
      if (span) for (let n = span[0]; n <= span[1]; n++) set.add(n);
    }
    return set;
  }, [text, highlight]);
  const bad = new Map(problems.filter((p) => p.line).map((p) => [p.line!, p.message]));
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const target = pre.current?.querySelector(line ? `[data-line="${line}"]` : ".hl");
    target?.scrollIntoView({ block: "center" });
  }, [line, editing]);

  return (
    <Sheet
      wide
      title={name}
      sub="The drawer file. Everything you do on the plan edits it, and an agent edits it the same way."
      onClose={onClose}
      actions={
        editing ? (
          <>
            <button type="button" className="btn" onClick={() => { setDraft(text); setEditing(false); }}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => { onApply(draft); setEditing(false); }}>Apply changes</button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => { setDraft(text); setEditing(true); }}>Edit the text</button>
        )
      }
    >
      {editing ? (
        <textarea className="file-edit" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="The drawer file" />
      ) : (
        <pre className="file" ref={pre}>
          {lines.map((l, k) => {
            const n = k + 1;
            const comment = l.match(/^(\s*)(#.*)$/);
            const key = l.match(/^(\s*-?\s*)([\w-]+)(:)(.*)$/);
            let body: ReactNode = l || " ";
            if (comment) body = <>{comment[1]}<span className="c">{comment[2]}</span></>;
            else if (key) {
              const [, lead, k2, colon, rest] = key;
              const hash = rest.indexOf(" #");
              body = <>{lead}<span className="k">{k2}</span>{colon}{hash >= 0 ? <>{rest.slice(0, hash)}<span className="c">{rest.slice(hash)}</span></> : rest}</>;
            }
            return (
              <span key={k} data-line={n} className={["ln", marked.has(n) && "hl", bad.has(n) && "bad", line === n && "at"].filter(Boolean).join(" ")} title={bad.get(n)}>
                {body}
              </span>
            );
          })}
        </pre>
      )}
    </Sheet>
  );
}

// --- Adding a thing ----------------------------------------------------------------------

export type NewThing = Parameters<typeof addThing>[1];

export function AddThingSheet({ onAdd, onClose }: { onAdd: (thing: NewThing) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [round, setRound] = useState(true);
  const [size, setSize] = useState(["", "", ""]);
  const dims = round ? ["Diameter", "Height"] : ["Width", "Depth", "Height"];
  const values = dims.map((_, k) => Number(size[k]));
  const ok = name.trim() && values.every((v) => v > 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    onAdd(round ? { name: name.trim(), cylinder: [values[0], values[1]] } : { name: name.trim(), box: [values[0], values[1], values[2]] });
  };
  return (
    <Sheet title="Add a thing" sub="It waits on the counter in front of the drawer until you drag it in." onClose={onClose}>
      <form className="add-form" onSubmit={submit}>
        <label>
          What is it?
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Milk jug" autoFocus />
        </label>
        <div className="pill" role="group" aria-label="Shape">
          <button type="button" aria-pressed={round} onClick={() => setRound(true)}>Round</button>
          <button type="button" aria-pressed={!round} onClick={() => setRound(false)}>Box-shaped</button>
        </div>
        <p className="note">{round ? "Measured standing up: across its widest part, and how tall." : "Measured lying flat: left to right, front to back, and how tall."}</p>
        <div className="dims">
          {dims.map((label, k) => (
            <label key={label}>
              {label}
              <span className="unit">
                <input className="field num" type="number" min={1} value={size[k]} onChange={(e) => setSize(size.map((v, j) => (j === k ? e.target.value : v)))} />
                mm
              </span>
            </label>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!ok}><Icon.plus />Add to the counter</button>
        </div>
      </form>
    </Sheet>
  );
}
