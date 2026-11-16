import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { exportDrawer, load, zipExport, type ExportedFile, type Fit } from "../core/index.ts";

// Builds an export off the main thread: a full tile takes seconds in manifold.

export interface ExportRequest {
  text: string;
  /** The drawer's printer's bed and fits, as the CLI builds to. */
  bed: [number, number, number];
  fit: Fit;
  /** Separate files for a folder, or one zip to download. */
  want: "files" | "zip";
}

export type ExportReply =
  | { kind: "progress"; step: string }
  | { kind: "files"; files: ExportedFile[] }
  | { kind: "zip"; zip: Uint8Array }
  | { kind: "failed"; message: string };

const reply = (message: ExportReply, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = async ({ data }: MessageEvent<ExportRequest>) => {
  try {
    const file = load(data.text);
    if (file.kind !== "drawer") throw new Error("only a drawer file exports");
    const files = exportDrawer(await Module({ locateFile: () => wasmUrl }), file.drawer, {
      bed: data.bed,
      fit: data.fit,
      progress: (step) => reply({ kind: "progress", step }),
    });
    if (data.want === "files") return reply({ kind: "files", files }, [...new Set(files.map((f) => f.data.buffer as ArrayBuffer))]);
    const zip = zipExport(files);
    reply({ kind: "zip", zip }, [zip.buffer as ArrayBuffer]);
  } catch (error) {
    reply({ kind: "failed", message: (error as Error).message });
  }
};
