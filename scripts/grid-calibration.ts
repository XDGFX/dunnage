// Writes the grid base test prints for #7 as STLs, with a parts list.
//
//   bun scripts/grid-calibration.ts round-1
//   bun scripts/grid-calibration.ts round-2 --variant light,3.3,0.05,0.6 --variant standard,3.4,0,1.2
//
// Files go to out/grid-calibration/<round>/ unless --out says otherwise.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Module from "manifold-3d";
import { NOMINAL_HOLE, SKINS, roundOne, roundTwo, variantList, type Part } from "../src/core/grid/calibration.ts";
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
if (round !== "round-1" && round !== "round-2") fail("Say round-1 or round-2.");

const wasm = await Module();
wasm.setup();

let parts: Part[];
if (round === "round-1") {
  parts = roundOne(wasm);
} else {
  const usage = "--variant takes <variant>,<hole mm>,<plate fit mm>,<skin mm>, e.g. light,3.3,0.05,0.6 (negative fit is interference)";
  const variants = (values.variant ?? []).map((v) => {
    const [variant, hole, fit, skin] = v.split(",");
    if (!variant || !(variant in VARIANTS) || !Number(hole) || fit === undefined || Number.isNaN(Number(fit)) || !Number(skin)) {
      fail(`${usage}, not ${v}.`);
    }
    return { variant: variant as Variant, hole: Number(hole), fit: Number(fit), skin: Number(skin) };
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
if (round === "round-1") {
  // What each option would weigh as a full tile, to set against how its test piece feels.
  lines.push("", "## A full 25 × 25 tile, estimated", "", `| Variant | ${SKINS.map((s) => `${s} mm skin`).join(" | ")} |`, `|---|${SKINS.map(() => "---|").join("")}`);
  for (const variant of variantList) {
    const weights = SKINS.map((skin) => {
      const full = tile(wasm, { variant, nx: 25, ny: 25, hole: NOMINAL_HOLE[variant], skin });
      return `${((full.volume() / 1000) * PETG).toFixed(0)} g`;
    });
    lines.push(`| ${variant} (${VARIANTS[variant].wall} mm wall) | ${weights.join(" | ")} |`);
  }
}
writeFileSync(join(out, "README.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${parts.length} parts to ${out}`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
