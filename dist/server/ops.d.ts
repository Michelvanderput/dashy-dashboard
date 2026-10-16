import { type Appointment, type StateBody, type WorkdayConfig } from './plan.js';
import type { Store } from './store.js';
export declare function dashboard(store: Store, now: number, workday?: WorkdayConfig): Promise<StateBody>;
export declare function addTasks(store: Store, input: unknown, now: number): Promise<{
    added: {
        id: string;
        title: string;
    }[];
}>;
export declare function updateTasks(store: Store, input: unknown, now: number): Promise<{
    updated: string[];
    removed: string[];
}>;
/** Puts these open tasks first, in this order. */
export declare function reorderTasks(store: Store, input: unknown): Promise<{
    order: string[];
}>;
export declare function setAppointment(store: Store, input: unknown, now: number): Promise<{
    appointment: Appointment | null;
}>;
/**
 * The one write the screen may do: check a task off or undo it. Idempotent (checking off a done task changes nothing, so a double tap
 * or a retry is harmless). Returns false when there is no such task.
 */
export declare function setDone(store: Store, id: string, done: boolean, now: number): Promise<boolean>;
/** Time spent: "2 hours for client A on the report". A batch with one bad entry changes nothing. */
export declare function logTime(store: Store, input: unknown, now: number): Promise<{
    logged: {
        id: string;
        day: string;
        project: string | null;
        minutes: number;
    }[];
    vandaag_min: number;
}>;
/** Correct an entry: other minutes or project, move it to another day, or remove it. */
export declare function editTime(store: Store, input: unknown, now: number): Promise<{
    updated: string[];
    removed: string[];
}>;
/** After booking the hours in the time sheet: mark them. By ids, or a whole day (optionally one project). */
export declare function markBooked(store: Store, input: unknown, now: number): Promise<{
    gemarkeerd: number;
    min: number;
}>;
/** One day of hours, compact: [id, project, description, minutes, booked]. Default today. */
export declare function timeLog(store: Store, input: unknown, now: number): Promise<{
    day: string;
    regels: (string | number | boolean | null)[][];
    regels_format: string;
    totaal_min: number;
    te_boeken_min: number;
    per_project: [string | null, number, number][];
    per_project_format: string;
    eerder_te_boeken_min: number;
}>;
/**
 * The facts of a week (Monday to Sunday), for the story Claude writes in the buddy's voice: what got done (per category, per day, per part of
 * the day), the hours per project, and what is still open from that week. No judgement and no score in here on purpose.
 */
export declare function weekReview(store: Store, input: unknown, now: number): Promise<{
    week: {
        van: string;
        tot: string;
        loopt_nog: boolean;
    };
    gedaan: {
        totaal: number;
        per_categorie: Record<string, number>;
        per_dag: Record<string, number>;
        per_dagdeel: {
            ochtend: number;
            middag: number;
            avond: number;
        };
        titels: string[];
    };
    uren: {
        totaal_min: number;
        te_boeken_min: number;
        per_project: [string | null, number, number][];
        per_project_format: string;
    };
    nog_open_uit_deze_week: number;
}>;
