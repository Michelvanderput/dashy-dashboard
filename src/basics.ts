/**
 * The basics of a day as quiet ticks: eaten, drunk, been outside, medication. Today only: tomorrow they are empty again,
 * and nothing remembers earlier days (no history, no counting). Lives on this device.
 */
export const DEFAULT_BASICS = ['eten', 'drinken', 'buiten', 'medicijnen'] as const;
const MAX_ITEMS = 6, MAX_LEN = 20;

/** "eten, drinken, buiten": the list you want (VITE_BASICS). Empty or invalid gives the default. */
export function parseBasics(text: string | undefined): string[] {
  const items = (text ?? '').split(',').map(s => s.trim().toLowerCase()).filter(s => /^[\p{L}][\p{L} -]*$/u.test(s) && s.length <= MAX_LEN);
  const uniq = [...new Set(items)].slice(0, MAX_ITEMS);
  return uniq.length ? uniq : [...DEFAULT_BASICS];
}
export interface BasicsState { day: string; done: string[] }
/** What is ticked for `day`; a stored state from another day counts as nothing. */
export function parseBasicsState(text: string | null, day: string): BasicsState {
  try {
    const v = JSON.parse(text ?? 'null') as Record<string, unknown> | null;
    if (v && v.day === day && Array.isArray(v.done)) return { day, done: v.done.filter((x): x is string => typeof x === 'string').slice(0, 12) };
  } catch { /* nothing stored */ }
  return { day, done: [] };
}
export const toggleBasic = (s: BasicsState, item: string): BasicsState => ({ day: s.day, done: s.done.includes(item) ? s.done.filter(x => x !== item) : [...s.done, item] });
