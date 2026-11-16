import { describe, expect, test } from "vitest";
import { check } from "../src/core/index.ts";
import { reading } from "../src/ui/model.ts";

const GRID_DRAWER = `format: drawer/0.3
name: Test
drawer: { preset: ikea-maximera-80x60-low }
base: { kind: grid }
items: {}
layout: []
`;

describe("reading a drawer for the app", () => {
  test("carries the file's warnings", () => {
    const r = reading(GRID_DRAWER, [256, 256, 256]);
    expect(r.warnings).toEqual(check(GRID_DRAWER).warnings);
    expect(r.warnings.map((w) => w.path)).toContain("drawer.preset");
  });

  test("checks the board against the drawer's printer's bed", () => {
    const tiny: [number, number, number] = [15, 15, 15];
    expect(reading(GRID_DRAWER, [256, 256, 256]).general).toEqual([]);
    expect(reading(GRID_DRAWER, tiny).general).toEqual(check(GRID_DRAWER, { bed: tiny }).problems);
    expect(reading(GRID_DRAWER, tiny).general).not.toEqual([]);
  });
});
