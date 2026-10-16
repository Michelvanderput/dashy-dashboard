/** Small pure helpers for the record player window and the buddy. */

/** RMS loudness (0..1) to a meter position (0..1) on a decibel scale: -60 dBFS is empty, 0 dBFS is full. A linear meter would sit at the bottom for ordinary music. */
export function levelToMeter(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 60) / 60));
}

export type TurntableMood = 'off' | 'quiet' | 'playing';
export const turntableMood = (s: { listening: boolean; playing: boolean }): TurntableMood => (!s.listening ? 'off' : s.playing ? 'playing' : 'quiet');
export const TURNTABLE_LABEL: Record<TurntableMood, string> = { off: 'Luistert niet', quiet: 'Stil: wacht op een plaat', playing: 'Platenspeler draait' };

/** "Woonkamer", "Woonkamer en Keuken", "Woonkamer, Keuken en Slaapkamer". */
export function roomList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
}
