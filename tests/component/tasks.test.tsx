import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDashyTasks } from '../../src/react';

afterEach(() => cleanup());
const body = (tasks: unknown[], extra: object = {}) => JSON.stringify({ today: '2026-10-16 vrijdag', tasks, left_open: [], time_today: '0m', ...extra });
const ok = (b: string) => ({ ok: true, status: 200, text: async () => b }) as Response;

describe('useDashyTasks', () => {
  it('is calm and not connected without a url', () => {
    const { result } = renderHook(() => useDashyTasks({}));
    expect(result.current.connected).toBe(false); expect(result.current.state).toBe('idle');
  });
  it('shows the first task, sends the token, and celebrates when a task disappears', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok(body([['a', 'Bellen', 'werk', 'vandaag', '']])))
      .mockResolvedValue(ok(body([])));
    const { result } = renderHook(() => useDashyTasks({ url: 'https://x.test/d', token: 'secret-token-1', intervalMs: 50, fetch: f as never }));
    await waitFor(() => expect(result.current.snapshot?.tasks[0].title).toBe('Bellen'));
    expect(f.mock.calls[0][1].headers.authorization).toBe('Bearer secret-token-1');
    await waitFor(() => expect(result.current.state).toBe('done'), { timeout: 2000 });
  });
  it('keeps the last picture and shows a calm error when the dashboard fails or the key is wrong', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(body([['a', 'Bellen', 'werk', 'vandaag', '']]))).mockResolvedValue({ ok: false, status: 401, text: async () => '' } as Response);
    const { result } = renderHook(() => useDashyTasks({ url: 'https://x.test/d', intervalMs: 50, fetch: f as never }));
    await waitFor(() => expect(result.current.error).toMatch(/sleutel/));
    expect(result.current.snapshot?.tasks).toHaveLength(1);
  });
  it('a garbage body is an error, not a crash', async () => {
    const f = vi.fn().mockResolvedValue(ok('<html>'));
    const { result } = renderHook(() => useDashyTasks({ url: 'https://x.test/d', intervalMs: 5000, fetch: f as never }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.snapshot).toBeNull();
    await act(async () => {});
  });
});

describe('useDashyTasks: check off from the screen', () => {
  const two = body([['a', 'Bellen', 'werk', 'vandaag', ''], ['b', 'Mailen', 'werk', 'vandaag', '']]);
  const setup = (action: (init: RequestInit) => Response | Promise<Response>, o: { read?: boolean } = {}) => {
    const f = vi.fn(async (u: string, init: RequestInit) => (String(u).endsWith('/action') ? action(init) : ok(two)));
    const hook = renderHook(() => useDashyTasks({ url: 'https://x.test/api/state', token: 'read-token-1', actionUrl: o.read ? null : 'https://x.test/api/action', actionToken: 'act-token-1', intervalMs: 60_000, fetch: f as never }));
    return { f, ...hook };
  };
  it('has no complete() without an action token: the screen only looks', async () => {
    const { result } = setup(() => ok('{}'), { read: true });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.complete).toBeUndefined();
  });
  it('shows the check-off at once, celebrates, sends the action token, and offers undo', async () => {
    let release!: () => void; const gate = new Promise<void>(r => (release = r));
    const { result, f } = setup(async init => { await gate; expect(new Headers(init.headers).get('authorization')).toBe('Bearer act-token-1'); expect(JSON.parse(init.body as string)).toEqual({ action: 'done', id: 'a' }); return ok(body([['b', 'Mailen', 'werk', 'vandaag', '']])); });
    await waitFor(() => expect(result.current.snapshot?.tasks).toHaveLength(2));
    let p!: Promise<boolean>; act(() => { p = result.current.complete!('a'); });
    await waitFor(() => expect(result.current.snapshot?.tasks.map(t => t.id)).toEqual(['b'])); // before the server answered
    expect(result.current.state).toBe('done'); expect(result.current.justDone).toEqual({ id: 'a', title: 'Bellen' });
    release(); expect(await p).toBe(true);
    expect(result.current.snapshot?.tasks.map(t => t.id)).toEqual(['b']); expect(result.current.undo).toBeDefined();
    expect(f.mock.calls.filter(c => String(c[0]).endsWith('/action'))).toHaveLength(1);
  });
  it('puts the task back and says so when the server refuses or is unreachable', async () => {
    const r1 = setup(() => new Response('{}', { status: 401 }));
    await waitFor(() => expect(r1.result.current.snapshot?.tasks).toHaveLength(2));
    await act(async () => { expect(await r1.result.current.complete!('a')).toBe(false); });
    expect(r1.result.current.snapshot?.tasks).toHaveLength(2); expect(r1.result.current.error).toMatch(/sleutel/); expect(r1.result.current.justDone).toBeNull();
    cleanup();
    const r2 = setup(() => { throw new TypeError('network'); });
    await waitFor(() => expect(r2.result.current.snapshot?.tasks).toHaveLength(2));
    await act(async () => { expect(await r2.result.current.complete!('a')).toBe(false); });
    expect(r2.result.current.snapshot?.tasks).toHaveLength(2); expect(r2.result.current.error).toBeTruthy();
  });
  it('undo brings the task back with the server state', async () => {
    let n = 0;
    const { result } = setup(() => (n++ === 0 ? ok(body([['b', 'Mailen', 'werk', 'vandaag', '']])) : ok(two)));
    await waitFor(() => expect(result.current.snapshot?.tasks).toHaveLength(2));
    await act(async () => { await result.current.complete!('a'); });
    await act(async () => { expect(await result.current.undo!()).toBe(true); });
    expect(result.current.snapshot?.tasks).toHaveLength(2); expect(result.current.justDone).toBeNull(); expect(result.current.undo).toBeUndefined();
  });
});
