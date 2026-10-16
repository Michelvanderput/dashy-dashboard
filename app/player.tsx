import { StrictMode, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { TURNTABLE_LABEL, levelToMeter, roomList, turntableMood } from '../src';
import { Grooves } from '../src/react/NowPlayingBlock';
import { call, errorText, on, type InputInfo, type Room, type Status } from './native';

/**
 * The record player window (opened from the menu bar item): choose the aux input, see whether a record is playing, choose the Sonos
 * speakers and send the sound to them. The heavy lifting (audio, stream, Sonos) is in src-tauri/src.
 */
const LS = 'dashy.player';
type Saved = { device?: string; rooms?: Room[]; selected?: string[]; volume?: number; auto?: boolean };
const load = (): Saved => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } };
const save = (s: Saved) => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* private mode */ } };
const EMPTY: Status = { listening: false, device: null, rate: null, playing: false, streaming: false, listeners: 0, url: null, rooms: [], took_over: [], auto: false };

function Player() {
  const [saved, setSaved] = useState<Saved>(load);
  const [inputs, setInputs] = useState<InputInfo[]>([]);
  const [st, setSt] = useState<Status>(EMPTY);
  const [level, setLevel] = useState(0);
  const [rooms, setRooms] = useState<Room[]>(saved.rooms ?? []);
  const [selected, setSelected] = useState<string[]>(saved.selected ?? []);
  const [volume, setVolume] = useState(saved.volume ?? 25);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [addr, setAddr] = useState('');
  const volTimer = useRef<ReturnType<typeof setTimeout>>();

  const keep = (patch: Partial<Saved>) => { const n = { ...saved, ...patch }; setSaved(n); save(n); };
  const run = async (what: string, f: () => Promise<void>) => { setBusy(what); setErr(null); try { await f(); } catch (e) { setErr(errorText(e)); } finally { setBusy(null); } };

  useEffect(() => {
    void call<InputInfo[]>('audio_inputs').then(setInputs).catch(() => {});
    void call<Status>('status').then(setSt).catch(() => {});
    const offs: (() => void)[] = []; let gone = false;
    void Promise.all([
      on<{ level: number }>('audio-level', e => setLevel(e.level)),
      on<{ playing: boolean }>('turntable', e => setSt(s => ({ ...s, playing: e.playing }))),
      on<Status>('stream-status', s => setSt(s)), // the priority mode starts and stops the stream by itself
      on<string>('player-error', e => setErr(errorText(e))),
    ]).then(o => { if (gone) o.forEach(f => f()); else offs.push(...o); });
    return () => { gone = true; offs.forEach(f => f()); };
  }, []);
  // while streaming, ask now and then whether the speakers really connected
  useEffect(() => {
    if (!st.streaming) return;
    const id = setInterval(() => { void call<Status>('status').then(s => setSt(s)).catch(() => {}); }, 2000);
    return () => clearInterval(id);
  }, [st.streaming]);

  const device = saved.device ?? inputs.find(i => i.is_default)?.name ?? inputs[0]?.name;
  const mood = turntableMood(st);
  const chosen = rooms.filter(r => selected.includes(r.uuid));

  const toggleListen = () => run('listen', async () => { setSt(await call<Status>(st.listening ? 'listen_stop' : 'listen_start', st.listening ? {} : { device })); if (st.listening) setLevel(0); });
  const search = () => run('search', async () => {
    const found = await call<Room[]>('sonos_discover');
    if (!found.length) throw 'Geen Sonos-speakers gevonden. Zitten ze op hetzelfde wifi-netwerk als deze Mac? Je kunt ook hieronder het adres van een speaker invullen.';
    setRooms(found); keep({ rooms: found });
  });
  const add = () => run('add', async () => {
    const r = await call<Room>('sonos_add', { addr });
    const next = [...rooms.filter(x => x.uuid !== r.uuid), r]; setRooms(next); setSelected(s => [...s, r.uuid]); keep({ rooms: next, selected: [...selected, r.uuid] }); setAddr('');
  });
  const toggleRoom = (uuid: string) => { const n = selected.includes(uuid) ? selected.filter(x => x !== uuid) : [...selected, uuid]; setSelected(n); keep({ selected: n }); if (saved.auto) void pushAuto(true, rooms.filter(r => n.includes(r.uuid)), volume); };
  /** Tell the Mac side whether the priority mode is on, and which rooms and volume it should use. */
  const pushAuto = (enabled: boolean, rs: Room[], vol: number) => call<Status>('auto_set', { enabled, rooms: rs, volume: vol }).then(setSt).catch(e => { setErr(errorText(e)); keep({ auto: false }); });
  const toggleAuto = (on: boolean) => { keep({ auto: on }); void pushAuto(on, chosen, volume); };
  const startStream = () => run('stream', async () => { setSt(await call<Status>('stream_start', { rooms: chosen, volume })); });
  const stopStream = () => run('stream', async () => { setSt(await call<Status>('stream_stop')); });
  const changeVolume = (v: number) => {
    setVolume(v); keep({ volume: v });
    if (saved.auto) void pushAuto(true, chosen, v);
    clearTimeout(volTimer.current);
    if (st.streaming) volTimer.current = setTimeout(() => { for (const r of st.rooms) void call('sonos_volume', { addr: r.addr, volume: v }).catch(e => setErr(errorText(e))); }, 250);
  };

  return (
    <main style={{ padding: 20, display: 'grid', gap: 16, maxWidth: 460, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div aria-hidden="true" style={{ width: 84, height: 84, flex: 'none', color: '#7c3aed', animation: mood === 'playing' ? 'spin 1.8s linear infinite' : 'none', background: '#7c3aed', borderRadius: '50%', opacity: mood === 'off' ? 0.4 : 1 }}><Grooves id="player-label" /></div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Platenspeler</h1>
          <p role="status" style={{ margin: '2px 0 0', color: 'var(--mute)' }}>{TURNTABLE_LABEL[mood]}</p>
        </div>
      </header>

      <Card title="1. Ingang">
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: 'var(--mute)' }}>Waar zit de aux-kabel op?</span>
          <select value={device ?? ''} disabled={st.listening || inputs.length === 0} onChange={e => keep({ device: e.target.value })} style={field}>
            {inputs.length === 0 && <option value="">Geen ingang gevonden</option>}
            {inputs.map(i => <option key={i.name} value={i.name}>{i.name}{i.is_default ? ' (standaard)' : ''}</option>)}
          </select>
        </label>
        <div role="meter" aria-label="Geluidsniveau" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelToMeter(level) * 100)} style={{ height: 10, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${levelToMeter(st.listening ? level : 0) * 100}%`, background: levelToMeter(level) > 0.92 ? '#e5484d' : 'var(--accent)', transition: 'width .08s linear' }} />
        </div>
        <button type="button" onClick={() => void toggleListen()} disabled={busy === 'listen' || (!st.listening && !device)} style={st.listening ? ghost : primary}>{st.listening ? 'Stop met luisteren' : 'Luister naar de platenspeler'}</button>
        {st.listening && <p style={note}>Luistert naar: {st.device}. Zet de naald op de plaat; zodra er muziek is, gaat Dashy dansen.</p>}
      </Card>

      <Card title="2. Sonos">
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void search()} disabled={busy === 'search'} style={ghost}>{busy === 'search' ? 'Zoeken…' : rooms.length ? 'Zoek opnieuw' : 'Zoek speakers'}</button>
        </div>
        {rooms.length > 0 && (
          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            <legend style={{ color: 'var(--mute)', padding: 0, marginBottom: 4 }}>Waar wil je het horen?</legend>
            {rooms.map(r => (
              <label key={r.uuid} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36 }}>
                <input type="checkbox" checked={selected.includes(r.uuid)} disabled={st.streaming} onChange={() => toggleRoom(r.uuid)} />
                <span>{r.name}</span><span style={{ color: 'var(--mute)' }}>{r.model}</span>
              </label>
            ))}
          </fieldset>
        )}
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--mute)' }}>Speaker niet gevonden? Vul het adres in</summary>
          <form onSubmit={e => { e.preventDefault(); void add(); }} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input aria-label="Adres van de speaker" placeholder="192.168.1.20" value={addr} onChange={e => setAddr(e.target.value)} style={{ ...field, flex: 1 }} inputMode="decimal" autoComplete="off" />
            <button type="submit" disabled={!addr.trim() || busy === 'add'} style={ghost}>Voeg toe</button>
          </form>
        </details>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: 'var(--mute)' }}>Volume: {volume}</span>
          <input type="range" min={0} max={100} value={volume} onChange={e => changeVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={!!saved.auto && st.auto} disabled={!st.listening || chosen.length === 0} onChange={e => toggleAuto(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>De platenspeler heeft voorrang</strong>
            <span style={{ display: 'block', color: 'var(--mute)', fontSize: 13 }}>Draait er een plaat, dan pauzeert Dashy wat de speakers speelden (zoals Spotify) en speelt de plaat af. Stopt de plaat, dan geeft hij de speakers weer vrij.</span>
          </span>
        </label>
        {st.streaming ? (
          <>
            <button type="button" onClick={() => void stopStream()} disabled={busy === 'stream'} style={ghost}>Stop met afspelen</button>
            <p role="status" style={note}>{st.listeners > 0 ? `Sonos luistert mee in ${roomList(st.rooms.map(r => r.name))}.` : 'Wachten tot Sonos de stream ophaalt… (Speelt er misschien iets anders op de speakers?)'} Sonos loopt 5 tot 10 seconden achter op de plaat.</p>
            {st.took_over.length > 0 && <p style={note}>Gepauzeerd om plaats te maken: {st.took_over.join(', ')}.</p>}
          </>
        ) : (
          <button type="button" onClick={() => void startStream()} disabled={busy === 'stream' || !st.listening || chosen.length === 0} style={primary}>{busy === 'stream' ? 'Bezig…' : chosen.length ? `Speel af in ${roomList(chosen.map(r => r.name))}` : 'Kies een speaker'}</button>
        )}
        {!st.listening && chosen.length > 0 && !st.streaming && <p style={note}>Zet eerst "Luister naar de platenspeler" aan.</p>}
      </Card>

      {err && <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 12, background: 'rgba(229,72,77,.12)', color: 'var(--ink)', border: '1px solid rgba(229,72,77,.4)' }}>{err}</p>}
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </main>
  );
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--line)' }}>
    <h2 style={{ margin: 0, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--mute)' }}>{title}</h2>{children}
  </section>
);
const field: CSSProperties = { minHeight: 36, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)' };
const btn: CSSProperties = { minHeight: 44, padding: '0 18px', borderRadius: 999, cursor: 'pointer', fontWeight: 600 };
const primary: CSSProperties = { ...btn, border: 0, background: 'var(--accent)', color: '#fff' };
const ghost: CSSProperties = { ...btn, border: '1.5px solid var(--line)', background: 'transparent' };
const note: CSSProperties = { margin: 0, color: 'var(--mute)', fontSize: 13 };

createRoot(document.getElementById('root')!).render(<StrictMode><Player /></StrictMode>);
