/** Kiosk mode (a phone or tablet on the charger, just to look at): helpers. Pure. */

/** `?kiosk=1` (or `?kiosk`) turns it on. */
export function isKiosk(search: string): boolean {
  const v = new URLSearchParams(search).get('kiosk');
  return v !== null && v !== '0' && v.toLowerCase() !== 'false';
}

/**
 * A small shift of the whole screen, different every few minutes, so a static picture does not burn into an OLED screen over weeks.
 * Deterministic in the time (no randomness), at most `max` px in each direction, and the same for everyone within the same period.
 */
export function burnInOffset(now: number, max = 6, periodMs = 3 * 60_000): { x: number; y: number } {
  const n = Math.floor(now / periodMs);
  const h = (k: number) => { let x = Math.imul(n + 1, 2654435761) ^ Math.imul(k + 7, 40503); x = Math.imul(x ^ (x >>> 15), 2246822519); x ^= x >>> 13; return ((x >>> 0) / 4294967295) * 2 - 1; };
  return { x: Math.round(h(1) * max) || 0, y: Math.round(h(2) * max) || 0 }; // "|| 0" turns -0 into 0
}
