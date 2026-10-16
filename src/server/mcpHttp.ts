import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authorized, fingerprint, tokenFrom } from './auth';
import type { Store } from './dashyStore';
import { createDashyMcp } from './mcpServer';

export interface McpHttpDeps {
  store: Store | null;
  now: () => number;
  /** Secret that lets Claude write. Different from the app's read-only token. */
  mcpToken: string | undefined;
  allow: (key: string) => Promise<boolean>;
  log?: (msg: string) => void;
}

const MAX_BODY = 50_000;
const rpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/**
 * Remote MCP over Streamable HTTP, stateless (every request is self-contained, which is what serverless needs).
 * Order of checks: method, configuration, token, rate limit, body size. Details of failures go to the log, never to the caller.
 */
export async function handleMcpRequest(req: Request, deps: McpHttpDeps): Promise<Response> {
  const log = deps.log ?? console.error;
  if (req.method !== 'POST') return rpcError(405, -32000, 'Method not allowed', { allow: 'POST' });
  if (!deps.mcpToken || !deps.store) { log('MCP not configured: DASHY_MCP_TOKEN or Redis missing'); return rpcError(503, -32000, 'Not configured'); }
  if (!authorized(req, deps.mcpToken)) return rpcError(401, -32001, 'Unauthorized', { 'www-authenticate': 'Bearer' });

  let allowed = false;
  try { allowed = await deps.allow(`mcp:${fingerprint(tokenFrom(req))}`); } catch (e) { log(`rate limiter failed: ${String(e)}`); }
  if (!allowed) return rpcError(429, -32002, 'Too many requests');

  const body = await req.text();
  if (body.length > MAX_BODY) return rpcError(413, -32000, 'Request too large');
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return rpcError(400, -32700, 'Parse error'); }

  const server = createDashyMcp({ store: deps.store, now: deps.now, log });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req, { parsedBody: parsed });
  } catch (e) {
    log(`mcp request failed: ${String(e)}`);
    return rpcError(500, -32603, 'Internal error');
  } finally {
    await server.close().catch(() => {});
  }
}
