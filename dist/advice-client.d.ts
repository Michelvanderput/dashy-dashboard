import { type Advice, type AdviceInput } from './advice';
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
export declare function fetchAdvice(input: AdviceInput, o: AdviceClientOptions): Promise<Advice>;
