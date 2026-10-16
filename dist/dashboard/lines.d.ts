/** One short Dutch line per situation, in Dashy's voice: warm, concrete, never guilt. Claude's own line (MCP) replaces these. */
import type { Resolution } from '../driver';
export interface LineContext {
    /** the task the state driver is looking at, and when: "over 8 min" / "nu" / overdue with its time */
    task?: {
        title: string;
        in: string;
        overdue: boolean;
        at: string;
    };
    /** next appointment or task, for calm moments */
    /** the one thing that is "Nu" on the screen */
    nowTitle?: string;
    /** a habit worth a nudge today (not done, week goal not met) */
    habit?: {
        title: string;
        plan?: string;
    };
    nextTitle?: string;
    nextIn?: string;
    /** an open task that is past its deadline for a while: still open, never blamed */
    stale?: string;
    music?: string;
}
export declare function dashyLine(res: Resolution, c?: LineContext): string;
