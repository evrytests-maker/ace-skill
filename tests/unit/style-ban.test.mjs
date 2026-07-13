import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectStyleSegments,
  findForbiddenContrast,
  validateStyle,
} from '../../scripts/services/style.mjs';

test('forbids English replacement-by-negation templates', () => {
  const samples = [
    ['She is not a guard, she is a jailer.', 'EN-REPEATED-SUBJECT'],
    ['The archive is not merely old, but alive.', 'EN-NOT-BUT'],
    ['The archive is not old but alive.', 'EN-NOT-BUT'],
    ["He isn't frightened. He is calculating.", 'EN-REPEATED-SUBJECT'],
    ["She isn't a guard but a jailer.", 'EN-NOT-BUT'],
    ["She's no guard. She's a jailer.", 'EN-REPEATED-SUBJECT'],
    ['Mira is no guard; Mira is a jailer.', 'EN-NAMED-SUBJECT'],
  ];
  for (const [sample, expected] of samples) {
    assert.ok(findForbiddenContrast(sample).some((match) => match.patternId === expected), sample);
  }
});

test('forbids Russian replacement-by-negation templates without translating them', () => {
  const samples = [
    ['Она не охранница, она тюремщица.', 'RU-REPEATED-SUBJECT'],
    ['Архив не просто старый, а живой.', 'RU-NE-A-NO'],
    ['Архив не старый а древний.', 'RU-NE-A-NO'],
    ['Это не предупреждение — это призыв.', 'RU-REPEATED-SUBJECT'], ['Она была не охранницей, она была тюремщицей.', 'RU-REPEATED-SUBJECT'], ['Мира не охранница, Мира тюремщица.', 'RU-NAMED-SUBJECT'], ['Она не охранница, зато тюремщица.', 'RU-NE-A-NO'],
  ];
  for (const [sample, expected] of samples) {
    assert.ok(findForbiddenContrast(sample).some((match) => match.patternId === expected), sample);
  }
});

test('allows ordinary standalone negation and direct positive prose', () => {
  const allowed = [
    'She does not open the sealed door.',
    'The archive is silent. Mira checks the lock.',
    'Rather than wait, Mira leaves.',
    'She does not open the door, but the lock remains intact.',
    'Она не открывает запечатанную дверь.',
    'Архив молчит. Мира проверяет замок.',
  ];
  for (const sample of allowed) assert.deepEqual(findForbiddenContrast(sample), [], sample);
});

test('scans only authored card and lorebook prose fields', () => {
  const artifact = {
    spec: 'chara_card_v2',
    data: {
      name: 'Not A, but B',
      description: 'She is not a guide, she is the trap.',
      alternate_greetings: ['Mira waits beside the archive door.'],
      character_book: { entries: [{ id: 7, content: 'The bell is not merely a signal, but a summons.' }] },
    },
  };
  const fields = collectStyleSegments(artifact).map((item) => item.field);
  assert.ok(!fields.includes('data.name'));
  assert.ok(fields.includes('data.description'));
  assert.ok(fields.includes('data.character_book.entries[7].content'));
  const result = validateStyle(artifact);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((error) => error.ruleId === 'ACE-STYLE-001'));
});

test('passes prose without the banned construction and rejects inputs with no prose', () => {
  assert.equal(validateStyle({ description: 'Mira checks the lock and records the result.' }).status, 'PASS');
  const empty = validateStyle({ name: 'Mira' });
  assert.equal(empty.status, 'FAIL');
  assert.equal(empty.errors[0].code, 'STYLE_NO_PROSE');
});
