import type { Task } from './model.js';
/** A task with a time becomes "Nu doen" this long before it; a date-only task at DATE_ONLY_READY_HOUR that morning. */
export declare const READY_LEAD_MS: number;
export declare const DATE_ONLY_READY_HOUR = 7;
/** When the task becomes ready for "Nu doen"; null = always. */
export declare function readyAt(t: Pick<Task, 'dueAt' | 'hasTime'>): number | null;
export declare const isReady: (t: Pick<Task, 'dueAt' | 'hasTime'>, now: number) => boolean;
export interface Ordered {
    ready: Task[];
    planned: Task[];
}
/** Open tasks in the order the screen shows them: what can be done now first (a real time of day goes first, by time), then what is planned. */
export declare function orderTasks(open: Task[], now: number): Ordered;
/** Open tasks whose day is before today. Facts, no verdict. */
export declare function leftOpen(open: Task[], now: number, tz?: string): Task[];
export interface Appointment {
    title: string;
    at: number;
    endsAt?: number | null;
}
/** Version 2 of the state body: what the screen and Claude both read. Epoch times, no Dutch text to parse. */
export interface StateBody {
    v: 2;
    today: string;
    weekday: number;
    now: number;
    tz: string;
    tasks: {
        id: string;
        title: string;
        category: string;
        dueAt: number | null;
        hasTime: boolean;
        note: string | null;
        state: 'now' | 'later';
    }[];
    leftOpen: string[];
    /** Done in the last 24 h, newest first, so the screen can celebrate by itself. */
    recentlyDone: {
        id: string;
        title: string;
        doneAt: number;
    }[];
    appointment: Appointment | null;
}
export declare function buildState(all: Task[], appointment: Appointment | null, now: number, tz?: string): StateBody;
