import { type PollResult } from './model';
/** One call to "currently playing". Never throws and never hangs; every outcome is a PollResult. */
export declare function fetchCurrentlyPlaying(o: {
    accessToken: string;
    fetch?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
}): Promise<PollResult>;
