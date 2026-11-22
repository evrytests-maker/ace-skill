import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isValidTriggerResponse, validateDatasets } from '../../evals/run-evals.mjs';
import { ROOT } from '../helpers/repo-fixture.mjs';

const DATASET_FILES = [
  'evals/triggers.train.json',
  'evals/triggers.validation.json',
  'evals/behavior.json',
  'rules/workflows.json',
  'rules/registry.json',
];

function makeDatasetFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-eval-data-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of DATASET_FILES) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  fs.cpSync(path.join(ROOT, 'evals/inputs'), path.join(root, 'evals/inputs'), { recursive: true });
  return root;
}

test('checked-in eval datasets validate', () => {
  const result = validateDatasets();
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
});

test('a non-array requiredRules value is reported without throwing', (t) => {
  const root = makeDatasetFixture(t);
  const file = path.join(root, 'evals/behavior.json');
  const behavior = JSON.parse(fs.readFileSync(file, 'utf8'));
  behavior.cases[0].requiredRules = 'ACE-CORE-001';
  fs.writeFileSync(file, JSON.stringify(behavior));
  const result = validateDatasets(root);
  assert.ok(result.errors.some((error) => error.includes('requiredRules must be an array')));
});

test('a null behavior case is reported without throwing', (t) => {
  const root = makeDatasetFixture(t);
  const file = path.join(root, 'evals/behavior.json');
  const behavior = JSON.parse(fs.readFileSync(file, 'utf8'));
  behavior.cases.push(null);
  fs.writeFileSync(file, JSON.stringify(behavior));
  const result = validateDatasets(root);
  assert.ok(result.errors.some((error) => error.includes('behavior entry must be an object')));
});

test('trigger responses must match the declared schema', () => {
  assert.equal(isValidTriggerResponse({ triggered: false, skills: [], reason: 'no match' }), true);
  assert.equal(isValidTriggerResponse({}), false);
  assert.equal(isValidTriggerResponse({ triggered: false, skills: [], reason: 'no match', extra: true }), false);
  assert.equal(isValidTriggerResponse({ triggered: false, skills: [1], reason: 'no match' }), false);
});
