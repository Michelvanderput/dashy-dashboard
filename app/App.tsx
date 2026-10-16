import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Dashboard, useNow, useRemoteDashy, useSpotify } from '../src/react';
import { initialModel, reducer, type Action, type PlanItem } from '../src/dashboard/plan';
import { resolve, type Resolution, type RuleName } from '../src/driver';
import { DemoPanel } from './DemoPanel';
import { demoTrack, seedItems } from './demo';

const env = import.meta.env as Record<string, string | undefined>;
const MIN = 60_000;

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
  const remoteOn = !!env.VITE_DASHY_STATE_URL && !!env.VITE_DASHY_STATE_TOKEN;
  const remote = useRemoteDashy({ url: env.VITE_DASHY_STATE_URL ?? '', token: env.VITE_DASHY_STATE_TOKEN ?? '', enabled: remoteOn });

  const local = resolve(model.driver, now);
  const useRemote = remoteOn && remote.source !== 'fallback';
  const resolution = useRemote ? fromRemote(remote.state, remote.rule) : local;
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
        now={now} items={model.items} resolution={resolution} line={line}
        music={{ nowPlaying, status: spotifyId ? sp.status : 'connected', onConnect: spotifyId ? sp.connect : undefined, onDisconnect: spotifyId ? sp.disconnect : undefined, error: sp.error, spotifyLogoSrc: env.VITE_SPOTIFY_LOGO }}
        onToggleDone={(id, done) => dispatch({ type: done ? 'done' : 'undo', id })}
      />
      {!useRemote && <DemoPanel a={actions} />}
    </>
  );
}
