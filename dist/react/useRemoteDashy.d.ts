import { type RemoteState, type StateClientOptions } from '../state-client';
export interface RemoteOptions extends StateClientOptions {
    /** How often to ask when nothing is expected to change. Default 15 s. */
    intervalMs?: number;
    /** false = do not poll at all (nothing configured). Default true. */
    enabled?: boolean;
}
/**
 * Polls the state endpoint and returns what Dashy should show. Asks sooner when the server says the answer changes
 * by itself at a known moment (nextWakeAt), and stops asking while the window is hidden.
 */
export declare function useRemoteDashy(o: RemoteOptions): RemoteState & {
    apply: (s: RemoteState) => void;
};
