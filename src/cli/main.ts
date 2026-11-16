#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import Module from "manifold-3d";
import { check, exportDrawer, load, read, type CheckResult, type Fit, type Problem } from "../core/index.ts";

const usage = `Usage: dunnage <command> [--json] <file...>

Commands:
  check   validate drawer and printer files, one problem per line as
          file:line:column: path: message (or JSON with --json). Warnings
          are marked as such and don't fail the check.
  export  dunnage export <drawer file> [--out dir]: write the grid base as
          3MFs plated for the bed, the calibration print, a parts list
          (parts.md) and spec sheets. --out defaults to out/<drawer name>.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { version: { type: "boolean" }, help: { type: "boolean", short: "h" }, json: { type: "boolean" }, out: { type: "string" } },
});

if (values.version) {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
  process.exit(0);
}

const [command, ...files] = positionals;

if (values.help || !command) {
  console.log(usage);
  process.exit(values.help ? 0 : 1);
}

if (command === "check") {
  if (files.length === 0) fail("check needs at least one file");
  const results = files.map((file) => ({ file, ...checkFile(file) }));
  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const { file, format, migratedFrom, problems, warnings = [] } of results) {
      const say = ({ path, message, line, column }: Problem, label = "") =>
        console.log(`${[file, line, column].filter((part) => part !== undefined).join(":")}: ${label}${path ? `${path}: ` : ""}${message}`);
      for (const problem of problems) say(problem);
      for (const warning of warnings) say(warning, "warning: ");
      const migrated = migratedFrom ? `, migrated from ${migratedFrom}` : "";
      const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
      const warned = warnings.length === 0 ? "" : warnings.length === 1 ? ", 1 warning" : `, ${warnings.length} warnings`;
      console.log(problems.length === 0 ? `${file}: ok, ${format}${migrated}${warned}` : `${file}: ${count}${warned}`);
    }
  }
  process.exit(results.some((result) => result.problems.length > 0) ? 1 : 0);
}

if (command === "export") {
  if (files.length !== 1) fail("export takes one drawer file");
  const file = files[0]!;
  const result = checkFile(file);
  if (result.problems.length > 0) {
    for (const { path, message, line, column } of result.problems) console.error(`${[file, line, column].filter((part) => part !== undefined).join(":")}: ${path ? `${path}: ` : ""}${message}`);
    fail(`${file} has problems: fix them, then export`);
  }
  const text = readFileSync(file, "utf8");
  const loaded = load(text);
  if (loaded.kind !== "drawer") fail(`${file} is a printer file: export takes a drawer`);
  const out = values.out ?? join("out", basename(file).replace(/(\.drawer)?\.ya?ml$/, ""));
  const started = performance.now();
  const written = exportDrawer(await Module(), loaded.drawer, {
    ...printerOf(text, (name) => join(dirname(file), `${name}.printer.yml`)),
    progress: (step) => console.error(`building ${step}`),
  });
  for (const { name, data } of written) {
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), data);
    console.log(`${join(out, name)}  ${(data.byteLength / 1024).toFixed(0)} kB`);
  }
  console.log(`${written.length} files in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  process.exit(0);
}

fail(`unknown command ${command}\n\n${usage}`);

function checkFile(file: string): CheckResult {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return { problems: [{ path: "", message: `can't read it: ${(error as Error).message}` }] };
  }
  const printerFile = (name: string) => join(dirname(file), `${name}.printer.yml`);
  return check(text, { printerExists: (name) => existsSync(printerFile(name)), ...printerOf(text, printerFile) });
}

/** The bed and fits of the printer a drawer file names, when its profile is beside it and reads cleanly. */
function printerOf(text: string, printerFile: (name: string) => string): { bed?: [number, number, number]; fit?: Fit } {
  try {
    const drawer = read(text).file;
    if (drawer?.kind !== "drawer" || drawer.drawer.printer === undefined) return {};
    const printer = load(readFileSync(printerFile(drawer.drawer.printer), "utf8"));
    return printer.kind === "printer" ? { bed: printer.printer.bed, fit: printer.printer.fit } : {};
  } catch {
    return {};
  }
}

function fail(message: string): never {
  console.error(`dunnage: ${message}`);
  process.exit(1);
}
