import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advancedFieldEvidence,
  classifyLorebookWorkflow,
  executeRuntimeGate,
  runtimeGateResult,
  simulationEvidence,
} from '../../scripts/lib/lorebook-evidence.mjs';

test('advanced fields automatically select simulator workflow with UID/index/path evidence', () => {
  const artifact = { entries: { alpha: { uid: 7, key: ['x'], content: 'enough content', extensions: { depth: 2 } } } };
  assert.deepEqual(advancedFieldEvidence(artifact), [{ entryUid: 7, entryIndex: 0, fieldPath: 'extensions.depth' }]);
  assert.deepEqual(classifyLorebookWorkflow(artifact).requiredGates, ['VAL-LORE', 'VAL-SIMULATOR']);
});

test('basic entries do not claim advanced workflow', () => {
  assert.equal(classifyLorebookWorkflow({ entries: [{ key: ['x'], content: 'plain' }] }).workflow, 'basic');
});

test('runtime adapter is BLOCKED when unavailable or missing genuine runtime evidence', () => {
  assert.equal(runtimeGateResult({ ruleId: 'G-RUNTIME' }).status, 'BLOCKED');
  assert.equal(runtimeGateResult({ adapter: { name: 'st' }, evidence: { simulated: true }, ruleId: 'G-RUNTIME' }).status, 'BLOCKED');
  const pass = runtimeGateResult({ adapter: { name: 'st' }, evidence: { runtimeObserved: true, runId: 'run-1' }, ruleId: 'G-RUNTIME' });
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.evidence.simulated, false);
});

test('runtime adapter must execute and return genuine observation before PASS', async () => {
  let calls = 0;
  const pass = await executeRuntimeGate({
    adapter: { name: 'st', verify: async (input) => { calls += 1; return { status: 'PASS', runtimeObserved: true, runId: `run-${input.id}` }; } },
    input: { id: 7 }, ruleId: 'G-RUNTIME',
  });
  assert.equal(calls, 1);
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.evidence.adapterInvoked, true);
  assert.equal((await executeRuntimeGate({ adapter: { kind: 'fake', verify: () => ({}) }, ruleId: 'G-RUNTIME' })).status, 'BLOCKED');
  assert.equal((await executeRuntimeGate({ adapter: { name: 'missing-method' }, ruleId: 'G-RUNTIME' })).blocker, 'RUNTIME_ADAPTER_METHOD_MISSING');
  assert.equal((await executeRuntimeGate({ adapter: { name: 'broken', verify: () => { throw new Error('offline'); } }, ruleId: 'G-RUNTIME' })).blocker, 'RUNTIME_ADAPTER_ERROR');
});

test('simulation evidence can never masquerade as runtime evidence', () => {
  const result = simulationEvidence({ trace: { seed: 9, errors: [], blockers: [] }, ruleId: 'G-SIM' });
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidence.simulated, true);
  assert.equal(result.evidence.runtimeObserved, false);
});
