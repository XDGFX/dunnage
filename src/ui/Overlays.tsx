import { addOverlay, GRID, mm, removeOverlay, setOverlay, VARIANT_NAMES, type OverlayLayout, type Pegboard, type Variant } from "../core/index.ts";
import { Icon } from "./icons.tsx";
import { NumberField } from "./NumberField.tsx";

// Grid overlays on a pegboard: patches of the grid board, latched into the pegboard's slots. Each
// is placed from the board's front-left corner and sized in holes.

interface Props {
  overlays: OverlayLayout[];
  board: Pegboard;
  apply: (edit: (text: string) => string) => void;
}

const PITCH = GRID.pitch;

export function Overlays({ overlays, board, apply }: Props) {
  const most: [number, number] = [Math.floor(board.width / PITCH), Math.floor(board.depth / PITCH)];
  return (
    <div className="grid-base overlays">
      <h4>Grid overlays</h4>
      <p className="note">
        A patch of the fine grid on top of the pegboard, for things that want screwed or pinned holders. Spring latches under it snap into the slots, so it presses
        straight down. The rest of the drawer keeps its IKEA pegs.
      </p>
      {overlays.map((o) => {
        const at: [number, number] = [tenth(o.box.x0 - board.x0), tenth(o.box.y0 - board.y0)];
        const set = (field: "at" | "holes" | "variant", value: unknown) => apply((text) => setOverlay(text, o.id, field, value));
        return (
          <div key={o.id} className="overlay-card">
            <div className="overlay-head">
              <b>{o.id}</b>
              <span className="tag">{o.holes[0]} × {o.holes[1]} holes</span>
              <button type="button" className="btn sm ghost" aria-label={`Remove overlay ${o.id}`} onClick={() => apply((text) => removeOverlay(text, o.id))}><Icon.close />Remove</button>
            </div>
            <div className="kv">
              <label>From the board's corner<small>Across and back, mm</small></label>
              <span className="triple">
                <NumberField id={`o-${o.id}-x`} label="Across" value={at[0]} min={0} width={60} onCommit={(v) => set("at", [Math.max(0, v), at[1]])} />
                <NumberField id={`o-${o.id}-y`} label="Back" value={at[1]} min={0} width={60} onCommit={(v) => set("at", [at[0], Math.max(0, v)])} />
              </span>
              <label>Size<small>Across and deep, in holes of {PITCH} mm</small></label>
              <span className="triple">
                <NumberField id={`o-${o.id}-nx`} label="Holes across" value={o.holes[0]} min={1} max={most[0]} width={60} onCommit={(v) => set("holes", [clamp(v, most[0]), o.holes[1]])} />
                <NumberField id={`o-${o.id}-ny`} label="Holes deep" value={o.holes[1]} min={1} max={most[1]} width={60} onCommit={(v) => set("holes", [o.holes[0], clamp(v, most[1])])} />
              </span>
              <label htmlFor={`o-${o.id}-v`}>Variant</label>
              <select id={`o-${o.id}-v`} className="select" value={o.variant} onChange={(e) => set("variant", e.target.value === GRID.variant ? undefined : (e.target.value as Variant))}>
                {VARIANT_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <p className="note board-sum">
              {o.problems.length ? (
                <span className="bad-text">{o.problems.map((p) => p.message).join("; ")}</span>
              ) : (
                <>
                  {mm(o.box.x1 - o.box.x0)} × {mm(o.box.y1 - o.box.y0)} mm in {o.tiles.length} {o.tiles.length === 1 ? "tile" : "tiles"}, held by <b>{o.latches.length} latches</b>;
                  {" "}{o.blind.length} holes over their sockets are blind. Things on it have 8 mm less height.
                </>
              )}
            </p>
          </div>
        );
      })}
      <div>
        <button type="button" className="btn sm" onClick={() => apply((text) => addOverlay(text).text)}><Icon.plus />Add an overlay</button>
      </div>
    </div>
  );
}

const clamp = (v: number, most: number) => Math.max(1, Math.min(most, Math.round(v)));
const tenth = (v: number) => Math.round(v * 10) / 10;
