import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateSecondaryKeys, normalizeSelectiveLogic, SELECTIVE_LOGIC } from '../../scripts/lib/st-matching.mjs';

const expected = {
  [SELECTIVE_LOGIC.AND_ANY]: ([a, b]) => a || b,
  [SELECTIVE_LOGIC.NOT_ALL]: ([a, b]) => !(a && b),
  [SELECTIVE_LOGIC.NOT_ANY]: ([a, b]) => !(a || b),
  [SELECTIVE_LOGIC.AND_ALL]: ([a, b]) => a && b,
};

test('official selectiveLogic map is exact', () => {
  assert.deepEqual(SELECTIVE_LOGIC, { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 });
  assert.equal(normalizeSelectiveLogic('AND ANY'), 0);
  assert.equal(normalizeSelectiveLogic('NOT ALL'), 1);
  assert.equal(normalizeSelectiveLogic('NOT ANY'), 2);
  assert.equal(normalizeSelectiveLogic('AND ALL'), 3);
});

test('guide UI labels preserve their documented behavior instead of literal translation', () => {
  assert.equal(normalizeSelectiveLogic('И ЛЮБОЙ'), 0);
  assert.equal(normalizeSelectiveLogic('НЕ ЛЮБОЙ'), 1);
  assert.equal(normalizeSelectiveLogic('НЕ ВСЕ'), 2);
  assert.equal(normalizeSelectiveLogic('И ВСЕ'), 3);
});

test('all four selective modes satisfy their complete two-key truth table', () => {
  const rows = [[false, false], [false, true], [true, false], [true, true]];
  for (const [logic, predicate] of Object.entries(expected)) {
    for (const row of rows) {
      assert.equal(evaluateSecondaryKeys(true, row, Number(logic)).ok, predicate(row), `logic=${logic}, row=${row}`);
      assert.equal(evaluateSecondaryKeys(false, row, Number(logic)).ok, false, `primary gate must fail for logic=${logic}`);
    }
  }
});

test('unknown selectiveLogic fails closed', () => {
  const result = evaluateSecondaryKeys(true, [true, false], 9);
  assert.equal(result.logic, null);
  assert.equal(result.ok, false);
  assert.match(result.reason, /unknown/i);
});
