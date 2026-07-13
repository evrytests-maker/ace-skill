import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readJson, ROOT } from '../helpers/repo-fixture.mjs';
import { main as runEvalMain, validateDatasets } from '../../evals/run-evals.mjs';

const REQUIRED_BEHAVIOR_FIELDS = [
  'id', 'prompt', 'shouldTrigger', 'requiredWorkflow', 'requiredReferences', 'forbiddenReferences',
  'requiredRules', 'requiredValidators', 'requiredOutputs', 'assertions', 'prohibitedBehavior', 'evidence',
];

test('trigger corpus has exactly 32 unique cases, balanced 16/16 and split 20/12', () => {
  const train = readJson('evals/triggers.train.json').cases;
  const validation = readJson('evals/triggers.validation.json').cases;
  assert.equal(train.length, 20);
  assert.equal(validation.length, 12);
  const all = [...train, ...validation];
  assert.equal(all.length, 32);
  assert.equal(new Set(all.map((item) => item.id)).size, 32);
  assert.equal(all.filter((item) => item.shouldTrigger).length, 16);
  assert.equal(all.filter((item) => !item.shouldTrigger).length, 16);
  for (const split of [train, validation]) {
    assert.equal(split.filter((item) => item.shouldTrigger).length, split.length / 2);
    assert.equal(split.filter((item) => !item.shouldTrigger).length, split.length / 2);
  }
  const categories = new Set(all.map((item) => item.category));
  for (const category of ['typo', 'near-miss', 'buried', 'multi-step', 'colloquial']) assert.ok(categories.has(category), `missing category ${category}`);
});

test('behavior corpus has exactly 20 decision-complete cases', () => {
  const cases = readJson('evals/behavior.json').cases;
  assert.equal(cases.length, 20);
  assert.equal(new Set(cases.map((item) => item.id)).size, 20);
  for (const item of cases) {
    for (const field of REQUIRED_BEHAVIOR_FIELDS) assert.ok(Object.hasOwn(item, field), `${item.id} misses ${field}`);
    assert.ok(Array.isArray(item.requiredReferences));
    assert.ok(Array.isArray(item.forbiddenReferences));
    assert.ok(Array.isArray(item.requiredRules));
    assert.ok(Array.isArray(item.requiredValidators));
    assert.ok(Array.isArray(item.requiredOutputs));
    assert.ok(Array.isArray(item.assertions) && item.assertions.length > 0);
    assert.ok(Array.isArray(item.prohibitedBehavior) && item.prohibitedBehavior.length > 0);
    assert.ok(Array.isArray(item.evidence) && item.evidence.length > 0);
  }
});

test('all eval rule/workflow/validator/reference IDs resolve', () => {
  const registry = readJson('rules/registry.json');
  const workflows = readJson('rules/workflows.json');
  const rules = new Set(registry.rules.map((item) => item.id));
  const validators = new Set(registry.validators.map((item) => item.id));
  const workflowMap = new Map(workflows.workflows.map((item) => [item.id, item]));
  for (const item of readJson('evals/behavior.json').cases) {
    if (!item.shouldTrigger) continue;
    assert.ok(workflowMap.has(item.requiredWorkflow), `${item.id} unknown workflow`);
    const workflow = workflowMap.get(item.requiredWorkflow);
    for (const id of item.requiredRules) assert.ok(rules.has(id), `${item.id} unknown rule ${id}`);
    for (const id of item.requiredValidators) assert.ok(validators.has(id), `${item.id} unknown validator ${id}`);
    for (const reference of item.requiredReferences) assert.ok(fs.existsSync(path.join(ROOT, reference)), `${item.id} missing reference ${reference}`);
    for (const reference of workflow.requiredReferences) assert.ok(item.requiredReferences.includes(reference), `${item.id} omits workflow reference ${reference}`);
    for (const reference of workflow.forbiddenReferences) assert.ok(item.forbiddenReferences.includes(reference), `${item.id} omits forbidden reference ${reference}`);
    assert.deepEqual([...item.requiredValidators].sort(), [...workflow.validators].sort(), `${item.id} validator set drifts from ${workflow.id}`);
  }
});

test('the standalone dataset validator confirms counts without claiming model PASS', async () => {
  assert.deepEqual(validateDatasets().errors, []);
  const output = path.join(ROOT, '.ace-reports/test-data-validation.json');
  const status = await runEvalMain(['--suite', 'all', '--validate-data', '--output', output]);
  assert.equal(status, 0);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(report.status, 'VALIDATED');
  assert.notEqual(report.status, 'PASS');
  assert.match(report.note, /not an evaluation PASS/);
});

test('unavailable fresh-context runner returns BLOCKED exit 3, never PASS', async () => {
  const output = path.join(os.tmpdir(), 'ace-v5-eval-blocked-test.json');
  const status = await runEvalMain(['--suite', 'triggers', '--runner', '/definitely/missing/ace-runner', '--output', output]);
  assert.equal(status, 3);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(report.status, 'BLOCKED');
  assert.notEqual(report.status, 'PASS');
  assert.match(report.reason, /runner unavailable/);
  fs.rmSync(output, { force: true });
});
