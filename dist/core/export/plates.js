// Shelf packing: parts in rows across the bed, the deepest first, a new plate when a row won't fit.
/**
 * Lays copies out on as many plates as they take, inside `margin` of the bed's edge and `gap` apart.
 * Throws when one part is bigger than the bed.
 */
export function plates(items, bed, margin, gap) {
    const [x0, y0, x1, y1] = [margin, margin, bed[0] - margin, bed[1] - margin];
    const copies = items
        .flatMap((item) => Array.from({ length: item.copies }, () => item))
        .sort((a, b) => b.size[1] - a.size[1] || b.size[0] - a.size[0]);
    const out = [];
    let plate = [];
    let [x, y, rowDepth] = [x0, y0, 0];
    for (const { key, size: [w, d] } of copies) {
        if (w > x1 - x0 || d > y1 - y0)
            throw new Error(`${key} is ${w.toFixed(1)} × ${d.toFixed(1)} mm, and the bed has ${x1 - x0} × ${y1 - y0} mm inside its margin`);
        if (x + w > x1)
            [x, y, rowDepth] = [x0, y + rowDepth + gap, 0];
        if (y + d > y1) {
            out.push(plate);
            [plate, x, y, rowDepth] = [[], x0, y0, 0];
        }
        plate.push({ key, at: [x, y] });
        x += w + gap;
        rowDepth = Math.max(rowDepth, d);
    }
    if (plate.length > 0)
        out.push(plate);
    return out;
}
