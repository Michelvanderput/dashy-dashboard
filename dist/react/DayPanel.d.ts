import { type CSSProperties } from 'react';
import { type Workday } from '../day';
export interface DayPanelProps {
    /** The next appointment, epoch ms. */
    appointment?: {
        title: string;
        at: number;
        endsAt?: number | null;
    } | null;
    workday?: Workday;
    /** Fixed time for tests and screenshots. Default: the real time, refreshed every 30 s. */
    now?: number;
    style?: CSSProperties;
}
/**
 * The day at a glance: the next appointment with a countdown (orange under ten minutes), and a bar for how far through the working day you are.
 * Calm on purpose: no percentages shouted, no "behind schedule", and nothing at all on a day off.
 */
export declare function DayPanel({ appointment, workday, now: fixed, style }: DayPanelProps): import("react").JSX.Element | null;
