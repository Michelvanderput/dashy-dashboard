import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ALLOWED_STATES, MAX_LINE } from '../advice';
import { LIMITS, nowOf, update, view, type Call, type Store } from './dashyStore';

export interface McpDeps { store: Store; now: () => number; log?: (msg: string) => void }

const text = (o: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(o) }], ...(isError ? { isError: true } : {}) });

/**
 * The MCP server Claude talks to. Tools only report facts or set a mood: the shown state always comes from the
 * state driver and its priorities (a deadline beats a mood). Every result says what Dashy shows now and why.
 */
export function createDashyMcp(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'dashy', version: '0.1.0' }, {
    instructions: 'Dashy is a screen that shows the day of the user and a small avatar that reacts to it. Keep the plan up to date with dashy_task (tasks, with a short title and an optional deadline) and dashy_appointment (appointments with a start); the app decides how Dashy reacts (deadlines make him strict or angry) and which ONE thing is "Nu" (the result tells you). Use dashy_focus to choose the task to do first, dashy_flag and dashy_activity for situations, and dashy_mood for a mood and one short line of your own. Ids are chosen by you and must stay the same for the same task. Titles and notes are shown on the screen and stored in the owner\'s own database: keep them short and do not put secrets in them.',
  });

  async function run(call: Call) {
    const now = deps.now();
    try {
      const { outcome, doc } = await update(deps.store, now, call);
      if (!outcome.ok) return text({ ok: false, error: outcome.error }, true);
      const v = view(doc, now);
      const n = nowOf(doc, now);
      return text({ ok: true, shown: { state: v.state, line: v.line, source: v.source, because: v.rule }, now: n ? { title: n.item.title, reason: n.reason } : null, ...(outcome.note ? { note: outcome.note } : {}) });
    } catch (e) {
      deps.log?.(`dashy tool failed: ${String(e)}`);
      return text({ ok: false, error: 'Dashy could not save this right now. Nothing changed; try again later.' }, true);
    }
  }

  server.registerTool('dashy_task', {
    title: 'Add or change a task',
    description: `Keep the task list on the screen up to date. action "added" (new task: give a short title, optionally a deadline and a note), "done" (checked off: Dashy celebrates), "reopen" (a finished task is open again), "removed", or "due" (change or clear the deadline). Dashy turns strict when a deadline is within an hour and angry within 15 minutes. Use a stable id per task. Title at most ${LIMITS.title} characters, note at most ${LIMITS.note}.`,
    inputSchema: {
      action: z.enum(['added', 'done', 'reopen', 'removed', 'due']),
      id: z.string().describe('Your own stable id for the task, 1-64 characters: letters, digits, - and _'),
      title: z.string().max(LIMITS.title).optional().describe('Short title shown on the screen (for action "added"; imperative, 2-5 words, no time or date in it)'),
      due: z.string().nullish().describe('ISO 8601 date-time WITH offset, e.g. 2026-10-16T15:00:00+02:00. For action "due", null clears the deadline.'),
      note: z.string().max(LIMITS.note).optional().describe('Optional detail, e.g. where or why'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async a => run({ tool: 'task', action: a.action, id: a.id, due: a.due, title: a.title, note: a.note }));

  server.registerTool('dashy_appointment', {
    title: 'Add or remove an appointment',
    description: 'Put an appointment on the screen (action "added": id, title and a start, optionally an end) or take it off (action "removed"). When an appointment starts within 10 minutes it becomes the "Nu" of the screen. Re-adding the same id changes it.',
    inputSchema: {
      action: z.enum(['added', 'removed']),
      id: z.string().describe('Your own stable id, 1-64 characters: letters, digits, - and _'),
      title: z.string().max(LIMITS.title).optional(),
      start: z.string().optional().describe('ISO 8601 date-time WITH offset, e.g. 2026-10-16T14:30:00+02:00'),
      end: z.string().nullish().describe('ISO 8601 date-time WITH offset; default 30 minutes after the start'),
      note: z.string().max(LIMITS.note).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async a => run({ tool: 'appointment', action: a.action, id: a.id, title: a.title, start: a.start, end: a.end, note: a.note }));

  server.registerTool('dashy_focus', {
    title: 'Choose the one thing to do first',
    description: 'Choose the open task that should be "Nu" on the screen. It stays the one thing until it is done, unless a deadline within 15 minutes needs attention first. Pass id null to go back to the automatic choice.',
    inputSchema: { id: z.string().nullable().describe('The id of an open task, or null') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async a => run({ tool: 'focus', id: a.id }));

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
