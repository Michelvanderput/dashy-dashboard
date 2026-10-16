/**
 * The state behind the MCP: one small document (driver state + Claude's current mood), plus the pure functions that change it.
 * No network, no clock: time is passed in. The Redis store at the bottom is the only part that touches a service.
 */
import { type AllowedState } from '../advice';
import type { DashyState } from '../core';
import { type DriverState, type RuleName } from '../driver';
export interface Mood {
    state: AllowedState;
    line: string;
    until: number;
}
export interface Doc {
    rev: number;
    driver: DriverState;
    mood: Mood | null;
}
export declare const emptyDoc: (now: number) => Doc;
export declare const LIMITS: {
    readonly openTasks: 200;
    readonly moodMinutesDefault: 30;
    readonly moodMinutesMax: 240;
    readonly idPattern: RegExp;
};
/** What Dashy shows right now, and when it may change by itself. */
export interface View {
    state: DashyState;
    line: string;
    source: 'driver' | 'claude';
    rule: RuleName;
    /** ms epoch of the next moment the answer can change without a new event; null = only on an event */
    nextWakeAt: number | null;
    rev: number;
}
export declare function view(doc: Doc, now: number): View;
export type Call = {
    tool: 'task';
    action: 'added' | 'done' | 'removed' | 'due';
    id: string;
    due?: string | null;
} | {
    tool: 'flag';
    flag: 'waiting' | 'blocked' | 'break' | 'working';
    value: boolean;
} | {
    tool: 'activity';
} | {
    tool: 'mood';
    state?: string;
    line?: string;
    minutes?: number;
    clear?: boolean;
};
export type Outcome = {
    ok: true;
    doc: Doc;
    note?: string;
} | {
    ok: false;
    error: string;
};
/** Pure: returns a new document or an error. Never mutates the input. */
export declare function apply(doc: Doc, call: Call, now: number): Outcome;
export interface Store {
    load(): Promise<Doc | null>;
    save(doc: Doc): Promise<void>;
}
export declare class MemoryStore implements Store {
    doc: Doc | null;
    load(): Promise<Doc | null>;
    save(d: Doc): Promise<void>;
}
/** Validates what came out of storage, so a corrupt value never crashes the endpoints. */
export declare function parseDoc(raw: unknown): Doc | null;
/**
 * Read-modify-write on one document. Two writes in the same few milliseconds could overwrite each other
 * (last write wins); for one person talking to one Claude that is acceptable, and it is documented.
 */
export declare function update(store: Store, now: number, call: Call): Promise<{
    outcome: Outcome;
    doc: Doc;
}>;
export declare function read(store: Store, now: number): Promise<Doc>;
