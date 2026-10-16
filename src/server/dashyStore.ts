/**
 * The state behind the MCP: one small document (driver state + Claude's current mood), plus the pure functions that change it.
 * No network, no clock: time is passed in. The Redis store at the bottom is the only part that touches a service.
 */
import { ALLOWED_STATES, MAX_LINE, oneLine, type AllowedState } from '../advice';
import type { DashyState } from '../core';
import { initialDriverState, nextWakeAt, reduce, resolve, type DriverEvent, type DriverState, type RuleName } from '../driver';

export interface Mood { state: AllowedState; line: string; until: number }
export interface Doc { rev: number; driver: DriverState; mood: Mood | null }
export const emptyDoc = (now: number): Doc => ({ rev: 0, driver: initialDriverState(now), mood: null });

export const LIMITS = { openTasks: 200, moodMinutesDefault: 30, moodMinutesMax: 240, idPattern: /^[A-Za-z0-9_-]{1,64}$/ } as const;
const YEAR = 366 * 24 * 3600_000;

/** What Dashy shows right now, and when it may change by itself. */
export interface View {
  state: DashyState; line: string; source: 'driver' | 'claude'; rule: RuleName;
  /** ms epoch of the next moment the answer can change without a new event; null = only on an event */
  nextWakeAt: number | null;
  rev: number;
}

export function view(doc: Doc, now: number): View {
  const r = resolve(doc.driver, now);
  const mood = doc.mood && now < doc.mood.until ? doc.mood : null;
  const open = r.rule === 'idle' || r.rule === 'quiet';
  const wakes = [nextWakeAt(doc.driver, now), mood ? mood.until : null].filter((x): x is number => x !== null);
  const base = { rule: r.rule, rev: doc.rev, nextWakeAt: wakes.length ? Math.min(...wakes) : null };
  return mood && open ? { ...base, state: mood.state, line: mood.line, source: 'claude' } : { ...base, state: r.state, line: '', source: 'driver' };
}

export type Call =
  | { tool: 'task'; action: 'added' | 'done' | 'removed' | 'due'; id: string; due?: string | null }
  | { tool: 'flag'; flag: 'waiting' | 'blocked' | 'break' | 'working'; value: boolean }
  | { tool: 'activity' }
  | { tool: 'mood'; state?: string; line?: string; minutes?: number; clear?: boolean };

export type Outcome = { ok: true; doc: Doc; note?: string } | { ok: false; error: string };

function parseDue(due: string | null | undefined, now: number): { ok: true; ms: number | null } | { ok: false; error: string } {
  if (due === null || due === undefined || due === '') return { ok: true, ms: null };
  const ms = Date.parse(due);
  if (!Number.isFinite(ms)) return { ok: false, error: `due is not a valid ISO 8601 date-time: ${oneLine(due, 40)}` };
  if (Math.abs(ms - now) > YEAR) return { ok: false, error: 'due is more than a year away from now' };
  return { ok: true, ms };
}

