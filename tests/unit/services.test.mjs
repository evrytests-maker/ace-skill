import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditSecondaryArtifact,
  auditTokenBudget,
  checkLorebookActivation,
  testKey,
  validateCard,
  validateLorebook,
  verifyOfficialTruthTable,
} from '../../scripts/services/index.mjs';
import { readJson } from '../helpers/repo-fixture.mjs';

function assertStructured(result, expectedStatus = null) {
  assert.equal(typeof result.service, 'string');
  assert.equal(typeof result.operation, 'string');
  assert.ok(['PASS', 'FAIL', 'BLOCKED'].includes(result.status));
  assert.equal(typeof result.ok, 'boolean');
  assert.ok([0, 1, 3].includes(result.exitCode));
  for (const field of ['errors', 'warnings', 'blockers', 'evidence']) assert.ok(Array.isArray(result[field]), `${field} is not an array`);
  assert.equal(typeof result.data, 'object');
  if (expectedStatus) assert.equal(result.status, expectedStatus, JSON.stringify(result, null, 2));
}

test('card service recognizes valid and invalid V1/V2/V3 fixtures', () => {
  for (const version of ['v1', 'v2', 'v3']) {
    const valid = validateCard(readJson(`tests/fixtures/characters/${version}-valid.json`));
    assertStructured(valid, 'PASS');
    assert.equal(valid.data.version, Number(version.slice(1)));
    const invalid = validateCard(readJson(`tests/fixtures/characters/${version}-invalid.json`));
    assertStructured(invalid, 'FAIL');
    assert.ok(invalid.errors.some((issue) => issue.ruleId === 'ACE-CARD-001'));
  }
});

test('lorebook service handles native object and embedded array containers', () => {
  const native = validateLorebook(readJson('tests/fixtures/lorebooks/native-valid.json'));
  assertStructured(native, 'PASS');
  assert.equal(native.data.format, 'world-info-object');
  const embedded = validateLorebook(readJson('tests/fixtures/lorebooks/embedded-valid.json'));
  assertStructured(embedded, 'PASS');
  assert.equal(embedded.data.format, 'embedded-character-book-array');
  const invalid = validateLorebook(readJson('tests/fixtures/lorebooks/invalid.json'));
  assertStructured(invalid, 'FAIL');
  assert.ok(invalid.errors.some((issue) => issue.code === 'LORE_SELECTIVE_LOGIC'));
});

test('key service requires and executes every positive and negative case', () => {
  const result = testKey({
    key: '/архив|archive/iu',
    shouldMatch: ['archive door', 'АРХИВ закрыт'],
    shouldNotMatch: ['library door', 'archival record'],
  });
  assertStructured(result, 'PASS');
  assert.equal(result.data.cases.length, 4);
  assert.ok(result.data.cases.every((item) => item.pass));
  const alias = testKey({ key: '/Mira/iu', shouldMatch: ['Mira arrived'], not: ['Nix arrived'] });
  assertStructured(alias, 'PASS');
  assert.equal(alias.evidence.find((item) => item.kind === 'key-cases').notAliasAccepted, true);
  const negativeHit = testKey({ key: '/archive/iu', shouldMatch: ['archive'], shouldNotMatch: ['archive'] });
  assertStructured(negativeHit, 'FAIL');
  assert.ok(negativeHit.errors.some((issue) => issue.code === 'KEY_NEGATIVE_HIT'));
});

test('official secondary truth table and artifact audit fail closed', () => {
  const table = verifyOfficialTruthTable();
  assertStructured(table, 'PASS');
  assert.equal(table.data.cases.length, 21);
  assert.ok(table.data.cases.every((item) => item.pass));
  const invalid = auditSecondaryArtifact(readJson('tests/fixtures/lorebooks/invalid.json'));
  assertStructured(invalid, 'FAIL');
  assert.ok(invalid.errors.some((issue) => issue.code === 'SECONDARY_UNKNOWN_LOGIC'));
});

test('activation service reports actual per-entry decisions', () => {
  const artifact = readJson('tests/fixtures/lorebooks/native-valid.json');
  const hit = checkLorebookActivation(artifact, { text: 'Mira entered the sealed archive door.' });
  assertStructured(hit, 'PASS');
  assert.equal(hit.data.entries.length, 1);
  assert.equal(hit.data.entries[0].active, true);
  const miss = checkLorebookActivation(artifact, { text: 'The library was empty.' });
  assertStructured(miss, 'PASS');
  assert.equal(miss.data.entries[0].active, false);
});

test('token service enumerates object entries and discloses estimated method', async () => {
  const result = await auditTokenBudget(readJson('tests/fixtures/lorebooks/native-valid.json'), { model: 'generic', forceEstimate: true });
  assertStructured(result, 'PASS');
  assert.equal(result.data.methodKind, 'estimate');
  assert.equal(result.data.exact, false);
  assert.ok(result.data.rows.some((row) => row.field === 'entries[0].content'));
  assert.ok(result.data.rows.every((row) => row.method.kind === 'estimate'));
});
