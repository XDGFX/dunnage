import { addOverlay, GRID, mm, moveOverlayToBestFit, removeOverlay, setOverlay, VARIANT_NAMES, type Fit, type OverlayLayout, type OverlaySpec, type Pegboard, type Variant } from "../core/index.ts";
import { Icon } from "./icons.tsx";
import { NumberField } from "./NumberField.tsx";

// Grid overlays on a pegboard: patches of the grid board, held by lock pins in the pegboard's slots. Each
// is placed from the board's front-left corner and sized in holes.

interface Props {
  /** As the file writes them, so editing one field leaves the others exactly as they are. */
  specs: OverlaySpec[];
  overlays: OverlayLayout[];
  board: Pegboard;
  /** The printer's bed and fits, which the best fit lays tiles out for. */
  bed: readonly [number, number, number];
  fit: Fit;
  apply: (edit: (text: string) => string) => void;
}

const PITCH = GRID.pitch;

export function Overlays({ specs, overlays, board, bed, fit, apply }: Props) {
  return (
    <div className="grid-base overlays">
      <h4>Grid overlays</h4>
      <p className="note">
        A patch of the fine grid on top of the pegboard, for things that want screwed or pinned holders. Lock pins from the library twist into the board's slots
        first; the overlay presses down over their pegs, which go up into its holes. The rest of the drawer keeps its IKEA pegs.
      </p>
      {specs.map((spec) => {
        const o = overlays.find((layout) => layout.id === spec.id);
        if (!o) return null;
        const [ax, ay] = spec.at;
        // As many holes as fit between where it starts and the board's far edges.
        const most: [number, number] = [Math.max(1, Math.floor((board.width - ax) / PITCH)), Math.max(1, Math.floor((board.depth - ay) / PITCH))];
        const set = (field: "at" | "holes" | "variant", value: unknown) => apply((text) => setOverlay(text, spec.id, field, value));
        return (
          <div key={spec.id} className="overlay-card">
            <div className="overlay-head">
              <b>{spec.id}</b>
              <span className="tag">{spec.holes[0]} × {spec.holes[1]} holes</span>
              <button type="button" className="btn sm ghost" aria-label={`Remove overlay ${spec.id}`} onClick={() => apply((text) => removeOverlay(text, spec.id))}><Icon.close />Remove</button>
            </div>
            <div className="kv">
              <label>From the board's corner<small>Across and back, mm</small></label>
              <span className="triple">
                <NumberField id={`o-${spec.id}-x`} label="Across" value={ax} min={0} width={60} onCommit={(v) => set("at", [Math.max(0, v), ay])} />
                <NumberField id={`o-${spec.id}-y`} label="Back" value={ay} min={0} width={60} onCommit={(v) => set("at", [ax, Math.max(0, v)])} />
              </span>
              <label>Size<small>Across and deep, in holes of {PITCH} mm: at most {most[0]} × {most[1]} from here</small></label>
              <span className="triple">
                <NumberField id={`o-${spec.id}-nx`} label="Holes across" value={spec.holes[0]} min={1} max={most[0]} width={60} onCommit={(v) => set("holes", [clamp(v, most[0]), spec.holes[1]])} />
                <NumberField id={`o-${spec.id}-ny`} label="Holes deep" value={spec.holes[1]} min={1} max={most[1]} width={60} onCommit={(v) => set("holes", [spec.holes[0], clamp(v, most[1])])} />
              </span>
              <label htmlFor={`o-${spec.id}-v`}>Variant</label>
              <select id={`o-${spec.id}-v`} className="select" value={o.variant} onChange={(e) => set("variant", e.target.value === GRID.variant ? undefined : (e.target.value as Variant))}>
                {VARIANT_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <p className="note board-sum">
              {mm(o.box.x1 - o.box.x0)} × {mm(o.box.y1 - o.box.y0)} mm in {o.tiles.length} {o.tiles.length === 1 ? "tile" : "tiles"}. <b>{o.compatible.length} holes</b> line up with a slot,
              {" "}and <b>{o.pins.length} lock pins</b> {spec.pins ? "are chosen by hand" : "are chosen"}; no fixing can use their holes. Things on it have {GRID.thickness} mm less height.
            </p>
            {o.problems.length > 0 && <p className="note bad-text">{o.problems.map((p) => p.message).join("; ")}</p>}
            <div>
              <button type="button" className="btn sm" onClick={() => apply((text) => moveOverlayToBestFit(text, spec.id, { bed, fit }))}>Move to the best fit</button>
            </div>
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
