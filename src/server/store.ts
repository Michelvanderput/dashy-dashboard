/** Storage. One record per task (a hash), so two writers never overwrite each other's tasks. */
import type { Task, TimeEntry } from './model.js';
import { CATEGORIES } from './model.js';
import type { Appointment } from './plan.js';

export interface Store {
  tasks(): Promise<Task[]>;
  putTasks(ts: Task[]): Promise<void>;
  deleteTasks(ids: string[]): Promise<void>;
  appointment(): Promise<Appointment | null>;
  setAppointment(a: Appointment | null): Promise<void>;
  entries(): Promise<TimeEntry[]>;
  putEntries(es: TimeEntry[]): Promise<void>;
  deleteEntries(ids: string[]): Promise<void>;
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Defensive read: a damaged record is skipped, never thrown on, so one bad row cannot take the whole screen down. */
export function parseTask(raw: unknown): Task | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (typeof o !== 'object' || o === null) return null;
  const t = o as Record<string, unknown>;
  if (typeof t.id !== 'string' || typeof t.title !== 'string' || !(CATEGORIES as readonly unknown[]).includes(t.category)) return null;
  if (!(t.dueAt === null || num(t.dueAt)) || typeof t.hasTime !== 'boolean' || typeof t.done !== 'boolean' || !num(t.position) || !num(t.createdAt)) return null;
  return { id: t.id, title: t.title, category: t.category as Task['category'], dueAt: t.dueAt as number | null, hasTime: t.hasTime, note: typeof t.note === 'string' ? t.note : null, done: t.done, doneAt: num(t.doneAt) ? t.doneAt : null, position: t.position, createdAt: t.createdAt };
}
export function parseEntry(raw: unknown): TimeEntry | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (typeof o !== 'object' || o === null) return null;
  const e = o as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.day) || typeof e.description !== 'string' || !num(e.minutes) || e.minutes < 1 || typeof e.booked !== 'boolean' || !num(e.createdAt)) return null;
  return { id: e.id, day: e.day, project: typeof e.project === 'string' ? e.project : null, description: e.description, minutes: e.minutes, booked: e.booked, taskId: typeof e.taskId === 'string' ? e.taskId : null, createdAt: e.createdAt };
}
export function parseAppointment(raw: unknown): Appointment | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (typeof o !== 'object' || o === null) return null;
  const a = o as Record<string, unknown>;
  if (typeof a.title !== 'string' || !num(a.at)) return null;
  return { title: a.title, at: a.at, endsAt: num(a.endsAt) ? a.endsAt : null };
}

export class MemoryStore implements Store {
  private t = new Map<string, Task>(); private a: Appointment | null = null; private e = new Map<string, TimeEntry>();
  async tasks() { return [...this.t.values()].map(x => ({ ...x })); }
  async putTasks(ts: Task[]) { for (const x of ts) this.t.set(x.id, { ...x }); }
  async deleteTasks(ids: string[]) { for (const id of ids) this.t.delete(id); }
  async appointment() { return this.a && { ...this.a }; }
  async setAppointment(a: Appointment | null) { this.a = a && { ...a }; }
  async entries() { return [...this.e.values()].map(x => ({ ...x })); }
  async putEntries(es: TimeEntry[]) { for (const x of es) this.e.set(x.id, { ...x }); }
  async deleteEntries(ids: string[]) { for (const id of ids) this.e.delete(id); }
}

