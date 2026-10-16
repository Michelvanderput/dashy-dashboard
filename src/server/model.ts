/**
 * Tasks as Dashy keeps them. Inspired by the main Dashy app (short titles, `due` and `note` kept apart, Nu doen vs Straks),
 * with three deliberate differences:
 *  - a date-only task says so (`hasTime: false`) instead of hiding as "07:00", so a real 07:00 task stays a real 07:00 task;
 *  - times are epoch ms plus that flag, never Dutch text that every reader has to parse again;
 *  - one record per task, so two writers (Claude and the screen) cannot overwrite each other's tasks.
 */
import { addDays, localParts, zonedToEpoch, TIME_ZONE } from './time.js';

export const CATEGORIES = ['werk', 'sport', 'thuis', 'prive'] as const;
export type Category = (typeof CATEGORIES)[number];
export const TITLE_MAX = 60, NOTE_MAX = 100, BATCH_MAX = 50;

export interface Task {
  id: string; title: string; category: Category;
  /** Epoch ms. With hasTime false it is local midnight of that day. */
  dueAt: number | null; hasTime: boolean;
  note: string | null; done: boolean; doneAt: number | null;
  /** Lower = earlier. Fractions and negatives are fine. */
  position: number; createdAt: number;
}
export class InputError extends Error {}

export function checkTitle(v: unknown): string {
  if (typeof v !== 'string') throw new InputError('title moet tekst zijn');
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t) throw new InputError('title mag niet leeg zijn');
  if ([...t].length > TITLE_MAX) throw new InputError(`title te lang (max ${TITLE_MAX} tekens): houd hem kort en zet details in note`);
  if (/\b\d{1,2}[:.]\d{2}\b/.test(t) || /\b\d{4}-\d{2}-\d{2}\b/.test(t)) throw new InputError('zet de tijd of datum in due, niet in de title');
  return t;
}
export function checkNote(v: unknown): string {
  if (typeof v !== 'string') throw new InputError('note moet tekst zijn');
  const t = v.trim();
  if (!t) throw new InputError('note mag niet leeg zijn (laat hem weg, of gebruik null om te wissen)');
  if ([...t].length > NOTE_MAX) throw new InputError(`note te lang (max ${NOTE_MAX} tekens)`);
  return t;
}
export function checkCategory(v: unknown): Category {
  if (!(CATEGORIES as readonly unknown[]).includes(v)) throw new InputError(`category moet een van ${CATEGORIES.join(', ')} zijn`);
  return v as Category;
}

/**
 * due: 'YYYY-MM-DD HH:mm' (a T instead of the space is fine), 'YYYY-MM-DD' (only the day is known) or 'HH:mm' (today).
 * Dutch time. A time that does not exist (the hour skipped when the clocks go forward, 30 February) is refused with a clear message.
 */
export function parseDue(v: unknown, now: number, tz = TIME_ZONE): { dueAt: number; hasTime: boolean } {
  if (typeof v !== 'string') throw new InputError("due moet tekst zijn: 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD' of 'HH:mm'");
  const s = v.trim();
  const m = /^(?:(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?|(\d{2}):(\d{2}))$/.exec(s);
  if (!m) throw new InputError("due moet 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD' of 'HH:mm' zijn (Nederlandse tijd)");
  const today = localParts(now, tz);
  let y: number, mo: number, d: number, h: number | null, mi: number | null;
  if (m[6] !== undefined) { y = today.y; mo = today.mo; d = today.d; h = +m[6]; mi = +m[7]; }
  else { y = +m[1]; mo = +m[2]; d = +m[3]; h = m[4] === undefined ? null : +m[4]; mi = m[5] === undefined ? null : +m[5]; }
  const at = zonedToEpoch(y, mo, d, h ?? 0, mi ?? 0, tz);
  if (at === null) throw new InputError(`due ${s} bestaat niet (verkeerde datum, of het uur dat overgeslagen wordt bij de wisseling naar zomertijd)`);
  return { dueAt: at, hasTime: h !== null };
}

/** The day a task belongs to, 'YYYY-MM-DD' (Dutch time). */
export const dueDay = (t: Pick<Task, 'dueAt'>, tz = TIME_ZONE) => (t.dueAt === null ? null : localParts(t.dueAt, tz).date);
export function relativeDay(now: number, n: number, tz = TIME_ZONE) {
  const p = localParts(now, tz), x = addDays(p.y, p.mo, p.d, n);
  return `${x.y}-${String(x.mo).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
}

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (0/o, 1/l/i)
export function newId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(8));
    const id = Array.from(b, x => ID_CHARS[x % ID_CHARS.length]).join('');
    if (!taken.has(id)) return id;
  }
}
