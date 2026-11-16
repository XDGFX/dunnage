import { fixingsOf, holderSide } from "./export/fixings.ts";
import type { BoardLayout } from "./grid/layout.ts";
import type { Fit } from "./grid/parameters.ts";
import { pretty, type Plan, type PlannedHolder } from "./plan.ts";
import type { Pose } from "./schema.ts";

const poseText = (pose: Pose) => (typeof pose === "object" ? `tilted ${pose.tilt}°` : pose);

/** The grid board a holder is fixed to, for its fixings' positions and sizes. */
export interface SpecBoard {
  layout: BoardLayout;
  fit: Fit;
}

/**
 * A custom or ply holder's spec sheet, in Markdown: everything needed to build it elsewhere, in
 * Fusion or Blender, or from plywood. Origin is the drawer's front-left floor corner; x right,
 * y back, z up; mm.
 */
export function specSheet(p: Plan, h: PlannedHolder, drawerName: string, board?: SpecBoard): string {
  const r = h.rect;
  const spec = h.source.method === "custom" ? h.source.spec : undefined;
  const ply = h.method === "ply";
  const lines: (string | null)[] = [
    `# ${pretty(h.id)}: ${ply ? "ply" : "custom"} holder spec`,
    "",
    `Drawer: ${drawerName}, ${p.width} × ${p.depth} × ${p.height} mm inside, ${p.base.name.toLowerCase()}.`,
    `Purpose: ${spec?.purpose ?? (ply ? `hold ${h.things.map((t) => t.name).join(", ")} in plywood, routed part-way to its shape` : "not given")}`,
    spec?.contact ? `Contact: ${spec.contact}` : null,
    `Clearance: ${spec?.clearance ?? 1} mm per side`,
    `Build in: ${spec?.build ?? (ply ? "plywood, cut to the footprint and routed" : "Fusion or Blender")}`,
    "",
    "## What it holds",
  ];
  for (const t of h.things) {
    const shape = "cylinder" in t.item ? `cylinder Ø${t.item.cylinder[0]} × ${t.item.cylinder[1]} mm` : `box ${t.item.box.join(" × ")} mm`;
    lines.push(`- ${t.name}: ${shape}, ${poseText(t.pose)}${t.rotate ? `, turned ${t.rotate}°` : ""}; centre at (${t.x}, ${t.y}); top at ${Math.round(t.z0 + t.shape.height)} mm.`);
  }
  if (r) {
    lines.push("", "## Space available", `- Footprint: ${Math.round(r.x1 - r.x0)} × ${Math.round(r.y1 - r.y0)} mm, front-left corner at (${Math.round(r.x0)}, ${Math.round(r.y0)}).`);
    lines.push(`- Height: up to ${p.height - p.base.z} mm above the ${p.base.z ? "base" : "drawer floor"}, less what it holds.`);
    if (h.travel) lines.push(`- Free space round it: ${Math.round(h.travel.L)} mm left, ${Math.round(h.travel.R)} right, ${Math.round(h.travel.F)} front, ${Math.round(h.travel.B)} back.`);
  }
  const fixings = board ? fixingsOf([h.source], board.layout) : [];
  if (board && fixings.length > 0) {
    lines.push("", "## Fixings to the grid");
    for (const f of fixings) {
      lines.push(`- ${f.by === "screw" ? "Screw" : "Pin"} in hole [${f.hole.join(", ")}], centre at (${round(f.at[0])}, ${round(f.at[1])}): ${holderSide(f.by, board.layout, board.fit)}.`);
    }
  }
  lines.push("", "Origin is the front-left corner of the drawer floor; x right, y back, z up; mm.", "");
  return lines.filter((line) => line !== null).join("\n");
}

const round = (mm: number) => Number(mm.toFixed(2));
