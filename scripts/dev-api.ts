/**
 * Local stand-in for the Vercel functions: the same handlers on http://127.0.0.1:8787, with an in-memory store (gone on restart).
 *   npm run api:dev      tokens: DASHY_MCP_TOKEN / DASHY_STATE_TOKEN, or the dev defaults printed at start
 * Then open the app with  #tasks=http://127.0.0.1:8787/api/state&key=<state token>&act=<action token>
 */
import { createServer } from 'node:http';
import { handleAction, handleMcp, handleState } from '../src/server/mcp';
import { MemoryStore } from '../src/server/store';

const mcpToken = process.env.DASHY_MCP_TOKEN ?? 'dev-mcp-token-0123456789abcdef';
const stateToken = process.env.DASHY_STATE_TOKEN ?? 'dev-state-token-0123456789abcdef';
const actionToken = process.env.DASHY_ACTION_TOKEN ?? 'dev-action-token-0123456789abcdef';
const port = Number(process.env.PORT ?? 8787);
const store = new MemoryStore();

createServer(async (q, r) => {
  const chunks: Buffer[] = []; for await (const c of q) chunks.push(c as Buffer);
  const url = `http://${q.headers.host}${q.url}`;
  const req = new Request(url, { method: q.method, headers: q.headers as Record<string, string>, body: ['GET', 'HEAD', 'OPTIONS'].includes(q.method ?? '') ? undefined : Buffer.concat(chunks) });
  const path = new URL(url).pathname;
  const res = path.startsWith('/api/mcp') ? await handleMcp(req, { store, token: mcpToken, now: Date.now, allowPathToken: path !== '/api/mcp' })
    : path === '/api/action' ? await handleAction(req, { store, token: actionToken, now: Date.now })
    : path === '/api/state' ? await handleState(req, { store, token: stateToken, now: Date.now })
    : new Response('not found', { status: 404 });
  r.writeHead(res.status, Object.fromEntries(res.headers)); r.end(Buffer.from(await res.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Dashy dev API on http://127.0.0.1:${port}\n  MCP   POST /api/mcp   Bearer ${mcpToken}\n  state GET  /api/state Bearer ${stateToken}\n  act   POST /api/action Bearer ${actionToken}`));
