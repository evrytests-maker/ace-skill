import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasOnlyOneWord,
  matchPlainKey,
  matchSingleKey,
  validateRegexKey,
} from '../../scripts/lib/st-matching.mjs';
import { simulateWorldInfo } from '../../scripts/lib/world-info-simulator.mjs';

// Unicode escapes keep this file free of literal Cyrillic while still
// exercising the release-code \W boundary behavior.
const FOREST = '\u043b\u0435\u0441';
const FOREST_DIMINUTIVE = '\u043b\u0435\u0441\u043e\u043a';
const FLOOR = '\u043f\u043e\u043b';
const FIELD = '\u043f\u043e\u043b\u0435';

test('single-word plaintext keys use ASCII \\W boundaries like release code', () => {
  assert.equal(matchPlainKey(FOREST, FOREST_DIMINUTIVE, { wholeWords: true }), true);
  assert.equal(matchPlainKey(FLOOR, FIELD, { wholeWords: true }), true);
  assert.equal(matchPlainKey(FOREST, ` ${FOREST_DIMINUTIVE} `, { wholeWords: true }), true);
  // An ASCII word character before the key still blocks the boundary.
  assert.equal(matchPlainKey(FOREST, `x${FOREST_DIMINUTIVE}`, { wholeWords: true }), false);
  assert.equal(matchPlainKey('cat', 'concatenate', { wholeWords: true }), false);
  assert.equal(matchPlainKey('cat', 'a cat here', { wholeWords: true }), true);
});

test('only whitespace separates a multi-word plaintext key', () => {
  assert.equal(hasOnlyOneWord('a,b'), true);
  assert.equal(hasOnlyOneWord('two words'), false);
  assert.equal(matchPlainKey('a,b', 'xa,by', { wholeWords: true }), false);
  assert.equal(matchPlainKey('a,b', 'a,b', { wholeWords: true }), true);
  assert.equal(matchPlainKey('two words', 'two words here', { wholeWords: true }), true);
  assert.equal(matchPlainKey('two words', 'two  words', { wholeWords: true }), false);
});

test('empty and internally delimited slash keys stay plaintext', () => {
  assert.deepEqual(validateRegexKey('//'), { isRegex: false, ok: true, message: 'plaintext key' });
  assert.equal(matchSingleKey('//', 'anything'), false);
  assert.equal(matchSingleKey('//', 'a // b'), true);
  assert.deepEqual(validateRegexKey('/a/b/g'), { isRegex: false, ok: true, message: 'plaintext key' });
  assert.equal(matchSingleKey('/a/b/g', 'a/b'), false);
});

test('the simulator treats empty slash keys as plaintext, not catch-all regexes', () => {
  const absent = simulateWorldInfo({
    history: ['anything at all'],
    lorebook: { entries: [{ uid: 1, key: ['//'], content: 'This entry must not activate.' }] },
  });
  assert.deepEqual(absent.includedEntryIds, []);
  const literal = simulateWorldInfo({
    history: ['a // b'],
    lorebook: { entries: [{ uid: 1, key: ['//'], content: 'This entry should activate.' }] },
  });
  assert.deepEqual(literal.includedEntryIds, ['1']);
});
