// Writes the grid base test prints for #7 as STLs, with a parts list.
//
//   bun scripts/grid-calibration.ts round-1
//   bun scripts/grid-calibration.ts round-2 --variant light,3.3,0.6
//   bun scripts/grid-calibration.ts round-3 --variant light,3.3,0.6,0.3
//
// A variant is <variant>,<hole mm>,<skin mm>, and for round 3 the joiner fit too (negative is
// interference). Files go to out/grid-calibration/<round>/ unless --out says otherwise.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Module from "manifold-3d";
import { roundOne, roundThree, roundTwo, variantList, type Part } from "../src/core/grid/calibration.ts";
import { toStl } from "../src/core/grid/stl.ts";
import { VARIANTS, tile, type Variant } from "../src/core/grid/tile.ts";

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
if (round !== "round-1" && round !== "round-2" && round !== "round-3") fail("Say round-1, round-2 or round-3.");

const wasm = await Module();
wasm.setup();

let parts: Part[];
if (round === "round-1") {
  parts = roundOne(wasm);
} else {
  const withFit = round === "round-3";
  const usage = `--variant takes <variant>,<hole mm>,<skin mm>${withFit ? ",<joiner fit mm>" : ""}, e.g. light,3.3,0.6${withFit ? ",0.3" : ""}`;
  const choices = (values.variant ?? []).map((v) => {
    const [variant, hole, skin, fit] = v.split(",");
    const bad = !variant || !(variant in VARIANTS) || !Number(hole) || !Number(skin) || (withFit && (fit === undefined || Number.isNaN(Number(fit))));
    if (bad) fail(`${usage}, not ${v}.`);
    return { variant: variant as Variant, hole: Number(hole), skin: Number(skin), fit: Number(fit) };
  });
  if (!choices.length) fail(`${round} needs at least one --variant. ${usage}.`);
  parts = withFit ? roundThree(wasm, choices) : roundTwo(wasm, choices);
}

const out = values.out ?? join("out", "grid-calibration", round);
mkdirSync(out, { recursive: true });
const lines = [`# Grid calibration, ${round}`, "", "Print as exported, in PETG, without supports.", ""];
lines.push("| File | Print | Est. weight each | What it's for |", "|---|---|---|---|");
for (const part of parts) {
  writeFileSync(join(out, `${part.name}.stl`), toStl(part.solid.getMesh(), `dunnage ${part.name}`));
  const grams = (part.solid.volume() / 1000) * PETG;
  lines.push(`| \`${part.name}.stl\` | ${part.copies} | ${grams.toFixed(0)} g | ${part.note} |`);
}
if (round === "round-1") {
  // What each wall and skin would weigh as a full tile, to set against how the strips feel.
  const skins = [0.6, 1.2];
  lines.push("", "## A full 25 × 25 tile, estimated", "", `| Variant | ${skins.map((s) => `${s} mm skin`).join(" | ")} |`, `|---|${skins.map(() => "---|").join("")}`);
  for (const variant of variantList) {
    const weights = skins.map((skin) => `${(((tile(wasm, { variant, nx: 25, ny: 25, hole: 3.3, skin }).volume() / 1000) * PETG)).toFixed(0)} g`);
    lines.push(`| ${variant} (${VARIANTS[variant].wall} mm wall) | ${weights.join(" | ")} |`);
  }
}
writeFileSync(join(out, "README.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${parts.length} parts to ${out}`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
