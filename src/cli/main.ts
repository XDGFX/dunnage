#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { readHeader } from "../core/index.ts";

const usage = `Usage: dunnage <command> <file...>

Commands:
  check   validate drawer and printer files
  export  write 3MFs and spec sheets (not built yet)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { version: { type: "boolean" }, help: { type: "boolean", short: "h" } },
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
  let failed = false;
  for (const file of files) {
    try {
      const { kind, version } = readHeader(readFileSync(file, "utf8"));
      // Only the header is checked so far; the full schema comes with the format work.
      console.log(`${file}: ${kind}/${version}`);
    } catch (error) {
      console.error(`${file}: ${(error as Error).message}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

if (command === "export") fail("export is not built yet");

fail(`unknown command ${command}\n\n${usage}`);

function fail(message: string): never {
  console.error(`dunnage: ${message}`);
  process.exit(1);
}
