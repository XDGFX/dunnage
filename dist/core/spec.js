import { fixingsOf, holderSide, round } from "./export/fixings.js";
import { pretty } from "./plan.js";
const poseText = (pose) => (typeof pose === "object" ? `tilted ${pose.tilt}°` : pose);
/** Holders built elsewhere from a spec sheet, rather than fetched from the library. */
export const hasSpecSheet = (method) => method === "custom" || method === "ply";
/** Where a holder's spec sheet is written, inside the export folder. */
export const specPath = (id) => `specs/${id}.md`;
/**
 * A custom or ply holder's spec sheet, in Markdown: everything needed to build it elsewhere, in
 * Fusion or Blender, or from plywood. Origin is the drawer's front-left floor corner; x right,
 * y back, z up; mm.
 */
export function specSheet(drawerPlan, holder, drawerName, board) {
    const rect = holder.rect;
    const spec = holder.source.method === "custom" ? holder.source.spec : undefined;
    const ply = holder.method === "ply";
    const lines = [
        `# ${pretty(holder.id)}: ${ply ? "ply" : "custom"} holder spec`,
        "",
        `Drawer: ${drawerName}, ${drawerPlan.width} × ${drawerPlan.depth} × ${drawerPlan.height} mm inside, ${drawerPlan.base.name.toLowerCase()}.`,
        `Purpose: ${spec?.purpose ?? (ply ? `hold ${holder.things.map((thing) => thing.name).join(", ")} in plywood, routed part-way to its shape` : "not given")}`,
        spec?.contact ? `Contact: ${spec.contact}` : null,
        `Clearance: ${spec?.clearance ?? 1} mm per side`,
        `Build in: ${spec?.build ?? (ply ? "plywood, cut to the footprint and routed" : "Fusion or Blender")}`,
        "",
        "## What it holds",
    ];
    for (const thing of holder.things) {
        const shape = "cylinder" in thing.item ? `cylinder Ø${thing.item.cylinder[0]} × ${thing.item.cylinder[1]} mm` : `box ${thing.item.box.join(" × ")} mm`;
        lines.push(`- ${thing.name}: ${shape}, ${poseText(thing.pose)}${thing.rotate ? `, turned ${thing.rotate}°` : ""}; centre at (${thing.x}, ${thing.y}); top at ${Math.round(thing.z0 + thing.shape.height)} mm.`);
    }
    if (rect) {
        lines.push("", "## Space available", `- Footprint: ${Math.round(rect.x1 - rect.x0)} × ${Math.round(rect.y1 - rect.y0)} mm, front-left corner at (${Math.round(rect.x0)}, ${Math.round(rect.y0)}).`);
        lines.push(`- Height: up to ${drawerPlan.height - drawerPlan.base.z} mm above the ${drawerPlan.base.z ? "base" : "drawer floor"}, less what it holds.`);
        const travel = holder.travel;
        if (travel)
            lines.push(`- Free space round it: ${Math.round(travel.L)} mm left, ${Math.round(travel.R)} right, ${Math.round(travel.F)} front, ${Math.round(travel.B)} back.`);
    }
    const fixings = board ? fixingsOf([holder.source], board.layout) : [];
    if (board && fixings.length > 0) {
        lines.push("", "## Fixings to the grid");
        for (const fixing of fixings) {
            lines.push(`- ${fixing.by === "screw" ? "Screw" : "Pin"} in hole [${fixing.hole.join(", ")}], centre at (${round(fixing.at[0])}, ${round(fixing.at[1])}): ${holderSide(fixing.by, board.layout, board.fit)}.`);
        }
    }
    lines.push("", "Origin is the front-left corner of the drawer floor; x right, y back, z up; mm.", "");
    return lines.filter((line) => line !== null).join("\n");
}
