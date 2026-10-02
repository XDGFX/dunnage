import { flow, read } from "../core/index.ts";
import coffee from "../../fixtures/coffee.drawer.yml?raw";
import p1s from "../../fixtures/p1s.printer.yml?raw";

// Where drawer files come from and go back to. With the File System Access API, a folder is
// opened once and every edit is written straight back to its file. Without it, files are opened
// from the picker and saved by downloading them. The demo is the coffee drawer, held in memory.

export type Mode = "folder" | "files" | "demo";

export interface Workspace {
  mode: Mode;
  /** The folder's name, or what stands in for it. */
  name: string;
  /** Drawer file names, such as `coffee.drawer.yml`. */
  drawers: string[];
  /** Printer beds by profile name, from `<name>.printer.yml`. */
  printers: Record<string, [number, number, number]>;
  readDrawer(file: string): Promise<string>;
  /** Writes a drawer back. False when this workspace can't, and it has to be downloaded. */
  writeDrawer(file: string, text: string): Promise<boolean>;
  /** When the file was last changed on disk, to notice edits made elsewhere. */
  modified(file: string): Promise<number | null>;
}

export const DRAWER = /\.drawer\.ya?ml$/;
const PRINTER = /\.printer\.ya?ml$/;
const DEFAULT_BED: [number, number, number] = [256, 256, 256];

export const canOpenFolders = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

function bedOf(text: string): [number, number, number] | null {
  const { file } = read(text);
  return file?.kind === "printer" ? file.printer.bed : null;
}

/** The bed for a drawer's printer, or the common 256 mm one when there's no profile. */
export function bedFor(workspace: Workspace, printer: string | undefined): { bed: [number, number, number]; found: boolean } {
  const bed = printer ? workspace.printers[printer] : undefined;
  return bed ? { bed, found: true } : { bed: DEFAULT_BED, found: false };
}

// --- A folder, with the File System Access API ----------------------------------------------

interface DirectoryHandle {
  name: string;
  values(): AsyncIterable<FileHandle | DirectoryHandle & { kind: "directory" }>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}
interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

export async function openFolder(): Promise<Workspace | null> {
  const pick = (window as unknown as { showDirectoryPicker(o: object): Promise<DirectoryHandle> }).showDirectoryPicker;
  let dir: DirectoryHandle;
  try {
    dir = await pick.call(window, { mode: "readwrite", id: "dunnage" });
  } catch {
    return null; // cancelled
  }
  await remember(dir);
  return folder(dir);
}

/** The folder opened last time, if the browser kept it. Opening it may ask for permission again. */
export async function lastFolder(): Promise<{ name: string; open: () => Promise<Workspace | null> } | null> {
  const dir = await recall();
  if (!dir) return null;
  return {
    name: dir.name,
    open: async () => {
      if ((await dir.queryPermission({ mode: "readwrite" })) !== "granted" && (await dir.requestPermission({ mode: "readwrite" })) !== "granted") return null;
      return folder(dir);
    },
  };
}

async function folder(dir: DirectoryHandle): Promise<Workspace> {
  const files = new Map<string, FileHandle>();
  for await (const entry of dir.values()) if (entry.kind === "file") files.set(entry.name, entry as FileHandle);
  const printers: Workspace["printers"] = {};
  for (const [name, handle] of files) {
    if (!PRINTER.test(name)) continue;
    const bed = bedOf(await (await handle.getFile()).text());
    if (bed) printers[name.replace(PRINTER, "")] = bed;
  }
  const write = async (handle: FileHandle, text: string) => {
    const stream = await handle.createWritable();
    await stream.write(text);
    await stream.close();
  };
  return {
    mode: "folder",
    name: dir.name,
    drawers: [...files.keys()].filter((name) => DRAWER.test(name)).sort(),
    printers,
    readDrawer: async (file) => (await files.get(file)!.getFile()).text(),
    writeDrawer: async (file, text) => {
      let handle = files.get(file);
      if (!handle) {
        handle = await dir.getFileHandle(file, { create: true });
        files.set(file, handle);
      }
      await write(handle, text);
      return true;
    },
    modified: async (file) => (await files.get(file)?.getFile())?.lastModified ?? null,
  };
}

// The folder handle is kept in IndexedDB, the one place a browser can keep it between visits.
const DB = "dunnage";
const STORE = "folders";

function database(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function remember(dir: DirectoryHandle) {
  const db = await database();
  db?.transaction(STORE, "readwrite").objectStore(STORE).put(dir, "last");
}

async function recall(): Promise<DirectoryHandle | null> {
  const db = await database();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).get("last");
    request.onsuccess = () => resolve((request.result as DirectoryHandle) ?? null);
    request.onerror = () => resolve(null);
  });
}

// --- Files picked one by one, saved by downloading ------------------------------------------

export function fromFiles(picked: File[]): Promise<Workspace> {
  return Promise.all(picked.map(async (file) => [file.name, await file.text()] as const)).then((entries) => inMemory("files", "Opened files", new Map(entries)));
}

export function demo(): Workspace {
  return inMemory("demo", "Example", new Map([["coffee.drawer.yml", coffee], ["p1s.printer.yml", p1s]]));
}

function inMemory(mode: Mode, name: string, files: Map<string, string>): Workspace {
  const printers: Workspace["printers"] = {};
  for (const [file, text] of files) {
    const bed = PRINTER.test(file) ? bedOf(text) : null;
    if (bed) printers[file.replace(PRINTER, "")] = bed;
  }
  return {
    mode,
    name,
    drawers: [...files.keys()].filter((file) => DRAWER.test(file)).sort(),
    printers,
    readDrawer: async (file) => files.get(file) ?? "",
    writeDrawer: async (file, text) => {
      files.set(file, text);
      return false;
    },
    modified: async () => null,
  };
}

/** Saves text as a file through the browser's downloads. */
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A new, empty drawer file. */
export function blankDrawer(name: string, printer?: string): string {
  return `format: drawer/0.2
name: ${flow(name)}
${printer ? `printer: ${flow(printer)}\n` : ""}
drawer:
  inside: [600, 450, 120]          # width, depth, height in mm

base:
  kind: bare

items: {}

layout: []

holders: []
`;
}
