import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { exportDrawer, load, zipExport, type ExportedFile } from "../core/index.ts";

// Builds an export off the main thread: a full tile takes seconds in manifold.

export interface ExportRequest {
  text: string;
  bed: [number, number, number];
}

export type ExportReply = { kind: "progress"; step: string } | { kind: "done"; files: ExportedFile[]; zip: Uint8Array } | { kind: "failed"; message: string };

const reply = (message: ExportReply, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = async ({ data }: MessageEvent<ExportRequest>) => {
  try {
    const file = load(data.text);
    if (file.kind !== "drawer") throw new Error("only a drawer file exports");
    const manifold = async () => {
      const wasm = await Module({ locateFile: () => wasmUrl });
      wasm.setup();
      return wasm;
    };
    const files = await exportDrawer(manifold, file.drawer, { bed: data.bed, progress: (step) => reply({ kind: "progress", step }) });
    const zip = zipExport(files);
    reply({ kind: "done", files, zip }, [zip.buffer as ArrayBuffer]);
  } catch (error) {
    reply({ kind: "failed", message: (error as Error).message });
  }
};
