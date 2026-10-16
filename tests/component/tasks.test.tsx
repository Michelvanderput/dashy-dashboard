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
