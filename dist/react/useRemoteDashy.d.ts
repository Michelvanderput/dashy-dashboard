import { type RemoteState, type StateClientOptions } from '../state-client';
export interface RemoteOptions extends StateClientOptions {
    /** How often to ask when nothing is expected to change. Default 15 s. */
    intervalMs?: number;
}
/**
 * Polls the state endpoint and returns what Dashy should show. Asks sooner when the server says the answer changes
 * by itself at a known moment (nextWakeAt), and stops asking while the window is hidden.
 */
export declare function useRemoteDashy(o: RemoteOptions): RemoteState;
