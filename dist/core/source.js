import { isMap, isScalar, isSeq, parseDocument, stringify } from "yaml";
/** A value as the files write it: lists and maps in flow style, strings quoted only when they must be. */
export function flow(value) {
    if (Array.isArray(value))
        return `[${value.map(flow).join(", ")}]`;
    if (value !== null && typeof value === "object") {
        const pairs = Object.entries(value).filter(([, v]) => v !== undefined);
        return pairs.length ? `{ ${pairs.map(([k, v]) => `${k}: ${flow(v)}`).join(", ")} }` : "{}";
    }
    // Inside a flow collection, commas and brackets end a plain string, so those are quoted.
    if (typeof value === "string" && /[,[\]{}]/.test(value))
        return JSON.stringify(value);
    return stringify(value, { lineWidth: 0 }).trimEnd();
}
/** Sets the value at `path`, adding it, and any maps on the way, if it isn't there. */
export function setIn(text, path, value) {
    const doc = parseDocument(text);
    // Find the deepest map or list on the path that the file has.
    let node = doc.contents;
    for (let depth = 0; depth < path.length; depth++) {
        const key = path[depth];
        const rest = path.slice(depth + 1);
        if (isMap(node)) {
            const pair = pairOf(node, key);
            if (!pair)
                return insertPair(text, node, String(key), nest(rest, value));
            if (rest.length === 0 || !(isMap(pair.value) || isSeq(pair.value))) {
                return replace(text, pair.value, pair, nest(rest, value));
            }
            node = pair.value;
        }
        else if (isSeq(node) && typeof key === "number" && node.items[key]) {
            const item = node.items[key];
            if (rest.length === 0 || !(isMap(item) || isSeq(item)))
                return replace(text, item, null, nest(rest, value));
            node = item;
        }
        else {
            throw new Error(`can't set ${path.join(".")}: there's no map or list at ${path.slice(0, depth).join(".") || "the top"}`);
        }
    }
    throw new Error(`can't set the whole file`);
}
/** Removes the field at `path`. A missing field leaves the file as it is. */
export function deleteIn(text, path) {
    const doc = parseDocument(text);
    const parent = doc.getIn(path.slice(0, -1), true);
    if (!isMap(parent))
        return text;
    const index = parent.items.findIndex((pair) => keyOf(pair) === String(path.at(-1)));
    if (index < 0)
        return text;
    const pair = parent.items[index];
    if (parent.flow) {
        // `, key: value`, or for the first field, `key: value, `.
        const [start, end] = index > 0 ? [valueEnd(parent.items[index - 1]), valueEnd(pair)] : [keyStart(pair), keyStart(parent.items[1]) ?? valueEnd(pair)];
        return text.slice(0, start) + text.slice(end);
    }
    return text.slice(0, lineStart(text, keyStart(pair))) + text.slice(lineEnd(text, valueEnd(pair)));
}
/** Adds `value` to the end of the list at `path`, starting the list if it isn't there. */
export function appendIn(text, path, value) {
    const list = parseDocument(text).getIn(path, true);
    if (!isSeq(list))
        return setIn(text, path, [value]);
    const isMapValue = value !== null && typeof value === "object" && !Array.isArray(value);
    if (list.items.length === 0 && isMapValue)
        return unfold(text, range(list), (indent) => entry(value, indent));
    if (list.flow)
        return setIn(text, path, [...list.toJSON(), value]);
    const last = list.items.at(-1);
    const first = list.items[0];
    const indent = text.indexOf("-", lineStart(text, range(first)[0])) - lineStart(text, range(first)[0]);
    const at = lineEnd(text, range(last)[1]);
    // Entries are spaced with blank lines between them when the ones before are.
    const spaced = text.slice(0, lineStart(text, range(last)[0])).endsWith("\n\n");
    return text.slice(0, at) + (spaced ? "\n" : "") + entry(value, indent) + text.slice(at);
}
/** Removes the entry at `path` from its list. */
export function removeIn(text, path) {
    const doc = parseDocument(text);
    const list = doc.getIn(path.slice(0, -1), true);
    const index = path.at(-1);
    if (!isSeq(list) || typeof index !== "number" || !list.items[index])
        return text;
    if (list.flow)
        return setIn(text, path.slice(0, -1), list.toJSON().filter((_, i) => i !== index));
    if (list.items.length === 1) {
        // An empty list, written `key: []`, not a key with nothing after it.
        const [start, end] = range(list);
        const colon = text.lastIndexOf(":", start);
        return text.slice(0, colon) + ": []" + text.slice(lineEnd(text, end) - 1);
    }
    const item = list.items[index];
    let start = lineStart(text, range(item)[0]);
    if (text.slice(0, start).endsWith("\n\n"))
        start -= 1;
    return text.slice(0, start) + text.slice(lineEnd(text, range(item)[1]));
}
/** The lines, counting from 1, that the entry at `path` spans; null when it isn't there. */
export function linesOf(text, path) {
    const node = parseDocument(text).getIn(path, true);
    if (!node?.range)
        return null;
    const [start, end] = range(node);
    const line = (at) => text.slice(0, at).split("\n").length;
    return [line(lineStart(text, start)), line(text[end - 1] === "\n" ? end - 1 : end)];
}
// --- Helpers -------------------------------------------------------------------------------
/** `value` wrapped in maps for each key left on the path. */
function nest(rest, value) {
    return rest.reduceRight((inner, key) => ({ [key]: inner }), value);
}
function keyOf(pair) {
    return String(isScalar(pair.key) ? pair.key.value : pair.key);
}
function pairOf(map, key) {
    return map.items.find((pair) => keyOf(pair) === String(key));
}
function range(node) {
    return node.range;
}
function keyStart(pair) {
    return pair ? range(pair.key)[0] : undefined;
}
function valueEnd(pair) {
    return pair.value ? range(pair.value)[1] : range(pair.key)[1];
}
function lineStart(text, at) {
    return text.lastIndexOf("\n", at - 1) + 1;
}
/** Just past the end of the line `at` is on, newline included. A position just past a newline is on the line before. */
function lineEnd(text, at) {
    const from = at > 0 && text[at - 1] === "\n" ? at - 1 : at;
    const newline = text.indexOf("\n", from);
    return newline < 0 ? text.length : newline + 1;
}
/** Replaces a value where it stands. With no value (`key:` and nothing after it), writes one after the key. */
function replace(text, node, pair, value) {
    if (!node || !node.range) {
        const end = range(pair.key)[1];
        const colon = text.indexOf(":", end) + 1;
        return text.slice(0, colon) + " " + flow(value) + text.slice(colon);
    }
    const [start, end] = range(node);
    // A block value's range runs to the end of its last line; keep that line break.
    const stop = text[end - 1] === "\n" ? end - 1 : end;
    return text.slice(0, start) + flow(value) + text.slice(stop);
}
/** Adds `key: value` to a map: before its `why`, which reads best last, or at the end. */
function insertPair(text, map, key, value) {
    const field = `${key}: ${flow(value)}`;
    const why = map.items.find((pair) => keyOf(pair) === "why");
    if (map.flow && map.items.length === 0)
        return unfold(text, range(map), (indent) => `${" ".repeat(indent)}${field}\n`);
    if (map.flow) {
        if (why)
            return text.slice(0, keyStart(why)) + `${field}, ` + text.slice(keyStart(why));
        if (map.items.length === 0) {
            const brace = text.indexOf("{", range(map)[0]) + 1;
            return text.slice(0, brace) + ` ${field} ` + text.slice(brace).replace(/^\s*/, "");
        }
        const end = valueEnd(map.items.at(-1));
        return text.slice(0, end) + `, ${field}` + text.slice(end);
    }
    if (map.items.length === 0)
        throw new Error(`can't add ${key} to an empty map`);
    const indent = " ".repeat(range(map.items[0].key)[0] - lineStart(text, range(map.items[0].key)[0]));
    if (why) {
        const at = lineStart(text, keyStart(why));
        return text.slice(0, at) + `${indent}${field}\n` + text.slice(at);
    }
    const at = lineEnd(text, valueEnd(map.items.at(-1)));
    const before = text.slice(0, at);
    return before + (before.endsWith("\n") || before === "" ? "" : "\n") + `${indent}${field}\n` + text.slice(at);
}
/**
 * Rewrites an empty `[]` or `{}` as a block, its first entry on the next line and indented under
 * its key. A comment after it stays on the key's line.
 */
function unfold(text, [start, end], lines) {
    const from = lineStart(text, start);
    const indent = text.slice(from).search(/\S/) + 2;
    const stop = text[end - 1] === "\n" ? end - 1 : end;
    const after = lineEnd(text, stop);
    const rest = text.slice(stop, after).replace(/\n$/, "");
    return text.slice(0, start).replace(/ +$/, "") + rest + "\n" + lines(indent) + text.slice(after);
}
/** A new list entry: a map as one field a line, anything else on one line. */
function entry(value, indent) {
    const pad = " ".repeat(indent);
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return `${pad}- ${flow(value)}\n`;
    const fields = Object.entries(value).filter(([, v]) => v !== undefined);
    return fields.map(([k, v], i) => `${pad}${i === 0 ? "- " : "  "}${k}: ${flow(v)}\n`).join("");
}
