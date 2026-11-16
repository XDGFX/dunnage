import { strToU8, zipSync } from "fflate";
import type { TriangleMesh } from "../grid/stl.ts";

// A plain 3MF (the core specification, no slicer extensions): one model in millimetres, one object
// per distinct part, and a build item for each copy placed on the bed.

export interface PlacedPart {
  name: string;
  mesh: TriangleMesh;
  /** Where each copy's origin goes on the bed, in mm. */
  at: readonly (readonly [number, number, number])[];
}

export const MODEL_PATH = "3D/3dmodel.model";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/${MODEL_PATH}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`;

export function model(parts: readonly PlacedPart[], title: string): string {
  const out: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<model unit="millimeter" xml:lang="en-GB" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`,
    `<metadata name="Title">${escape(title)}</metadata>`,
    `<metadata name="Application">dunnage</metadata>`,
    `<resources>`,
  ];
  parts.forEach((part, n) => {
    const { numProp, vertProperties: v, triVerts: t } = part.mesh;
    out.push(`<object id="${n + 1}" type="model" name="${escape(part.name)}"><mesh><vertices>`);
    for (let i = 0; i < v.length; i += numProp) out.push(`<vertex x="${num(v[i]!)}" y="${num(v[i + 1]!)}" z="${num(v[i + 2]!)}"/>`);
    out.push(`</vertices><triangles>`);
    for (let i = 0; i < t.length; i += 3) out.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
    out.push(`</triangles></mesh></object>`);
  });
  out.push(`</resources>`, `<build>`);
  parts.forEach((part, n) => {
    for (const [x, y, z] of part.at) out.push(`<item objectid="${n + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(x)} ${num(y)} ${num(z)}"/>`);
  });
  out.push(`</build>`, `</model>`, ``);
  return out.join("\n");
}

/** A 3MF package, zipped. */
export function to3mf(parts: readonly PlacedPart[], title: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(RELS),
    [MODEL_PATH]: strToU8(model(parts, title)),
  });
}

const num = (value: number) => String(Number(value.toFixed(4)));

function escape(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
