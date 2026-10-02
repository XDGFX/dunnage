import type { TSchema } from "typebox";
import Value from "typebox/value";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Document } from "yaml";
import { FORMATS, migrate, readHeader } from "./format.ts";
import { Drawer, Printer, PRINTER_PRESETS } from "./schema.ts";
import { bounds, outline, overlap, poseName, posesOf, rectangle, samePose, writtenPose, type Part } from "./shape.ts";

/** Something wrong with a file: where it is, as a path such as `layout[3].at` and a line, and what to fix. */
export interface Problem {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface CheckResult {
  /** The format the file is in once read, such as `drawer/0.2`. Absent when the format line is unreadable. */
  format?: string;
  /** The format the file was written in, when it was older and has been migrated. */
  migratedFrom?: string;
  problems: Problem[];
}

export type LoadedPrinter = Printer & { bed: [number, number, number] };
export type DunnageFile = { kind: "drawer"; drawer: Drawer } | { kind: "printer"; printer: LoadedPrinter };

export class FormatError extends Error {
  readonly problems: Problem[];

  constructor(problems: Problem[]) {
    super(problems.map((problem) => (problem.path ? `${problem.path}: ${problem.message}` : problem.message)).join("\n"));
    this.name = "FormatError";
    this.problems = problems;
  }
}

export interface CheckOptions {
  /**
   * Whether the printer profile a drawer names, `<name>.printer.yml`, is beside it. The core
   * can't look at files, so without this the name goes unchecked.
   */
  printerExists?: (name: string) => boolean;
}

/** Reads a drawer or printer file and reports everything wrong with it. */
export function check(text: string, options: CheckOptions = {}): CheckResult {
  return inspect(text, options).result;
}

/** Reads a drawer or printer file, migrated to the current format. Throws a `FormatError` if anything is wrong. */
export function load(text: string): DunnageFile {
  const { result, file } = inspect(text, {});
  if (result.problems.length > 0 || !file) throw new FormatError(result.problems);
  return file;
}

type Path = (string | number)[];

/** A problem before it is placed in the file. `key` points at a field of `at` that should not be there. */
interface Issue {
  at: Path;
  key?: string;
  message: string;
}

function inspect(text: string, options: CheckOptions): { result: CheckResult; file?: DunnageFile } {
  const lines = new LineCounter();
  const yaml = parseDocument(text, { lineCounter: lines });
  if (yaml.errors.length > 0) {
    const problems = yaml.errors.map((error) => {
      const [position] = error.linePos ?? [];
      return { path: "", message: error.message.split("\n")[0], line: position?.line, column: position?.col };
    });
    return { result: { problems } };
  }

  const place = (issues: Issue[]) => dedupe(issues.map((issue) => locate(yaml, lines, issue)));
  const original: unknown = yaml.toJS();

  let header;
  try {
    header = readHeader(original);
  } catch (error) {
    return { result: { problems: place([{ at: ["format"], message: (error as Error).message }]) } };
  }

  const { kind, version } = header;
  const format = `${kind}/${FORMATS[kind]}`;
  const migratedFrom = version === FORMATS[kind] ? undefined : `${kind}/${version}`;
  let document;
  try {
    document = migrate(original as Record<string, unknown>, kind, version);
  } catch (error) {
    return { result: { problems: place([{ at: ["format"], message: (error as Error).message }]) } };
  }

  const schema = kind === "drawer" ? Drawer : Printer;
  const invalid = schemaIssues(schema, document);
  if (invalid.length > 0) return { result: { format, migratedFrom, problems: place(invalid) } };

  if (kind === "drawer") {
    const drawer = document as Drawer;
    return { result: { format, migratedFrom, problems: place(drawerIssues(drawer, options)) }, file: { kind, drawer } };
  }
  const printer = document as Printer;
  const bed = printer.bed ?? (printer.preset ? PRINTER_PRESETS[printer.preset as keyof typeof PRINTER_PRESETS] : undefined);
  const problems = place(
    bed ? [] : [{ at: [], message: `needs a \`bed\`, or a \`preset\` to take one from: ${Object.keys(PRINTER_PRESETS).join(", ")}` }],
  );
  return { result: { format, migratedFrom, problems }, file: bed ? { kind, printer: { ...printer, bed: [...bed] } } : undefined };
}

// --- Schema --------------------------------------------------------------------------------

interface SchemaError {
  keyword: string;
  schemaPath: string;
  instancePath: string;
  params: Record<string, unknown>;
  message: string;
}

const ID_PATTERN = "^[a-z0-9][a-z0-9-]*$";

function schemaIssues(schema: TSchema, value: unknown): Issue[] {
  // TypeBox reports `additionalProperties: false` twice; the "boolean" copy says less.
  // An unmatched union is reported through its branches, so its own error adds nothing.
  const errors = (Value.Errors(schema, value) as SchemaError[]).filter((error) => error.keyword !== "boolean" && error.keyword !== "anyOf");
  return narrowUnions(errors, schema, value).flatMap((error) => explain(error, schema, value));
}

/**
 * A value that matches no branch of a union gets errors from every branch, most of them beside
 * the point. Keep the branch the author meant: the one whose distinguishing fields (a `method`,
 * a `kind`, a `box` or `cylinder`) match. When none does, say what the field may be instead.
 */
function narrowUnions(errors: SchemaError[], root: TSchema, value: unknown, done = new Set<string>()): SchemaError[] {
  const keyOf = (union: Union) => `${union.schemaPath}|${union.instancePath}`;
  let target: Union | undefined;
  for (const error of errors) {
    const union = unionsOf(error).find((candidate) => !done.has(keyOf(candidate)));
    if (union && (!target || union.schemaPath.length < target.schemaPath.length)) target = union;
  }
  if (!target) return errors;
  const union = target;
  done.add(keyOf(union));

  const branchOf = (error: SchemaError) => unionsOf(error).find((candidate) => keyOf(candidate) === keyOf(union))?.branch;
  const inside = errors.filter((error) => branchOf(error) !== undefined);
  const rest = errors.filter((error) => branchOf(error) === undefined);
  const options = (resolve(root, union.schemaPath) as { anyOf: TSchema[] }).anyOf;
  const branches = options.map((_, index) => inside.filter((error) => branchOf(error) === index));
  const next = (picked: SchemaError[]) => narrowUnions([...rest, ...picked], root, value, done);

  const enumOf = (instancePath: string, allowedValues: string[]): SchemaError => ({
    keyword: "enum",
    schemaPath: union.schemaPath,
    instancePath,
    params: { allowedValues },
    message: "",
  });

  // A plain value, such as a pose or a status: list what it may be.
  if (typeof valueAt(value, union.instancePath) !== "object") {
    return next([enumOf(union.instancePath, options.map(describeOption))]);
  }

  // Objects told apart by one fixed field, such as `method`: take the branch it names, or list
  // what it may be.
  const fixed = (option: TSchema, field: string) => (option as { properties?: Record<string, { const?: unknown }> }).properties?.[field]?.const;
  const tag = Object.keys((options[0] as { properties?: object }).properties ?? {}).find((field) =>
    options.every((option) => fixed(option, field) !== undefined),
  );
  if (tag) {
    const chosen = options.findIndex((option) => fixed(option, tag) === valueAt(value, `${union.instancePath}/${tag}`));
    if (chosen >= 0) return next(branches[chosen]);
    return next([enumOf(`${union.instancePath}/${tag}`, options.map((option) => String(fixed(option, tag))))]);
  }

  // Otherwise the branch with the fewest, slightest errors: a missing field counts for more.
  const score = (branch: SchemaError[]) => branch.reduce((total, error) => total + (error.keyword === "required" ? 10 : 1), 0);
  return next(branches.reduce((a, b) => (score(b) < score(a) ? b : a)));
}

interface Union {
  schemaPath: string;
  instancePath: string;
  branch: number;
}

/**
 * The unions an error sits inside, outermost first. TypeBox doesn't always report the union
 * itself, so each is found from an `anyOf/<n>` step in the error's schema path, and its place in
 * the value by walking back over the steps after it that go into the value.
 */
function unionsOf(error: SchemaError): Union[] {
  const unions: Union[] = [];
  const instance = pointer(error.instancePath);
  for (const match of error.schemaPath.matchAll(/\/anyOf\/(\d+)/g)) {
    const after = pointer(error.schemaPath.slice(match.index + match[0].length));
    const depth = instance.length - stepsIntoValue(after);
    unions.push({
      schemaPath: error.schemaPath.slice(0, match.index),
      instancePath: instance.slice(0, depth).map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`).join(""),
      branch: Number(match[1]),
    });
  }
  return unions;
}

/** How many steps into the value a run of schema path steps takes. */
function stepsIntoValue(steps: string[]): number {
  let depth = 0;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (step === "properties" || step === "patternProperties") {
      depth++;
      index++;
    } else if (step === "items" || step === "prefixItems") {
      depth++;
      if (/^\d+$/.test(steps[index + 1] ?? "")) index++;
    } else if (step === "additionalProperties" || step === "additionalItems") {
      depth++;
    } else if (step === "anyOf" || step === "allOf" || step === "oneOf") {
      index++;
    }
  }
  return depth;
}

function describeOption(option: TSchema): string {
  const schema = option as { const?: unknown; type?: string; required?: string[] };
  if ("const" in schema) return String(schema.const);
  if (schema.type === "object") return `{ ${(schema.required ?? []).join(", ")}: … }`;
  return schema.type ?? "something else";
}

function explain(error: SchemaError, root: TSchema, value: unknown): Issue[] {
  const at = toPath(value, error.instancePath);
  const { params } = error;
  switch (error.keyword) {
    case "required":
      return [{ at, message: `missing ${(params.requiredProperties as string[]).map((key) => `\`${key}\``).join(", ")}` }];
    case "additionalProperties": {
      const schema = resolve(root, error.schemaPath) as { properties?: object; patternProperties?: object };
      return (params.additionalProperties as string[]).map((key) => ({
        at,
        key,
        message: schema.patternProperties
          ? `\`${key}\` isn't a valid id: use lower case letters, digits and hyphens`
          : `unknown field \`${key}\`; the fields here are ${Object.keys(schema.properties ?? {}).join(", ")}`,
      }));
    }
    case "enum": {
      const actual = valueAt(value, error.instancePath);
      return [{ at, message: `must be one of ${(params.allowedValues as string[]).join(", ")}, not ${JSON.stringify(actual)}` }];
    }
    case "const":
      return [{ at, message: `must be ${JSON.stringify(params.allowedValue)}` }];
    case "pattern":
      if (params.pattern === ID_PATTERN) return [{ at, message: `${JSON.stringify(valueAt(value, error.instancePath))} isn't a valid id: use lower case letters, digits and hyphens` }];
  }
  return [{ at, message: error.message }];
}

