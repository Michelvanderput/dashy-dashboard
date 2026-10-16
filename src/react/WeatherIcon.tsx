import type { WeatherIcon as Name } from '../weather';

const CLOUD = 'M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 8.9 4.6 4.6 0 0 0 7 18z';
const RAYS = [[12, 2.5, 12, 4.5], [12, 19.5, 12, 21.5], [2.5, 12, 4.5, 12], [19.5, 12, 21.5, 12], [5.3, 5.3, 6.7, 6.7], [17.3, 17.3, 18.7, 18.7], [5.3, 18.7, 6.7, 17.3], [17.3, 6.7, 18.7, 5.3]] as const;

/** Small line icons for the weather, drawn in the current text colour so they follow the theme. */
export function WeatherIcon({ name, size = 40 }: { name: Name; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };
  switch (name) {
    case 'sun': return <svg {...common}><circle cx="12" cy="12" r="4.2" />{RAYS.map((r, i) => <line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}</svg>;
    case 'moon': return <svg {...common}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>;
    case 'partly': return <svg {...common}><circle cx="8" cy="8" r="2.8" />{[[8, 2, 8, 3], [2, 8, 3, 8], [3.8, 3.8, 4.5, 4.5], [12.2, 3.8, 11.5, 4.5]].map((r, i) => <line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}<path d="M9 20h9a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 9.2 12 4.1 4.1 0 0 0 9 20z" /></svg>;
    case 'partly-night': return <svg {...common}><path d="M11 3.2a4.6 4.6 0 0 0 5.4 6.3A4.6 4.6 0 1 1 11 3.2z" transform="translate(-4 0) scale(.9)" /><path d="M9 20h9a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 9.2 12 4.1 4.1 0 0 0 9 20z" /></svg>;
    case 'cloud': return <svg {...common}><path d={CLOUD} /></svg>;
    case 'fog': return <svg {...common}><path d="M7 14h10a3.6 3.6 0 0 0 .5-7.1A5 5 0 0 0 7.2 6 4.1 4.1 0 0 0 7 14z" /><line x1="4" y1="17.5" x2="20" y2="17.5" /><line x1="7" y1="21" x2="17" y2="21" /></svg>;
    case 'drizzle': return <svg {...common}><path d="M7 14h10a3.6 3.6 0 0 0 .5-7.1A5 5 0 0 0 7.2 6 4.1 4.1 0 0 0 7 14z" /><line x1="9" y1="17.5" x2="8.4" y2="19" /><line x1="13" y1="17.5" x2="12.4" y2="19" /><line x1="17" y1="17.5" x2="16.4" y2="19" /></svg>;
    case 'rain': return <svg {...common}><path d="M7 14h10a3.6 3.6 0 0 0 .5-7.1A5 5 0 0 0 7.2 6 4.1 4.1 0 0 0 7 14z" /><line x1="8.5" y1="17" x2="7.5" y2="20.5" /><line x1="12.5" y1="17" x2="11.5" y2="20.5" /><line x1="16.5" y1="17" x2="15.5" y2="20.5" /></svg>;
    case 'snow': return <svg {...common}><path d="M7 14h10a3.6 3.6 0 0 0 .5-7.1A5 5 0 0 0 7.2 6 4.1 4.1 0 0 0 7 14z" /><circle cx="8.5" cy="18" r=".6" /><circle cx="12.5" cy="19.5" r=".6" /><circle cx="16.5" cy="18" r=".6" /><circle cx="10.5" cy="21.3" r=".6" /><circle cx="14.5" cy="21.3" r=".6" /></svg>;
    case 'thunder': return <svg {...common}><path d="M7 14h10a3.6 3.6 0 0 0 .5-7.1A5 5 0 0 0 7.2 6 4.1 4.1 0 0 0 7 14z" /><polyline points="12.5,14 10.5,18 13.5,18 11.5,22" /></svg>;
  }
}
