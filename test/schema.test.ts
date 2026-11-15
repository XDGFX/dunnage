import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { FORMATS, jsonSchema } from "../src/core/index.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const fixtures = {
  drawer: ["fixtures/coffee.drawer.yml", "fixtures/tool-chest.drawer.yml"],
  printer: ["fixtures/p1s.printer.yml"],
};

describe.each(["drawer", "printer"] as const)("docs/format/%s schema", (kind) => {
  const published = JSON.parse(read(`docs/format/${kind}-${FORMATS[kind]}.schema.json`));

  test("is the core's schema (run `bun run schema` if not)", () => {
    expect(published).toEqual(jsonSchema(kind));
  });

  test.each(fixtures[kind])("accepts %s in another validator", (fixture) => {
    const validate = new Ajv({ strict: false }).compile(published);
    expect(validate(parse(read(fixture))), JSON.stringify(validate.errors)).toBe(true);
  });
});
