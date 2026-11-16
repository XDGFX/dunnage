#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { check, load, read } from "../core/index.js";
const usage = `Usage: dunnage <command> [--json] <file...>

Commands:
  check   validate drawer and printer files, one problem per line as
          file:line:column: path: message (or JSON with --json). Warnings
          are marked as such and don't fail the check.
  export  write 3MFs and spec sheets (not built yet)`;
const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { version: { type: "boolean" }, help: { type: "boolean", short: "h" }, json: { type: "boolean" } },
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
    if (files.length === 0)
        fail("check needs at least one file");
    const results = files.map((file) => ({ file, ...checkFile(file) }));
    if (values.json) {
        console.log(JSON.stringify(results, null, 2));
    }
    else {
        for (const { file, format, migratedFrom, problems, warnings = [] } of results) {
            const say = ({ path, message, line, column }, label = "") => console.log(`${[file, line, column].filter((part) => part !== undefined).join(":")}: ${label}${path ? `${path}: ` : ""}${message}`);
            for (const problem of problems)
                say(problem);
            for (const warning of warnings)
                say(warning, "warning: ");
            const migrated = migratedFrom ? `, migrated from ${migratedFrom}` : "";
            const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
            const warned = warnings.length === 0 ? "" : warnings.length === 1 ? ", 1 warning" : `, ${warnings.length} warnings`;
            console.log(problems.length === 0 ? `${file}: ok, ${format}${migrated}${warned}` : `${file}: ${count}${warned}`);
        }
    }
    process.exit(results.some((result) => result.problems.length > 0) ? 1 : 0);
}
if (command === "export")
    fail("export is not built yet");
fail(`unknown command ${command}\n\n${usage}`);
function checkFile(file) {
    let text;
    try {
        text = readFileSync(file, "utf8");
    }
    catch (error) {
        return { problems: [{ path: "", message: `can't read it: ${error.message}` }] };
    }
    const printerFile = (name) => join(dirname(file), `${name}.printer.yml`);
    return check(text, { printerExists: (name) => existsSync(printerFile(name)), ...printerOf(text, printerFile) });
}
/** The bed and fits of the printer a drawer file names, when its profile is beside it and reads cleanly. */
function printerOf(text, printerFile) {
    try {
        const drawer = read(text).file;
        if (drawer?.kind !== "drawer" || drawer.drawer.printer === undefined)
            return {};
        const printer = load(readFileSync(printerFile(drawer.drawer.printer), "utf8"));
        return printer.kind === "printer" ? { bed: printer.printer.bed, fit: printer.printer.fit } : {};
    }
    catch {
        return {};
    }
}
function fail(message) {
    console.error(`dunnage: ${message}`);
    process.exit(1);
}
