/** Planning data and the small helpers around it. Pure. */
import { type DriverState } from '../driver';
export interface PlanItem {
    id: string;
    kind: 'task' | 'event';
    title: string; /** start (event) or deadline (task), ms epoch */
    at: number | null;
    endsAt?: number | null;
    done?: boolean;
    note?: string;
}
export type Urgency = 'near' | 'soon' | 'normal';
export declare const URGENT: {
    readonly nearMs: number;
    readonly soonMs: number;
};
export declare function urgency(item: PlanItem, now: number): Urgency;
/** Open items by time (items without a time last), finished tasks at the bottom. Does not mutate. */
export declare function planOrder(items: readonly PlanItem[], now: number): PlanItem[];
/** The next thing that happens: the earliest open appointment or task deadline that has not passed by more than 2 minutes. */
export declare function nextUp(items: readonly PlanItem[], now: number): {
    item: PlanItem;
    at: number;
} | null;
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
