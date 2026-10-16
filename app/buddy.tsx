import { StrictMode, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { adoptPastedLink, forgetTasksConnection, mountDashy, nowTask, type DashyHandle } from '../src';
import { musicState } from '../src/spotify/model';
import { useDashyTasks } from '../src/react';
import { initialConnection, store } from './storage';

/**
 * Dashy as a small floating buddy (the Mac app, see src-tauri/). The same Dashy and the same task connection as the web app.
 * Outside Tauri this page works in any browser too, which is how it is developed and tested.
 *
 * The Rust side sends two events: "cursor" (where the mouse is relative to him, -1..1, anywhere on screen) and "unlink".
 */
const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function Buddy() {
  const [conn, setConn] = useState(initialConnection);
  const tasks = useDashyTasks({ url: conn?.url, token: conn?.token, actionUrl: conn?.actionUrl, actionToken: conn?.actionToken });
  const host = useRef<HTMLDivElement>(null), handle = useRef<DashyHandle | null>(null);
  const [bad, setBad] = useState(false);
  const [record, setRecord] = useState(false); // a record is really playing on the turntable

  useEffect(() => {
    const h = mountDashy(host.current!, { initialState: 'idle', ambient: 1.3, perspective: 1.5 });
    handle.current = h;
    return () => { h.destroy(); handle.current = null; };
  }, []);
  // facts beat feelings: he dances to the record only when nothing urgent is going on (same rule as for Spotify)
  const shown = musicState({ state: tasks.state, rule: tasks.rule }, record);
  useEffect(() => { const h = handle.current; if (h && h.getState() !== shown) h.setState(shown); }, [shown]);

  // the global cursor and the menu bar's "Koppeling wissen", from the Rust side
  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void)[] = [], gone = false;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const a = await listen<{ nx: number; ny: number }>('cursor', e => handle.current?.look(e.payload.nx, e.payload.ny));
      const b = await listen('unlink', () => { forgetTasksConnection(store); setConn(null); });
      const c = await listen<{ playing: boolean }>('turntable', e => setRecord(e.payload.playing));
      if (gone) { a(); b(); c(); } else off = [a, b, c];
    });
    return () => { gone = true; off.forEach(f => f()); };
  }, []);

  const task = nowTask(tasks.snapshot);
  const tryLink = (text: string) => { if (adoptPastedLink(text, store)) { setBad(false); setConn(initialConnection()); } else setBad(text.trim() !== ''); };
  return (
    <div style={{ width: 200, height: 240, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div ref={host} aria-label="Dashy" style={{ position: 'relative', width: 200, height: 200, flex: 'none' }} />
      {/* the strip under him: grab it to move him; it also shows what is up now */}
      {conn ? (
        <div data-tauri-drag-region style={strip}>
          <span data-tauri-drag-region style={record || task ? pill : grip} title={record ? 'Platenspeler' : task?.title}>{record ? '♪ Platenspeler' : task ? task.title : ''}</span>
        </div>
      ) : (
        <div data-tauri-drag-region style={strip}>
          <input aria-label="Koppel-link" aria-invalid={bad} title={bad ? 'Dat is geen geldige koppel-link' : undefined} placeholder="Plak je koppel-link" autoComplete="off" spellCheck={false}
            onPaste={e => { e.preventDefault(); tryLink(e.clipboardData.getData('text')); }} onChange={e => tryLink(e.target.value)} style={{ ...input, borderColor: bad ? '#e5484d' : 'transparent' }} />
        </div>
      )}
    </div>
  );
}

const strip: CSSProperties = { width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab' };
const pill: CSSProperties = { maxWidth: 188, padding: '4px 10px', borderRadius: 999, background: 'rgba(20,20,22,.72)', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' };
const grip: CSSProperties = { width: 36, height: 5, borderRadius: 999, background: 'rgba(120,120,125,.55)', pointerEvents: 'none' };
const input: CSSProperties = { width: 176, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 999, border: '1.5px solid transparent', background: 'rgba(255,255,255,.9)', color: '#16181a', font: 'inherit', outline: 'none', userSelect: 'text' };

createRoot(document.getElementById('root')!).render(<StrictMode><Buddy /></StrictMode>);
