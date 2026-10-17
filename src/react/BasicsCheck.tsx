import type { CSSProperties } from 'react';

export interface BasicsCheckProps {
  items: string[];
  done: string[];
  /** Without it the ticks are only shown (a look-only screen). */
  onToggle?: (item: string) => void;
  compact?: boolean;
  style?: CSSProperties;
}
const CSS = `
.bc{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.bc-pill{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1.5px solid var(--line);background:none;color:inherit;font:inherit;font-size:.9rem;cursor:pointer}
.bc-pill[aria-pressed="true"]{background:color-mix(in srgb,var(--ink) 14%,transparent);border-color:transparent}
.bc-pill:disabled{cursor:default}.bc-pill:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.bc-tick{width:16px;height:16px;flex:none}
.bc-compact .bc-pill{min-height:34px;padding:0 10px;font-size:.8rem}
`;
/** The basics of today as quiet ticks. No counting, no history: tomorrow they are empty again. */
export function BasicsCheck({ items, done, onToggle, compact = false, style }: BasicsCheckProps) {
  return (
    <div className={`bc${compact ? ' bc-compact' : ''}`} role="group" aria-label="De basis van vandaag" style={style}>
      <style>{CSS}</style>
      {items.map(i => {
        const on = done.includes(i);
        return (
          <button key={i} type="button" className="bc-pill" aria-pressed={on} disabled={!onToggle} onClick={() => onToggle?.(i)}>
            <svg className="bc-tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              {on ? <path d="M3.5 8.5l3 3 6-7" /> : <circle cx="8" cy="8" r="5" strokeOpacity=".5" />}
            </svg>{i}
          </button>
        );
      })}
    </div>
  );
}
