import { describe, expect, test } from "vitest";
import { readHeader } from "../src/core/index.ts";

describe("readHeader", () => {
  test("reads the kind and version from the format line", () => {
    expect(readHeader("format: drawer/0.2\nname: Coffee\n")).toEqual({ kind: "drawer", version: "0.2" });
  });

  test("refuses a file newer than this copy of dunnage", () => {
    expect(() => readHeader("format: drawer/0.9\n")).toThrow("this copy of dunnage reads drawer/0.2");
  });

  test("refuses a file that is not a dunnage file", () => {
    expect(() => readHeader("name: Coffee\n")).toThrow("no `format:` line");
    expect(() => readHeader("format: toaster/1.0\n")).toThrow("unknown format toaster/1.0");
  });
});
