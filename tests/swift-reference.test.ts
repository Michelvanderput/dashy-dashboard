import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REFERENCE_PATH, buildReference } from '../scripts/swift-reference';

// The Swift tests replay reference.json. If core.ts, small.ts or driver.ts change and it is not regenerated, the Swift port would be
// compared against an old recording, so fail here and say what to do.
test('swift reference.json is up to date with the TypeScript simulation', () => {
  assert.equal(readFileSync(REFERENCE_PATH, 'utf8'), JSON.stringify(buildReference()), 'stale: run npm run swift:reference, then swift test');
});
