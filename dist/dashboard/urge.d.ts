/**
 * "Even stoppen": a calm sheet for when an urge or a pull to drift (gambling, porn, scrolling, anything) is there.
 * Research behind it (see docs/RESEARCH.md): a short delay, something else to do (distraction beat "urge surfing" for
 * acute craving in one trial) and slow breathing. No streak counter, no judgement, no content is asked or stored.
 * Pure: time is passed in. The log is only ever kept on this device.
 */
export declare const URGE_DELAY_MS: number;
export declare const BREATH: {
    readonly inMs: 4000;
    readonly outMs: 6000;
};
export declare const urgeLeft: (startedAt: number, now: number) => number;
export interface Breath {
    phase: 'in' | 'out';
    label: 'Adem in' | 'Adem uit'; /** 0..1, how full the lungs are, for a circle */
    fill: number;
}
/** Slow breathing, 4 s in and 6 s out. Smooth (eased) so the circle does not jerk. */
export declare function breath(elapsedMs: number): Breath;
/** Small, physical, different from the urge. Not a task list. */
export declare const DISTRACTIONS: readonly string[];
export declare const distractionFor: (n: number) => string;
export type UrgeOutcome = 'overleefd' | 'gebeurd' | 'gestopt';
export interface UrgeEntry {
    at: number;
    outcome: UrgeOutcome;
}
export declare const MAX_LOG = 200;
/** Reads the device log; garbage gives an empty log. */
export declare function parseLog(raw: string | null): UrgeEntry[];
export declare const addEntry: (log: readonly UrgeEntry[], e: UrgeEntry) => UrgeEntry[];
/** What Dashy says at the end: calm, no numbers. */
export declare function closing(outcome: UrgeOutcome): string;
