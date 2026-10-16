/**
 * "Even stoppen": a calm sheet for when an urge or a pull to drift (gambling, porn, scrolling, anything) is there.
 * Research behind it (see docs/RESEARCH.md): a short delay, something else to do (distraction beat "urge surfing" for
 * acute craving in one trial) and slow breathing. No streak counter, no judgement, no content is asked or stored.
 * Pure: time is passed in. The log is only ever kept on this device.
 */
export const URGE_DELAY_MS = 10 * 60_000;
export const BREATH = { inMs: 4000, outMs: 6000 } as const;

export const urgeLeft = (startedAt: number, now: number): number => Math.max(0, startedAt + URGE_DELAY_MS - now);

export interface Breath { phase: 'in' | 'out'; label: 'Adem in' | 'Adem uit'; /** 0..1, how full the lungs are, for a circle */ fill: number }
/** Slow breathing, 4 s in and 6 s out. Smooth (eased) so the circle does not jerk. */
export function breath(elapsedMs: number): Breath {
  const cycle = BREATH.inMs + BREATH.outMs, t = ((elapsedMs % cycle) + cycle) % cycle;
  const ease = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;
  return t < BREATH.inMs
    ? { phase: 'in', label: 'Adem in', fill: ease(t / BREATH.inMs) }
    : { phase: 'out', label: 'Adem uit', fill: 1 - ease((t - BREATH.inMs) / BREATH.outMs) };
}

/** Small, physical, different from the urge. Not a task list. */
export const DISTRACTIONS: readonly string[] = [
  'Drink een glas water.', 'Sta op en loop een rondje door het huis.', 'Ga even naar buiten, vijf minuten.',
  'Doe tien squats of push-ups.', 'Bel of app iemand, ook al is het over niks.', 'Was je gezicht met koud water.',
];
export const distractionFor = (n: number): string => DISTRACTIONS[((n % DISTRACTIONS.length) + DISTRACTIONS.length) % DISTRACTIONS.length];

export type UrgeOutcome = 'overleefd' | 'gebeurd' | 'gestopt';
export interface UrgeEntry { at: number; outcome: UrgeOutcome }
const OUTCOMES: readonly string[] = ['overleefd', 'gebeurd', 'gestopt'];
export const MAX_LOG = 200;

/** Reads the device log; garbage gives an empty log. */
export function parseLog(raw: string | null): UrgeEntry[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((e): e is UrgeEntry => !!e && typeof e.at === 'number' && Number.isFinite(e.at) && OUTCOMES.includes(e.outcome)).slice(-MAX_LOG);
  } catch { return []; }
}
export const addEntry = (log: readonly UrgeEntry[], e: UrgeEntry): UrgeEntry[] => [...log, e].slice(-MAX_LOG);

/** What Dashy says at the end: calm, no numbers. */
export function closing(outcome: UrgeOutcome): string {
  switch (outcome) {
    case 'overleefd': return 'Goed gedaan. De golf is voorbij.';
    case 'gebeurd': return 'Het is gebeurd. Dat zegt niets over jou. Kies één klein ding voor het volgende uur.';
    case 'gestopt': return 'Prima. Je kunt altijd terugkomen.';
  }
}
