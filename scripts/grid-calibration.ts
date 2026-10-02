// Writes the grid base test prints for #7 as STLs, with a parts list.
//
//   bun scripts/grid-calibration.ts round-1
//   bun scripts/grid-calibration.ts round-2 --variant light,3.3,0.05 --variant standard,3.4,0
//
// Files go to out/grid-calibration/<round>/ unless --out says otherwise.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Module from "manifold-3d";
import { roundOne, roundTwo, type Part } from "../src/core/grid/calibration.ts";
import { toStl } from "../src/core/grid/stl.ts";
import { VARIANTS, type Variant } from "../src/core/grid/tile.ts";

/** g/cm³, for a rough weight before the scales say otherwise. */
const PETG = 1.27;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    variant: { type: "string", multiple: true },
  },
});

const round = positionals[0];
if (round !== "round-1" && round !== "round-2") fail("Say round-1 or round-2.");

const wasm = await Module();
wasm.setup();

let parts: Part[];
if (round === "round-1") {
  parts = roundOne(wasm);
} else {
  const usage = "--variant takes <variant>,<hole mm>,<plate fit mm>, e.g. light,3.3,0.05 (negative fit is interference)";
  const variants = (values.variant ?? []).map((v) => {
    const [variant, hole, fit] = v.split(",");
    if (!variant || !(variant in VARIANTS) || !Number(hole) || fit === undefined || Number.isNaN(Number(fit))) fail(`${usage}, not ${v}.`);
    return { variant: variant as Variant, hole: Number(hole), fit: Number(fit) };
  });
  if (!variants.length) fail(`round-2 needs at least one --variant. ${usage}.`);
  parts = roundTwo(wasm, { variants });
}

const out = values.out ?? join("out", "grid-calibration", round);
mkdirSync(out, { recursive: true });
const lines = [`# Grid calibration, ${round}`, "", "Print face-down as exported, in PETG, without supports.", ""];
lines.push("| File | Print | Est. weight each | What it's for |", "|---|---|---|---|");
for (const part of parts) {
  writeFileSync(join(out, `${part.name}.stl`), toStl(part.solid.getMesh(), `dunnage ${part.name}`));
  const grams = (part.solid.volume() / 1000) * PETG;
  lines.push(`| \`${part.name}.stl\` | ${part.copies} | ${grams.toFixed(0)} g | ${part.note} |`);
}
writeFileSync(join(out, "README.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${parts.length} parts to ${out}`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
