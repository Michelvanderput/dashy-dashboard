import { type CSSProperties } from 'react';
import type { Hours } from '../tasks';
import type { Workday } from '../day';
export interface HoursPanelProps {
    hours: Hours;
    workday?: Workday;
    /** Fixed time for tests and screenshots. Default: the real time, refreshed every minute. */
    now?: number;
    /** Smaller: the projects on one line. For low screens (a phone on its side). */
    compact?: boolean;
    style?: CSSProperties;
}
/**
 * The hours: what you logged today (quietly), and from 15 minutes before the end of the working day what there is to book, per project.
 * Earlier days that were never booked get one calm line. No red, no "you forgot", no total of what is missing over weeks.
 */
export declare function HoursPanel({ hours, workday, now: fixed, compact, style }: HoursPanelProps): import("react").JSX.Element | null;
