import { useEffect, useRef, useState } from "react";
import { Editor } from "./Editor.tsx";
import { Icon } from "./icons.tsx";
import { blankDrawer, canOpenFolders, demo, fromFiles, lastFolder, openFolder, type Workspace } from "./workspace.ts";

// The app: open a folder of drawer files (or a few files, or the example), then edit one drawer
// at a time.

interface Open {
  workspace: Workspace;
  file: string;
  text: string;
}

export function App() {
  const [open, setOpen] = useState<Open | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (workspace: Workspace | null) => {
    if (!workspace) return;
    if (!workspace.drawers.length) {
      setError(`There are no drawer files in ${workspace.name}. A drawer file's name ends in .drawer.yml.`);
      if (workspace.mode === "folder" && window.confirm(`${workspace.name} has no drawer files. Start a new one there?`)) return create(workspace);
      return;
    }
    setError(null);
    const file = workspace.drawers[0];
    setOpen({ workspace, file, text: await workspace.readDrawer(file) });
  };

  const switchTo = async (file: string) => {
    if (!open) return;
    setOpen({ ...open, file, text: await open.workspace.readDrawer(file) });
  };

  const create = async (workspace: Workspace) => {
    const name = window.prompt("What's the drawer called?", "Kitchen drawer");
    if (!name?.trim()) return;
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "drawer";
    let file = `${base}.drawer.yml`;
    for (let n = 2; workspace.drawers.includes(file); n++) file = `${base}-${n}.drawer.yml`;
    const printer = Object.keys(workspace.printers)[0];
    const text = blankDrawer(name.trim(), printer);
    await workspace.writeDrawer(file, text);
    const next = { ...workspace, drawers: [...workspace.drawers, file].sort() };
    setError(null);
    setOpen({ workspace: next, file, text });
  };

  if (open) {
    return (
      <Editor
        key={`${open.workspace.name}/${open.file}`}
        workspace={open.workspace}
        file={open.file}
        initial={open.text}
        onOpen={switchTo}
        onNew={() => create(open.workspace)}
        onClose={() => setOpen(null)}
      />
    );
  }
  return <Welcome onWorkspace={start} error={error} />;
}

function Welcome({ onWorkspace, error }: { onWorkspace: (w: Workspace | null) => void; error: string | null }) {
  const picker = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState<Awaited<ReturnType<typeof lastFolder>>>(null);
  const folders = canOpenFolders();
  useEffect(() => {
    if (folders) void lastFolder().then(setLast);
  }, [folders]);

  return (
    <main className="welcome">
      <div className="welcome-copy">
        <p className="wordmark big">dunnage</p>
        <h1>Holders that keep things still in a drawer, even on a rough road.</h1>
        <p className="lede">
          Describe what's in the drawer and where it goes. dunnage works out how each thing is held, checks it fits, and keeps the
          drawer file beside your other files, where you and an agent can both edit it.
        </p>
        <div className="welcome-actions">
          {folders ? (
            <button type="button" className="btn primary big" onClick={async () => onWorkspace(await openFolder())}>
              <Icon.folder />Open a folder of drawers
            </button>
          ) : (
            <button type="button" className="btn primary big" onClick={() => picker.current?.click()}>
              <Icon.file />Open drawer files
            </button>
          )}
          {last && (
            <button type="button" className="btn big" onClick={async () => onWorkspace(await last.open())}>
              Reopen {last.name}
            </button>
          )}
          <button type="button" className="btn big ghost" onClick={() => onWorkspace(demo())}>Try the coffee drawer</button>
        </div>
        {!folders && <p className="note">This browser can't open folders, so edits are saved by downloading the file. Chrome and Edge can save straight back to the folder.</p>}
        {folders && (
          <p className="note">
            Or <button type="button" className="link" onClick={() => picker.current?.click()}>open drawer files one by one</button> and save them by downloading.
          </p>
        )}
        {error && <p className="note bad">{error}</p>}
        <input
          ref={picker}
          type="file"
          accept=".yml,.yaml"
          multiple
          hidden
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) onWorkspace(await fromFiles(files));
          }}
        />
      </div>
      <ol className="steps" aria-label="How it works">
        {[
          ["Inventory", "What lives in the drawer, and the ways each thing can sit."],
          ["Arrange", "Where each thing goes. Drag things about; they settle into a tidy layout."],
          ["Hold", "How each thing, or a group, is held: wells, posts, slots, pegs or ply."],
          ["Make", "Prints, router templates, and spec sheets for anything bespoke."],
          ["Lock", "What's built is frozen, and later layouts design round it."],
        ].map(([step, what]) => (
          <li key={step}>
            <b>{step}</b>
            <span>{what}</span>
          </li>
        ))}
      </ol>
      <p className="files-hint">
        A folder of drawers holds files like <span className="mono">coffee.drawer.yml</span>, one for each drawer, and a printer profile such as{" "}
        <span className="mono">p1s.printer.yml</span>.
      </p>
    </main>
  );
}
