import { useEffect, useState, type CSSProperties } from 'react';
import { DEFAULT_PLACE, parseWeather, rainNote, WEATHER_MAX_AGE_MS, WEATHER_REFRESH_MS, weatherUrl, type Place, type Weather } from '../weather';
import { WeatherIcon } from './WeatherIcon';

const KEY = 'dashy.weather';
const read = (place: Place): Weather | null => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && v.place === place.name && v.weather ? (v.weather as Weather) : null; } catch { return null; } };
const write = (place: Place, weather: Weather) => { try { localStorage.setItem(KEY, JSON.stringify({ place: place.name, weather })); } catch { /* private mode */ } };

/**
 * The weather for one place. The last good answer is kept (and shown right away on the next visit); a failed refresh keeps showing it, and
 * after six hours without a fresh answer it is hidden rather than shown wrong. Never throws, never asks the browser where you are.
 */
export function useWeather(place: Place = DEFAULT_PLACE, f?: typeof fetch): Weather | null {
  const [w, setW] = useState<Weather | null>(() => read(place));
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (stop) return;
      if (typeof document !== 'undefined' && document.hidden) { timer = setTimeout(load, WEATHER_REFRESH_MS); return; }
      const ctl = new AbortController(), kill = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await (f ?? fetch)(weatherUrl(place), { signal: ctl.signal });
        if (res.ok) { const next = parseWeather(await res.json(), Date.now()); if (next && !stop) { setW(next); write(place, next); } }
      } catch { /* keep what we have */ } finally { clearTimeout(kill); }
      if (!stop) timer = setTimeout(load, WEATHER_REFRESH_MS);
    };
    void load();
    const again = () => { if (!document.hidden) { clearTimeout(timer); void load(); } };
    document.addEventListener('visibilitychange', again); window.addEventListener('focus', again); window.addEventListener('online', again);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); window.removeEventListener('online', again); };
  }, [place.name, place.lat, place.lon, f]);
  return w && Date.now() - w.fetchedAt < WEATHER_MAX_AGE_MS ? w : null;
}

export interface WeatherViewProps {
  place?: Place;
  /** For tests and screenshots: show this instead of fetching. */
  weather?: Weather | null;
  fetch?: typeof fetch;
  compact?: boolean;
  style?: CSSProperties;
}

export function WeatherView({ place = DEFAULT_PLACE, weather, fetch: f, compact = false, style }: WeatherViewProps) {
  const live = useWeather(place, f);
  const w = weather === undefined ? live : weather;
  if (!w) return null;
  const rain = rainNote(w);
  const t = (n: number) => `${Math.round(n)}°`;
  return (
    <div role="group" aria-label={`Weer in ${place.name}`} style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 16, ...style }}>
      <span style={{ opacity: 0.85, display: 'grid' }}><WeatherIcon name={w.icon} size={compact ? 34 : 52} /></span>
      <div style={{ display: 'grid', gap: 1 }}>
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: compact ? '1.6rem' : 'clamp(2rem, 6vmin, 3.4rem)', fontWeight: 300, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{t(w.tempC)}</span>
          <span style={{ fontSize: compact ? '.9rem' : 'clamp(1rem, 2.4vmin, 1.4rem)' }}>{w.label}</span>
        </p>
        <p style={{ margin: 0, fontSize: compact ? '.75rem' : '.9rem', opacity: 0.65 }}>
          {place.name}{w.highC !== null && w.lowC !== null ? ` · ${t(w.highC)} / ${t(w.lowC)}` : ''}{rain ? ` · ${rain}` : ''}
        </p>
      </div>
    </div>
  );
}
