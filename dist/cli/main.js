#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { check } from "../core/index.js";
const usage = `Usage: dunnage <command> [--json] <file...>

Commands:
  check   validate drawer and printer files, one problem per line as
          file:line:column: path: message (or JSON with --json)
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
        for (const { file, format, migratedFrom, problems } of results) {
            for (const { path, message, line, column } of problems) {
                console.log(`${[file, line, column].filter((part) => part !== undefined).join(":")}: ${path ? `${path}: ` : ""}${message}`);
            }
            const migrated = migratedFrom ? `, migrated from ${migratedFrom}` : "";
            const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
            console.log(problems.length === 0 ? `${file}: ok, ${format}${migrated}` : `${file}: ${count}`);
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
    return check(text, { printerExists: (name) => existsSync(join(dirname(file), `${name}.printer.yml`)) });
}
function fail(message) {
    console.error(`dunnage: ${message}`);
    process.exit(1);
}
