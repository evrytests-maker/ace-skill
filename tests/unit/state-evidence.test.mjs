import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { validateEvidence } from '../../scripts/lib/enforcement.mjs';
import { buildValidLedger, ROOT, sha256 } from '../helpers/repo-fixture.mjs';
import { readJson } from '../helpers/repo-fixture.mjs';

test('checked-in valid evidence fixture passes without hydration', () => {
  const result = validateEvidence(readJson('tests/fixtures/evidence/valid-template.json'), ROOT);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
});

test('complete fresh ledger passes', () => {
  const ledger = buildValidLedger('token-budget');
  const result = validateEvidence(ledger, ROOT);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
});

test('token-budget loads the reference matching artifactType and forbids domain leakage', () => {
  const character = buildValidLedger('token-budget');
  character.artifactType = 'character';
  character.references = [{
    path: 'references/character-cards.md',
    sha256: sha256('references/character-cards.md', ROOT),
    evidence: 'Read the character reference for a character token audit.',
  }];
  assert.deepEqual(validateEvidence(character, ROOT).errors, []);

  const missingType = buildValidLedger('token-budget');
  delete missingType.artifactType;
  assert.ok(validateEvidence(missingType, ROOT).errors.some((error) => error.includes('requires artifactType')));

  const leaked = buildValidLedger('token-budget');
  leaked.references.push({ path: 'references/character-cards.md', sha256: '0'.repeat(64), evidence: 'Wrong domain.' });
  assert.ok(validateEvidence(leaked, ROOT).errors.some((error) => error.includes('Forbidden reference')));
});

test('REPORT before VERIFY is rejected', () => {
  const ledger = buildValidLedger('token-budget');
  ledger.transitions = ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE', 'REPORT'];
  assert.ok(validateEvidence(ledger, ROOT).errors.some((error) => error.includes('transition')));
});

test('repair cycles must be paired with revalidation and capped at five', () => {
  const missingRerun = buildValidLedger('token-budget');
  missingRerun.transitions = ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE', 'REPAIR', 'VERIFY', 'REPORT'];
  assert.ok(validateEvidence(missingRerun, ROOT).errors.some((error) => error.includes('transition')));

  const tooMany = buildValidLedger('token-budget');
  tooMany.transitions = ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE'];
  for (let i = 0; i < 6; i += 1) tooMany.transitions.push('REPAIR', 'VALIDATE');
  tooMany.transitions.push('VERIFY', 'REPORT');
  assert.ok(validateEvidence(tooMany, ROOT).errors.some((error) => error.includes('transition')));
});

test('wrong reference hash and forbidden domain reference are rejected', () => {
  const ledger = buildValidLedger('character-create');
  ledger.references[0].sha256 = '0'.repeat(64);
  ledger.references.push({ path: 'references/lorebooks.md', sha256: '0'.repeat(64), evidence: 'Should not have been read.' });
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /hash mismatch/);
  assert.match(errors, /Forbidden reference/);
});

test('every reference must be unique, repo-relative, present, and correctly hashed', () => {
  const ledger = buildValidLedger('token-budget');
  ledger.references.push({ ...ledger.references[0] });
  ledger.references.push({
    path: path.join(ROOT, 'references/lorebooks.md'),
    sha256: sha256('references/lorebooks.md', ROOT),
    evidence: 'An absolute path must never be accepted.',
  });
  ledger.references.push({
    path: 'references/missing-ledger-reference.md',
    sha256: '0'.repeat(64),
    evidence: 'A missing extra reference must still be checked.',
  });
  ledger.references.push({
    path: '../outside-ledger-reference.md',
    sha256: '0'.repeat(64),
    evidence: 'A traversal path must never escape the repository root.',
  });
  ledger.references.push({
    path: 'references/sources-and-conflicts.md',
    sha256: '0'.repeat(64),
    evidence: 'A non-required extra reference must still be hash checked.',
  });
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /Duplicate reference evidence/);
  assert.match(errors, /must be repo-relative/);
  assert.match(errors, /Referenced file is missing: references\/missing-ledger-reference\.md/);
  assert.match(errors, /Reference path escapes repository root/);
  assert.match(errors, /Reference hash mismatch: references\/sources-and-conflicts\.md/);
});

