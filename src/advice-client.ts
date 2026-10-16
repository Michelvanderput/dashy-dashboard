import { SAFE_FALLBACK, parseAdvice, sanitizeInput, type Advice, type AdviceInput } from './advice';

export interface AdviceClientOptions {
  /** e.g. https://dashy.example.app/api/dashy-advice */
  url: string;
  token: string;
  /** Milliseconds before giving up. Default 8000. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * App side: asks the server route for advice. Never throws and never trusts the answer: whatever comes back
 * is parsed strictly again, and any error, timeout, bad status or invalid body gives the safe fallback (idle, no text).
 */
export async function fetchAdvice(input: AdviceInput, o: AdviceClientOptions): Promise<Advice> {
  const ms = o.timeoutMs ?? 8000;
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Our own timer too: a custom or polyfilled fetch may ignore the abort signal, and the app must never hang on this.
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new Error('timeout')); }, ms); });
  try {
    const request = (async () => {
      const res = await (o.fetch ?? fetch)(o.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${o.token}` },
        body: JSON.stringify(sanitizeInput(input)),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return parseAdvice(await res.text());
    })();
    request.catch(() => {}); // a late failure after the timeout must not become an unhandled rejection
    return await Promise.race([request, timeout]);
  } catch {
    return { ...SAFE_FALLBACK };
  } finally {
    clearTimeout(timer);
  }
}
