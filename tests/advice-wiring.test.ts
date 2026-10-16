import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGenerate } from '../src/server/generateAdvice';
import { getAdvice, SAFE_FALLBACK, type AdviceInput } from '../src/advice';

// No network and no API key: a fake Anthropic server. This checks what we actually send and how we read what comes back.
const input: AdviceInput = { now: '2026-10-16T14:05:00+02:00', tasks: [{ title: 'Offerte sturen' }], agenda: [] };
function fake(answerText: string, status = 200) {
  const seen: { url: string; headers: Headers; body: any }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: answerText }], usage: { input_tokens: 10, output_tokens: 10 },
    }), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
  return { seen, model: createAnthropic({ apiKey: 'test-key', fetch })('claude-opus-5-5') };
}

test('request to Anthropic: right model, strict json schema, low effort, no forced tool use, no sampling params', async () => {
  const { seen, model } = fake('{"state":"strict","line":"Offerte eerst."}');
  const out = await createGenerate(model)('SYSTEM', 'USER');
  assert.deepEqual(out, { state: 'strict', line: 'Offerte eerst.' });
  assert.equal(seen.length, 1);
  const b = seen[0].body;
  assert.match(seen[0].url, /\/messages$/);
  assert.equal(seen[0].headers.get('x-api-key'), 'test-key');
  assert.equal(b.model, 'claude-opus-5-5');
  assert.equal(b.output_config?.effort, 'low');
  assert.equal(b.output_config?.format?.type, 'json_schema');
  const schema = b.output_config.format.schema;
  assert.deepEqual(Object.keys(schema.properties).sort(), ['line', 'state']);
  assert.deepEqual(schema.properties.state.enum, ['idle', 'working', 'thinking', 'waiting', 'happy', 'sad', 'angry', 'strict', 'dancing', 'sleepy']);
  assert.equal(schema.additionalProperties, false);
  assert.ok(!('tool_choice' in b), 'forced tool use is rejected by this model');
  for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in b), k + ' is rejected by this model');
  assert.ok(!JSON.stringify(b.thinking ?? {}).includes('disabled') && !('budget_tokens' in (b.thinking ?? {})), 'thinking is never disabled or budgeted');
  assert.ok(b.max_tokens >= 1000, 'room for thinking');
  assert.match(JSON.stringify(b.system ?? b.messages), /SYSTEM/);
  assert.match(JSON.stringify(b.messages), /USER/);
});

test('through getAdvice: valid answer passes; off-schema or non-JSON answers become the fallback', async () => {
  for (const [text, expected] of [
    ['{"state":"happy","line":"Goed bezig."}', { state: 'happy', line: 'Goed bezig.' }],
    ['{"state":"blocked","line":"x"}', SAFE_FALLBACK],
    ['Sorry, dat kan ik niet.', SAFE_FALLBACK],
    ['{"state":"idle"}', SAFE_FALLBACK],
    ['{"state":"idle","line":"ok","extra":true}', SAFE_FALLBACK],
  ] as const) {
    const { model } = fake(text);
    assert.deepEqual(await getAdvice(input, createGenerate(model)), expected, text);
  }
});

test('HTTP errors from Anthropic (401, 429, 500) become the fallback, not an exception', async () => {
  for (const status of [401, 429, 500, 529]) {
    const { model } = fake(JSON.stringify({ type: 'error', error: { type: 'x', message: 'nope' } }), status);
    assert.deepEqual(await getAdvice(input, createGenerate(model)), SAFE_FALLBACK, String(status));
  }
});
