import { useCallback, useMemo, useState } from "react";
import { plan as planOf, read, type Drawer, type Issue, type Plan, type Problem } from "../core/index.ts";

// One drawer file being edited: its text, what's undone and redone, and what dunnage makes of
// it. The text is the state; the drawer and its plan are worked out from it after every edit.

export interface Reading {
  problems: Problem[];
  drawer?: Drawer;
  plan?: Plan;
  /** Problems with each thing and holder, from the file's check and the plan, by id. */
  issues: Map<string, Issue[]>;
  /** Problems the file has that belong to no one thing or holder. */
  general: Problem[];
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function reading(text: string, bed: readonly [number, number, number]): Reading {
  const result = read(text);
  if (result.file?.kind !== "drawer") return { problems: result.problems, issues: new Map(), general: result.problems };
  const drawer = result.file.drawer;
  const plan = planOf(drawer, bed);
  const issues = new Map<string, Issue[]>();
  const add = (id: string, issue: Issue) => issues.set(id, [...(issues.get(id) ?? []), issue]);
  const general: Problem[] = [];
  for (const problem of result.problems) {
    const thing = problem.path.match(/^layout\[(\d+)\]/);
    const holder = problem.path.match(/^holders\[(\d+)\]/);
    const id = thing ? drawer.layout[Number(thing[1])]?.id : holder ? drawer.holders?.[Number(holder[1])]?.id : undefined;
    if (id && !(thing && drawer.layout[Number(thing[1])]?.aside)) add(id, { level: "bad", text: sentence(problem.message) });
    else if (!id) general.push(problem);
  }
  for (const t of plan.placed) for (const issue of t.issues) add(t.id, issue);
  for (const h of plan.holders) for (const issue of h.issues) add(h.id, issue);
  return { problems: result.problems, drawer, plan, issues, general };
}

export interface History {
  text: string;
  /** Texts before this one, newest last. */
  past: string[];
  future: string[];
}

export function useHistory(initial: string) {
  const [history, setHistory] = useState<History>({ text: initial, past: [], future: [] });
  /** Applies an edit. One that throws, or changes nothing, leaves the history alone. */
  const apply = useCallback((edit: (text: string) => string) => {
    setHistory((h) => {
      let next: string;
      try {
        next = edit(h.text);
      } catch (error) {
        console.error(error);
        return h;
      }
      return next === h.text ? h : { text: next, past: [...h.past.slice(-199), h.text], future: [] };
    });
  }, []);
  const undo = useCallback(() => setHistory((h) => (h.past.length ? { text: h.past.at(-1)!, past: h.past.slice(0, -1), future: [h.text, ...h.future] } : h)), []);
  const redo = useCallback(() => setHistory((h) => (h.future.length ? { text: h.future[0], past: [...h.past, h.text], future: h.future.slice(1) } : h)), []);
  /** Starts afresh from a text, as when a file is opened. */
  const reset = useCallback((text: string) => setHistory({ text, past: [], future: [] }), []);
  return useMemo(() => ({ ...history, apply, undo, redo, reset }), [history, apply, undo, redo, reset]);
}
