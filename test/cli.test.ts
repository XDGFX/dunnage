import { execFile } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const run = promisify(execFile);
const main = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));

async function dunnage(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [main, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { code, stdout, stderr };
  }
}

describe("dunnage check", () => {
  test("accepts the coffee drawer and the P1S printer", async () => {
    const result = await dunnage("check", "fixtures/coffee.drawer.yml", "fixtures/p1s.printer.yml");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("fixtures/coffee.drawer.yml: ok, drawer/0.2");
    expect(result.stdout).toContain("fixtures/p1s.printer.yml: ok, printer/0.2");
  });

  test("puts each problem at its file, line and path, and fails", async () => {
    const file = scratch("bad.drawer.yml", readFileSync("fixtures/coffee.drawer.yml", "utf8").replace("item: coaster", "item: coastr"));
    copyFileSync("fixtures/p1s.printer.yml", file.replace("bad.drawer.yml", "p1s.printer.yml"));
    const result = await dunnage("check", file);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(new RegExp(`^${file}:\\d+:\\d+: layout\\[2\\]\\.item: coastr is not an item`, "m"));
    expect(result.stdout).toContain(`${file}: 1 problem`);
  });

  test("reports a printer profile that isn't beside the drawer", async () => {
    const file = scratch("lonely.drawer.yml", readFileSync("fixtures/coffee.drawer.yml", "utf8"));
    const result = await dunnage("check", file);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("printer: no printer profile p1s.printer.yml beside this file");
  });

  test("speaks JSON for agents", async () => {
    const file = scratch("bad.printer.yml", "format: printer/0.2\nbed: [256, 256]\n");
    const result = await dunnage("check", "--json", "fixtures/p1s.printer.yml", file);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual([
      { file: "fixtures/p1s.printer.yml", format: "printer/0.2", problems: [] },
      { file, format: "printer/0.2", problems: [{ path: "bed", message: expect.any(String), line: 2, column: 1 }] },
    ]);
  });

  test("reports a file it can't read", async () => {
    const result = await dunnage("check", "fixtures/missing.drawer.yml");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("fixtures/missing.drawer.yml: can't read it");
  });
});

function scratch(name: string, text: string) {
  const file = join(mkdtempSync(join(tmpdir(), "dunnage-")), name);
  writeFileSync(file, text);
  return file;
}

describe("dunnage export", () => {
  test("says it is not built yet and fails", async () => {
    const result = await dunnage("export", "fixtures/coffee.drawer.yml");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("export is not built yet");
  });
});

describe("dunnage --version", () => {
  test("prints the package version", async () => {
    const result = await dunnage("--version");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(result.stdout.trim()).toBe(pkg.version);
  });
});
