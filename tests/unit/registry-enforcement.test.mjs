import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateRuleSystem, validateSources } from '../../scripts/lib/enforcement.mjs';
import { makeRepoFixture, readJson, removeFixture, ROOT, writeJson } from '../helpers/repo-fixture.mjs';

test('live rule system has complete traceability', () => {
  const result = validateRuleSystem(ROOT);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.match(result.evidence.join('\n'), /rules, \d+ validators, 9 workflows/);
});

test('every MUST is attached to a real gate, catalog test, source, and workflow', () => {
  const registry = readJson('rules/registry.json');
  const workflows = readJson('rules/workflows.json');
  const gates = readJson('rules/manual-gates.json');
  const sources = readJson('rules/sources.json');
  const catalog = new Set(readJson('tests/catalog.json').tests);
  const validatorIds = new Set(registry.validators.map((item) => item.id));
  const manualIds = new Set(gates.gates.map((item) => item.id));
  const sourceIds = new Set(sources.sources.map((item) => item.id));
  const workflowRules = new Set(workflows.workflows.flatMap((item) => item.rules));
  for (const rule of registry.rules.filter((item) => item.level === 'MUST')) {
    assert.ok(rule.gate, `${rule.id} has no gate`);
    assert.ok(rule.gate.kind === 'automatic' ? validatorIds.has(rule.gate.id) : manualIds.has(rule.gate.id), `${rule.id} has an unknown gate`);
    assert.ok(rule.tests.length > 0 && rule.tests.every((id) => catalog.has(id)), `${rule.id} has unknown tests`);
    assert.ok(rule.sources.length > 0 && rule.sources.every((id) => sourceIds.has(id)), `${rule.id} has unknown sources`);
    assert.ok(workflowRules.has(rule.id), `${rule.id} is not enforced by a workflow`);
  }
});

test('workflow validators cover every automatic gate of their rules', () => {
  const registry = readJson('rules/registry.json');
  const workflows = readJson('rules/workflows.json');
  const rules = new Map(registry.rules.map((item) => [item.id, item]));
  for (const workflow of workflows.workflows) {
    const configured = new Set(workflow.validators);
    for (const ruleId of workflow.rules) {
      const rule = rules.get(ruleId);
      if (rule?.gate.kind === 'automatic') assert.ok(configured.has(rule.gate.id), `${workflow.id} omits ${rule.gate.id} required by ${ruleId}`);
    }
  }
});

test('unknown test ID is rejected', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const registry = readJson('rules/registry.json', root);
  registry.rules[0].tests.push('T-DOES-NOT-EXIST');
  writeJson('rules/registry.json', registry, root);
  assert.ok(validateRuleSystem(root).errors.some((error) => error.includes('unknown test')));
});

test('missing validator implementation is rejected', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const registry = readJson('rules/registry.json', root);
  const target = registry.validators.find((item) => item.id === 'VAL-CARD');
  fs.rmSync(path.join(root, target.path));
  assert.ok(validateRuleSystem(root).errors.some((error) => error.includes('missing validator')));
});

test('live sources are repository-contained and active source IDs resolve', () => {
  const result = validateSources(ROOT);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.match(result.evidence.join('\n'), /self-contained files checked/);
});

test('bundled source path escape fails ACE-REPO-005', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const sources = readJson('rules/sources.json', root);
  const bundled = sources.sources.find((source) => source.type === 'bundled-rule-export');
  bundled.url = 'local:../outside.md';
  writeJson('rules/sources.json', sources, root);
  assert.match(validateSources(root).errors.join('\n'), /ACE-REPO-005 local source escapes the skill root/);
});

test('unknown SRC token in an active source document fails closed', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  fs.appendFileSync(path.join(root, 'references/character-cards.md'), '\n`SRC-NOT-REGISTERED`\n');
  assert.match(validateSources(root).errors.join('\n'), /ACE-REPO-005 active source document references unknown source ID: references\/character-cards\.md: SRC-NOT-REGISTERED/);
});
