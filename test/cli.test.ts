import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const run = promisify(execFile);
const main = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));

async function dunnage(...args: string[]) {
  try {
    const { stdout, stderr } = await run("node", [main, ...args]);
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
    expect(result.stdout).toContain("fixtures/coffee.drawer.yml: drawer/0.2");
    expect(result.stdout).toContain("fixtures/p1s.printer.yml: printer/0.2");
  });
});

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
