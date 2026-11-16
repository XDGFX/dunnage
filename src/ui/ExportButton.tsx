import { useState } from "react";
import type { ExportReply, ExportRequest } from "./export.worker.ts";
import { Icon } from "./icons.tsx";

// Export: the same core code as `dunnage export`, in a worker. Writes into a folder the person
// picks where the browser allows it, and downloads a zip where it doesn't.

interface DirectoryHandle {
  getDirectoryHandle(name: string, options: { create: true }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options: { create: true }): Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>;
}

export function ExportButton({ text, name, bed, disabled }: { text: string; name: string; bed: [number, number, number]; disabled?: boolean }) {
  const [step, setStep] = useState<string | null>(null);

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
    worker.onmessage = async ({ data }: MessageEvent<ExportReply>) => {
      if (data.kind === "progress") return setStep(data.step);
      worker.terminate();
      try {
        if (data.kind === "failed") throw new Error(data.message);
        if (folder) {
          for (const file of data.files) await write(folder, file.name, file.data);
        } else {
          const url = URL.createObjectURL(new Blob([data.zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `${name}.zip`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (error) {
        window.alert(`Export failed: ${(error as Error).message}`);
      } finally {
        setStep(null);
      }
    };
    worker.postMessage({ text, bed } satisfies ExportRequest);
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
