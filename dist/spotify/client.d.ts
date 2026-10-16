import { type PollResult } from './model';
/** One call to "currently playing". Never throws and never hangs; every outcome is a PollResult. */
export declare function fetchCurrentlyPlaying(o: {
    accessToken: string;
    fetch?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
}): Promise<PollResult>;
export type Command = 'play' | 'pause' | 'next' | 'previous';
export type CommandResult = {
    kind: 'ok';
} | {
    kind: 'unauthorized';
} | {
    kind: 'premium';
} | {
    kind: 'no-device';
} | {
    kind: 'forbidden';
} | {
    kind: 'rate-limited';
} | {
    kind: 'error';
};
/** One playback command (needs the user-modify-playback-state scope and, for Spotify, a Premium account). Never throws, never hangs. */
export declare function sendCommand(o: {
    accessToken: string;
    command: Command;
    fetch?: typeof fetch;
    timeoutMs?: number;
}): Promise<CommandResult>;