test('repoHead, inputs, and automatic PASS cwd must contain real evidence', () => {
  const ledger = buildValidLedger('token-budget');
  ledger.repoHead = 'fake-head';
  ledger.inputs = [];
  ledger.gates.find((gate) => gate.kind === 'automatic').cwd = '.';
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /requires a 40-hex repoHead/);
  assert.match(errors, /at least one nonempty input/);
  assert.match(errors, /automatic PASS without an absolute cwd/);

  const unavailablePass = buildValidLedger('token-budget');
  unavailablePass.repoHead = 'UNAVAILABLE';
  assert.match(validateEvidence(unavailablePass, ROOT).errors.join('\n'), /UNAVAILABLE is allowed only when overallStatus is BLOCKED/);
});

test('PASS requires every applicable workflow gate', () => {
  const ledger = buildValidLedger('token-budget');
  ledger.gates = [];
  const errors = validateEvidence(ledger, ROOT).errors;
  assert.ok(errors.some((error) => /missing|required.*gate|not evidenced/i.test(error)), `Expected missing-gate error, got:\n${errors.join('\n')}`);
});

test('automatic and manual PASS require command and independent review evidence', () => {
  const ledger = buildValidLedger('character-create');
  const automatic = ledger.gates.find((gate) => gate.kind === 'automatic');
  delete automatic.command;
  delete automatic.attempts;
  const manual = ledger.gates.find((gate) => gate.kind === 'manual');
  manual.reviewerRunId = ledger.runId;
  delete manual.reviewEvidence;
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /successful command evidence/);
  assert.match(errors, /independent reviewerRunId/);
  assert.match(errors, /structured manual evidence/);
});

test('automatic PASS requires a real successful transcript and status matches exit code', () => {
  const ledger = buildValidLedger('token-budget');
  const gate = ledger.gates.find((candidate) => candidate.kind === 'automatic');
  gate.attempts = [{ at: '2026-07-10T12:00:00.500Z', exitCode: 0, stdout: '', stderr: '' }];
  assert.ok(validateEvidence(ledger, ROOT).errors.some((error) => error.includes('transcript/log')));

  gate.status = 'BLOCKED';
  gate.exitCode = 1;
  assert.ok(validateEvidence(ledger, ROOT).errors.some((error) => error.includes('BLOCKED is inconsistent')));
});

test('artifact validators cannot PASS without a checked artifact hash', () => {
  const ledger = buildValidLedger('token-budget');
  const gate = ledger.gates.find((candidate) => candidate.gateId === 'VAL-TOKENS');
  gate.artifacts = [];
  assert.ok(validateEvidence(ledger, ROOT).errors.some((error) => error.includes('artifact SHA-256')));
});

test('overall PASS cannot contain FAIL or BLOCKED', () => {
  for (const status of ['FAIL', 'BLOCKED']) {
    const ledger = buildValidLedger('token-budget');
    ledger.gates[0].status = status;
    ledger.gates[0].exitCode = 1;
    assert.ok(validateEvidence(ledger, ROOT).errors.some((error) => error.includes('overallStatus PASS')));
  }
});

test('overall status is derived bidirectionally with BLOCKED before FAIL before PASS', () => {
  for (const claimed of ['BLOCKED', 'FAIL']) {
    const allPass = buildValidLedger('token-budget');
    allPass.overallStatus = claimed;
    if (claimed === 'BLOCKED') allPass.repoHead = 'UNAVAILABLE';
    assert.match(validateEvidence(allPass, ROOT).errors.join('\n'), new RegExp(`overallStatus ${claimed} is inconsistent with gate-derived PASS`));
  }

  const blockedWins = buildValidLedger('token-budget');
  blockedWins.gates[0].status = 'FAIL';
  blockedWins.gates[0].exitCode = 1;
  blockedWins.gates[1].status = 'BLOCKED';
  blockedWins.gates[1].exitCode = 3;
  blockedWins.overallStatus = 'FAIL';
  assert.match(validateEvidence(blockedWins, ROOT).errors.join('\n'), /overallStatus FAIL is inconsistent with gate-derived BLOCKED/);
});

test('N/A is accepted only with policy and evidence', () => {
  const ledger = buildValidLedger('token-budget');
  const coreGate = ledger.gates.find((gate) => gate.ruleIds.includes('ACE-CORE-001'));
  coreGate.status = 'N/A';
  coreGate.naReason = '';
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /N\/A without reason/);
  assert.match(errors, /non-optional ACE-CORE-001 N\/A/);
});
