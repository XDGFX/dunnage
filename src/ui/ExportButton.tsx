import { useEffect, useRef, useState } from "react";
import type { ExportReply, ExportRequest } from "./export.worker.ts";
import { Icon } from "./icons.tsx";
import type { Fit } from "../core/index.ts";

// Export: the same core code as `dunnage export`, in a worker. Writes into a folder the person
// picks where the browser allows it, and downloads a zip where it doesn't.

interface DirectoryHandle {
  getDirectoryHandle(name: string, options: { create: true }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options: { create: true }): Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>;
}

interface Props {
  /** The drawer file's name, such as `coffee.drawer.yml`. */
  file: string;
  text: string;
  /** The drawer's printer's bed and fits, so the parts match the CLI's. */
  bed: [number, number, number];
  fit: Fit;
  disabled?: boolean;
}

export function ExportButton({ file, text, bed, fit, disabled }: Props) {
  const [step, setStep] = useState<string | null>(null);
  const running = useRef<Worker | null>(null);

  const stop = () => {
    running.current?.terminate();
    running.current = null;
    setStep(null);
  };
  // An export belongs to the file it started on.
  useEffect(() => stop, [file]);

  const failed = (message: string) => {
    stop();
    window.alert(`Export failed: ${message}`);
  };

  const run = async () => {
    const pick = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirectoryHandle> }).showDirectoryPicker;
    let folder: DirectoryHandle | undefined;
    if (pick) {
      try {
        folder = await pick.call(window, { mode: "readwrite", id: "dunnage-export" });
      } catch {
        return; // cancelled
      }
    }
    setStep("starting");
    const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
    running.current = worker;
    worker.onerror = (event) => failed(event.message || "the export worker stopped");
    worker.onmessageerror = () => failed("the export worker's reply couldn't be read");
    worker.onmessage = async ({ data }: MessageEvent<ExportReply>) => {
      if (running.current !== worker) return;
      if (data.kind === "progress") return setStep(data.step);
      if (data.kind === "failed") return failed(data.message);
      stop();
      try {
        if (data.kind === "files") {
          for (const exported of data.files) await write(folder!, exported.name, exported.data);
        } else {
          const url = URL.createObjectURL(new Blob([data.zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `${file.replace(/(\.drawer)?\.ya?ml$/, "")}.zip`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (error) {
        failed((error as Error).message);
      }
    };
    worker.postMessage({ text, bed, fit, want: folder ? "files" : "zip" } satisfies ExportRequest);
  };

  return (
    <button type="button" className="btn" onClick={run} disabled={disabled || step !== null} title="Write the base's 3MFs, the parts list and spec sheets">
      <Icon.box />
      {step ? `Building ${step}…` : "Export"}
    </button>
  );
}

async function write(folder: DirectoryHandle, path: string, data: Uint8Array) {
  const parts = path.split("/");
  let dir = folder;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  const writable = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
  await writable.write(data);
  await writable.close();
}