export interface UpstashOptions { url: string; token: string; prefix?: string; fetch?: typeof fetch; timeoutMs?: number }
/** Upstash Redis over its REST API, with plain fetch (no SDK). */
export class UpstashStore implements Store {
  private k: { tasks: string; appt: string; time: string };
  constructor(private o: UpstashOptions) { const p = o.prefix ?? 'dashy:v2'; this.k = { tasks: `${p}:tasks`, appt: `${p}:appointment`, time: `${p}:time` }; }
  private async run(cmds: (string | number)[][]): Promise<unknown[]> {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 6000);
    try {
      const res = await (this.o.fetch ?? fetch)(`${this.o.url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${this.o.token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmds), signal: ctl.signal });
      if (!res.ok) throw new Error(`storage status ${res.status}`);
      const out = await res.json() as { result?: unknown; error?: string }[];
      const bad = out.find(r => r.error); if (bad) throw new Error(`storage: ${bad.error}`);
      return out.map(r => r.result);
    } finally { clearTimeout(timer); }
  }
  async tasks() {
    const [flat] = await this.run([['HGETALL', this.k.tasks]]);
    const out: Task[] = [], arr = Array.isArray(flat) ? flat : [];
    for (let i = 1; i < arr.length; i += 2) { const t = parseTask(arr[i]); if (t) out.push(t); }
    return out;
  }
  async putTasks(ts: Task[]) { if (ts.length) await this.run([['HSET', this.k.tasks, ...ts.flatMap(t => [t.id, JSON.stringify(t)])]]); }
  async deleteTasks(ids: string[]) { if (ids.length) await this.run([['HDEL', this.k.tasks, ...ids]]); }
  async appointment() { const [v] = await this.run([['GET', this.k.appt]]); return v ? parseAppointment(v) : null; }
  async setAppointment(a: Appointment | null) { await this.run([a ? ['SET', this.k.appt, JSON.stringify(a)] : ['DEL', this.k.appt]]); }
  async entries() {
    const [flat] = await this.run([['HGETALL', this.k.time]]);
    const out: TimeEntry[] = [], arr = Array.isArray(flat) ? flat : [];
    for (let i = 1; i < arr.length; i += 2) { const e = parseEntry(arr[i]); if (e) out.push(e); }
    return out;
  }
  async putEntries(es: TimeEntry[]) { if (es.length) await this.run([['HSET', this.k.time, ...es.flatMap(e => [e.id, JSON.stringify(e)])]]); }
  async deleteEntries(ids: string[]) { if (ids.length) await this.run([['HDEL', this.k.time, ...ids]]); }
}

export interface SupabaseOptions { url: string; serviceKey: string; fetch?: typeof fetch; timeoutMs?: number }
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * Supabase (Postgres) over its REST API with plain fetch, using the service role key on the server (see db/dashy-tasks.sql:
 * RLS is on without policies, so nothing else can reach the tables). One row per task, like the Redis hash.
 */
export class SupabaseStore implements Store {
  constructor(private o: SupabaseOptions) {}
  private async call(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 6000);
    try {
      const { prefer, ...rest } = init;
      const res = await (this.o.fetch ?? fetch)(`${this.o.url.replace(/\/$/, '')}/rest/v1/${path}`, { ...rest, headers: { apikey: this.o.serviceKey, authorization: `Bearer ${this.o.serviceKey}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) }, signal: ctl.signal });
      if (!res.ok) throw new Error(`storage status ${res.status}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } finally { clearTimeout(timer); }
  }
  async tasks() {
    const rows = await this.call('dashy_tasks?select=*&limit=2000') as Record<string, unknown>[] | null;
    return (rows ?? []).map(r => parseTask({ id: r.id, title: r.title, category: r.category, dueAt: r.due_at ?? null, hasTime: r.has_time, note: r.note ?? null, done: r.done, doneAt: r.done_at ?? null, position: r.position, createdAt: r.created_at })).filter((t): t is Task => t !== null);
  }
  async putTasks(ts: Task[]) {
    if (!ts.length) return;
    await this.call('dashy_tasks?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify(ts.map(t => ({ id: t.id, title: t.title, category: t.category, due_at: t.dueAt, has_time: t.hasTime, note: t.note, done: t.done, done_at: t.doneAt, position: t.position, created_at: t.createdAt }))) });
  }
  async deleteTasks(ids: string[]) {
    if (!ids.length) return;
    if (!ids.every(id => SAFE_ID.test(id))) throw new Error('unsafe id');
    await this.call(`dashy_tasks?id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
  }
  async appointment() {
    const rows = await this.call('dashy_appointment?select=*&id=eq.1') as Record<string, unknown>[] | null;
    const r = rows?.[0]; return r ? parseAppointment({ title: r.title, at: r.at, endsAt: r.ends_at ?? null }) : null;
  }
  async setAppointment(a: Appointment | null) {
    if (!a) { await this.call('dashy_appointment?id=eq.1', { method: 'DELETE', prefer: 'return=minimal' }); return; }
    await this.call('dashy_appointment?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify({ id: 1, title: a.title, at: a.at, ends_at: a.endsAt ?? null }) });
  }
  async entries() {
    const rows = await this.call('dashy_time?select=*&limit=5000') as Record<string, unknown>[] | null;
    return (rows ?? []).map(r => parseEntry({ id: r.id, day: r.day, project: r.project ?? null, description: r.description, minutes: r.minutes, booked: r.booked, taskId: r.task_id ?? null, createdAt: r.created_at })).filter((e): e is TimeEntry => e !== null);
  }
  async putEntries(es: TimeEntry[]) {
    if (!es.length) return;
    await this.call('dashy_time?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: JSON.stringify(es.map(e => ({ id: e.id, day: e.day, project: e.project, description: e.description, minutes: e.minutes, booked: e.booked, task_id: e.taskId, created_at: e.createdAt }))) });
  }
  async deleteEntries(ids: string[]) {
    if (!ids.length) return;
    if (!ids.every(id => SAFE_ID.test(id))) throw new Error('unsafe id');
    await this.call(`dashy_time?id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
  }
}
