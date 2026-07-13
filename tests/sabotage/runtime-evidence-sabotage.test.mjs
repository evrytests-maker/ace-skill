import assert from 'node:assert/strict';
import test from 'node:test';

import { executeRuntimeGate } from '../../scripts/lib/lorebook-evidence.mjs';

test('runtime PASS cannot be forged by a fake adapter', async () => {
  const result = await executeRuntimeGate({
    adapter: { kind: 'fake', verify: () => ({ status: 'PASS', runtimeObserved: true, runId: 'forged' }) },
    ruleId: 'G-EVID-003',
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.blocker, 'RUNTIME_ADAPTER_SIMULATED');
});

test('runtime PASS without observation identity fails closed', async () => {
  const result = await executeRuntimeGate({
    adapter: { name: 'incomplete', verify: () => ({ status: 'PASS', evidence: { runtimeObserved: true } }) },
    ruleId: 'G-EVID-003',
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.blocker, 'RUNTIME_EVIDENCE_MISSING');
});

test('unknown adapter status cannot become PASS', async () => {
  const result = await executeRuntimeGate({
    adapter: { name: 'unknown', verify: () => ({ status: 'MAYBE', runtimeObserved: true, runId: 'run-1' }) },
    ruleId: 'G-EVID-003',
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.blocker, 'RUNTIME_STATUS_UNKNOWN');
});
