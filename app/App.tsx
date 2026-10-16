import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Dashboard, useNow, useRemoteDashy, useSpotify } from '../src/react';
import { adoptHash, loadConnection } from '../src/connection';
import { webStore } from '../src/spotify/auth';
import { sendAction } from '../src/state-client';
import { initialModel, reducer, type Action, type PlanItem } from '../src/dashboard/plan';
import { resolve, type Resolution, type RuleName } from '../src/driver';
import { DemoPanel } from './DemoPanel';
import { demoTrack, seedItems } from './demo';

const env = import.meta.env as Record<string, string | undefined>;
const MIN = 60_000;

/** Open the app once with  /#key=<read token>&act=<action token>  : both stay on this device, never in the public bundle. */
function connect() {
  try {
    const store = webStore('local');
    const { cleaned, adopted } = adoptHash(location.hash, store);
    if (adopted) history.replaceState(null, '', location.pathname + location.search + cleaned);
    return loadConnection(store, location.origin);
  } catch { return null; }
}

/** Map what the server says (MCP) back to a rule, for the attention logic. */
const RULES: RuleName[] = ['done', 'received', 'blocked', 'deadlineSoon', 'deadlineNear', 'waiting', 'break', 'working', 'quiet', 'idle'];
const fromRemote = (state: Resolution['state'], rule?: string): Resolution => ({ state, rule: (RULES as string[]).includes(rule ?? '') ? (rule as RuleName) : 'idle' });

export function App() {
  const now = useNow(1000);
  const nowRef = useRef(now); nowRef.current = now;
  const [model, send] = useReducer((m: ReturnType<typeof initialModel>, a: Action & { at: number }) => reducer(m, a, a.at), undefined, () => initialModel(seedItems(Date.now()), Date.now()));
  const dispatch = (a: Action) => send({ ...a, at: Date.now() });
  const [track, setTrack] = useState(0);
  const [demoMusic, setDemoMusic] = useState(false);

  // Real sources, when configured in .env.local; otherwise the demo.
  const spotifyId = env.VITE_SPOTIFY_CLIENT_ID;
  const sp = useSpotify({ clientId: spotifyId ?? 'not-configured', redirectUri: env.VITE_SPOTIFY_REDIRECT_URI ?? `${location.origin}/` });
  const connection = useMemo(connect, []);
  const remoteOn = !!connection;
  const remote = useRemoteDashy({ url: connection?.stateUrl ?? '', token: connection?.token ?? '', enabled: remoteOn });

  // Real mode (connected via the link): never show the invented demo day. Dashy and the lists follow the server (what Claude put there).
  const local = resolve(model.driver, now);
  const useRemote = remoteOn && remote.source !== 'fallback';
  const resolution = remoteOn ? (useRemote ? fromRemote(remote.state, remote.rule) : fromRemote('idle', 'idle')) : local;
  const items = remoteOn ? remote.items : model.items;
  const hour = new Date(now).getHours(), night = hour >= 22 || hour < 7;
  const line = useRemote && remote.source === 'claude' ? remote.line : undefined;

  const nowPlaying = spotifyId ? sp.nowPlaying : demoMusic ? demoTrack(now, true, track) : null;
  useEffect(() => { dispatch({ type: 'music', playing: !!nowPlaying?.playing }); }, [nowPlaying?.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (item: PlanItem) => dispatch({ type: 'add', item });
  const actions = useMemo(() => ({
    deadline: (m: number) => add({ id: `d${Date.now()}`, kind: 'task', title: m > 30 ? 'Offerte afronden' : 'Factuur versturen', at: Date.now() + m * MIN }),
    appointment: (m: number) => add({ id: `a${Date.now()}`, kind: 'event', title: 'Bellen met de klant', at: Date.now() + m * MIN, endsAt: Date.now() + (m + 30) * MIN }),
    finishFirst: () => { const t = model.items.filter(i => i.kind === 'task' && !i.done).sort((a, b) => (a.at ?? 1e18) - (b.at ?? 1e18))[0]; if (t) dispatch({ type: 'done', id: t.id }); },
    music: () => setDemoMusic(v => !v), nextTrack: () => { setTrack(t => t + 1); setDemoMusic(true); },
    flag: (f: 'waiting' | 'blocked' | 'break') => dispatch({ type: 'flag', flag: f, value: !(f === 'waiting' ? model.driver.waiting : f === 'blocked' ? model.driver.blocked : model.driver.onBreak) }),
    reset: () => { setDemoMusic(false); dispatch({ type: 'reset', items: seedItems(Date.now()) }); },
    state: { music: demoMusic, waiting: model.driver.waiting, blocked: model.driver.blocked, onBreak: model.driver.onBreak },
  }), [model, demoMusic]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Dashboard
        now={now} items={items} resolution={resolution} line={line} night={night} keepAwake emptyText={remoteOn ? 'Vraag Claude om iets op je scherm te zetten.' : undefined}
        music={{ nowPlaying, status: spotifyId ? sp.status : 'connected', onConnect: spotifyId ? sp.connect : undefined, onDisconnect: spotifyId ? sp.disconnect : undefined, error: sp.error, spotifyLogoSrc: env.VITE_SPOTIFY_LOGO }}
        focusTaskId={remoteOn ? remote.focusId : undefined}
        onToggleDone={remoteOn ? (connection!.actionToken ? (id, done) => { void sendAction({ url: connection!.actionUrl, token: connection!.actionToken!, action: done ? 'done' : 'undo', id }).then(r => { if (r) remote.apply(r); }); } : undefined) : (id, done) => dispatch({ type: done ? 'done' : 'undo', id })}
      />
      {!remoteOn && <DemoPanel a={actions} />}
    </>
  );
}
