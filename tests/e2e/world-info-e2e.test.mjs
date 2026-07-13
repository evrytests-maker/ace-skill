import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { executeRuntimeGate } from '../../scripts/lib/lorebook-evidence.mjs';
import { verifyLorebookRoundTrip } from '../../scripts/lib/lorebook-io.mjs';
import { FakeVectorProvider, simulateWorldInfo } from '../../scripts/lib/world-info-simulator.mjs';

const entry = (uid, overrides = {}) => ({ uid, key: [`k${uid}`], content: `entry ${uid} complete content`, ...overrides });

test('e2e basic valid lorebook', () => {
  assert.deepEqual(simulateWorldInfo({ history: ['k1'], lorebook: { entries: [entry(1)] } }).includedEntryIds, ['1']);
});

test('e2e unreachable activation remains excluded with reason', () => {
  const result = simulateWorldInfo({ history: ['nothing'], lorebook: { entries: [entry(1)] } });
  assert.deepEqual(result.includedEntryIds, []);
  assert.ok(result.trace.candidates[0].reasons.includes('KEY_NOT_MATCHED'));
});

test('e2e probability plus budget plus order', () => {
  const result = simulateWorldInfo({ seed: 3, history: ['k1 k2'], tokenCounter: () => 4, budgetPolicy: { budget: 4 }, lorebook: { entries: [entry(1, { order: 1, probability: 100 }), entry(2, { order: 2, probability: 100 })] } });
  assert.deepEqual(result.includedEntryIds, ['2']);
  assert.ok(result.trace.budget.every((row) => row.after >= 0));
});

test('e2e recursion cycle and limit terminates', () => {
  const result = simulateWorldInfo({ history: ['head'], settings: { recursiveScanning: true, maxRecursionDepth: 2 }, lorebook: { entries: [entry(1, { key: ['head'], content: 'tail' }), entry(2, { key: ['tail'], content: 'head' })] } });
  assert.ok(result.trace.recursion.cycles.length > 0);
  assert.ok(['NO_NEW_ACTIVATIONS', 'DEPTH_LIMIT'].includes(result.trace.recursion.terminationReason));
});

test('e2e weighted groups choose one eligible member', () => {
  const result = simulateWorldInfo({ seed: 7, history: ['x'], lorebook: { entries: [entry(1, { key: ['x'], group: 'g', groupWeight: 1 }), entry(2, { key: ['x'], group: 'g', groupWeight: 3 })] } });
  assert.equal(result.includedEntryIds.length, 1);
  assert.ok(['1', '2'].includes(result.includedEntryIds[0]));
});

test('e2e sticky cooldown delay timeline is serializable', () => {
  const first = simulateWorldInfo({ messageNumber: 1, history: ['k1'], lorebook: { entries: [entry(1, { sticky: 1, cooldown: 1, delay: 1 })] } });
  const second = simulateWorldInfo({ messageNumber: 2, history: ['none'], timedState: first.timedState, lorebook: { entries: [entry(1, { sticky: 1, cooldown: 1, delay: 1 })] } });
  assert.deepEqual(second.includedEntryIds, ['1']);
  assert.doesNotThrow(() => JSON.stringify(second.timedState));
});

test('e2e filters and scan sources preserve provenance', () => {
  const result = simulateWorldInfo({ character: { name: 'Mira', scenario: 'vault' }, history: [], settings: { matchScenario: true }, lorebook: { entries: [entry(1, { key: ['vault'], characterFilter: ['Mira'] })] } });
  assert.deepEqual(result.includedEntryIds, ['1']);
  assert.ok(result.trace.scanBuffer.segments.some((segment) => segment.source === 'scenario'));
});

test('e2e advanced raw prompt placement', () => {
  const result = simulateWorldInfo({ history: ['k1'], lorebook: { entries: [entry(1, { position: 'at_depth', depth: 0, role: 'user', outlet: 'memory' })] } });
  assert.deepEqual(result.rawPrompt[0], { role: 'user', content: 'entry 1 complete content', position: 'at_depth', depth: 0, outlet: 'memory', entryId: '1' });
});

