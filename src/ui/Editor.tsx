import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import {
  addThing, arrange, half, lockHolder, moveThings, putBackSpot, removeThing, setAside, setRotate, solve, unlockHolder, wrap,
  type ArrangeOp, type Path,
} from "../core/index.ts";
import { version } from "../../package.json";
import { Icon } from "./icons.tsx";
import { reading, useHistory } from "./model.ts";
import { Panel } from "./Panel.tsx";
import { PlanView } from "./PlanView.tsx";
import { AddThingSheet, FileSheet, MakeSheet, SpecSheet, type NewThing } from "./sheets.tsx";
import { bedFor, download, type Workspace } from "./workspace.ts";

// three.js is big, so the 3D view loads the first time it's opened.
const Preview3D = lazy(() => import("./Preview3D.tsx").then((m) => ({ default: m.Preview3D })));

// One drawer open: the plan or the 3D view, the panel beside it, and the file kept in step.

type SheetState = { kind: "make" } | { kind: "spec"; id: string } | { kind: "file"; line?: number } | { kind: "add" } | null;
type Status = "saved" | "saving" | "unsaved" | "failed";

interface Props {
  workspace: Workspace;
  file: string;
  initial: string;
  onOpen: (file: string) => void;
  onNew: () => void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function Editor({ workspace, file, initial, onOpen, onNew, onClose }: Props) {
  const history = useHistory(initial);
  const { text, apply } = history;
  const printer = useMemo(() => /^printer:\s*["']?([\w.-]+)/m.exec(text)?.[1], [text]);
  const { bed, found: printerFound } = bedFor(workspace, printer);
  const r = useMemo(() => reading(text, bed), [text, bed]);
  const p = r.plan;
  const [sels, setSels] = useState<string[]>([]);
  const [view, setView] = useState<"plan" | "3d">("plan");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Keep the selection to things that still exist.
  const live = p ? sels.filter((id) => p.things.some((t) => t.id === id)) : [];
  const select = useCallback((ids: string[], add = false) => {
    setSels((current) => (add ? (ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]) : ids));
  }, []);

  const say = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3200);
  }, []);

  // --- Saving, and noticing edits made elsewhere ---------------------------------------
  const saved = useRef(initial);
  const seen = useRef<number | null>(null);
  const current = useRef(text);
  current.current = text;
  const [status, setStatus] = useState<Status>("saved");

  useEffect(() => {
    if (text === saved.current) return setStatus("saved");
    if (workspace.mode !== "folder") {
      void workspace.writeDrawer(file, text);
      return setStatus("unsaved");
    }
    setStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        await workspace.writeDrawer(file, text);
        saved.current = text;
        seen.current = await workspace.modified(file);
        setStatus(current.current === text ? "saved" : "saving");
      } catch (error) {
        console.error(error);
        setStatus("failed");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text, file, workspace]);

  useEffect(() => {
    if (workspace.mode !== "folder") return;
    let stopped = false;
    void workspace.modified(file).then((m) => (seen.current = m));
    const look = async () => {
      if (document.hidden || stopped) return;
      const modified = await workspace.modified(file);
      if (modified === null || modified === seen.current) return;
      seen.current = modified;
      const disk = await workspace.readDrawer(file);
      if (disk === saved.current || stopped) return;
      if (current.current !== saved.current) return say("The file changed on disk while you were editing; your version will be saved over it.");
      saved.current = disk;
      apply(() => disk);
      say("Updated from the file on disk.");
    };
    const timer = window.setInterval(look, 1500);
    window.addEventListener("focus", look);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", look);
    };
  }, [workspace, file, apply, say]);

  const save = () => {
    download(file, text);
    saved.current = text;
    setStatus("saved");
  };

  // --- Actions the panel and keys reach ----------------------------------------------
  const onLock = async (id: string) => {
    const h = p?.holders.find((x) => x.id === id);
    if (!h) return;
    if (h.locked) return apply((t) => unlockHolder(t, id));
    if (!h.rect) return;
    const shape = { at: [half(h.rect.x0), half(h.rect.y0)] as [number, number], size: [half(h.rect.x1 - h.rect.x0), half(h.rect.y1 - h.rect.y0)] as [number, number], height: h.height || 1, rotate: 0 };
    // Until dunnage exports holders, the hash is of what defines the holder as built.
    const hash = await sha256(JSON.stringify({ method: h.method, holds: h.holds, shape }));
    apply((t) => lockHolder(t, id, { at: today(), tool: version, shape, export: `locked/${id}.3mf`, sha256: hash }));
  };

  const onPutBack = (id: string) => {
    const t = p?.things.find((x) => x.id === id);
    if (p && t) apply((text) => setAside(text, id, false, putBackSpot(p, t)));
  };

  const onAdd = (thing: NewThing) => {
    const { id } = addThing(text, thing);
    apply((t) => addThing(t, thing).text);
    setSels([id]);
    setSheet(null);
  };

  const onRemove = (id: string) => {
    if (!window.confirm(`Remove ${id} from the drawer file? Undo brings it back.`)) return;
    apply((t) => removeThing(t, id));
    setSels([]);
  };

  // Without a folder, edits live only in this tab until they're downloaded.
  const unsaved = workspace.mode !== "folder" && status === "unsaved";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const close = () => {
    if (!unsaved || window.confirm(`${file} has changes that haven't been downloaded. Close it and lose them?`)) onClose();
  };

  const doArrange = (op: ArrangeOp) => {
    if (!p) return;
    const moves = arrange(p, live, op);
    if (moves.length) apply((t) => moveThings(t, moves));
  };

  // --- Keys --------------------------------------------------------------------------
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable], dialog")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        return e.shiftKey ? history.redo() : history.undo();
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        return history.redo();
      }
      if (e.key === "Escape") return setSels([]);
      if (!p || view !== "plan" || mod) return;
      const ts = live.map((id) => p.things.find((t) => t.id === id)!).filter((t) => t && !t.aside && !t.holder?.locked);
      if (!ts.length) return;
      if ((e.key === "r" || e.key === "R") && ts.length === 1) {
        const t = ts[0];
        return apply((x) => setRotate(x, t.id, wrap(t.rotate + (e.shiftKey ? p.rules.angle_step : 90))));
      }
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, [number, number]>)[e.key];
      if (!dir) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const move = solve(p, ts.map((t) => t.id), dir[0] * step, dir[1] * step, true);
      if (move && (move.dx || move.dy)) apply((x) => moveThings(x, ts.map((t) => [t.id, move.dx, move.dy])));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [p, view, live, apply, history]);

  // --- Page ----------------------------------------------------------------------------
  const highlight: Path[] = useMemo(() => {
    if (!r.drawer) return [];
    const out: Path[] = [];
    for (const id of live) {
      const index = r.drawer.layout.findIndex((t) => t.id === id);
      if (index >= 0) out.push(["layout", index]);
      const holder = (r.drawer.holders ?? []).findIndex((h) => h.holds.includes(id));
      if (holder >= 0) out.push(["holders", holder]);
    }
    return out;
  }, [r.drawer, live]);

  const placedSel = p ? live.filter((id) => p.placed.some((t) => t.id === id)) : [];
  const title = r.drawer?.name ?? file;
  const words = title.split(" ");

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <button type="button" className="wordmark" onClick={close} title="Close this folder">dunnage</button>
          <div className="files">
            <Icon.folder />
            <span className="muted">{workspace.name}</span>
            <span className="slash">/</span>
            <select className="file-select" value={file} onChange={(e) => (e.target.value === "+new" ? onNew() : onOpen(e.target.value))} aria-label="Drawer file">
              {workspace.drawers.map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="+new">New drawer…</option>
            </select>
          </div>
        </div>
        <div className="heading">
          <h1 className="title">
            {words.slice(0, -1).join(" ")} <span className="underline">{words.at(-1)}</span>
          </h1>
          {p && (
            <p className="counts">
              {p.placed.length} things in the drawer{p.things.length > p.placed.length ? `, ${p.things.length - p.placed.length} set aside` : ""} · {printerFound ? `${printer} bed ${bed[0]} × ${bed[1]} mm` : printer ? `no ${printer}.printer.yml, so a ${bed[0]} mm bed` : `no printer, so a ${bed[0]} mm bed`}
            </p>
          )}
        </div>
        <span className="spacer" />
        <div className="pill" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "plan"} onClick={() => setView("plan")}>Plan</button>
          <button type="button" aria-pressed={view === "3d"} onClick={() => setView("3d")} disabled={!p}>3D</button>
        </div>
        <div className="history">
          <button type="button" className="btn icon" onClick={history.undo} disabled={!history.past.length} aria-label="Undo" title="Undo (⌘Z)"><Icon.undo /></button>
          <button type="button" className="btn icon" onClick={history.redo} disabled={!history.future.length} aria-label="Redo" title="Redo (⇧⌘Z)"><Icon.redo /></button>
        </div>
        <SaveState status={status} mode={workspace.mode} onDownload={save} />
        <button type="button" className="btn" onClick={() => setSheet({ kind: "file" })}><Icon.file />File</button>
        <button type="button" className="btn primary" onClick={() => setSheet({ kind: "make" })} disabled={!p}><Icon.box />Make</button>
      </header>

      {p && r.drawer ? (
        <>
          <section className="board">
            <div className="stage" style={{ "--plan-ratio": `${p.width + 80} / ${p.depth + p.counterDepth + 80}` } as CSSProperties}>
              {view === "plan" ? <PlanView plan={p} issues={r.issues} sels={live} select={select} apply={apply} /> : <Suspense fallback={<p className="hint">Loading the 3D view…</p>}><Preview3D plan={p} sels={live} select={select} /></Suspense>}
              {view === "plan" && placedSel.length > 1 && <Toolbar count={placedSel.length} onArrange={doArrange} />}
            </div>
            <div className="legend">
              <span><i className="k-thing" />Thing</span>
              <span><i className="k-holder" />Its holder</span>
              <span><i className="k-slide" />Holder can slide, mm</span>
              <span><i className="k-lock" />Locked</span>
              <span className="spacer" />
              <span className="hint-keys">Shift-click or drag a box for several · knob turns · Alt drags freely · arrows nudge</span>
            </div>
          </section>
          <aside className="rail">
            <Panel
              plan={p} drawer={r.drawer} issues={r.issues} general={r.general} sels={live}
              select={select} apply={apply} onLock={onLock} onSpec={(id) => setSheet({ kind: "spec", id })}
              onAddThing={() => setSheet({ kind: "add" })} onRemove={onRemove} onPutBack={onPutBack}
              onShowFile={(line) => setSheet({ kind: "file", line })}
            />
          </aside>
        </>
      ) : (
        <Broken problems={r.problems} canUndo={history.past.length > 0} onUndo={history.undo} onOpenFile={(line) => setSheet({ kind: "file", line })} />
      )}

      {sheet?.kind === "make" && p && r.drawer && <MakeSheet plan={p} issues={r.issues} onSpec={(id) => setSheet({ kind: "spec", id })} onClose={() => setSheet(null)} />}
      {sheet?.kind === "spec" && p && r.drawer && p.holders.some((h) => h.id === sheet.id) && (
        <SpecSheet plan={p} holder={p.holders.find((h) => h.id === sheet.id)!} drawerName={r.drawer.name} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "file" && <FileSheet name={file} text={text} problems={r.problems} highlight={highlight} line={sheet.line} onApply={(next) => apply(() => next)} onClose={() => setSheet(null)} />}
      {sheet?.kind === "add" && <AddThingSheet onAdd={onAdd} onClose={() => setSheet(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function SaveState({ status, mode, onDownload }: { status: Status; mode: Workspace["mode"]; onDownload: () => void }) {
  if (mode === "folder") {
    const text = { saved: "Saved", saving: "Saving…", unsaved: "Not saved", failed: "Couldn't save" }[status];
    return <span className={`save ${status}`} role="status"><i />{text}</span>;
  }
  return (
    <button type="button" className={`btn ${status === "unsaved" ? "attention" : ""}`} onClick={onDownload} title="Save the drawer file by downloading it">
      <Icon.download />{status === "unsaved" ? "Download changes" : "Download"}
    </button>
  );
}

function Toolbar({ count, onArrange }: { count: number; onArrange: (op: ArrangeOp) => void }) {
  const tool = (op: ArrangeOp, I: () => ReactElement, label: string) => (
    <button type="button" className="tool" onClick={() => onArrange(op)} title={label} aria-label={label}><I /></button>
  );
  return (
    <div className="tools" role="toolbar" aria-label="Arrange the selection">
      <span className="tools-label">{count} selected</span>
      {tool("left", Icon.left, "Align left edges")}{tool("hmid", Icon.hmid, "Align centres across")}{tool("right", Icon.right, "Align right edges")}
      <span className="sep" />
      {tool("back", Icon.backEdge, "Align back edges")}{tool("vmid", Icon.vmid, "Align centres front to back")}{tool("front", Icon.frontEdge, "Align front edges")}
      <span className="sep" />
      {tool("dist-x", Icon.distx, "Distribute across, equal gaps")}{tool("dist-y", Icon.disty, "Distribute front to back, equal gaps")}
      <span className="sep" />
      {tool("pack-x", Icon.packx, "Close gaps across")}{tool("pack-y", Icon.packy, "Close gaps front to back")}
    </div>
  );
}

function Broken({ problems, canUndo, onUndo, onOpenFile }: { problems: { path: string; message: string; line?: number }[]; canUndo: boolean; onUndo: () => void; onOpenFile: (line?: number) => void }) {
  return (
    <section className="broken">
      <h2>dunnage can't read this drawer file yet</h2>
      <p className="note">Fix what's below in the file, here or in your editor, and the plan comes back.</p>
      <ul>
        {problems.map((problem, k) => (
          <li key={k}>
            <button type="button" className="flag" onClick={() => onOpenFile(problem.line)}>
              <b>{problem.path || "The file"}{problem.line ? `, line ${problem.line}` : ""}</b>
              <span>{problem.message}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        {canUndo && <button type="button" className="btn" onClick={onUndo}><Icon.undo />Undo the last change</button>}
        <button type="button" className="btn primary" onClick={() => onOpenFile(problems[0]?.line)}><Icon.file />Open the file</button>
      </div>
    </section>
  );
}
