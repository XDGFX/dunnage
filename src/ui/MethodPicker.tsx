import { useState } from "react";
import { METHODS, RAD, type Method, type Plan } from "../core/index.ts";

// The library of holding methods as a grid of isometric wireframes: the holder in white, the
// thing it holds dashed, green when chosen, with a line on what each one is.

type P3 = [number, number, number];

function isometric(kind: Method): string[] {
  const iso = (x: number, y: number, z: number) => [40 + (x - y) * 0.82, 37 + (x + y) * 0.41 - z * 0.95];
  const out: string[] = [];
  const line = (points: P3[], cls = "") => out.push(`${cls}|${points.map((q) => iso(...q).map((v) => v.toFixed(1)).join(",")).join(" ")}`);
  const box = (x: number, y: number, z: number, w: number, d: number, h: number, cls?: string) => {
    const c: [number, number][] = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
    line([...c, c[0]].map(([a, b]) => [a, b, z]), cls);
    if (h) {
      line([...c, c[0]].map(([a, b]) => [a, b, z + h]), cls);
      for (const [a, b] of c) line([[a, b, z], [a, b, z + h]], cls);
    }
  };
  const ring = (cx: number, cy: number, z: number, r: number, cls?: string) =>
    line(Array.from({ length: 33 }, (_, i) => [cx + r * Math.cos((i / 16) * Math.PI), cy + r * Math.sin((i / 16) * Math.PI), z] as P3), cls);
  const cylinder = (cx: number, cy: number, z: number, r: number, h: number, cls?: string) => {
    ring(cx, cy, z, r, cls);
    ring(cx, cy, z + h, r, cls);
    const k = r / Math.SQRT2;
    line([[cx + k, cy - k, z], [cx + k, cy - k, z + h]], cls);
    line([[cx - k, cy + k, z], [cx - k, cy + k, z + h]], cls);
  };
  switch (kind) {
    case "well": box(-18, -14, 0, 36, 28, 8); ring(0, 0, 8, 9.5); ring(0, 0, 3, 9.5, "ghost"); cylinder(0, 0, 3, 8.5, 18, "thing"); break;
    case "posts": box(-18, -18, 0, 36, 36, 2); for (const a of [90, 210, 330]) cylinder(13 * Math.cos(a * RAD), 13 * Math.sin(a * RAD), 2, 1.8, 13); for (let k = 0; k < 3; k++) cylinder(0, 0, 2 + k * 3, 10.5, 3, "thing"); break;
    case "slot": box(-18, -9, 0, 36, 18, 2); box(-16, -8, 2, 32, 3, 15); box(-16, 5, 2, 32, 3, 15); box(-13, -4, 2, 26, 8, 22, "thing"); break;
    case "peg": {
      box(-16, -16, 0, 32, 32, 2); cylinder(0, 0, 2, 2.2, 15); ring(0, 0, 9, 6, "thing"); ring(0, 0, 21, 13, "thing");
      line([[6 / Math.SQRT2, -6 / Math.SQRT2, 9], [13 / Math.SQRT2, -13 / Math.SQRT2, 21]], "thing");
      line([[-6 / Math.SQRT2, 6 / Math.SQRT2, 9], [-13 / Math.SQRT2, 13 / Math.SQRT2, 21]], "thing");
      break;
    }
    case "gridfinity": box(-18, -18, 0, 36, 36, 3); line([[0, -18, 3], [0, 18, 3]], "ghost"); line([[-18, 0, 3], [18, 0, 3]], "ghost"); box(-17, -17, 3, 16, 34, 12); cylinder(-9, -9, 5, 4.5, 14, "thing"); cylinder(-9, 8, 5, 4.5, 10, "thing"); break;
    case "pegs": {
      box(-20, -20, 0, 40, 40, 1.5);
      for (let i = -15; i <= 15; i += 10) for (let j = -15; j <= 15; j += 10) if (Math.abs(i) + Math.abs(j) !== 30) line([[i - 2.5, j, 1.5], [i + 2.5, j, 1.5]], "ghost");
      for (const [x, y] of [[12, 7], [-12, 7], [0, -14]]) box(x - 1, y - 2, 1.5, 2, 4, 15);
      cylinder(0, 0, 1.5, 11, 6, "thing");
      break;
    }
    case "ply": box(-20, -15, 0, 40, 30, 6); ring(0, 0, 6, 10); ring(0, 0, 2.5, 10, "ghost"); box(-14, -12, 17, 28, 24, 0, "ghost"); ring(0, 0, 17, 10, "ghost"); break;
    case "custom": {
      box(-15, -11, 0, 30, 22, 12, "ghost");
      line([[-15, 15, 0], [15, 15, 0]]); line([[-15, 13, 0], [-15, 17, 0]]); line([[15, 13, 0], [15, 17, 0]]);
      line([[19, -11, 0], [19, 11, 0]]); line([[17, -11, 0], [21, -11, 0]]); line([[17, 11, 0], [21, 11, 0]]);
      cylinder(0, 0, 3, 6, 8, "thing");
      break;
    }
  }
  return out;
}

const ORDER = Object.keys(METHODS) as Method[];

/** Why a method can't be used on this base, if it can't. */
export function unavailable(method: Method, p: Plan): string | null {
  if (method === "gridfinity" && !p.base.grid) return "Needs a Gridfinity base";
  if (method === "pegs" && !p.base.board) return "Needs a pegboard base";
  return null;
}

export function MethodPicker({ plan, current, disabled, onPick }: { plan: Plan; current: Method | null; disabled?: boolean; onPick: (method: Method) => void }) {
  const [hover, setHover] = useState<Method | null>(null);
  const shown = hover ?? current;
  return (
    <div className="methods">
      <div className="method-grid" role="radiogroup" aria-label="How it's held">
        {ORDER.map((method) => {
          const off = unavailable(method, plan);
          return (
            <button
              key={method}
              type="button"
              className="method"
              role="radio"
              aria-checked={method === current}
              disabled={!!off || disabled}
              title={off ?? METHODS[method].name}
              onClick={() => onPick(method)}
              onMouseEnter={() => setHover(method)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(method)}
              onBlur={() => setHover(null)}
            >
              <svg viewBox="0 0 80 60" aria-hidden="true">
                {isometric(method).map((entry, k) => {
                  const [cls, points] = entry.split("|");
                  return <polyline key={k} className={cls} points={points} />;
                })}
              </svg>
              <span>{METHODS[method].short}</span>
            </button>
          );
        })}
      </div>
      <p className="note">{shown ? METHODS[shown].about : "Choose how to hold it. Hover over one to see what it is."}</p>
    </div>
  );
}
