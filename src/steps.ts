/**
 * A first step: the smallest thing that gets a task started ("open the mail from the bank"). It lives in the note, behind a marker,
 * so it needs no new column: "Ask about the key ▸ Open the mail from the bank". Pure and shared by the server and the screen.
 */
export const STEP_MARK = ' ▸ ';
export const STEP_MAX = 80;
const clean = (s: string) => s.replace(/▸/g, '-').replace(/\s+/g, ' ').trim();

export function splitNote(raw: string | null | undefined): { note: string; step: string } {
  const text = raw ?? '';
  const i = text.indexOf(STEP_MARK.trim());
  if (i < 0) return { note: text.trim(), step: '' };
  return { note: text.slice(0, i).trim(), step: text.slice(i + 1).trim() };
}
/** Note and step back into one text (null when both are empty). */
export function joinNote(note: string | null | undefined, step: string | null | undefined): string | null {
  const n = clean(note ?? ''), s = clean(step ?? '');
  return n && s ? `${n}${STEP_MARK}${s}` : s ? `${STEP_MARK.trim()} ${s}` : n || null;
}
