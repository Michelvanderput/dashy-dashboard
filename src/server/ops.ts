/** The operations on the task list. Validate everything first, then write: a batch with one bad item changes nothing. */
import { joinNote, splitNote } from '../steps.js';
import { BATCH_MAX, TITLE_MAX, checkCategory, checkDescription, checkMinutes, checkNote, checkProject, checkStep, checkTitle, InputError, newId, parseDay, parseDue, relativeDay, type Task, type TimeEntry } from './model.js';
import { addDays, localParts, startOfDay, zonedToEpoch, TIME_ZONE } from './time.js';
import { buildState, type Appointment, type StateBody, type WorkdayConfig } from './plan.js';
import type { Store } from './store.js';

const DONE_KEEP_MS = 14 * 24 * 3600_000; // two weeks: the week review looks back over a whole week
const obj = (v: unknown, what: string): Record<string, unknown> => { if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new InputError(`${what} moet een object zijn`); return v as Record<string, unknown>; };
const list = (v: unknown, what: string, max = BATCH_MAX): unknown[] => { if (!Array.isArray(v) || v.length < 1) throw new InputError(`${what} moet een lijst met minstens 1 item zijn`); if (v.length > max) throw new InputError(`${what}: maximaal ${max} per keer`); return v; };
const known = (o: Record<string, unknown>, keys: string[], where: string) => { for (const k of Object.keys(o)) if (!keys.includes(k)) throw new InputError(`${where}: onbekend veld "${k}"`); };
const at = (i: number, msg: string) => { throw new InputError(`item ${i + 1}: ${msg}`); };
const wrap = <T>(i: number, f: () => T): T => { try { return f(); } catch (e) { if (e instanceof InputError) return at(i, e.message); throw e; } };

/** Drops done tasks older than two weeks. Called after every write. */
async function prune(store: Store, all: Task[], now: number) {
  const old = all.filter(t => t.done && t.doneAt !== null && now - t.doneAt > DONE_KEEP_MS).map(t => t.id);
  if (old.length) await store.deleteTasks(old);
}

/**
 * The hours are an extra, never a condition: when their storage is missing (the dashy_time table was not created yet) or fails, the screen
 * still shows tasks, appointment and day, just without hours. The tools that work on hours say what to do instead (see `hoursStore`).
 */
const entriesOrNone = (store: Store) => store.entries().catch(e => { console.error('hours storage unavailable', e); return [] as TimeEntry[]; });
export const HOURS_SETUP = 'De uren-opslag is nog niet ingesteld: voer het onderste deel van db/dashy-tasks.sql (tabel dashy_time) uit in Supabase.';
/** For the hour tools: the entries, or a clear message for the user (Claude passes it on). */
async function hoursStore(store: Store): Promise<TimeEntry[]> {
  try { return await store.entries(); } catch (e) { console.error('hours storage unavailable', e); throw new InputError(HOURS_SETUP); }
}

export async function dashboard(store: Store, now: number, workday?: WorkdayConfig): Promise<StateBody> {
  const [all, appt, entries] = await Promise.all([store.tasks(), store.appointment(), entriesOrNone(store)]);
  return buildState(all, appt, now, undefined, workday, entries);
}

