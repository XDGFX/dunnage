import type { BoardLayout } from "./grid/layout.ts";
import type { Fit } from "./grid/parameters.ts";
import { type Method, type Plan, type PlannedHolder } from "./plan.ts";
/** The grid board a holder is fixed to, for its fixings' positions and sizes. */
export interface SpecBoard {
    layout: BoardLayout;
    fit: Fit;
}
/** Holders built elsewhere from a spec sheet, rather than fetched from the library. */
export declare const hasSpecSheet: (method: Method) => method is "custom" | "ply";
/** Where a holder's spec sheet is written, inside the export folder. */
export declare const specPath: (id: string) => string;
/**
 * A custom or ply holder's spec sheet, in Markdown: everything needed to build it elsewhere, in
 * Fusion or Blender, or from plywood. Origin is the drawer's front-left floor corner; x right,
 * y back, z up; mm.
 */
export declare function specSheet(drawerPlan: Plan, holder: PlannedHolder, drawerName: string, board?: SpecBoard): string;
