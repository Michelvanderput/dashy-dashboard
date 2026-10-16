export interface WakeLockState {
    /** The browser can keep the screen on at all (Safari 16.4+, Chrome, Edge). */
    supported: boolean;
    /** The screen is being kept on right now. */
    active: boolean;
    /** Why it did not work (battery saver, not allowed), in plain words. */
    error: string | null;
}
/**
 * Keeps the screen on while `enabled` and the window is visible. The browser drops the lock whenever the window is hidden, so it is asked for
 * again when it comes back. Never throws: where it does not work, `supported` or `error` says so, and the phone's own auto-lock applies.
 */
export declare function useWakeLock(enabled: boolean): WakeLockState;
