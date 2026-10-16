/** Storage. One record per task (a hash), so two writers never overwrite each other's tasks. */
import type { Task } from './model';
import { CATEGORIES } from './model';
import type { Appointment } from './plan';

export interface Store {
  tasks(): Promise<Task[]>;
  putTasks(ts: Task[]): Promise<void>;
  deleteTasks(ids: string[]): Promise<void>;
  appointment(): Promise<Appointment | null>;
  setAppointment(a: Appointment | null): Promise<void>;
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
export function parseAppointment(raw: unknown): Appointment | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (typeof o !== 'object' || o === null) return null;
  const a = o as Record<string, unknown>;
  if (typeof a.title !== 'string' || !num(a.at)) return null;
  return { title: a.title, at: a.at, endsAt: num(a.endsAt) ? a.endsAt : null };
}

export class MemoryStore implements Store {
  private t = new Map<string, Task>(); private a: Appointment | null = null;
  async tasks() { return [...this.t.values()].map(x => ({ ...x })); }
  async putTasks(ts: Task[]) { for (const x of ts) this.t.set(x.id, { ...x }); }
  async deleteTasks(ids: string[]) { for (const id of ids) this.t.delete(id); }
  async appointment() { return this.a && { ...this.a }; }
  async setAppointment(a: Appointment | null) { this.a = a && { ...a }; }
}

export interface UpstashOptions { url: string; token: string; prefix?: string; fetch?: typeof fetch; timeoutMs?: number }
/** Upstash Redis over its REST API, with plain fetch (no SDK). */
export class UpstashStore implements Store {
  private k: { tasks: string; appt: string };
  constructor(private o: UpstashOptions) { const p = o.prefix ?? 'dashy:v2'; this.k = { tasks: `${p}:tasks`, appt: `${p}:appointment` }; }
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
}
