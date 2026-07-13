import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { simulateWorldInfo } from '../../scripts/lib/world-info-simulator.mjs';

test('disabled entry cannot be inserted by constant, recursion, or ignoreBudget flags', () => {
  const result = simulateWorldInfo({ seed: 1, history: ['key'], lorebook: { entries: [{
    uid: 1, key: ['key'], content: 'disabled content', constant: true, disable: true,
    ignoreBudget: true, preventRecursion: false,
  }] } });
  assert.deepEqual(result.includedEntryIds, []);
  assert.ok(result.trace.candidates.some((candidate) => candidate.reasons.includes('ENTRY_DISABLED')));
});

test('zero probability cannot be bypassed by constant mode', () => {
  for (let seed = 0; seed < 64; seed += 1) {
    const result = simulateWorldInfo({ seed, lorebook: { entries: [{ uid: 1, constant: true, probability: 0, content: 'constant' }] } });
    assert.deepEqual(result.includedEntryIds, []);
  }
});

test('budget never becomes negative and no entry is both included and finally rejected', () => {
  const result = simulateWorldInfo({ history: ['x'], tokenCounter: () => 9, budgetPolicy: { budget: 1 }, lorebook: { entries: [
    { uid: 1, key: ['x'], content: 'one' }, { uid: 2, key: ['x'], content: 'two', ignoreBudget: true },
  ] } });
  assert.ok(result.trace.budget.every((item) => item.after >= 0));
  const included = new Set(result.includedEntryIds);
  assert.ok(result.trace.candidates.filter((item) => item.status === 'REJECTED').every((item) => !included.has(item.entryId)));
});

test('simulation source forbids direct Math.random', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../../scripts/lib/world-info-simulator.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/u);
});
