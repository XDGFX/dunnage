/** The pose an item is written in: its shape's numbers describe it sitting this way. */
export const writtenPose = (item) => ("box" in item ? "flat" : "upright");
export const posesOf = (item) => item.poses ?? [writtenPose(item)];
export const samePose = (a, b) => typeof a === "string" || typeof b === "string" ? a === b : a.tilt === b.tilt;
export const poseName = (pose) => (typeof pose === "string" ? pose : `{ tilt: ${pose.tilt} }`);
const RAD = Math.PI / 180;
/**
 * The thing's footprint before turning, [x, y], and its height. A box is written [w, d, h]
 * flat; a cylinder [diameter, h] upright, and lying it runs front to back. A tilt is lying,
 * raised by that angle. Only the written pose stacks, each extra adding `nest` (or its height).
 */
function footprint(item, pose, stack) {
    const tilt = typeof pose === "object" ? pose.tilt * RAD : 0;
    const stacked = (height) => height + (stack - 1) * (item.nest ?? height);
    if ("cylinder" in item) {
        const [d, h] = item.cylinder;
        if (pose === "upright")
            return { size: [d, d], round: true, height: stacked(h) };
        if (pose === "lying")
            return { size: [d, h], round: false, height: d };
        return { size: [d, h * Math.cos(tilt) + d * Math.sin(tilt)], round: false, height: h * Math.sin(tilt) + d * Math.cos(tilt) };
    }
    const [w, d, h] = item.box;
    if (pose === "flat")
        return { size: [w, d], round: false, height: stacked(h) };
    if (pose === "upright")
        return { size: [w, h], round: false, height: d };
    if (pose === "side")
        return { size: [d, h], round: false, height: w };
    return { size: [w, d * Math.cos(tilt) + h * Math.sin(tilt)], round: false, height: d * Math.sin(tilt) + h * Math.cos(tilt) };
}
/** A w × d rectangle centred at `centre` plus `offset` (in the thing's own frame), turned by `angle`. */
export function rectangle(centre, [w, d], angle = 0, offset = [0, 0]) {
    const cos = Math.cos(angle * RAD);
    const sin = Math.sin(angle * RAD);
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    return {
        kind: "polygon",
        points: corners.map(([x, y]) => {
            const [u, v] = [x + offset[0], y + offset[1]];
            return [centre[0] + u * cos - v * sin, centre[1] + u * sin + v * cos];
        }),
    };
}
export function outline(thing, item) {
    const pose = thing.pose ?? posesOf(item)[0];
    const angle = thing.rotate ?? 0;
    const { size, round, height } = footprint(item, pose, thing.stack ?? 1);
    if (!round)
        return { parts: [rectangle(thing.at, size, angle)], overhang: [], height };
    // A handle sits at the front at rotation 0 and a spout at the back, each reaching that far
    // past the body and 8 mm into it so the outline has no seam.
    const radius = size[0] / 2;
    const parts = [{ kind: "circle", centre: thing.at, radius }];
    const overhang = [];
    if ("handle" in item && item.handle) {
        const [width, reach] = item.handle;
        parts.push(rectangle(thing.at, [width, reach + 8], angle, [0, -(radius + reach / 2) + 4]));
    }
    if ("spout" in item && item.spout) {
        const [width, reach] = item.spout;
        overhang.push(rectangle(thing.at, [width, reach + 8], angle, [0, radius + reach / 2 - 4]));
    }
    return { parts, overhang, height };
}
export function bounds(parts) {
    const box = { left: Infinity, right: -Infinity, front: Infinity, back: -Infinity };
    for (const part of parts) {
        const points = part.kind === "circle" ? [part.centre] : part.points;
        const pad = part.kind === "circle" ? part.radius : 0;
        for (const [x, y] of points) {
            box.left = Math.min(box.left, x - pad);
            box.right = Math.max(box.right, x + pad);
            box.front = Math.min(box.front, y - pad);
            box.back = Math.max(box.back, y + pad);
        }
    }
    return box;
}
/** How far two convex parts overlap, along the axis that separates them soonest; 0 if they don't. */
export function overlap(a, b) {
    if (a.kind === "circle" && b.kind === "circle") {
        return Math.max(0, a.radius + b.radius - Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]));
    }
    let least = Infinity;
    for (const axis of [...axes(a, b), ...axes(b, a)]) {
        const [aMin, aMax] = project(a, axis);
        const [bMin, bMax] = project(b, axis);
        least = Math.min(least, Math.min(aMax, bMax) - Math.max(aMin, bMin));
        if (least <= 0)
            return 0;
    }
    return least;
}
/** The axes to test for `part` against `other`: its edge normals, or for a circle, towards `other`'s nearest corner. */
function axes(part, other) {
    if (part.kind === "polygon") {
        return part.points.map(([x1, y1], i) => {
            const [x2, y2] = part.points[(i + 1) % part.points.length];
            return unit([y1 - y2, x2 - x1]);
        });
    }
    if (other.kind === "circle")
        return [];
    const [cx, cy] = part.centre;
    const nearest = other.points.reduce((best, p) => Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? p : best);
    return [unit([nearest[0] - cx, nearest[1] - cy])];
}
function unit([x, y]) {
    const length = Math.hypot(x, y) || 1;
    return [x / length, y / length];
}
function project(part, [nx, ny]) {
    if (part.kind === "circle") {
        const centre = part.centre[0] * nx + part.centre[1] * ny;
        return [centre - part.radius, centre + part.radius];
    }
    const along = part.points.map(([x, y]) => x * nx + y * ny);
    return [Math.min(...along), Math.max(...along)];
}