/** Pure: returns a new document or an error. Never mutates the input. */
export function apply(doc: Doc, call: Call, now: number): Outcome {
  const bump = (d: Omit<Doc, 'rev'>): Doc => ({ ...d, rev: doc.rev + 1 });
  switch (call.tool) {
    case 'task': {
      if (!LIMITS.idPattern.test(call.id ?? '')) return { ok: false, error: 'id must be 1-64 characters: letters, digits, - and _' };
      let event: DriverEvent;
      if (call.action === 'done' || call.action === 'removed') {
        // Lenient on purpose: a task from before the connection is still worth celebrating (done) or is simply gone (removed).
        event = { type: call.action === 'done' ? 'taskDone' : 'taskRemoved', id: call.id };
      } else {
        const due = parseDue(call.due, now);
        if (!due.ok) return due;
        if (call.action === 'added') {
          if (!(call.id in doc.driver.tasks) && Object.keys(doc.driver.tasks).length >= LIMITS.openTasks) return { ok: false, error: `at most ${LIMITS.openTasks} open tasks` };
          event = { type: 'taskAdded', id: call.id, dueAt: due.ms };
        } else {
          if (!(call.id in doc.driver.tasks)) return { ok: false, error: `no open task with id ${call.id}` };
          event = { type: 'taskDueChanged', id: call.id, dueAt: due.ms };
        }
      }
      return { ok: true, doc: bump({ driver: reduce(doc.driver, event, now), mood: doc.mood }) };
    }
    case 'flag': {
      if (!['waiting', 'blocked', 'break', 'working'].includes(call.flag) || typeof call.value !== 'boolean') return { ok: false, error: 'flag must be waiting, blocked, break or working, with a boolean value' };
      const type = call.flag === 'break' ? 'break' : call.flag;
      return { ok: true, doc: bump({ driver: reduce(doc.driver, { type, value: call.value } as DriverEvent, now), mood: doc.mood }) };
    }
    case 'activity':
      return { ok: true, doc: bump({ driver: reduce(doc.driver, { type: 'activity' }, now), mood: doc.mood }) };
    case 'mood': {
      if (call.clear) return { ok: true, doc: bump({ driver: doc.driver, mood: null }) };
      if (!(ALLOWED_STATES as readonly string[]).includes(call.state ?? '')) return { ok: false, error: `state must be one of: ${ALLOWED_STATES.join(', ')}` };
      const line = oneLine(call.line ?? '', MAX_LINE);
      if (!line || (call.line ?? '').length > MAX_LINE) return { ok: false, error: `line is required and at most ${MAX_LINE} characters` };
      const minutes = call.minutes ?? LIMITS.moodMinutesDefault;
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > LIMITS.moodMinutesMax) return { ok: false, error: `minutes must be between 1 and ${LIMITS.moodMinutesMax}` };
      const next = bump({ driver: doc.driver, mood: { state: call.state as AllowedState, line, until: now + minutes * 60_000 } });
      const shown = view(next, now);
      return { ok: true, doc: next, note: shown.source === 'claude' ? undefined : `The mood is saved but not shown now: the app has something more urgent (${shown.rule}). It shows if that clears within ${minutes} minutes.` };
    }
  }
}

// ---------- storage ----------
export interface Store { load(): Promise<Doc | null>; save(doc: Doc): Promise<void> }

export class MemoryStore implements Store {
  doc: Doc | null = null;
  async load() { return this.doc ? structuredClone(this.doc) : null; }
  async save(d: Doc) { this.doc = structuredClone(d); }
}

/** Validates what came out of storage, so a corrupt value never crashes the endpoints. */
export function parseDoc(raw: unknown): Doc | null {
  try {
    const d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Doc;
    if (!d || typeof d.rev !== 'number' || !d.driver || typeof d.driver.tasks !== 'object' || d.driver.tasks === null || typeof d.driver.lastActivityAt !== 'number') return null;
    for (const v of Object.values(d.driver.tasks)) if (v !== null && typeof v !== 'number') return null;
    if (d.mood !== null && d.mood !== undefined && (!(ALLOWED_STATES as readonly string[]).includes(d.mood.state) || typeof d.mood.line !== 'string' || typeof d.mood.until !== 'number')) return null;
    return { rev: d.rev, driver: d.driver, mood: d.mood ?? null };
  } catch { return null; }
}

/**
 * Read-modify-write on one document. Two writes in the same few milliseconds could overwrite each other
 * (last write wins); for one person talking to one Claude that is acceptable, and it is documented.
 */
export async function update(store: Store, now: number, call: Call): Promise<{ outcome: Outcome; doc: Doc }> {
  const doc = parseDoc(await store.load()) ?? emptyDoc(now);
  const outcome = apply(doc, call, now);
  if (outcome.ok) await store.save(outcome.doc);
  return { outcome, doc: outcome.ok ? outcome.doc : doc };
}
export async function read(store: Store, now: number): Promise<Doc> {
  return parseDoc(await store.load()) ?? emptyDoc(now);
}
