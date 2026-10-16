import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ALLOWED_STATES, MAX_LINE } from '../advice';
import { update, view, type Call, type Store } from './dashyStore';

export interface McpDeps { store: Store; now: () => number; log?: (msg: string) => void }

const text = (o: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(o) }], ...(isError ? { isError: true } : {}) });

/**
 * The MCP server Claude talks to. Tools only report facts or set a mood: the shown state always comes from the
 * state driver and its priorities (a deadline beats a mood). Every result says what Dashy shows now and why.
 */
export function createDashyMcp(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'dashy', version: '0.1.0' }, {
    instructions: 'Dashy is a small avatar that shows the mood of the day. Report facts with dashy_task, dashy_flag and dashy_activity; the app decides how Dashy reacts (deadlines make him strict or angry). Use dashy_mood to add a mood and one short line of your own. Tasks are identified by an id you choose; titles are never sent to Dashy.',
  });

  async function run(call: Call) {
    const now = deps.now();
    try {
      const { outcome, doc } = await update(deps.store, now, call);
      if (!outcome.ok) return text({ ok: false, error: outcome.error }, true);
      const v = view(doc, now);
      return text({ ok: true, shown: { state: v.state, line: v.line, source: v.source, because: v.rule }, ...(outcome.note ? { note: outcome.note } : {}) });
    } catch (e) {
      deps.log?.(`dashy tool failed: ${String(e)}`);
      return text({ ok: false, error: 'Dashy could not save this right now. Nothing changed; try again later.' }, true);
    }
  }

  server.registerTool('dashy_task', {
    title: 'Report a task event',
    description: 'Tell Dashy about a task. action "added" (new task, optional due), "done" (checked off: Dashy celebrates), "removed", or "due" (change or clear the deadline). Dashy turns strict when a deadline is within an hour and angry within 15 minutes. Use a stable id per task; do not send the title.',
    inputSchema: {
      action: z.enum(['added', 'done', 'removed', 'due']),
      id: z.string().describe('Your own stable id for the task, 1-64 characters: letters, digits, - and _'),
      due: z.string().nullish().describe('ISO 8601 date-time WITH offset, e.g. 2026-10-16T15:00:00+02:00. For action "due", null clears the deadline.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async a => run({ tool: 'task', action: a.action, id: a.id, due: a.due }));

  server.registerTool('dashy_flag', {
    title: 'Set a situation flag',
    description: 'Set a situation on or off: "waiting" (waiting for the user to answer), "blocked" (cannot continue), "break" (the user is on a break: Dashy gets sleepy), "working" (work is in progress).',
    inputSchema: { flag: z.enum(['waiting', 'blocked', 'break', 'working']), value: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async a => run({ tool: 'flag', flag: a.flag, value: a.value }));

  server.registerTool('dashy_activity', {
    title: 'Report activity',
    description: 'Report that the user did something. This resets the "nothing done for an hour" timer, so Dashy does not turn sad.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async () => run({ tool: 'activity' }));

  server.registerTool('dashy_mood', {
    title: 'Set Dashy\'s mood and a line',
    description: `Give Dashy a mood and one short line in his voice (Dutch, warm, concrete, no guilt, no numbers or streaks, max ${MAX_LINE} characters). It only shows while Dashy has nothing more urgent (no deadline, blocked, waiting, break or celebration), and expires after "minutes" (default 30). Use clear: true to remove it. Allowed states: ${ALLOWED_STATES.join(', ')}.`,
    inputSchema: {
      state: z.enum(ALLOWED_STATES).optional(),
      line: z.string().max(MAX_LINE).optional(),
      minutes: z.number().int().min(1).max(240).optional(),
      clear: z.boolean().optional().describe('true removes the current mood; then state and line are not needed'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async a => run({ tool: 'mood', state: a.state, line: a.line, minutes: a.minutes, clear: a.clear }));

  return server;
}
