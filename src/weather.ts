/**
 * Weather from Open-Meteo (free, no key, open to browsers). One place, set by you; nothing about where you are is ever asked of the browser.
 * Pure: parsing and wording only. The fetching is in react/Weather.tsx.
 */
export interface Place { name: string; lat: number; lon: number }
export const DEFAULT_PLACE: Place = { name: 'Maastricht', lat: 50.85, lon: 5.69 };

/** "Maastricht:50.85,5.69" (name, latitude, longitude). Anything invalid gives the default place. */
export function parsePlace(text: string | undefined): Place {
  const m = /^\s*(\p{L}[\p{L} .'-]{0,39}?)\s*:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/u.exec(text ?? ''); // the name: letters, spaces, dots, dashes
  if (!m) return DEFAULT_PLACE;
  const lat = Number(m[2]), lon = Number(m[3]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { name: m[1].trim(), lat, lon } : DEFAULT_PLACE;
}

export const weatherUrl = (p: Place) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;

export type WeatherIcon = 'sun' | 'moon' | 'partly' | 'partly-night' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';
export interface Weather { tempC: number; code: number; isDay: boolean; highC: number | null; lowC: number | null; rainChance: number | null; label: string; icon: WeatherIcon; fetchedAt: number }

/** WMO weather code to words and an icon. */
export function describeWeather(code: number, isDay: boolean): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: isDay ? 'Zonnig' : 'Helder', icon: isDay ? 'sun' : 'moon' };
  if (code === 1) return { label: 'Overwegend helder', icon: isDay ? 'partly' : 'partly-night' };
  if (code === 2) return { label: 'Half bewolkt', icon: isDay ? 'partly' : 'partly-night' };
  if (code === 3) return { label: 'Bewolkt', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Mist', icon: 'fog' };
  if (code >= 51 && code <= 55) return { label: 'Motregen', icon: 'drizzle' };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { label: 'IJzel', icon: 'rain' };
  if (code === 61) return { label: 'Lichte regen', icon: 'rain' };
  if (code === 63) return { label: 'Regen', icon: 'rain' };
  if (code === 65) return { label: 'Zware regen', icon: 'rain' };
  if (code === 71) return { label: 'Lichte sneeuw', icon: 'snow' };
  if (code === 73) return { label: 'Sneeuw', icon: 'snow' };
  if (code === 75 || code === 77) return { label: 'Zware sneeuw', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Buien', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Sneeuwbuien', icon: 'snow' };
  if (code === 95) return { label: 'Onweer', icon: 'thunder' };
  if (code === 96 || code === 99) return { label: 'Onweer met hagel', icon: 'thunder' };
  return { label: 'Wisselend', icon: 'cloud' };
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const first = (x: unknown): number | null => (Array.isArray(x) && num(x[0]) ? x[0] : null);

/** Strict reading of the Open-Meteo answer. Null when it does not look right (the screen then shows no weather rather than a wrong one). */
export function parseWeather(json: unknown, fetchedAt: number): Weather | null {
  if (typeof json !== 'object' || json === null) return null;
  const j = json as { current?: Record<string, unknown>; daily?: Record<string, unknown> };
  const c = j.current;
  if (!c || typeof c !== 'object' || !num(c.temperature_2m) || !num(c.weather_code) || c.temperature_2m < -90 || c.temperature_2m > 70) return null;
  const isDay = c.is_day !== 0;
  const rain = first(j.daily?.precipitation_probability_max);
  return { tempC: c.temperature_2m, code: c.weather_code, isDay, highC: first(j.daily?.temperature_2m_max), lowC: first(j.daily?.temperature_2m_min), rainChance: rain === null ? null : Math.min(100, Math.max(0, rain)), ...describeWeather(c.weather_code, isDay), fetchedAt };
}

/** "92% kans op regen" when it matters, otherwise nothing. */
export const rainNote = (w: Weather): string | null => (w.rainChance !== null && w.rainChance >= 40 && w.icon !== 'snow' ? `${Math.round(w.rainChance)}% kans op regen` : null);
/** Older than this the weather is not shown any more. */
export const WEATHER_MAX_AGE_MS = 6 * 3600_000;
export const WEATHER_REFRESH_MS = 20 * 60_000;