function resolve(root: unknown, schemaPath: string): unknown {
  return pointer(schemaPath.replace(/^#/, "")).reduce((node, key) => (node as Record<string, unknown>)?.[key], root);
}

function valueAt(value: unknown, instancePath: string): unknown {
  return pointer(instancePath).reduce((node, key) => (node as Record<string, unknown>)?.[key], value);
}

function pointer(path: string): string[] {
  return path === "" ? [] : path.slice(1).split("/").map((key) => key.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** A JSON pointer as path segments, with array indices as numbers. */
function toPath(value: unknown, instancePath: string): Path {
  const path: Path = [];
  let node = value;
  for (const key of pointer(instancePath)) {
    path.push(Array.isArray(node) ? Number(key) : key);
    node = (node as Record<string, unknown>)?.[key];
  }
  return path;
}

// --- What the schema can't say -------------------------------------------------------------

/** Less than this is rounding, not overlap. */
const EPSILON = 0.01;

const mm = (length: number) => `${Number(length.toFixed(1))} mm`;
const list = (ids: Iterable<string>) => [...ids].join(", ") || "none";

function drawerIssues(drawer: Drawer, options: CheckOptions): Issue[] {
  const issues: Issue[] = [];
  const say = (at: Path, message: string) => issues.push({ at, message });

  if (drawer.printer !== undefined && options.printerExists && !options.printerExists(drawer.printer)) {
    say(["printer"], `no printer profile ${drawer.printer}.printer.yml beside this file`);
  }
  const holders = drawer.holders ?? [];
  const zones = drawer.zones ?? {};
  const items = new Map(Object.entries(drawer.items));

  for (const [id, item] of items) {
    if (item.poses && !samePose(item.poses[0], writtenPose(item))) {
      say(["items", id, "poses", 0], `the first pose is how the shape is written, so it must be ${writtenPose(item)}`);
    }
  }

  // Things and holders share one set of ids, so a comment or concern can point at either.
  const owners = new Map<string, Path>();
  const claim = (id: string, at: Path) => {
    const owner = owners.get(id);
    if (owner) say(at, `${id} is already the id of ${pathText(owner.slice(0, -1))}`);
    else owners.set(id, at);
  };
  drawer.layout.forEach((thing, index) => claim(thing.id, ["layout", index, "id"]));
  holders.forEach((holder, index) => claim(holder.id, ["holders", index, "id"]));

  // The first thing with an id is the one it means; a repeat is reported above.
  const things = new Map(drawer.layout.map((thing) => [thing.id, { thing, item: items.get(thing.item ?? thing.id) }] as const).reverse());
  const placed = [];
  for (const [index, thing] of drawer.layout.entries()) {
    const itemId = thing.item ?? thing.id;
    const item = items.get(itemId);
    if (thing.zone !== undefined && !Object.hasOwn(zones, thing.zone)) {
      say(["layout", index, "zone"], `${thing.zone} is not a zone. Zones are: ${list(Object.keys(zones))}`);
    }
    if (!item) {
      say(
        ["layout", index, thing.item === undefined ? "id" : "item"],
        thing.item === undefined
          ? `${thing.id} is not an item, so this thing needs an \`item\`. Items are: ${list(items.keys())}`
          : `${itemId} is not an item. Items are: ${list(items.keys())}`,
      );
      continue;
    }
    const poses = posesOf(item);
    if (thing.pose !== undefined && !poses.some((pose) => samePose(pose, thing.pose!))) {
      say(["layout", index, "pose"], `${itemId} can't sit ${poseName(thing.pose)}; it sits ${poses.map(poseName).join(" or ")}`);
      continue;
    }
    if ((thing.stack ?? 1) > 1 && thing.pose !== undefined && !samePose(thing.pose, poses[0])) {
      say(["layout", index, "stack"], `only a ${itemId} sitting ${poseName(poses[0])} stacks`);
    }
    if (!thing.aside) placed.push({ index, thing, outline: outline(thing, item) });
  }

  // Things fit inside the drawer, clear of its obstructions and of each other.
  const [width, depth, height] = drawer.drawer.inside;
  const margin = drawer.rules?.edge_margin ?? 0;
  const obstructions = (drawer.drawer.obstructions ?? []).map((obstruction, index) => ({
    name: obstruction.name ?? `obstruction ${index + 1}`,
    part: rectangle([obstruction.at[0] + obstruction.size[0] / 2, obstruction.at[1] + obstruction.size[1] / 2], obstruction.size),
  }));
  const deepest = (a: Part[], b: Part[]) => Math.max(0, ...a.flatMap((p) => b.map((q) => overlap(p, q))));

  for (const [n, { index, thing, outline: shape }] of placed.entries()) {
    const box = bounds([...shape.parts, ...shape.overhang]);
    const crossed = Object.entries({
      left: margin - box.left,
      right: box.right - (width - margin),
      front: margin - box.front,
      back: box.back - (depth - margin),
    })
      .filter(([, by]) => by > EPSILON)
      .map(([wall, by]) => `the ${wall} wall by ${mm(by)}`);
    if (crossed.length > 0) {
      const counting = margin > 0 ? `, counting the ${mm(margin)} edge margin` : "";
      say(["layout", index, "at"], `${thing.id} crosses ${crossed.join(" and ")}${counting}`);
    }
    if (shape.height > height + EPSILON) {
      say(["layout", index], `${thing.id} is ${mm(shape.height)} tall, and the drawer is ${mm(height)} tall inside`);
    }
    for (const obstruction of obstructions) {
      const by = deepest(shape.parts, [obstruction.part]);
      if (by > EPSILON) say(["layout", index], `${thing.id} overlaps ${obstruction.name} by ${mm(by)}`);
    }
    for (const other of placed.slice(0, n)) {
      const by = deepest(shape.parts, other.outline.parts);
      if (by > EPSILON) say(["layout", index], `${thing.id} overlaps ${other.thing.id} by ${mm(by)}`);
    }
  }

  // Holders hold real things, each thing once, in a way the base allows.
  const base = drawer.base?.kind ?? "bare";
  const holderIds = new Set(holders.map((holder) => holder.id));
  const heldBy = new Map<string, string>();
  for (const [index, holder] of holders.entries()) {
    const needs = { gridfinity: "gridfinity", pegs: "pegboard" }[holder.method as string];
    if (needs && needs !== base) {
      say(["holders", index, "method"], `a ${holder.method} holder needs a ${needs} base, and this drawer's base is ${base}`);
    }
    for (const [slot, id] of holder.holds.entries()) {
      const at = ["holders", index, "holds", slot];
      const held = things.get(id);
      if (!held) {
        const madeFrom = drawer.layout.filter((thing) => (thing.item ?? thing.id) === id).map((thing) => thing.id);
        say(
          at,
          items.has(id)
            ? `${id} is an item, and a holder holds things in the layout: ${madeFrom.length > 0 ? `here, ${list(madeFrom)}` : "none is one"}`
            : holderIds.has(id)
              ? `${id} is a holder, and a holder holds things in the layout`
              : `${id} is not a thing in the layout. Things are: ${list(things.keys())}`,
        );
        continue;
      }
      const other = heldBy.get(id);
      if (other) say(at, `${id} is already held by ${other}`);
      else heldBy.set(id, holder.id);
      if (holder.method === "peg" && held.item && !held.item.outlet) {
        say(at, `${id} has no \`outlet\` for a peg to go through`);
      }
    }
  }

  // The review points at things that exist.
  const review = drawer.review ?? {};
  const known = new Set([
    ...owners.keys(),
    ...items.keys(),
    ...Object.keys(zones),
    ...(review.questions ?? []).map((question) => question.id),
    ...(review.concerns ?? []).map((concern) => concern.id),
  ]);
  const reviewIds = new Map<string, string>();
  for (const [section, entries] of [["questions", review.questions ?? []], ["concerns", review.concerns ?? []]] as const) {
    for (const [index, { id }] of entries.entries()) {
      const owner = reviewIds.get(id);
      if (owner) say(["review", section, index, "id"], `${id} is already the id of ${owner}`);
      else reviewIds.set(id, `review.${section}[${index}]`);
    }
  }
  for (const [index, concern] of (review.concerns ?? []).entries()) {
    for (const [slot, id] of concern.on.entries()) {
      if (!known.has(id)) say(["review", "concerns", index, "on", slot], `${id} is not an id in this file`);
    }
    for (const [slot, id] of (concern.act?.aside ?? []).entries()) {
      if (!things.has(id)) say(["review", "concerns", index, "act", "aside", slot], `${id} is not a thing in the layout`);
    }
  }
  for (const [index, comment] of (review.comments ?? []).entries()) {
    if (!known.has(comment.on)) say(["review", "comments", index, "on"], `${comment.on} is not an id in this file`);
  }

  return issues;
}

// --- Placing problems in the file ----------------------------------------------------------

function pathText(path: Path): string {
  return path.map((key, index) => (typeof key === "number" ? `[${key}]` : index === 0 ? key : `.${key}`)).join("");
}

/** Finds the line an issue is about: the key of the deepest field on its path that the file has. */
function locate(yaml: Document, lines: LineCounter, { at, key, message }: Issue): Problem {
  let node: unknown = yaml.contents;
  let offset = (yaml.contents?.range?.[0]) ?? 0;
  for (const segment of key === undefined ? at : [...at, key]) {
    if (isMap(node)) {
      const pair = node.items.find((item) => String(isScalar(item.key) ? item.key.value : item.key) === String(segment));
      if (!pair) break;
      offset = (pair.key as { range?: [number, number, number] }).range?.[0] ?? offset;
      node = pair.value;
    } else if (isSeq(node) && typeof segment === "number" && node.items[segment]) {
      node = node.items[segment];
      offset = (node as { range?: [number, number, number] }).range?.[0] ?? offset;
    } else {
      break;
    }
  }
  const { line, col } = lines.linePos(offset);
  return { path: pathText(at), message, line, column: col };
}

function dedupe(problems: Problem[]): Problem[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const key = `${problem.path}\0${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
