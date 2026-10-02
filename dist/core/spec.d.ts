import { type Plan, type PlannedHolder } from "./plan.ts";
/**
 * A custom holder's spec sheet, in Markdown: everything needed to build it elsewhere, in Fusion
 * or Blender. Origin is the drawer's front-left floor corner; x right, y back, z up; mm.
 */
export declare function specSheet(p: Plan, h: PlannedHolder, drawerName: string): string;
