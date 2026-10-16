import { useState } from 'react';
import { pairWithCode, type PairResult } from '../src';
import { store } from './storage';

const MESSAGE: Record<Exclude<PairResult, 'ok'>, string> = {
  wrong: 'Die code klopt niet (meer). Vraag Claude om een nieuwe.', offline: 'Geen verbinding. Probeer het zo nog eens.', unavailable: 'Koppelen kan hier nu niet. Gebruik de link met #tasks=.',
};
/** "Koppelen met een code": type the code Claude gave you. */
export function PairForm() {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setProblem(null);
    const r = await pairWithCode(code, location.origin, store);
    if (r === 'ok') location.reload(); else { setProblem(MESSAGE[r]); setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10, maxWidth: '26rem' }}>
      <label htmlFor="pair" style={{ fontSize: '.95rem' }}>Nog niet gekoppeld. Vraag Claude om een koppelcode en typ die hier:</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="pair" value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9} placeholder="XXXX-XXXX" inputMode="text"
          style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'inherit', font: 'inherit', letterSpacing: '.12em', fontVariantNumeric: 'tabular-nums' }} />
        <button type="submit" disabled={busy || code.replace(/[^A-Z0-9]/g, '').length < 8} style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: 0, background: 'var(--ink)', color: 'var(--bg)', font: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: busy || code.replace(/[^A-Z0-9]/g, '').length < 8 ? .5 : 1 }}>Koppel</button>
      </div>
      {problem && <p role="alert" style={{ margin: 0, fontSize: '.9rem', opacity: .8 }}>{problem}</p>}
    </form>
  );
}
