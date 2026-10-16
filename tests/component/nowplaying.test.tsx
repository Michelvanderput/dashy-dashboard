import { waitFor, act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NowPlayingBlock, useSpotify } from '../../src/react';
import { parseCurrentlyPlaying, type NowPlaying } from '../../src/spotify/model';
import type { SpotifySession } from '../../src/spotify/session';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const mk = (o: Partial<NowPlaying> = {}): NowPlaying => ({ ...parseCurrentlyPlaying({ is_playing: true, progress_ms: 60_000, currently_playing_type: 'track', item: { id: 'a', name: 'Midnight Roses', duration_ms: 200_000,
  artists: [{ name: 'The Placeholders' }, { name: 'Guest' }], album: { name: 'Test Album', images: [{ url: 'https://i.scdn.co/image/x', width: 640 }] }, external_urls: { spotify: 'https://open.spotify.com/track/a' } } }, Date.now())!, ...o });
const dashyLabel = (c: HTMLElement) => c.querySelector('svg[role="img"] title')!.textContent;

describe('<NowPlayingBlock />', () => {
  it('shows the cover whole with a text alternative, and the vinyl is hidden from screen readers', () => {
    const { container } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" />);
    const img = container.querySelector('.dnp-sleeve img')!;
    expect(img.getAttribute('alt')).toBe('Albumhoes van Test Album van The Placeholders, Guest');
    expect(img.getAttribute('src')).toBe('https://i.scdn.co/image/x');
    expect(container.querySelector('.dnp-vinyl')!.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Midnight Roses')).toBeTruthy(); expect(screen.getByText('The Placeholders, Guest')).toBeTruthy();
  });

  it('playing: vinyl spins (data-playing), Dashy dances; paused: no spin, Dashy calm', () => {
    const { container, rerender } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" />);
    const root = container.querySelector('.dnp')!;
    expect(root.getAttribute('data-playing')).toBe('true'); expect(dashyLabel(container)).toBe('Dashy danst'); expect(screen.getByRole('status').textContent).toBe('Speelt nu');
    rerender(<NowPlayingBlock nowPlaying={mk({ playing: false })} status="connected" />);
    expect(root.getAttribute('data-playing')).toBe('false'); expect(root.getAttribute('data-paused')).toBe('true'); expect(dashyLabel(container)).toBe('Dashy wacht rustig'); expect(screen.getByRole('status').textContent).toBe('Gepauzeerd');
  });

  it('facts beat the music: a deadline keeps Dashy strict even while music plays', () => {
    const { container } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" driver={{ state: 'strict', rule: 'deadlineSoon' }} />);
    expect(dashyLabel(container)).toBe('Dashy is streng');
    expect(container.querySelector('.dnp')!.getAttribute('data-playing')).toBe('true'); // the record still spins
  });

  it('respects reduced motion and the spin only runs when playing (CSS)', () => {
    const { container } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" />);
    const css = container.querySelector('style')!.textContent!;
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*\.dnp-spin\{animation:none\}/);
    expect(css).toMatch(/\.dnp-spin\{[^}]*animation-play-state:paused/);
    expect(css).toMatch(/\[data-playing="true"\] \.dnp-spin\{animation-play-state:running\}/);
    expect(css).toMatch(/1\.8s linear infinite/); // 33 1/3 rpm
  });

  it("follows Spotify's design rules: link back, rounded corners, logo only with metadata, nothing on top of the art", () => {
    const { container, rerender } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" spotifyLogoSrc="/spotify-logo.svg" />);
    fireEvent.click(screen.getByRole('button', { name: 'Meer opties' }));
    const a = screen.getByText('LISTEN ON SPOTIFY') as HTMLAnchorElement;
    expect(a.href).toBe('https://open.spotify.com/track/a'); expect(a.rel).toBe('noopener noreferrer'); expect(a.target).toBe('_blank');
    const logo = container.querySelector('img.dnp-logo') as HTMLImageElement; expect(logo.alt).toBe('Spotify'); expect(logo.width).toBeGreaterThanOrEqual(70);
    expect((logo.parentElement as HTMLAnchorElement).href).toBe('https://open.spotify.com/track/a'); // the visible logo is a link back to Spotify too
    expect((container.querySelector('.dnp') as HTMLElement).style.getPropertyValue('--rc')).toBe('4px');
    expect(container.querySelector('.dnp-sleeve')!.children).toHaveLength(1); // only the image, no overlay
    rerender(<NowPlayingBlock nowPlaying={mk()} status="connected" size={320} />);
    expect((container.querySelector('.dnp') as HTMLElement).style.getPropertyValue('--rc')).toBe('8px');
    rerender(<NowPlayingBlock nowPlaying={null} status="connected" spotifyLogoSrc="/spotify-logo.svg" />);
    expect(container.querySelector('img.dnp-logo')).toBeNull();
  });

  it('a cover that fails to load becomes a labelled placeholder, a new track tries again', () => {
    const { container, rerender } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" />);
    fireEvent.error(container.querySelector('.dnp-sleeve img')!);
    expect(container.querySelector('.dnp-blank')!.getAttribute('aria-label')).toBe('Geen albumhoes');
    rerender(<NowPlayingBlock nowPlaying={mk({ coverUrl: 'https://i.scdn.co/image/y' })} status="connected" />);
    expect(container.querySelector('.dnp-sleeve img')!.getAttribute('src')).toBe('https://i.scdn.co/image/y');
  });

  it('every connection state has a message and the right button', () => {
    const onConnect = vi.fn(), onDisconnect = vi.fn();
    const { rerender } = render(<NowPlayingBlock nowPlaying={null} status="disconnected" onConnect={onConnect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verbind met Spotify' })); expect(onConnect).toHaveBeenCalledOnce();
    rerender(<NowPlayingBlock nowPlaying={null} status="connecting" onConnect={onConnect} />); expect(screen.getByRole('status').textContent).toMatch(/Verbinden/); expect(screen.queryByRole('button')).toBeNull();
    rerender(<NowPlayingBlock nowPlaying={null} status="error" error="Kapot" onConnect={onConnect} />); expect(screen.getByRole('alert').textContent).toBe('Kapot');
    rerender(<NowPlayingBlock nowPlaying={null} status="connected" onDisconnect={onDisconnect} />); expect(screen.getByText('Er speelt niets')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Meer opties' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Ontkoppel' })); expect(onDisconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('the "..." menu: closed by default, keyboard friendly, closes on Escape and outside click, no menu when there is nothing in it', () => {
    const { rerender } = render(<div><button>outside</button><NowPlayingBlock nowPlaying={mk()} status="connected" onDisconnect={() => {}} /></div>);
    const trigger = screen.getByRole('button', { name: 'Meer opties' });
    expect(screen.queryByRole('menu')).toBeNull(); expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger); expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem'); expect(items.map(i => i.textContent)).toEqual(['LISTEN ON SPOTIFY', 'Ontkoppel']); expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' }); expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'ArrowDown' }); expect(document.activeElement).toBe(items[0]); // wraps
    fireEvent.keyDown(items[0], { key: 'ArrowUp' }); expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'Escape' }); expect(screen.queryByRole('menu')).toBeNull(); expect(document.activeElement).toBe(trigger); // back to where you were
    fireEvent.click(trigger); expect(screen.getByRole('menu')).toBeTruthy(); fireEvent.pointerDown(screen.getByText('outside')); expect(screen.queryByRole('menu')).toBeNull();
    rerender(<div><NowPlayingBlock nowPlaying={mk({ trackUrl: null })} status="connected" /></div>); expect(screen.queryByRole('button', { name: 'Meer opties' })).toBeNull();
    rerender(<div><NowPlayingBlock nowPlaying={null} status="disconnected" onConnect={() => {}} onDisconnect={() => {}} /></div>); expect(screen.queryByRole('button', { name: 'Meer opties' })).toBeNull(); // not connected: "connect" stays visible instead
  });

  it('controls: previous, play/pause (reflecting the state) and next, one command at a time; hidden without permission', async () => {
    let release!: () => void; const gate = new Promise<void>(r => (release = r));
    const onControl = vi.fn(async (_c: string) => { await gate; return true; });
    const { rerender } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" onControl={onControl} canControl />);
    expect(screen.getByRole('group', { name: 'Bediening' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pauzeer' })); expect(onControl).toHaveBeenLastCalledWith('pause');
    fireEvent.click(screen.getByRole('button', { name: 'Volgende' })); expect(onControl).toHaveBeenCalledTimes(1); // busy: a second tap is ignored
    expect((screen.getByRole('button', { name: 'Volgende' }) as HTMLButtonElement).disabled).toBe(true);
    release(); await waitFor(() => expect((screen.getByRole('button', { name: 'Volgende' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Vorige' })); expect(onControl).toHaveBeenLastCalledWith('previous');
    rerender(<NowPlayingBlock nowPlaying={mk({ playing: false })} status="connected" onControl={onControl} canControl />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Speel af' })).toBeTruthy());
    rerender(<NowPlayingBlock nowPlaying={mk()} status="connected" onControl={onControl} />); expect(screen.queryByRole('group', { name: 'Bediening' })).toBeNull();
    rerender(<NowPlayingBlock nowPlaying={mk()} status="connected" onControl={onControl} canControl={false} />); expect(screen.queryByRole('group', { name: 'Bediening' })).toBeNull();
  });

  it('an old login offers to connect again for the controls, and a failed control says why', () => {
    const onConnect = vi.fn();
    const { rerender } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" onConnect={onConnect} onControl={vi.fn()} needsReconnect />);
    expect(screen.queryByRole('group', { name: 'Bediening' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Koppel opnieuw voor bediening' })); expect(onConnect).toHaveBeenCalledOnce();
    rerender(<NowPlayingBlock nowPlaying={mk()} status="connected" onControl={vi.fn()} canControl controlError="Bedienen werkt alleen met Spotify Premium." />);
    expect(screen.getByText('Bedienen werkt alleen met Spotify Premium.')).toBeTruthy();
  });

  it('layout guard: the block never asks for container sizing (it collapsed the block inside shrink-to-fit cards)', () => {
    const { container } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" />);
    expect(container.querySelector('style')!.textContent).not.toMatch(/container-type|\bcqw\b/);
  });

  it('the progress bar moves while playing and is hidden from screen readers; two blocks can share a page', () => {
    vi.useFakeTimers(); vi.setSystemTime(2_000_000);
    const { container } = render(<><NowPlayingBlock nowPlaying={mk({ fetchedAt: Date.now() })} status="connected" /><NowPlayingBlock nowPlaying={mk({ fetchedAt: Date.now() })} status="connected" /></>);
    const t = () => container.querySelector('.dnp-time span')!.textContent;
    expect(t()).toBe('1:00');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(t()).toBe('1:05'); expect(container.querySelector('.dnp-bar')!.getAttribute('aria-hidden')).toBe('true');
    const ids = [...container.querySelectorAll('path[id]')].map(p => p.id); expect(new Set(ids).size).toBe(2);
  });

  it('stops its timer when the music stops or the block unmounts', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(<NowPlayingBlock nowPlaying={mk()} status="connected" />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    rerender(<NowPlayingBlock nowPlaying={mk({ playing: false })} status="connected" />);
    const during = vi.getTimerCount(); unmount(); expect(vi.getTimerCount()).toBeLessThan(during + 1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useSpotify', () => {
  it('starts the session on mount, mirrors its state, and stops it on unmount', async () => {
    let state = { status: 'disconnected' as const, nowPlaying: null as NowPlaying | null }; const subs = new Set<() => void>();
    const session = { getState: () => state, subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); }, start: vi.fn(async () => {}), stop: vi.fn(), nudge: vi.fn(), connect: vi.fn(async () => {}), disconnect: vi.fn(), control: vi.fn(async () => true), canControl: () => true, needsReconnect: () => false } as unknown as SpotifySession;
    const { result, unmount } = renderHook(() => useSpotify({ clientId: 'c', redirectUri: 'https://x/cb', session }));
    expect(session.start).toHaveBeenCalledOnce(); expect(result.current.status).toBe('disconnected');
    act(() => { state = { status: 'connected', nowPlaying: mk() } as never; subs.forEach(f => f()); });
    expect(result.current.nowPlaying?.title).toBe('Midnight Roses');
    expect(result.current.canControl).toBe(true); expect(result.current.needsReconnect).toBe(false); void result.current.control('next'); expect((session.control as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('next');
    act(() => { result.current.connect(); result.current.disconnect(); }); expect(session.connect).toHaveBeenCalled(); expect(session.disconnect).toHaveBeenCalled();
    act(() => { document.dispatchEvent(new Event('visibilitychange')); }); expect(session.nudge).toHaveBeenCalled();
    unmount(); expect(session.stop).toHaveBeenCalled();
  });
});
