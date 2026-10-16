/** Start and end as HH:MM and the weekdays it applies to (0 = Sunday). */
export interface WorkdayConfig {
    start: string;
    end: string;
    days: number[];
}
export declare const DEFAULT_WORKDAY: WorkdayConfig;
export type Workday = WorkdayConfig;
/** "08:30-17:00". Anything invalid gives the default, never a crash. */
export declare function parseWorkday(text: string | undefined): WorkdayConfig;
export type DayPhase = 'free' | 'before' | 'during' | 'after';
export interface DayProgress {
    phase: DayPhase; /** 0..1 through the working day (0 before, 1 after) */
    fraction: number;
    leftMs: number;
    start: number;
    end: number;
}
/** Where `now` is in today's working day. A weekend or other non-working day is "free". */
export declare function dayProgress(now: number, w?: Workday, tz?: string): DayProgress;
/** Where an appointment sits on today's bar (0..1), or null when it is not during today's working day. */
export declare function positionOnDay(day: DayProgress, at: number): number | null;
/** Work time or free time. Free time is after the working day and on days off; the morning before the day starts still counts as work. */
export type DayMode = 'work' | 'free';
export declare const modeAt: (now: number, w?: WorkdayConfig, tz?: string) => DayMode;
