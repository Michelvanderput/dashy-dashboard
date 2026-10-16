import { useEffect, useState } from 'react';

export interface WakeLockState {
  /** The browser can keep the screen on at all (Safari 16.4+, Chrome, Edge). */
  supported: boolean;
  /** The screen is being kept on right now. */
  active: boolean;
  /** Why it did not work (battery saver, not allowed), in plain words. */
  error: string | null;
}

/**
 * Keeps the screen on while `enabled` and the window is visible. The browser drops the lock whenever the window is hidden, so it is asked for
 * again when it comes back. Never throws: where it does not work, `supported` or `error` says so, and the phone's own auto-lock applies.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !supported) { setActive(false); return; }
    let lock: WakeLockSentinel | null = null, gone = false;
    const acquire = async () => {
      if (gone || lock || document.hidden) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (gone) { void l.release(); return; }
        lock = l; setActive(true); setError(null);
        l.addEventListener('release', () => { if (lock === l) lock = null; if (!gone) setActive(false); });
      } catch { if (!gone) { setActive(false); setError('Het scherm kan niet aan blijven (batterijbesparing of niet toegestaan).'); } }
    };
    const onVisible = () => { if (!document.hidden) void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => { gone = true; document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => {}); lock = null; setActive(false); };
  }, [enabled, supported]);

  return { supported, active, error };
}
