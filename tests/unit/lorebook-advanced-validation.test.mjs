import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLorebook } from '../../scripts/services/lorebook.mjs';

function entry(overrides = {}) {
  return {
    uid: 1,
    key: ['archive'],
    content: 'A self-contained archive description for validation.',
    ...overrides,
  };
}

test('advanced fields accept supported placement, timing and automation values', () => {
  const result = validateLorebook({ entries: [entry({
    position: 'at_depth', depth: 4, role: 'system', order: 20, outlet: 'memory',
    automation_id: 'archive-open', sticky: 2, cooldown: 3, delay: 1,
    useProbability: true, probability: 100, ignoreBudget: false,
  })] });
  assert.equal(result.status, 'PASS', JSON.stringify(result.errors));
});

test('advanced field errors include entry identity and exact field path', () => {
  const result = validateLorebook({ entries: [entry({
    role: 'developer', outlet: '', automationId: '', sticky: -1, cooldown: 1.5,
    enabled: true, disable: true,
  })] });
  assert.equal(result.status, 'FAIL');
  for (const field of ['role', 'outlet', 'automationId', 'sticky', 'cooldown', 'enabled/disable']) {
    assert.ok(result.errors.some((issue) => issue.entryId === 1 && issue.field === field), field);
  }
});

test('known-field typo produces a correction without rejecting vendor extensions', () => {
  const result = validateLorebook({ entries: [entry({ probablity: 80, vendorOpaque: true })] });
  const typo = result.warnings.find((issue) => issue.code === 'LORE_FIELD_TYPO');
  assert.equal(typo?.field, 'probablity');
  assert.equal(typo?.details?.suggestion, 'probability');
  assert.ok(!result.warnings.some((issue) => issue.field === 'vendorOpaque'));
});

test('conflicting aliases fail closed while identical aliases are only advisory', () => {
  const conflict = validateLorebook({ entries: [entry({ key: ['archive'], keys: ['vault'], order: 2, insertion_order: 3 })] });
  assert.equal(conflict.status, 'FAIL');
  assert.ok(conflict.errors.some((issue) => issue.code === 'LORE_KEY_ALIAS_CONFLICT'));
  assert.ok(conflict.errors.some((issue) => issue.code === 'LORE_ADVANCED_ALIAS_CONFLICT'));

  const duplicate = validateLorebook({ entries: [entry({ key: ['archive'], keys: ['archive'] })] });
  assert.equal(duplicate.status, 'PASS');
  assert.ok(duplicate.warnings.some((issue) => issue.code === 'LORE_DUPLICATE_KEY_ALIAS'));
});
