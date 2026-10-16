import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../../src/react';
import { NowPlayingBlock } from '../../src/react';
import { render, screen } from '@testing-library/react';
import { parseCurrentlyPlaying } from '../../src/spotify/model';

class Sentinel extends EventTarget { released = false; release = vi.fn(async () => { this.released = true; this.dispatchEvent(new Event('release')); }); }
let locks: Sentinel[], request: ReturnType<typeof vi.fn>;
const setHidden = (v: boolean) => { Object.defineProperty(document, 'hidden', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
beforeEach(() => { locks = []; request = vi.fn(async () => { const l = new Sentinel(); locks.push(l); return l; }); Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
afterEach(() => { cleanup(); delete (navigator as unknown as Record<string, unknown>).wakeLock; });

describe('useWakeLock', () => {
  it('keeps the screen on while enabled, and lets go when disabled or unmounted', async () => {
    const { result, rerender, unmount } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.active).toBe(true)); expect(request).toHaveBeenCalledWith('screen'); expect(result.current.supported).toBe(true);
    rerender({ on: false }); await waitFor(() => expect(result.current.active).toBe(false)); expect(locks[0].released).toBe(true);
    rerender({ on: true }); await waitFor(() => expect(result.current.active).toBe(true)); expect(request).toHaveBeenCalledTimes(2);
    unmount(); expect(locks[1].release).toHaveBeenCalled();
  });
  it('asks again when the window comes back, because the browser drops the lock while it is hidden', async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current.active).toBe(true));
    act(() => { locks[0].dispatchEvent(new Event('release')); setHidden(true); }); // the browser let go of it
    await waitFor(() => expect(result.current.active).toBe(false)); expect(request).toHaveBeenCalledTimes(1);
    act(() => setHidden(false)); await waitFor(() => expect(result.current.active).toBe(true)); expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not ask while the window is hidden', async () => {
    setHidden(true);
    renderHook(() => useWakeLock(true)); await new Promise(r => setTimeout(r, 30)); expect(request).not.toHaveBeenCalled();
  });
  it('says so, without throwing, when it is refused or not supported', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current.error).toMatch(/kan niet aan blijven/)); expect(result.current.active).toBe(false);
    cleanup(); delete (navigator as unknown as Record<string, unknown>).wakeLock;
    const r2 = renderHook(() => useWakeLock(true)); expect(r2.result.current.supported).toBe(false); expect(r2.result.current.active).toBe(false);
  });
  it('a lock that arrives after unmounting is released at once', async () => {
    let resolve!: (l: Sentinel) => void; request.mockImplementationOnce(() => new Promise<Sentinel>(r => (resolve = r)));
    const { unmount } = renderHook(() => useWakeLock(true)); unmount();
    const l = new Sentinel(); resolve(l); await waitFor(() => expect(l.release).toHaveBeenCalled());
  });
});

describe('<NowPlayingBlock kiosk />', () => {
  const np = parseCurrentlyPlaying({ is_playing: true, progress_ms: 1000, currently_playing_type: 'track', item: { id: 'a', type: 'track', name: 'Song', duration_ms: 100_000, artists: [{ name: 'Band' }], album: { name: 'Album', images: [] }, external_urls: { spotify: 'https://open.spotify.com/track/a' } } }, 0)!;
  it('shows what plays and nothing to press', () => {
    render(<NowPlayingBlock nowPlaying={np} status="connected" kiosk onControl={vi.fn()} canControl onDisconnect={vi.fn()} onConnect={vi.fn()} needsReconnect controlError="x" />);
    expect(screen.getByText('Song')).toBeTruthy(); expect(screen.queryByRole('button')).toBeNull(); expect(screen.queryByRole('group', { name: 'Bediening' })).toBeNull();
  });
  it('not connected: no connect button either', () => {
    render(<NowPlayingBlock nowPlaying={null} status="disconnected" kiosk onConnect={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
