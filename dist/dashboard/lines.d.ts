/** One short Dutch line per situation, in Dashy's voice: warm, concrete, never guilt. Claude's own line (MCP) replaces these. */
import type { Resolution } from '../driver';
export interface LineContext {
    nextTitle?: string;
    nextIn?: string;
    music?: string;
}
export declare function dashyLine(res: Resolution, c?: LineContext): string;
