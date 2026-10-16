import { useState } from 'react';
import { adoptHash, connectionHash } from '../src/connection';
import { webStore } from '../src/spotify/auth';

/** First start of a desktop app: there is no link to open, so the three values are typed (or pasted) here, once. */
export function ConnectPanel({ onDone }: { onDone: () => void }) {
  const [site, setSite] = useState(''), [key, setKey] = useState(''), [act, setAct] = useState(''), [bad, setBad] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const hash = connectionHash({ site, key, act });
    if (!hash) { setBad(true); return; }
    try { adoptHash(hash, webStore('local')); } catch { setBad(true); return; }
    onDone();
  };
  const field = (label: string, value: string, set: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label style={{ display: 'grid', gap: 6, textAlign: 'left' }}>{label}
      <input value={value} onChange={e => { set(e.target.value); setBad(false); }} autoComplete="off" spellCheck={false} {...props}
        style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(23,24,26,.24)', background: 'transparent', color: 'inherit', font: 'inherit' }} />
    </label>
  );
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#e8e6e0', color: '#17181a', fontFamily: '"Geist Variable", system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 'min(26rem,100%)', display: 'grid', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 500 }}>Dashy koppelen</h1>
        <p style={{ margin: 0, color: '#66645e' }}>Eén keer per apparaat. Vul de site en de twee sleutels in die bij je Dashy horen.</p>
        {field('Site', site, setSite, { type: 'url', inputMode: 'url', placeholder: 'https://jouw-app.vercel.app', required: true })}
        {field('Leessleutel', key, setKey, { type: 'password', required: true })}
        {field('Actiesleutel (om af te vinken en toe te voegen, mag leeg)', act, setAct, { type: 'password' })}
        {bad && <p role="alert" style={{ margin: 0, color: '#c7391f' }}>Dat klopt nog niet. De site moet met https:// beginnen en de sleutels zijn minstens 8 tekens.</p>}
        <button type="submit" style={{ minHeight: 48, borderRadius: 999, border: 0, background: '#17181a', color: '#f4f3ee', font: 'inherit', fontWeight: 500, cursor: 'pointer' }}>Koppelen</button>
      </form>
    </main>
  );
}
