import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffPaths,
  parseLorebook,
  serializeLorebook,
  verifyLorebookRoundTrip,
} from '../../scripts/lib/lorebook-io.mjs';

const advancedEntry = {
  uid: 41,
  key: ['/ведьм(?:а|ы|е)/iu'],
  keysecondary: ['печать'],
  selective: true,
  selectiveLogic: 0,
  content: 'Самодостаточное описание ведьминой печати.',
  position: 'at_depth',
  depth: 3,
  role: 'system',
  order: 17,
  outlet: 'memory',
  automation_id: 'seal-opened',
  extensions: { custom_vendor_field: { nested: true }, probability: 73 },
  scope: { kind: 'character', attachmentId: 'char-1' },
};

test('standalone array round-trip preserves regex, extensions, ids, order and advanced fields', () => {
  const source = { name: 'Book', entries: [advancedEntry], extra: { preserved: true } };
  const canonical = parseLorebook(source);
  assert.equal(canonical.containerShape, 'array');
  assert.equal(canonical.entries[0].advanced.automationId, 'seal-opened');
  const output = JSON.parse(serializeLorebook(canonical));
  assert.deepEqual(output, source);
  assert.deepEqual(verifyLorebookRoundTrip(source).differences, []);
});

test('standalone object and embedded containers preserve source keys and container shape', () => {
  for (const source of [
    { entries: { alpha: advancedEntry } },
    { data: { name: 'Card', character_book: { entries: { alpha: advancedEntry }, scan_depth: 4 } } },
    { character_book: { entries: [advancedEntry], token_budget: 512 } },
  ]) {
    const canonical = parseLorebook(source);
    assert.deepEqual(JSON.parse(serializeLorebook(canonical)), source);
    assert.equal(verifyLorebookRoundTrip(source).status, 'PASS');
  }
});

test('explicit conversion changes only the requested container representation', () => {
  const canonical = parseLorebook({ name: 'Preserved', settings: { budget: 256 }, entries: { alpha: advancedEntry } });
  const converted = JSON.parse(serializeLorebook(canonical, { format: 'embedded-array' }));
  assert.deepEqual(converted.data.character_book.entries, [advancedEntry]);
  assert.equal(converted.name, 'Preserved');
  assert.deepEqual(converted.settings, { budget: 256 });
  assert.equal('entries' in converted, false);
});

test('path diff reports lost, added and changed values precisely', () => {
  const diff = diffPaths({ a: 1, b: { c: 2 }, d: [1] }, { a: 3, b: {}, d: [1, 2] });
  assert.deepEqual(diff.map(({ path, kind }) => [path, kind]), [
    ['$.a', 'changed'],
    ['$.b.c', 'lost'],
    ['$.d[1]', 'added'],
  ]);
});

test('unsupported roots fail closed instead of inventing an entries container', () => {
  assert.throws(() => parseLorebook([]), /root must be an object/u);
  assert.throws(() => parseLorebook({ data: {} }), /No supported lorebook/u);
});
