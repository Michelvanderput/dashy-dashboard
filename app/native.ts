/**
 * The Mac app's own commands (src-tauri/src/lib.rs). Outside Tauri (a normal browser, for development and screenshots) a small pretend
 * version answers, so the record player window can be built and looked at without a Mac and speakers.
 */
export interface InputInfo { name: string; is_default: boolean }
export interface Room { name: string; addr: string; uuid: string; model: string }
export interface Status { listening: boolean; device: string | null; rate: number | null; playing: boolean; streaming: boolean; listeners: number; url: string | null; rooms: Room[]; /** what the speakers were playing before we took over, e.g. "Spotify in Woonkamer" */ took_over: string[]; /** the priority mode is on */ auto: boolean }

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type Handler = (payload: unknown) => void;
const bus = new Map<string, Set<Handler>>();
const emit = (name: string, payload: unknown) => bus.get(name)?.forEach(h => h(payload));

// ---- the pretend version
const demo: Status = { listening: false, device: null, rate: null, playing: false, streaming: false, listeners: 0, url: null, rooms: [], took_over: [], auto: false };
let timers: ReturnType<typeof setInterval>[] = [];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const DEMO_ROOMS: Room[] = [['Woonkamer', 'RINCON_A'], ['Keuken', 'RINCON_B'], ['Slaapkamer', 'RINCON_C']].map(([name, uuid], i) => ({ name, uuid, addr: `192.168.1.${20 + i}:1400`, model: 'Sonos Five' }));
const mock: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
  audio_inputs: async () => [{ name: 'Line-ingang (demo)', is_default: true }, { name: 'Microfoon (demo)', is_default: false }],
  status: async () => ({ ...demo }),
  listen_start: async a => {
    demo.listening = true; demo.device = String(a.device ?? 'Line-ingang (demo)'); demo.rate = 44100; emit('turntable', { playing: false });
    timers.forEach(clearInterval); let t = 0;
    timers = [setInterval(() => { t += 0.05; const on = t > 3; emit('audio-level', { level: on ? 0.04 + 0.03 * Math.abs(Math.sin(t * 3)) : 0.0015 }); if (on && !demo.playing) { demo.playing = true; emit('turntable', { playing: true }); } }, 50)];
    return { ...demo };
  },
  listen_stop: async () => { timers.forEach(clearInterval); Object.assign(demo, { listening: false, playing: false, streaming: false, listeners: 0, url: null, rooms: [], took_over: [] }); emit('turntable', { playing: false }); return { ...demo }; },
  sonos_discover: async () => { await wait(900); return DEMO_ROOMS; },
  sonos_add: async a => { await wait(300); const addr = String(a.addr); if (addr === '0') throw 'Geen Sonos gevonden op 0'; return { name: 'Badkamer', addr: `${addr}:1400`, uuid: 'RINCON_D', model: 'Sonos Era 100' }; },
  stream_start: async a => { await wait(700); Object.assign(demo, { streaming: true, rooms: a.rooms as Room[], url: 'http://192.168.1.7:5000/dashy.mp3', listeners: 0, took_over: ['Spotify in ' + (a.rooms as Room[])[0].name] }); setTimeout(() => { demo.listeners = 1; }, 1500); return { ...demo }; },
  stream_stop: async () => { await wait(300); Object.assign(demo, { streaming: false, listeners: 0, url: null, rooms: [], took_over: [] }); return { ...demo }; },
  auto_set: async a => { demo.auto = a.enabled === true; return { ...demo }; },
  sonos_volume: async () => undefined,
};

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (inTauri) { const { invoke } = await import('@tauri-apps/api/core'); return invoke<T>(cmd, args); }
  return (mock[cmd] ?? (async () => { throw `Onbekend: ${cmd}`; }))(args) as Promise<T>;
}
/** Listen to an event from the Rust side. Returns the function that stops listening. */
export async function on<T>(name: string, cb: (payload: T) => void): Promise<() => void> {
  if (inTauri) { const { listen } = await import('@tauri-apps/api/event'); return listen<T>(name, e => cb(e.payload)); }
  const h = cb as Handler; if (!bus.has(name)) bus.set(name, new Set()); bus.get(name)!.add(h);
  return () => { bus.get(name)?.delete(h); };
}
/** The text of an error from a command (Rust sends plain strings). */
export const errorText = (e: unknown) => (typeof e === 'string' ? e : e instanceof Error ? e.message : 'Er ging iets mis');
