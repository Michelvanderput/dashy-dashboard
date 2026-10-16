/**
 * Layer 1: Dashy reacts to your real tasks. Pure like driver.ts: no DOM, no timers, no Date.now().
 * Input is the dashboard the Dashy tools return: { today, tasks: [[id, title, category, when, note]], left_open, time_today }.
 * Output is driver events, so all the rules (done = small celebration, deadline near = strict, quiet hour = sad) stay in driver.ts.
 *
 * Tone on purpose: tasks that are already past their time are "still open", not late. They make him wait (a calm, open look),
 * never angry, and a deadline in the past is ignored by the driver (`TASK_DRIVER_CONFIG`).
 */
import type { DriverConfig, DriverEvent } from './driver';
export interface DashTask {
    id: string;
    title: string;
    category: string; /** ms since epoch, only when the task has a time of day */
    due: number | null; /** the text as shown ("morgen 14:00") */
    when: string;
    note: string;
}
export interface DashboardSnapshot {
    today: string;
    tasks: DashTask[];
    leftOpen: string[];
    timeTodayMin: number;
}
/** Strict (30 min before a deadline), never angry (-1: not even at the exact moment), nothing after the time has passed. */
export declare const TASK_DRIVER_CONFIG: Partial<DriverConfig>;
/**
 * "vandaag 19:00", "morgen 14:00", "zo 10:00", "ma", "15 okt 19:00", "31 okt", "vandaag". Returns the due moment (local time) only when
 * the text has a time of day; a day without a time is not a deadline for the driver (it is shown, but does not make him strict).
 */
export declare function parseWhen(text: string, today: string): number | null;
/** "vandaag 19:00", "morgen", "zo 10:00", "22 okt 19:00" for a due moment (Dutch time). */
export declare function whenLabel(dueAt: number, hasTime: boolean, now: number): string;
/** "0m", "45m", "1u 20m" -> minutes. */
export declare function parseMinutes(s: unknown): number;
/** Strict check of the dashboard body. Throws on anything unexpected; extra keys are ignored. */
export declare function parseDashboard(raw: unknown): DashboardSnapshot;
/** What changed between two snapshots, as driver events. `prev` null = first look. */
export declare function snapshotEvents(prev: DashboardSnapshot | null, next: DashboardSnapshot): DriverEvent[];
/** The task to show as "now": the first one (the server puts "Nu doen" first). */
export declare const nowTask: (s: DashboardSnapshot | null) => DashTask | null;
