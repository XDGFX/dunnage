// Writes the JSON Schemas in docs/format/ from the core's schemas. test/schema.test.ts fails
// when they are out of date. Older versions' schemas stay published for files that still name them.
import { writeFileSync } from "node:fs";
import { FORMATS, jsonSchema } from "../src/core/index.ts";

for (const kind of ["drawer", "printer"] as const) {
  writeFileSync(new URL(`../docs/format/${kind}-${FORMATS[kind]}.schema.json`, import.meta.url), `${JSON.stringify(jsonSchema(kind), null, 2)}\n`);
}
