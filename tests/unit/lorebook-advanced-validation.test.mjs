import assert from 'node:assert/strict';
import test from 'node:test';

import { checkLorebookActivation, validateLorebook } from '../../scripts/services/lorebook.mjs';

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

test('native numeric role and per-entry matching options are accepted', () => {
  const result = validateLorebook({ entries: [entry({
    position: 'at_depth', depth: 2, role: 0, caseSensitive: true, matchWholeWords: false,
  })] });
  assert.equal(result.status, 'PASS', JSON.stringify(result.errors));
  for (const role of [1, 2]) {
    const numeric = validateLorebook({ entries: [entry({ position: 'at_depth', depth: 2, role })] });
    assert.equal(numeric.status, 'PASS', JSON.stringify(numeric.errors));
  }
  const invalid = validateLorebook({ entries: [entry({ role: 3 })] });
  assert.equal(invalid.status, 'FAIL');
  assert.ok(invalid.errors.some((issue) => issue.code === 'LORE_ROLE'));
});

test('outlet position requires a non-empty, unpadded outletName', () => {
  const missing = validateLorebook({ entries: [entry({ position: 'outlet' })] });
  assert.equal(missing.status, 'FAIL');
  assert.ok(missing.errors.some((issue) => issue.code === 'LORE_OUTLET_NAME_REQUIRED'));
  const padded = validateLorebook({ entries: [entry({ position: 'outlet', outletName: ' Memory ' })] });
  assert.equal(padded.status, 'FAIL');
  assert.ok(padded.errors.some((issue) => issue.code === 'LORE_OUTLET_NAME_PADDING'));
  const valid = validateLorebook({ entries: [entry({ position: 'outlet', outletName: 'Memory' })] });
  assert.equal(valid.status, 'PASS', JSON.stringify(valid.errors));
});

test('activation honors entry-level case and whole-word overrides', () => {
  const artifact = { entries: [entry({
    key: ['Mira'], content: 'Mira checks the archive lock.', caseSensitive: true, matchWholeWords: false,
  })] };
  assert.equal(checkLorebookActivation(artifact, { text: 'mira' }).data.entries[0].active, false);
  assert.equal(checkLorebookActivation(artifact, { text: 'Miramar' }).data.entries[0].active, true);
  assert.equal(checkLorebookActivation(artifact, { text: 'Mira' }).data.entries[0].active, true);
});
