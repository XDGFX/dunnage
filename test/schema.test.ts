import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import { jsonSchema } from "../src/core/index.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe.each(["drawer", "printer"] as const)("docs/format/%s-0.2.schema.json", (kind) => {
  const published = JSON.parse(read(`docs/format/${kind}-0.2.schema.json`));

  test("is the core's schema (run `bun run schema` if not)", () => {
    expect(published).toEqual(jsonSchema(kind));
  });

  test("accepts the fixture in another validator", () => {
    const fixture = kind === "drawer" ? "fixtures/coffee.drawer.yml" : "fixtures/p1s.printer.yml";
    const validate = new Ajv({ strict: false }).compile(published);
    expect(validate(parse(read(fixture))), JSON.stringify(validate.errors)).toBe(true);
  });
});
