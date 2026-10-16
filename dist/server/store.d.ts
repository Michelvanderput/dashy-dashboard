/** Storage. One record per task (a hash), so two writers never overwrite each other's tasks. */
import type { Task } from './model.js';
import type { Appointment } from './plan.js';
export interface Store {
    tasks(): Promise<Task[]>;
    putTasks(ts: Task[]): Promise<void>;
    deleteTasks(ids: string[]): Promise<void>;
    appointment(): Promise<Appointment | null>;
    setAppointment(a: Appointment | null): Promise<void>;
}
/** Defensive read: a damaged record is skipped, never thrown on, so one bad row cannot take the whole screen down. */
export declare function parseTask(raw: unknown): Task | null;
export declare function parseAppointment(raw: unknown): Appointment | null;
export declare class MemoryStore implements Store {
    private t;
    private a;
    tasks(): Promise<{
        id: string;
        title: string;
        category: import("./model.js").Category;
        dueAt: number | null;
        hasTime: boolean;
        note: string | null;
        done: boolean;
        doneAt: number | null;
        position: number;
        createdAt: number;
    }[]>;
    putTasks(ts: Task[]): Promise<void>;
    deleteTasks(ids: string[]): Promise<void>;
    appointment(): Promise<{
        title: string;
        at: number;
        endsAt?: number | null;
    } | null>;
    setAppointment(a: Appointment | null): Promise<void>;
}
export interface UpstashOptions {
    url: string;
    token: string;
    prefix?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}
/** Upstash Redis over its REST API, with plain fetch (no SDK). */
export declare class UpstashStore implements Store {
    private o;
    private k;
    constructor(o: UpstashOptions);
    private run;
    tasks(): Promise<Task[]>;
    putTasks(ts: Task[]): Promise<void>;
    deleteTasks(ids: string[]): Promise<void>;
    appointment(): Promise<Appointment | null>;
    setAppointment(a: Appointment | null): Promise<void>;
}
export interface SupabaseOptions {
    url: string;
    serviceKey: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}
/**
 * Supabase (Postgres) over its REST API with plain fetch, using the service role key on the server (see db/dashy-tasks.sql:
 * RLS is on without policies, so nothing else can reach the tables). One row per task, like the Redis hash.
 */
export declare class SupabaseStore implements Store {
    private o;
    constructor(o: SupabaseOptions);
    private call;
    tasks(): Promise<Task[]>;
    putTasks(ts: Task[]): Promise<void>;
    deleteTasks(ids: string[]): Promise<void>;
    appointment(): Promise<Appointment | null>;
    setAppointment(a: Appointment | null): Promise<void>;
}
