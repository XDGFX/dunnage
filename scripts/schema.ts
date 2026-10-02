// Writes the JSON Schemas in docs/format/ from the core's schemas. test/schema.test.ts fails
// when they are out of date.
import { writeFileSync } from "node:fs";
import { jsonSchema } from "../src/core/index.ts";

for (const kind of ["drawer", "printer"] as const) {
  writeFileSync(new URL(`../docs/format/${kind}-0.2.schema.json`, import.meta.url), `${JSON.stringify(jsonSchema(kind), null, 2)}\n`);
}
