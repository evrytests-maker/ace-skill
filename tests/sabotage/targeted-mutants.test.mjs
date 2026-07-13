import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { validateDocs, validateEvidence, validateRuleSystem, validateSources } from '../../scripts/lib/enforcement.mjs';
import { buildValidLedger, makeRepoFixture, readJson, removeFixture, ROOT, writeJson } from '../helpers/repo-fixture.mjs';

function mutant(name, callback) {
  test(name, async (t) => {
    const root = makeRepoFixture();
    t.after(() => removeFixture(root));
    await callback(root);
  });
}

mutant('M-RULE-ID: deleting a referenced rule is detected', (root) => {
  const registry = readJson('rules/registry.json', root);
  registry.rules = registry.rules.filter((rule) => rule.id !== 'ACE-CORE-001');
  writeJson('rules/registry.json', registry, root);
  const errors = validateRuleSystem(root).errors.join('\n');
  assert.match(errors, /unknown rule: ACE-CORE-001/);
});

mutant('M-VALIDATOR-LINK: deleting a validator link is detected', (root) => {
  const registry = readJson('rules/registry.json', root);
  registry.validators = registry.validators.filter((validator) => validator.id !== 'VAL-LORE');
  writeJson('rules/registry.json', registry, root);
  const errors = validateRuleSystem(root).errors.join('\n');
  assert.match(errors, /unknown validator: VAL-LORE/);
});

test('M-EXPECTED-EXIT: PASS with a nonzero command exit is detected', () => {
  const ledger = buildValidLedger('token-budget', ROOT);
  const gate = ledger.gates.find((candidate) => candidate.kind === 'automatic');
  gate.exitCode = 17;
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /PASS without successful command evidence/);
});

mutant('M-MISSING-REFERENCE: deleting a required reference is detected', (root) => {
  fs.rmSync(path.join(root, 'references/lorebooks.md'));
  const errors = validateRuleSystem(root).errors.join('\n');
  assert.match(errors, /requires missing reference: references\/lorebooks\.md/);
});

mutant('M-OLD-ROUTE: restoring an active legacy route is detected', (root) => {
  fs.writeFileSync(path.join(root, 'references/stale-route.md'), '# Stale\n\nUse [the old route](../gpt/SKILL_GPT.md).\n');
  const errors = validateDocs(root).errors.join('\n');
  assert.match(errors, /stale route token|broken link/);
});

mutant('M-EXTERNAL-GUIDE-DEPENDENCY: restoring a local archive dependency is detected', (root) => {
  const sources = readJson('rules/sources.json', root);
  const bundled = sources.sources.find((source) => source.type === 'bundled-rule-export');
  bundled.type = 'local-archive';
  bundled.url = 'local:/home/example/external-guide.zip';
  writeJson('rules/sources.json', sources, root);
  const errors = validateSources(root).errors.join('\n');
  assert.match(errors, /ACE-REPO-005 forbids local-archive sources/);
  assert.match(errors, /ACE-REPO-005.*absolute|ACE-REPO-005.*ZIP/);
});

mutant('M-SELECTIVE-LOGIC: changing the canonical numeric map is detected', async (root) => {
  const modulePath = path.join(root, 'scripts/lib/st-matching.mjs');
  const source = fs.readFileSync(modulePath, 'utf8').replace('AND_ANY: 0,', 'AND_ANY: 7,');
  fs.writeFileSync(modulePath, source);
  const servicePath = path.join(root, 'scripts/services/secondary.mjs');
  const imported = await import(`${pathToFileURL(servicePath).href}?mutant=M-SELECTIVE-LOGIC`);
  const gate = imported.verifyOfficialTruthTable();
  assert.equal(gate.exitCode, 1, 'The mutated truth-table gate must fail nonzero.');
  assert.equal(gate.status, 'FAIL');
  assert.ok(gate.errors.some((issue) => issue.ruleId === 'ACE-LORE-002'), JSON.stringify(gate, null, 2));
});

mutant('M-ALWAYS-SUCCESS: validator returning unconditional success fails its invalid-fixture contract', async (root) => {
  const validator = path.join(root, 'scripts/services/lorebook.mjs');
  const source = fs.readFileSync(validator, 'utf8');
  const marker = 'export function validateLorebook(artifact, options = {}) {';
  assert.ok(source.includes(marker), 'Lorebook service contract marker is missing.');
  fs.writeFileSync(validator, source.replace(marker, `${marker}\n  return { service: 'lorebook', operation: 'validate', status: 'PASS', ok: true, exitCode: 0, errors: [], warnings: [], blockers: [], evidence: [], data: {} };`));
  const imported = await import(`${pathToFileURL(validator).href}?mutant=M-ALWAYS-SUCCESS`);
  const result = imported.validateLorebook(readJson('tests/fixtures/lorebooks/invalid.json', ROOT));
  const contractGate = result.exitCode === 1 && result.status === 'FAIL'
    ? { status: 'PASS', exitCode: 0, errors: [] }
    : {
      status: 'FAIL',
      exitCode: 1,
      errors: [{ gateId: 'M-ALWAYS-SUCCESS', ruleId: 'ACE-LORE-001', message: 'Invalid lorebook fixture was accepted.' }],
    };
  assert.equal(contractGate.exitCode, 1, 'The mutant contract gate must fail nonzero.');
  assert.equal(contractGate.status, 'FAIL');
  assert.ok(contractGate.errors.some((issue) => issue.gateId === 'M-ALWAYS-SUCCESS' && issue.ruleId === 'ACE-LORE-001'));
});

mutant('M-WORKFLOW-STEP: removing a state-machine step is detected', (root) => {
  const workflows = readJson('rules/workflows.json', root);
  workflows.states = workflows.states.filter((state) => state !== 'VERIFY');
  writeJson('rules/workflows.json', workflows, root);
  const errors = validateRuleSystem(root).errors.join('\n');
  assert.match(errors, /states do not match the required state machine/);
});

test('M-PASS-WITH-FAIL: overall PASS containing a failed gate is detected', () => {
  const ledger = buildValidLedger('token-budget', ROOT);
  ledger.gates[0].status = 'FAIL';
  ledger.gates[0].exitCode = 1;
  ledger.overallStatus = 'PASS';
  const errors = validateEvidence(ledger, ROOT).errors.join('\n');
  assert.match(errors, /overallStatus PASS contains FAIL or BLOCKED gate/);
});
