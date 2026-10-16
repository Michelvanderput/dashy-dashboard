import { type Appointment, type StateBody } from './plan.js';
import type { Store } from './store.js';
export declare function dashboard(store: Store, now: number): Promise<StateBody>;
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
