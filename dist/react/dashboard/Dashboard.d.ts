import { type CSSProperties } from 'react';
import { type BlockId } from '../../dashboard/layout';
import { type PlanItem } from '../../dashboard/plan';
import type { DashyState } from '../../core';
import type { Resolution } from '../../driver';
import { type NowPlaying } from '../../spotify/model';
import type { SpotifyStatus } from '../../spotify/session';
export interface DashboardMusic {
    nowPlaying: NowPlaying | null;
    status: SpotifyStatus;
    onConnect?: () => void;
    onDisconnect?: () => void;
    error?: string;
    spotifyLogoSrc?: string;
}
export interface DashboardProps {
    /** ms epoch; pass a ticking clock (useNow) */
    now: number;
    items: PlanItem[];
    /** What the state driver (or the MCP) says. Decides the attention and Dashy's default line. */
    resolution: Resolution;
    /** Override Dashy's state (default: dances when music plays and the driver is calm, otherwise the driver's state). */
    state?: DashyState;
    /** Claude's own line (MCP). Default: a line per situation. */
    line?: string;
    music: DashboardMusic;
    onToggleDone?: (id: string, done: boolean) => void;
    /** Text for an empty planning. Default: "Een lege dag. Voeg iets kleins toe." */
    emptyText?: string;
    /** Dark and dimmed (for the night, a phone on the charger). */
    night?: boolean;
    /** Keep the screen awake while the dashboard is visible (a phone on the charger). Default false. */
    keepAwake?: boolean;
    /** Working day for the day bar. Default 8 to 18. */
    workday?: {
        startHour: number;
        endHour: number;
    };
    /** Reports the block in focus (or null) and why. */
    onFocusChange?: (block: BlockId | null, reason: string) => void;
    className?: string;
    style?: CSSProperties;
}
/**
 * The whole screen: five minimal blocks in a grid. Nothing is in focus while things are calm. When a block needs attention
 * (a deadline, an appointment, Dashy asking for help, new music) the grid tracks grow so that block takes about half the
 * screen, animated by the browser itself; the content simply reflows. Tap a block's button to grow it yourself (Esc lets go).
 */
export declare function Dashboard({ now, items, resolution, state, line, music, onToggleDone, emptyText, night, keepAwake, workday, onFocusChange, className, style }: DashboardProps): import("react").JSX.Element;
