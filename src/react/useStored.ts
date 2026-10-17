import { useCallback, useEffect, useState } from 'react';

/**
 * A value kept in this device's own storage (never sent anywhere): read through `parse` (which must accept whatever is in there,
 * including nothing), written as JSON text. Storage that throws (private mode) just means it is not remembered.
 */
export function useStored<T>(key: string, parse: (text: string | null) => T, serialize: (v: T) => string | null = v => JSON.stringify(v)): [T, (v: T) => void] {
  const read = () => { try { return parse(localStorage.getItem(key)); } catch { return parse(null); } };
  const [value, setValue] = useState<T>(read);
  const set = useCallback((v: T) => {
    setValue(v);
    try { const s = serialize(v); if (s === null) localStorage.removeItem(key); else localStorage.setItem(key, s); } catch { /* not remembered */ }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // another tab or window of this device changed it
    const f = (e: StorageEvent) => { if (e.key === key) setValue(read()); };
    addEventListener('storage', f); return () => removeEventListener('storage', f);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, set];
}
