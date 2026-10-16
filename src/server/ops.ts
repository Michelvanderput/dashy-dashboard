/** The operations on the task list. Validate everything first, then write: a batch with one bad item changes nothing. */
import { BATCH_MAX, TITLE_MAX, checkCategory, checkNote, checkTitle, InputError, newId, parseDue, type Task } from './model';
import { buildState, type Appointment, type StateBody } from './plan';
import type { Store } from './store';

const DONE_KEEP_MS = 3 * 24 * 3600_000;
const obj = (v: unknown, what: string): Record<string, unknown> => { if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new InputError(`${what} moet een object zijn`); return v as Record<string, unknown>; };
const list = (v: unknown, what: string, max = BATCH_MAX): unknown[] => { if (!Array.isArray(v) || v.length < 1) throw new InputError(`${what} moet een lijst met minstens 1 item zijn`); if (v.length > max) throw new InputError(`${what}: maximaal ${max} per keer`); return v; };
const known = (o: Record<string, unknown>, keys: string[], where: string) => { for (const k of Object.keys(o)) if (!keys.includes(k)) throw new InputError(`${where}: onbekend veld "${k}"`); };
const at = (i: number, msg: string) => { throw new InputError(`item ${i + 1}: ${msg}`); };
const wrap = <T>(i: number, f: () => T): T => { try { return f(); } catch (e) { if (e instanceof InputError) return at(i, e.message); throw e; } };

/** Drops done tasks older than three days. Called after every write. */
async function prune(store: Store, all: Task[], now: number) {
  const old = all.filter(t => t.done && t.doneAt !== null && now - t.doneAt > DONE_KEEP_MS).map(t => t.id);
  if (old.length) await store.deleteTasks(old);
}

export async function dashboard(store: Store, now: number): Promise<StateBody> {
  const [all, appt] = await Promise.all([store.tasks(), store.appointment()]);
  return buildState(all, appt, now);
}

export async function addTasks(store: Store, input: unknown, now: number): Promise<{ added: { id: string; title: string }[] }> {
  const items = list(obj(input, 'invoer').tasks, 'tasks');
  const all = await store.tasks(), taken = new Set(all.map(t => t.id)), open = all.filter(t => !t.done);
  const maxPos = open.reduce((m, t) => Math.max(m, t.position), 0), minPos = open.reduce((m, t) => Math.min(m, t.position), 0);
  const front = items.filter(x => (x as { now?: unknown })?.now === true).length;
  let f = 0, b = 0;
  const made = items.map((raw, i): Task => wrap(i, () => {
    const o = obj(raw, 'taak'); known(o, ['title', 'category', 'due', 'note', 'now'], 'taak');
    const d = o.due === undefined ? null : parseDue(o.due, now);
    if (o.now !== undefined && typeof o.now !== 'boolean') throw new InputError('now moet true of false zijn');
    const id = newId(taken); taken.add(id);
    return { id, title: checkTitle(o.title), category: checkCategory(o.category), dueAt: d?.dueAt ?? null, hasTime: d?.hasTime ?? false, note: o.note === undefined ? null : checkNote(o.note), done: false, doneAt: null, createdAt: now,
      position: o.now === true ? minPos - front + f++ - 1 : maxPos + ++b };
  }));
  await store.putTasks(made);
  await prune(store, all, now);
  return { added: made.map(t => ({ id: t.id, title: t.title })) };
}

export async function updateTasks(store: Store, input: unknown, now: number): Promise<{ updated: string[]; removed: string[] }> {
  const items = list(obj(input, 'invoer').updates, 'updates');
  const all = await store.tasks(), byId = new Map(all.map(t => [t.id, t]));
  const put: Task[] = [], del: string[] = [];
  items.forEach((raw, i) => wrap(i, () => {
    const o = obj(raw, 'update'); known(o, ['id', 'done', 'title', 'category', 'due', 'note', 'remove'], 'update');
    const cur = typeof o.id === 'string' ? byId.get(o.id) : undefined;
    if (!cur) throw new InputError(`taak ${String(o.id)} bestaat niet (haal het dashboard opnieuw op)`);
    if (o.remove === true) { del.push(cur.id); return; }
    const t = { ...(put.find(x => x.id === cur.id) ?? cur) };
    if (o.title !== undefined) t.title = checkTitle(o.title);
    if (o.category !== undefined) t.category = checkCategory(o.category);
    if (o.note !== undefined) t.note = o.note === null ? null : checkNote(o.note);
    if (o.due !== undefined) { if (o.due === null) { t.dueAt = null; t.hasTime = false; } else { const d = parseDue(o.due, now); t.dueAt = d.dueAt; t.hasTime = d.hasTime; } }
    if (o.done !== undefined) { if (typeof o.done !== 'boolean') throw new InputError('done moet true of false zijn'); if (o.done && !t.done) t.doneAt = now; if (!o.done) t.doneAt = null; t.done = o.done; }
    put.push(t);
  }));
  const dedupe = [...new Map(put.map(t => [t.id, t])).values()];
  await store.putTasks(dedupe); await store.deleteTasks(del);
  await prune(store, all, now);
  return { updated: dedupe.map(t => t.id), removed: del };
}

/** Puts these open tasks first, in this order. */
export async function reorderTasks(store: Store, input: unknown): Promise<{ order: string[] }> {
  const ids = list(obj(input, 'invoer').ids, 'ids').map((x, i) => typeof x === 'string' ? x : at(i, 'id moet tekst zijn'));
  if (new Set(ids).size !== ids.length) throw new InputError('ids bevat dubbele id\'s');
  const all = await store.tasks(), open = all.filter(t => !t.done), byId = new Map(open.map(t => [t.id, t]));
  const missing = ids.filter(id => !byId.has(id)); if (missing.length) throw new InputError(`geen open taak met id: ${missing.join(', ')}`);
  const minOther = open.filter(t => !ids.includes(t.id)).reduce((m, t) => Math.min(m, t.position), 0);
  await store.putTasks(ids.map((id, i) => ({ ...byId.get(id)!, position: minOther - ids.length + i })));
  return { order: ids };
}

export async function setAppointment(store: Store, input: unknown, now: number): Promise<{ appointment: Appointment | null }> {
  const o = obj(input, 'invoer'); known(o, ['title', 'start', 'end', 'clear'], 'invoer');
  if (o.clear === true) { await store.setAppointment(null); return { appointment: null }; }
  if (typeof o.title !== 'string' || !o.title.trim() || [...o.title.trim()].length > TITLE_MAX) throw new InputError(`title moet 1 tot ${TITLE_MAX} tekens zijn`);
  const title = o.title.trim(), s = parseDue(o.start, now);
  if (!s.hasTime) throw new InputError('start heeft een tijd nodig: YYYY-MM-DD HH:mm of HH:mm');
  const e = o.end === undefined ? null : parseDue(o.end, now);
  if (e && (!e.hasTime || e.dueAt <= s.dueAt)) throw new InputError('end moet een tijd na start zijn');
  const a: Appointment = { title, at: s.dueAt, endsAt: e?.dueAt ?? null };
  await store.setAppointment(a); return { appointment: a };
}
