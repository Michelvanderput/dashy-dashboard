export interface AdviceDeps {
    /** Calls the model. Returns the raw answer (object or JSON text). Injected so it can be faked in tests. */
    generate: (system: string, user: string) => Promise<unknown>;
    /** Returns true when this caller may make a call. */
    allow: (key: string) => Promise<boolean>;
    /** Shared secret the app must send as a bearer token. */
    token: string | undefined;
}
/**
 * POST { now, tasks, agenda } -> { state, line }. Every response, also errors, has exactly that shape, so the
 * app can always parse it. Error details go to the server log only, never into the response.
 */
export declare function handleAdviceRequest(req: Request, deps: AdviceDeps, log?: (msg: string) => void): Promise<Response>;
