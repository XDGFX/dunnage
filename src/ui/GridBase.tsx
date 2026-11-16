import { useState, type FormEvent } from "react";
import {
  bedTile, cornerHoles, deleteIn, DRAWER_PRESETS, drawerShape, GRID, mm, presetName, setDrawerPreset, setIn, setWall, tileSizes, VARIANT_NAMES,
  type BoardLayout, type Drawer, type GridBase as Grid, type Path, type Side, type Variant,
} from "../core/index.ts";
import { Icon } from "./icons.tsx";
import { NumberField } from "./NumberField.tsx";

// The grid base's settings: the drawer it lies in, built-in or measured, and how the board is cut
// into tiles and bumpers.

interface Props {
  drawer: Drawer;
  layout: BoardLayout;
  bed: readonly [number, number, number];
  apply: (edit: (text: string) => string) => void;
}

const WALL_TEXT: Record<Side, string> = { left: "Left wall lean", right: "Right wall lean", front: "Front wall lean", back: "Back wall lean" };

const VARIANT_TEXT: Record<Variant, string> = {
  "light-thin": "Light, thin walls",
  light: "Light",
  "light-thick": "Light, thick walls",
  standard: "Standard",
};

export function GridBase({ drawer, layout, bed, apply }: Props) {
  const base = drawer.base as Grid;
  const shape = drawerShape(drawer.drawer)!;
  const preset = drawer.drawer.preset;
  const set = (path: Path, value: unknown) => apply((text) => setIn(text, path, value));
  const clear = (path: Path) => apply((text) => deleteIn(text, path));
  const [w, d, h] = shape.inside;

  // A pair that leans alike is one field; one that differs is a field a wall, so neither is lost.
  type WallRow = { label: string; value: number; wall: Side | "sides" | "ends" };
  const wallRows = ([["sides", "left", "right", "Side walls lean"], ["ends", "front", "back", "Front and back lean"]] as const).flatMap(([pair, a, b, text]): WallRow[] =>
    shape.walls[a] === shape.walls[b]
      ? [{ label: text, value: shape.walls[a], wall: pair }]
      : [a, b].map((side) => ({ label: WALL_TEXT[side], value: shape.walls[side], wall: side })),
  );

  const split = base.bumpers?.split ?? "even";
  const splitX = split === "even" ? "even" : (split.x ?? "even");
  const splitY = split === "even" ? "even" : (split.y ?? "even");
  const setSplit = (x: string, y: string) => set(["base", "bumpers", "split"], x === "even" && y === "even" ? "even" : { x, y });

  const variant = base.variant ?? GRID.variant;
  const sinks = base.countersinks ?? [];
  const setSinks = (list: [number, number][]) => (list.length ? set(["base", "countersinks"], list) : clear(["base", "countersinks"]));
  const [nx, ny] = layout.holes;
  const corners = cornerHoles(layout) as [number, number][];
  const { columns, rows } = tileSizes(layout);
  // The format takes both axes, so the one left blank is filled in at the bed's largest, as it was.
  const most = bedTile(bed);
  const setTile = (axis: 0 | 1, v: number | undefined) => {
    if (v === undefined) return clear(["base", "tile"]);
    const tile: [number, number] = [base.tile?.[0] ?? most[0], base.tile?.[1] ?? most[1]];
    tile[axis] = v;
    set(["base", "tile"], tile);
  };

  return (
    <div className="grid-base">
      <div className="kv">
        <label htmlFor="g-preset">Drawer<small>A built-in drawer, or your own measurements</small></label>
        <select
          id="g-preset"
          className="select"
          value={preset ?? ""}
          onChange={(e) => apply((text) => setDrawerPreset(text, e.target.value || null))}
        >
          <option value="">Measured by hand</option>
          {Object.keys(DRAWER_PRESETS).map((name) => <option key={name} value={name}>{presetName(name)}</option>)}
        </select>
      </div>
      <p className="note">
        {preset
          ? `Filled in from ${presetName(preset)}. Change any size below to override it.`
          : "Measure the inside at the floor, on top of any liner. Choosing a built-in drawer replaces these sizes; undo brings them back."}
      </p>
      <div className="kv">
        <label>Inside at the floor<small>Width, depth and usable height, mm</small></label>
        <span className="triple">
          <NumberField id="g-w" label="Width" value={w} min={1} width={60} onCommit={(v) => set(["drawer", "inside"], [v, d, h])} />
          <NumberField id="g-d" label="Depth" value={d} min={1} width={60} onCommit={(v) => set(["drawer", "inside"], [w, v, h])} />
          <NumberField id="g-h" label="Height" value={h} min={1} width={60} onCommit={(v) => set(["drawer", "inside"], [w, d, v])} />
        </span>
        {wallRows.map((row, k) => [
          <label key={`l-${row.wall}`} htmlFor={`g-${row.wall}`}>{row.label}{k === 0 && <small>Degrees out from upright</small>}</label>,
          <NumberField key={`f-${row.wall}`} id={`g-${row.wall}`} value={row.value} min={0} max={45} onCommit={(v) => apply((text) => setWall(text, row.wall, v))} />,
        ])}
        <label htmlFor="g-radius">Corner radius<small>Seen from above, mm</small></label>
        <NumberField id="g-radius" value={shape.corner_radius} min={0} step={0.5} onCommit={(v) => set(["drawer", "corner_radius"], Math.max(0, v))} />
        <label htmlFor="g-edge">Floor edge<small>The fillet where the floor meets the walls, mm</small></label>
        <NumberField id="g-edge" value={shape.floor_edge} min={0} step={0.5} onCommit={(v) => set(["drawer", "floor_edge"], Math.max(0, v))} />
      </div>

      <h4>Board</h4>
      <div className="pill sm" role="group" aria-label="Tile variant">
        {VARIANT_NAMES.map((name) => (
          <button key={name} type="button" aria-pressed={variant === name} title={name} onClick={() => (name === GRID.variant ? clear(["base", "variant"]) : set(["base", "variant"], name))}>
            {VARIANT_TEXT[name]}
          </button>
        ))}
      </div>
      {layout.tiles.length > 0 && (
        <p className="note board-sum">
          <b>{nx} × {ny} holes</b> in {layout.tiles.length} tiles ({columns.join(" + ")} across, {rows.join(" + ")} deep).
          Bumpers {mm(layout.gap.left)} and {mm(layout.gap.right)} mm at the sides, {mm(layout.gap.front)} and {mm(layout.gap.back)} mm front and back
          {layout.dropped.length ? `. The rounded corners cut ${layout.dropped.length} holes` : ""}.
        </p>
      )}
      <div className="kv">
        <label>Largest tile<small>Across and deep, in holes. Blank for the biggest the bed takes; setting one sets the other to that.</small></label>
        <span className="triple">
          <OptionalNumber label="Largest tile across" value={base.tile?.[0]} onCommit={(v) => setTile(0, v)} />
          <OptionalNumber label="Largest tile deep" value={base.tile?.[1]} onCommit={(v) => setTile(1, v)} />
        </span>
        <label htmlFor="g-split-x">Bumpers across<small>Which side takes the thicker bumper</small></label>
        <select id="g-split-x" className="select" value={splitX} onChange={(e) => setSplit(e.target.value, splitY)}>
          <option value="even">Even</option><option value="left">Left</option><option value="right">Right</option>
        </select>
        <label htmlFor="g-split-y">Bumpers front to back</label>
        <select id="g-split-y" className="select" value={splitY} onChange={(e) => setSplit(splitX, e.target.value)}>
          <option value="even">Even</option><option value="front">Front</option><option value="back">Back</option>
        </select>
        <label htmlFor="g-fit">Clearance to the walls<small>Each side, mm</small></label>
        <NumberField id="g-fit" value={base.bumpers?.fit ?? GRID.bumper.fit} min={0} step={0.1} onCommit={(v) => set(["base", "bumpers", "fit"], Math.max(0, v))} />
      </div>

      <div className="kv">
        <label>Countersinks<small>Holes to screw the board to the floor, as column, row from the front left</small></label>
        <span />
      </div>
      <div className="sinks">
        {sinks.map(([i, j], k) => (
          <span key={`${i}-${j}`} className="tag">
            {i}, {j}
            <button type="button" className="unsink" aria-label={`Remove the countersink at ${i}, ${j}`} onClick={() => setSinks(sinks.filter((_, n) => n !== k) as [number, number][])}><Icon.close /></button>
          </span>
        ))}
        <AddHole onAdd={(hole) => !sinks.some(([i, j]) => i === hole[0] && j === hole[1]) && setSinks([...(sinks as [number, number][]), hole])} />
        {!sinks.length && nx > 0 && ny > 0 && <button type="button" className="btn sm ghost" onClick={() => setSinks(corners)}>One in each corner</button>}
      </div>
    </div>
  );
}

/** A whole number that can be left blank. */
function OptionalNumber({ label, value, onCommit }: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void }) {
  return (
    <input
      key={value ?? "blank"}
      className="field num"
      style={{ width: 60 }}
      type="number"
      min={1}
      step={1}
      placeholder="auto"
      aria-label={label}
      defaultValue={value ?? ""}
      onBlur={(e) => {
        const v = e.target.value === "" ? undefined : Math.max(1, Math.round(Number(e.target.value)));
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function AddHole({ onAdd }: { onAdd: (hole: [number, number]) => void }) {
  const [value, setValue] = useState("");
  const hole = /^\s*(\d+)\s*[, ]\s*(\d+)\s*$/.exec(value);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!hole) return;
    onAdd([Number(hole[1]), Number(hole[2])]);
    setValue("");
  };
  return (
    <form className="ask" onSubmit={submit}>
      <input className="field" style={{ width: 90 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder="12, 8" aria-label="Countersink hole, column and row" />
      <button className="btn sm" type="submit" disabled={!hole}><Icon.plus />Add</button>
    </form>
  );
}