test('e2e vector fake provider passes pipeline', () => {
  const result = simulateWorldInfo({ history: ['query'], vectorProvider: new FakeVectorProvider([{ id: 1, score: 0.9 }]), vector: { scoreThreshold: 0.5, maxEntries: 1 }, lorebook: { entries: [entry(1, { key: [], vectorized: true })] } });
  assert.deepEqual(result.includedEntryIds, ['1']);
  assert.equal(result.trace.vector.evidenceType, 'simulation');
});

test('e2e embedded lorebook and character scope', () => {
  const result = simulateWorldInfo({ character: { name: 'Mira' }, history: ['k1'], lorebook: { data: { character_book: { entries: [entry(1, { scope: 'embedded-character' })] } } } });
  assert.deepEqual(result.includedEntryIds, ['1']);
  assert.equal(result.trace.containerPath, 'data.character_book.entries');
});

test('e2e import export round-trip is lossless', () => {
  assert.equal(verifyLorebookRoundTrip({ entries: { alpha: entry(1, { extensions: { custom: true } }) } }).status, 'PASS');
});

test('e2e combined conflicts fixture maintains invariants', () => {
  const fixture = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../fixtures/simulator/combined-conflicts.json', import.meta.url)), 'utf8'));
  fixture.vectorProvider = new FakeVectorProvider([{ id: 5, score: 0.9 }]);
  const result = simulateWorldInfo(fixture);
  assert.equal(result.status, 'PASS');
  assert.equal(new Set(result.includedEntryIds).size, result.includedEntryIds.length);
  assert.ok(result.trace.budget.every((row) => row.after >= 0));
});

test('e2e runtime-required case is BLOCKED without adapter', async () => {
  assert.equal((await executeRuntimeGate({ ruleId: 'G-PLACE-009' })).status, 'BLOCKED');
});

test('e2e runtime adapter is invoked before real runtime PASS', async () => {
  let calls = 0;
  const result = await executeRuntimeGate({
    ruleId: 'G-PLACE-009',
    input: { prompt: 'observed prompt' },
    adapter: {
      name: 'fixture-runtime',
      async verify(input) {
        calls += 1;
        return {
          status: 'PASS',
          evidence: { runtimeObserved: true, runId: 'runtime-e2e-1', prompt: input.prompt },
        };
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidence.simulated, false);
  assert.equal(result.evidence.prompt, 'observed prompt');
});

test('e2e budget rejection cuts the recursion branch before descendant matching', () => {
  const result = simulateWorldInfo({ history: ['root'], tokenCounter: () => 5, budgetPolicy: { budget: 0 }, lorebook: { entries: [entry(1, { key: ['root'], content: 'child-key' }), entry(2, { key: ['child-key'] })] } });
  assert.deepEqual(result.includedEntryIds, []);
  assert.equal(result.trace.recursion.terminationReason, 'BUDGET_REJECTED_ALL_SOURCES');
  assert.equal(result.trace.recursion.waves.length, 1);
});

test('e2e full prompt skeleton preserves at-depth provenance and expands Outlet only through a consumer macro', () => {
  const result = simulateWorldInfo({ systemPrompt: 'Memory: {{outlet::memory}}', character: { description: 'Character', examples: ['Example'] }, authorNote: 'AN', history: ['first', 'last'], lorebook: { entries: [entry(1, { constant: true, position: 'at_depth', depth: 1, role: 'assistant' }), entry(2, { constant: true, position: 'outlet', outlet: 'memory' })] } });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.simulatedRawPrompt.filter((segment) => segment.source === 'history' || segment.entryId === '1').map((segment) => segment.entryId ?? segment.content), ['first', '1', 'last']);
  assert.equal(result.simulatedRawPrompt.some((segment) => segment.entryId === '2'), false);
  assert.equal(result.simulatedRawPrompt.find((segment) => segment.source === 'systemPrompt').content, 'Memory: entry 2 complete content');
  assert.deepEqual(result.outletEntries, { memory: ['entry 2 complete content'] });
  const placed = result.simulatedRawPrompt.find((segment) => segment.entryId === '1');
  assert.ok(placed.provenance.fieldPath.endsWith('.content'));
  assert.equal(placed.order, 100);
  assert.ok(Number.isInteger(placed.finalIndex));
});
