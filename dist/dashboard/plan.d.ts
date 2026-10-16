/** Planning data and the small helpers around it. Pure. */
import { type DriverState } from '../driver';
export interface PlanItem {
    id: string;
    kind: 'task' | 'event';
    title: string; /** start (event) or deadline (task), ms epoch */
    at: number | null;
    endsAt?: number | null;
    done?: boolean; /** when it was finished, ms epoch (housekeeping) */
    doneAt?: number;
    note?: string;
}
/** `late` = open and more than 15 minutes past its deadline: it is simply still open (the driver stops nagging then too). */
export type Urgency = 'near' | 'soon' | 'late' | 'normal';
export declare const URGENT: {
    readonly nearMs: number;
    readonly soonMs: number;
};
export declare function urgency(item: PlanItem, now: number): Urgency;
/** Open items by time (items without a time last), finished tasks at the bottom. Does not mutate. */
export declare function planOrder(items: readonly PlanItem[], now: number): PlanItem[];
/**
 * The next thing that happens: the earliest open appointment or task deadline. An appointment counts until 2 minutes after its
 * start; a task deadline until 15 minutes after, the same period in which the state driver is still angry about it.
 */
export declare function nextUp(items: readonly PlanItem[], now: number): {
    item: PlanItem;
    at: number;
} | null;
/** The open task the state driver is looking at: the earliest deadline that has not been over for more than 15 minutes. */
export declare function pressingTask(items: readonly PlanItem[], now: number): PlanItem | null;
export declare const nextAppointmentAt: (items: readonly PlanItem[], now: number) => number | null;
/** "nu", "8 min", "1 u 05", "3 u". Past times: "nu" for the first minutes, then "5 min geleden". */
export declare function countdown(ms: number): string;
export declare const clock: (ms: number, tz?: string) => string;
export interface Model {
    items: PlanItem[];
    driver: DriverState;
    musicSince: number | null;
}
export type Action = {
    type: 'add';
    item: PlanItem;
} | {
    type: 'done';
    id: string;
} | {
    type: 'undo';
    id: string;
} | {
    type: 'flag';
    flag: 'waiting' | 'blocked' | 'break' | 'working';
    value: boolean;
} | {
    type: 'music';
    playing: boolean;
} | {
    type: 'reset';
    items: PlanItem[];
};
export declare function initialModel(items: PlanItem[], now: number): Model;
export declare function reducer(m: Model, a: Action, now: number): Model;
export interface NowPick {
    item: PlanItem; /** short, neutral, e.g. "Deadline om 12:00" */
    reason: string;
    why: 'deadline-near' | 'chosen' | 'appointment' | 'deadline-soon' | 'today' | 'later' | 'open';
}
/**
 * The one thing to do now. In this order, the first that applies:
 * 1. a task whose deadline is within 15 minutes (or passed less than 15 minutes ago)
 * 2. the task someone chose (`focusId`, set by Claude or by tapping), while it is open
 * 3. an appointment that starts within 10 minutes (or started less than 2 minutes ago)
 * 4. a task whose deadline is within the hour
 * 5. the open task with the earliest deadline today
 * 6. an open task without a time
 * 7. the open task with the earliest deadline on another day
 * Nothing open: null. Pure; ties go to the earliest deadline, then the order in the list.
 */
export declare function nowTask(items: readonly PlanItem[], now: number, focusId?: string | null): NowPick | null;
