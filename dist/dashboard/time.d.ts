/** ms epoch of HH:MM on a "YYYY-MM-DD" day in Dutch time (handles summer and winter time). */
export declare function zonedMs(day: string, hour: number, minute?: number): number;
export declare const hourIn: (ms: number) => number;
export type Later = 'plus30' | 'tomorrow';
export declare const LATER: readonly Later[];
/** A new moment for a task: in half an hour, or tomorrow at 09:00 (Dutch time). */
export declare function laterMs(until: Later, now: number): number;
export type PartOfDay = 'morning' | 'day' | 'evening';
/** Before 10: morning. From 21 until 5: evening. */
export declare function partOfDay(now: number): PartOfDay;
