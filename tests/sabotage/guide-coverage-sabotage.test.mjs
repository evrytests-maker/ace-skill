import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadGuideRulePacks, validateGuideCoverage } from '../../scripts/lib/guide-coverage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function copyJson(value) {
  return structuredClone(value);
}
function fixture(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-guide-packs-'));
  const source = loadGuideRulePacks(ROOT);
  const index = copyJson(source.index);
  const packs = new Map(source.packs.map(({ descriptor, pack }) => [descriptor.file, copyJson(pack)]));
  mutate(index, packs);
  fs.mkdirSync(path.join(root, 'rules/guide'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rules/guide/index.json'), JSON.stringify(index));
  for (const descriptor of index.packs ?? []) {
    const pack = packs.get(descriptor.file);
    if (pack) fs.writeFileSync(path.join(root, 'rules/guide', descriptor.file), JSON.stringify(pack));
  }
  for (const mechanism of index.mechanisms ?? []) {
    if (mechanism.path) {
      const target = path.join(root, mechanism.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'fixture');
    }
    for (const testFile of mechanism.testFiles ?? []) {
      const target = path.join(root, testFile);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'fixture');
    }
  }
  return validateGuideCoverage(root);
}
function hasError(result, fragment) {
  assert.ok(result.errors.some((message) => message.includes(fragment)), `${fragment}\n${result.errors.join('\n')}`);
}
function firstRule(packs) {
  return packs.values().next().value.rules[0];
}
function findRule(packs, id) {
  for (const pack of packs.values()) {
    const rule = pack.rules.find((candidate) => candidate.id === id);
    if (rule) return rule;
  }
  return null;
}

test('committed guide rules are split into focused AI packs with no duplicated scenario manifest', () => {
  const loaded = loadGuideRulePacks(ROOT);
  assert.equal(loaded.errors.length, 0);
  assert.ok(loaded.packs.length >= 6);
  assert.equal(loaded.rules.length, loaded.index.expectedRuleIds.length);
  assert.equal(fs.existsSync(path.join(ROOT, 'rules/guide-coverage.json')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'tests/guide-cases.json')), false);
  assert.ok(loaded.packs.every(({ file, pack }) => fs.statSync(file).size < 32768 && pack.agentPrompt && pack.loadWhen.length));
  assert.ok(loaded.rules.every((rule) => rule.action && rule.inputs.length && rule.source.locator));
  assert.deepEqual(validateGuideCoverage(ROOT).errors, []);
});

test('the original user guide is pinned without embedding duplicate prose in runtime packs', () => {
  const loaded = loadGuideRulePacks(ROOT);
  assert.match(loaded.index.source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(loaded.index.source.lineCount) && loaded.index.source.lineCount > 0);
  assert.ok(loaded.rules.every((rule) => !rule.action.startsWith('Enforce and verify this requirement:')));
  assert.ok(loaded.rules.every((rule) => rule.action.length <= 320));

  hasError(fixture((index) => { delete index.source.sha256; }), 'no pinned SHA-256');
  hasError(fixture((index) => { index.source.lineCount = 0; }), 'no valid lineCount');
  hasError(fixture((_index, packs) => {
    firstRule(packs).action = 'Enforce and verify this requirement: duplicated user prose.';
  }), 'generic user-guide wrapper');
  hasError(fixture((_index, packs) => { firstRule(packs).action = 'x'.repeat(321); }), 'exceeds 320 characters');
});

test('every guide rule has an independent parameterized missing-record mutation', () => {
  const loaded = loadGuideRulePacks(ROOT);
  for (const expectedId of loaded.index.expectedRuleIds) {
    const result = fixture((_index, packs) => {
      for (const pack of packs.values()) pack.rules = pack.rules.filter((rule) => rule.id !== expectedId);
    });
    hasError(result, `Missing guide rule record: ${expectedId}`);
  }
});

test('unknown and duplicate rule records fail closed', () => {
  hasError(fixture((_index, packs) => {
    const pack = packs.values().next().value;
    pack.rules.push({ ...copyJson(pack.rules[0]), id: 'G-UNKNOWN-999' });
  }), 'Unknown/orphan guide rule record');
  hasError(fixture((_index, packs) => {
    const pack = packs.values().next().value;
    pack.rules.push(copyJson(pack.rules[0]));
  }), 'Duplicate guide rule ID');
});

test('AI action, focused inputs, exact source, authority, mechanism, and verification are mandatory', () => {
  const mutations = [
    [(rule) => { delete rule.action; }, 'has no AI action'],
    [(rule) => { rule.inputs = []; }, 'has no focused input list'],
    [(rule) => { delete rule.source.locator; }, 'has no exact source record'],
    [(rule) => { rule.authority = 'invented'; }, 'unknown authority'],
    [(rule) => { rule.mechanisms = []; }, 'has no mechanisms'],
    [(rule) => { rule.verification = 'invented'; }, 'unknown verification'],
  ];
  for (const [mutate, fragment] of mutations) {
    const result = fixture((_index, packs) => mutate(firstRule(packs)));
    hasError(result, fragment);
  }
});

test('legacy duplicated prose and case fields are rejected inside packs', () => {
  for (const field of ['statement', 'applicability', 'evidenceContract', 'caseIds']) {
    const result = fixture((_index, packs) => { firstRule(packs)[field] = {}; });
    hasError(result, `forbidden duplicated field: ${field}`);
  }
});

test('status and verification cannot contradict each other', () => {
  const result = fixture((_index, packs) => {
    const rule = firstRule(packs);
    rule.status = 'covered';
    rule.verification = 'runtime-only';
  });
  hasError(result, 'conflicts with verification');
});

test('covered, advisory, and blocked claims require matching mechanism kinds', () => {
  hasError(fixture((_index, packs) => {
    const rule = firstRule(packs);
    rule.status = 'covered';
    rule.verification = 'automatic';
    rule.mechanisms = ['M-RUNTIME'];
  }), 'falsely claims covered');
  hasError(fixture((_index, packs) => {
    const rule = findRule(packs, 'G-ADVISORY-001');
    rule.mechanisms = ['M-MANUAL'];
  }), 'ADVISORY without advisory mechanism');
});

test('unknown and orphan mechanisms are detected bidirectionally', () => {
  hasError(fixture((_index, packs) => firstRule(packs).mechanisms.push('M-NOT-REGISTERED')), 'unknown mechanism');
  hasError(fixture((index) => index.mechanisms.push({ id: 'M-ORPHAN', kind: 'validator', path: 'orphan.mjs', testFiles: ['orphan.test.mjs'] })), 'Orphan coverage mechanism');
  hasError(fixture((index) => { index.mechanisms[0].testFiles = []; }), 'has no executable test files');
});

test('missing, mismatched, and oversized packs fail closed', () => {
  hasError(fixture((index, packs) => packs.delete(index.packs[0].file)), 'guide pack');
  hasError(fixture((index, packs) => { packs.get(index.packs[0].file).id = 'wrong'; }), 'mismatched pack');
  hasError(fixture((index, packs) => {
    const pack = packs.get(index.packs[0].file);
    pack.agentPrompt += 'x'.repeat(40000);
  }), 'focused-load limit');
});