export async function addTasks(store: Store, input: unknown, now: number): Promise<{ added: { id: string; title: string }[] }> {
  const items = list(obj(input, 'invoer').tasks, 'tasks');
  const all = await store.tasks(), taken = new Set(all.map(t => t.id)), open = all.filter(t => !t.done);
  const maxPos = open.reduce((m, t) => Math.max(m, t.position), 0), minPos = open.reduce((m, t) => Math.min(m, t.position), 0);
  const front = items.filter(x => (x as { now?: unknown })?.now === true).length;
  let f = 0, b = 0;
  const made = items.map((raw, i): Task => wrap(i, () => {
    const o = obj(raw, 'taak'); known(o, ['title', 'category', 'due', 'note', 'step', 'now'], 'taak');
    const d = o.due === undefined ? null : parseDue(o.due, now);
    if (o.now !== undefined && typeof o.now !== 'boolean') throw new InputError('now moet true of false zijn');
    const id = newId(taken); taken.add(id);
    return { id, title: checkTitle(o.title), category: checkCategory(o.category), dueAt: d?.dueAt ?? null, hasTime: d?.hasTime ?? false, note: joinNote(o.note === undefined ? null : checkNote(o.note), o.step === undefined ? null : checkStep(o.step)), done: false, doneAt: null, createdAt: now,
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
    const o = obj(raw, 'update'); known(o, ['id', 'done', 'title', 'category', 'due', 'note', 'step', 'remove'], 'update');
    const cur = typeof o.id === 'string' ? byId.get(o.id) : undefined;
    if (!cur) throw new InputError(`taak ${String(o.id)} bestaat niet (haal het dashboard opnieuw op)`);
    if (o.remove === true) { del.push(cur.id); return; }
    const t = { ...(put.find(x => x.id === cur.id) ?? cur) };
    if (o.title !== undefined) t.title = checkTitle(o.title);
    if (o.category !== undefined) t.category = checkCategory(o.category);
    if (o.note !== undefined || o.step !== undefined) {
      const was = splitNote(t.note);
      t.note = joinNote(o.note === undefined ? was.note : o.note === null ? null : checkNote(o.note), o.step === undefined ? was.step : o.step === null ? null : checkStep(o.step));
    }
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

/**
 * The one write the screen may do: check a task off or undo it. Idempotent (checking off a done task changes nothing, so a double tap
 * or a retry is harmless). Returns false when there is no such task.
 */
export async function setDone(store: Store, id: string, done: boolean, now: number): Promise<boolean> {
  const t = (await store.tasks()).find(x => x.id === id);
  if (!t) return false;
  if (t.done === done) return true;
  await store.putTasks([{ ...t, done, doneAt: done ? now : null }]);
  return true;
}

// ---------------------------------------------------------------- hours

const ENTRIES_MAX = 20;
const BOOKED_KEEP_DAYS = 120;
/** Drops booked entries older than 120 days. Unbooked ones stay until they are booked. */
async function pruneEntries(store: Store, all: TimeEntry[], now: number) {
  const cutoff = relativeDay(now, -BOOKED_KEEP_DAYS);
  const old = all.filter(e => e.booked && e.day < cutoff).map(e => e.id);
  if (old.length) await store.deleteEntries(old);
}
const sumMin = (es: TimeEntry[]) => es.reduce((a, e) => a + e.minutes, 0);
const perProject = (es: TimeEntry[]) => {
  const m = new Map<string | null, [number, number]>();
  for (const e of es) { const c = m.get(e.project) ?? [0, 0]; c[0] += e.minutes; if (!e.booked) c[1] += e.minutes; m.set(e.project, c); }
  return [...m.entries()].map(([p, [min, un]]) => [p, min, un] as [string | null, number, number]).sort((a, b) => b[1] - a[1]);
};

/** Time spent: "2 hours for client A on the report". A batch with one bad entry changes nothing. */
export async function logTime(store: Store, input: unknown, now: number): Promise<{ logged: { id: string; day: string; project: string | null; minutes: number }[]; vandaag_min: number }> {
  const items = list(obj(input, 'invoer').entries, 'entries', ENTRIES_MAX);
  const [tasks, all] = await Promise.all([store.tasks(), hoursStore(store)]);
  const taken = new Set(all.map(e => e.id)), today = localParts(now).date;
  const made = items.map((raw, i): TimeEntry => wrap(i, () => {
    const o = obj(raw, 'entry'); known(o, ['minutes', 'description', 'project', 'day', 'task'], 'entry');
    const task = o.task === undefined ? null : tasks.find(t => t.id === o.task);
    if (o.task !== undefined && !task) throw new InputError(`taak ${String(o.task)} bestaat niet`);
    if (o.description === undefined && !task) throw new InputError('description is nodig (of een task om de omschrijving van over te nemen)');
    const id = newId(taken); taken.add(id);
    return { id, day: o.day === undefined ? today : parseDay(o.day, now), project: o.project === undefined || o.project === null ? null : checkProject(o.project), description: o.description === undefined ? task!.title : checkDescription(o.description), minutes: checkMinutes(o.minutes), booked: false, taskId: task?.id ?? null, createdAt: now };
  }));
  await store.putEntries(made);
  await pruneEntries(store, all, now);
  return { logged: made.map(e => ({ id: e.id, day: e.day, project: e.project, minutes: e.minutes })), vandaag_min: sumMin([...all, ...made].filter(e => e.day === today)) };
}

/** Correct an entry: other minutes or project, move it to another day, or remove it. */
export async function editTime(store: Store, input: unknown, now: number): Promise<{ updated: string[]; removed: string[] }> {
  const items = list(obj(input, 'invoer').edits, 'edits', ENTRIES_MAX);
  const all = await hoursStore(store), byId = new Map(all.map(e => [e.id, e]));
  const put = new Map<string, TimeEntry>(), del: string[] = [];
  items.forEach((raw, i) => wrap(i, () => {
    const o = obj(raw, 'edit'); known(o, ['id', 'minutes', 'project', 'description', 'day', 'booked', 'remove'], 'edit');
    const cur = typeof o.id === 'string' ? byId.get(o.id) : undefined;
    if (!cur) throw new InputError(`uren-regel ${String(o.id)} bestaat niet (haal time_log opnieuw op)`);
    if (o.remove === true) { del.push(cur.id); put.delete(cur.id); return; }
    const e = { ...(put.get(cur.id) ?? cur) };
    if (o.minutes !== undefined) e.minutes = checkMinutes(o.minutes);
    if (o.project !== undefined) e.project = o.project === null ? null : checkProject(o.project);
    if (o.description !== undefined) e.description = checkDescription(o.description);
    if (o.day !== undefined) e.day = parseDay(o.day, now);
    if (o.booked !== undefined) { if (typeof o.booked !== 'boolean') throw new InputError('booked moet true of false zijn'); e.booked = o.booked; }
    put.set(e.id, e);
  }));
  await store.putEntries([...put.values()]); await store.deleteEntries(del);
  return { updated: [...put.keys()], removed: del };
}

/** After booking the hours in the time sheet: mark them. By ids, or a whole day (optionally one project). */
export async function markBooked(store: Store, input: unknown, now: number): Promise<{ gemarkeerd: number; min: number }> {
  const o = obj(input, 'invoer'); known(o, ['ids', 'day', 'project', 'booked'], 'invoer');
  if (o.ids === undefined && o.day === undefined) throw new InputError('geef ids of een day');
  if (o.booked !== undefined && typeof o.booked !== 'boolean') throw new InputError('booked moet true of false zijn');
  const booked = o.booked !== false, all = await hoursStore(store);
  let pick: TimeEntry[];
  if (o.ids !== undefined) {
    const ids = list(o.ids, 'ids', 100).map((x, i) => typeof x === 'string' ? x : at(i, 'id moet tekst zijn'));
    const missing = ids.filter(id => !all.some(e => e.id === id)); if (missing.length) throw new InputError(`geen uren-regel met id: ${missing.join(', ')}`);
    pick = all.filter(e => ids.includes(e.id));
  } else {
    const day = parseDay(o.day, now), project = o.project === undefined ? undefined : checkProject(o.project);
    pick = all.filter(e => e.day === day && (project === undefined || e.project === project));
  }
  await store.putEntries(pick.map(e => ({ ...e, booked })));
  return { gemarkeerd: pick.length, min: sumMin(pick) };
}

/** One day of hours, compact: [id, project, description, minutes, booked]. Default today. */
export async function timeLog(store: Store, input: unknown, now: number) {
  const o = obj(input ?? {}, 'invoer'); known(o, ['day'], 'invoer');
  const today = localParts(now).date, day = o.day === undefined ? today : parseDay(o.day, now);
  const all = await hoursStore(store), mine = all.filter(e => e.day === day).sort((a, b) => a.createdAt - b.createdAt);
  return {
    day, regels: mine.map(e => [e.id, e.project, e.description, e.minutes, e.booked]), regels_format: '[id, project, omschrijving, minuten, geboekt]',
    totaal_min: sumMin(mine), te_boeken_min: sumMin(mine.filter(e => !e.booked)), per_project: perProject(mine), per_project_format: '[project, minuten, nog te boeken]',
    eerder_te_boeken_min: sumMin(all.filter(e => e.day < today && !e.booked)),
  };
}

// ---------------------------------------------------------------- the week review

const DAY_NAMES = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const dateOf = (y: number, m: number, d: number, n: number) => { const x = addDays(y, m, d, n); return `${x.y}-${String(x.mo).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`; };
const epochOf = (date: string) => { const [y, m, d] = date.split('-').map(Number); return zonedToEpoch(y, m, d, 0, 0, TIME_ZONE) ?? startOfDay(zonedToEpoch(y, m, d, 12, 0, TIME_ZONE)!); };

/**
 * The facts of a week (Monday to Sunday), for the story Claude writes in the buddy's voice: what got done (per category, per day, per part of
 * the day), the hours per project, and what is still open from that week. No judgement and no score in here on purpose.
 */
export async function weekReview(store: Store, input: unknown, now: number) {
  const o = obj(input ?? {}, 'invoer'); known(o, ['week_of'], 'invoer');
  const anchor = o.week_of === undefined ? localParts(now).date : parseDay(o.week_of, now, TIME_ZONE, 7); // any date in the week, also later this week
  const [ay, am, ad] = anchor.split('-').map(Number), wd = localParts(zonedToEpoch(ay, am, ad, 12, 0)!).weekday;
  const monday = dateOf(ay, am, ad, -((wd + 6) % 7)), [my, mm, md] = monday.split('-').map(Number);
  const days = DAY_NAMES.map((_, i) => dateOf(my, mm, md, i)), nextMonday = dateOf(my, mm, md, 7);
  const from = epochOf(monday), to = epochOf(nextMonday);
  const [tasks, entries] = await Promise.all([store.tasks(), hoursStore(store)]);
  const done = tasks.filter(t => t.done && t.doneAt !== null && t.doneAt >= from && t.doneAt < to).sort((a, b) => a.doneAt! - b.doneAt!);
  const perCategory: Record<string, number> = {}; for (const t of done) perCategory[t.category] = (perCategory[t.category] ?? 0) + 1;
  const perDay = Object.fromEntries(DAY_NAMES.map(n => [n, 0])) as Record<string, number>, perPart = { ochtend: 0, middag: 0, avond: 0 };
  for (const t of done) {
    const p = localParts(t.doneAt!), i = days.indexOf(p.date); if (i >= 0) perDay[DAY_NAMES[i]]++;
    perPart[p.h < 12 ? 'ochtend' : p.h < 18 ? 'middag' : 'avond']++;
  }
  const mine = entries.filter(e => e.day >= monday && e.day < nextMonday), today0 = startOfDay(now);
  return {
    week: { van: monday, tot: days[6], loopt_nog: localParts(now).date >= monday && localParts(now).date < nextMonday },
    gedaan: { totaal: done.length, per_categorie: perCategory, per_dag: perDay, per_dagdeel: perPart, titels: done.slice(-12).map(t => t.title) },
    uren: { totaal_min: sumMin(mine), te_boeken_min: sumMin(mine.filter(e => !e.booked)), per_project: perProject(mine), per_project_format: '[project, minuten, nog te boeken]' },
    nog_open_uit_deze_week: tasks.filter(t => !t.done && t.dueAt !== null && t.dueAt >= from && t.dueAt < to && t.dueAt < today0).length,
  };
}
