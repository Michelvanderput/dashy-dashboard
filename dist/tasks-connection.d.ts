/**
 * Where the screen gets its tasks, without secrets in the public bundle: open the app once with
 *   https://<app>/#tasks=<https url of the dashboard json>&key=<read token>&act=<action token>
 * and it remembers both on this device (localStorage) and removes them from the address bar. Both tokens are optional; without `act` the screen can only look.
 */
import type { KeyValueStore } from './spotify/auth';
export interface TasksConnection {
    url: string;
    token: string | null;
    /** Where to send "done" and "undo". Derived from the state url (.../state -> .../action); null = the screen is read-only. */
    actionUrl: string | null;
    actionToken: string | null;
}
/** .../api/state -> .../api/action (same place, same origin). null when the url does not end in /state. */
export declare function actionUrlOf(stateUrl: string): string | null;
export declare function adoptTasksHash(hash: string, store: KeyValueStore): {
    cleaned: string;
    adopted: boolean;
};
export declare function loadTasksConnection(store: KeyValueStore): TasksConnection | null;
export declare const forgetTasksConnection: (store: KeyValueStore) => void;
/**
 * For windows without an address bar (the Mac app): accept what the user pastes, either the whole link
 * (https://<app>/#tasks=...&key=...&act=...) or just the part from the #. Returns true when it was a valid link and is now remembered.
 */
export declare function adoptPastedLink(text: string, store: KeyValueStore): boolean;
