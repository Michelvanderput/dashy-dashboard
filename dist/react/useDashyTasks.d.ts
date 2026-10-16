import { type DashboardSnapshot } from '../tasks';
import type { Resolution } from '../driver';
export interface UseDashyTasksOptions {
    /** Where "done" and "undo" go, with its own (write-limited) token. Without it `complete` is undefined: the screen only looks. */
    actionUrl?: string | null;
    actionToken?: string | null;
    /** URL of the dashboard JSON. undefined = not connected: Dashy stays calm and `connected` is false. */
    url?: string;
    token?: string | null;
    /** Default 30 s. Paused while the window is hidden. */
    intervalMs?: number;
    fetch?: typeof fetch;
}
export interface DashyTasks extends Resolution {
    snapshot: DashboardSnapshot | null;
    connected: boolean;
    error: string | null;
    /** Check a task off. Shows at once, then the server confirms; when it does not work the task comes back and `error` says so. undefined = read-only. */
    complete?: (id: string) => Promise<boolean>;
    /** Take the last check-off back. undefined when there is nothing to undo or the screen is read-only. */
    undo?: () => Promise<boolean>;
    /** The task that was just checked off (for an "Ongedaan maken" button), until `UNDO_MS` has passed. */
    justDone: {
        id: string;
        title: string;
    } | null;
}
export declare const UNDO_MS = 8000;
/** Polls the dashboard and feeds the changes to the driver, so Dashy's state follows your real tasks. A failed poll keeps the last picture and shows an error text; it never throws. */
export declare function useDashyTasks({ url, token, actionUrl, actionToken, intervalMs, fetch: f }: UseDashyTasksOptions): DashyTasks;
