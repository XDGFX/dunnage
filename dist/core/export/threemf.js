import { strToU8, zipSync } from "fflate";
export const MODEL_PATH = "3D/3dmodel.model";
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/${MODEL_PATH}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`;
export function model(parts, title) {
    const out = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<model unit="millimeter" xml:lang="en-GB" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`,
        `<metadata name="Title">${escape(title)}</metadata>`,
        `<metadata name="Application">dunnage</metadata>`,
        `<resources>`,
    ];
    parts.forEach((part, n) => {
        const { numProp, vertProperties: v, triVerts: t } = part.mesh;
        out.push(`<object id="${n + 1}" type="model" name="${escape(part.name)}"><mesh><vertices>`);
        for (let i = 0; i < v.length; i += numProp)
            out.push(`<vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}"/>`);
        out.push(`</vertices><triangles>`);
        for (let i = 0; i < t.length; i += 3)
            out.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
        out.push(`</triangles></mesh></object>`);
    });
    out.push(`</resources>`, `<build>`);
    parts.forEach((part, n) => {
        for (const [x, y, z] of part.at)
            out.push(`<item objectid="${n + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(x)} ${num(y)} ${num(z)}"/>`);
    });
    out.push(`</build>`, `</model>`, ``);
    return out.join("\n");
}
/** A 3MF package, zipped. */
export function to3mf(parts, title) {
    return zipSync({
        "[Content_Types].xml": strToU8(CONTENT_TYPES),
        "_rels/.rels": strToU8(RELS),
        [MODEL_PATH]: strToU8(model(parts, title)),
    });
}
const num = (value) => String(Number(value.toFixed(4)));
function escape(text) {
    return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
}
