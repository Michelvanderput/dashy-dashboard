/** Wall-clock time in one IANA zone (default Europe/Amsterdam), DST-safe, no dependencies. */
export declare const TIME_ZONE = "Europe/Amsterdam";
export interface Parts {
    date: string;
    y: number;
    mo: number;
    d: number;
    h: number;
    mi: number;
    weekday: number;
    minutes: number;
}
/** The clock on the wall in `tz` at epoch `ms`. */
export declare function localParts(ms: number, tz?: string): Parts;
/**
 * Epoch ms of a wall-clock time in `tz`, or null when that time does not exist (the hour skipped when the clocks go forward,
 * or a date like 2026-02-30). An ambiguous time (the hour repeated when the clocks go back) takes the first occurrence.
 */
export declare function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, tz?: string): number | null;
export declare const startOfDay: (ms: number, tz?: string) => number;
/** Adds whole calendar days on the wall clock (a day is 23 or 25 hours across a clock change). */
export declare function addDays(y: number, mo: number, d: number, n: number): {
    y: number;
    mo: number;
    d: number;
};
