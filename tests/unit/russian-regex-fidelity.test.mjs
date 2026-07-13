import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  buildRegexFromKey,
  evaluateSecondaryKeys,
  matchSingleKey,
  normalizeSelectiveLogic,
  parseRegexLiteral,
  validateRegexKey,
} from '../../scripts/lib/st-matching.mjs';
import { testKey } from '../../scripts/services/key.mjs';
import { readJson, sha256 as sha256File } from '../helpers/repo-fixture.mjs';

const fixture = readJson('tests/fixtures/regex/russian-guide-literals.json');
const sources = readJson('rules/sources.json');

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertExactLiteral(contract) {
  assert.equal(sha256Text(contract.literal), contract.sha256);
  const parsed = parseRegexLiteral(contract.literal);
  assert.ok(parsed);
  assert.equal(parsed.raw, contract.literal);
  assert.equal(parsed.pattern, contract.pattern);
  assert.equal(parsed.flags, contract.flags);
  assert.equal(buildRegexFromKey(contract.literal).source, contract.pattern);
  assert.equal(buildRegexFromKey(contract.literal).flags, contract.flags);
  assert.deepEqual(validateRegexKey(contract.literal), {
    isRegex: true,
    ok: true,
    message: contract.literal,
  });
}

function assertCases(contract) {
  for (const literal of contract.shouldMatch) {
    assert.equal(matchSingleKey(contract.literal, literal), true, JSON.stringify({ expected: true, literal }));
  }
  for (const literal of contract.shouldNotMatch) {
    assert.equal(matchSingleKey(contract.literal, literal), false, JSON.stringify({ expected: false, literal }));
  }
}

function normalizeMarkdownWrappedLiteral(contract) {
  return contract.markdownLines.join('').replace(/,$/u, '');
}

test('forest regex remains byte-exact to the guide literal', () => {
  assertExactLiteral(fixture.forest);
  assert.equal(
    fixture.forest.pattern,
    '(?<![а-яёА-ЯЁ])[Лл]ес(?:ами|ом|ов|ам|ах|а|у|е)?(?![а-яёА-ЯЁ])',
  );
});

test('regex fixture is pinned to the bundled self-contained rule export', () => {
  const source = sources.sources.find((candidate) => candidate.id === fixture.sourceBundleId);
  assert.ok(source);
  assert.equal(source.type, 'bundled-rule-export');
  assert.equal(source.url, `local:${fixture.sourceBundle}`);
  assert.equal(source.sha256, sha256File(fixture.sourceBundle));
  assert.match(fixture.sourceStatus, /no external archive is required/u);
});

test('forest regex preserves every listed inflection and rejects close compounds', () => {
  assertCases(fixture.forest);
  const result = testKey({
    key: fixture.forest.literal,
    shouldMatch: fixture.forest.shouldMatch,
    shouldNotMatch: fixture.forest.shouldNotMatch,
  });
  assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.data.cases.length, fixture.forest.shouldMatch.length + fixture.forest.shouldNotMatch.length);
  assert.ok(result.data.cases.every((entry) => entry.pass));
});

test('flower-field regex preserves escaping, groups, quantifiers, alternation order, and flags', () => {
  assertExactLiteral(fixture.flowerField);
  assert.equal(
    fixture.flowerField.pattern,
    '(?:^|[^а-яёА-ЯЁ])(цветочн(?:ого|ому|ым|ом|ое|ые|ых|ым|ыми)?\\s+пол(?:я|ю|ем|е|ей|ям|ями |ях)?)(?![а-яёА-ЯЁ])',
  );
  assertCases(fixture.flowerField);
});

test('flower-field sample records JavaScript runtime truth instead of the inaccurate guide comment', () => {
  const matches = fixture.flowerField.sampleText.match(buildRegexFromKey(fixture.flowerField.literal));
  assert.deepEqual(matches, fixture.flowerField.actualJavaScriptMatches);
  assert.notDeepEqual(matches, fixture.flowerField.guideCommentMatches);
});

test('all six wrapped guide regex examples normalize without changing any regex token', () => {
  assert.equal(fixture.wrappedKeyExamples.cases.length, 6);
  for (const contract of fixture.wrappedKeyExamples.cases) {
    assert.match(contract.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.equal(normalizeMarkdownWrappedLiteral(contract), contract.literal, contract.id);
    assert.equal(sha256Text(contract.literal), contract.sha256, contract.id);
    const parsed = parseRegexLiteral(contract.literal);
    assert.ok(parsed, contract.id);
    assert.equal(parsed.raw, contract.literal, contract.id);
    assert.equal(parsed.flags, contract.flags, contract.id);
    assert.equal(buildRegexFromKey(contract.literal).source, parsed.pattern, contract.id);
    assert.deepEqual(validateRegexKey(contract.literal), {
      isRegex: true,
      ok: true,
      message: contract.literal,
    }, contract.id);
    assertCases(contract);
  }
});

test('source-preserved specimens expose their known linguistic defects and are never canonical', () => {
  const specimens = [fixture.flowerField, ...fixture.wrappedKeyExamples.cases];
  for (const contract of specimens) {
    assert.equal(contract.recommended, false);
    assert.ok(contract.knownFalsePositives?.length, JSON.stringify(contract));
    for (const literal of contract.knownFalsePositives) {
      assert.equal(matchSingleKey(contract.literal, literal), true, `${contract.id ?? 'flowerField'} must retain documented source false positive ${literal}`);
    }
    for (const literal of contract.knownFalseNegatives ?? []) {
      assert.equal(matchSingleKey(contract.literal, literal), false, `${contract.id ?? 'flowerField'} must retain documented source false negative ${literal}`);
    }
  }
});

test('corrected production contracts cover real Russian forms and reject source defects', () => {
  assert.equal(fixture.productionContracts.cases.length, 7);
  for (const contract of fixture.productionContracts.cases) {
    assert.equal(sha256Text(contract.literal), contract.sha256, contract.id);
    const parsed = parseRegexLiteral(contract.literal);
    assert.ok(parsed, contract.id);
    assert.ok(parsed.flags.includes('u'), `${contract.id} must use Unicode semantics`);
    assert.deepEqual(validateRegexKey(contract.literal), {
      isRegex: true,
      ok: true,
      message: contract.literal,
    }, contract.id);
    assertCases(contract);
    const result = testKey({
      key: contract.literal,
      shouldMatch: contract.shouldMatch,
      shouldNotMatch: contract.shouldNotMatch,
    });
    assert.equal(result.status, 'PASS', JSON.stringify({ id: contract.id, result }, null, 2));
  }
});

test('guide localized labels are pinned to behavior rather than literal translation', () => {
  const expected = [
    { label: 'И ЛЮБОЙ', numericValue: 0, englishMeaning: 'AND ANY' },
    { label: 'НЕ ЛЮБОЙ', numericValue: 1, englishMeaning: 'NOT ALL' },
    { label: 'НЕ ВСЕ', numericValue: 2, englishMeaning: 'NOT ANY' },
    { label: 'И ВСЕ', numericValue: 3, englishMeaning: 'AND ALL' },
  ];
  assert.deepEqual(fixture.selectiveLogicGuideLabels, expected);

  const truthCases = {
    0: { pass: [false, true], fail: [false, false] },
    1: { pass: [false, true], fail: [true, true] },
    2: { pass: [false, false], fail: [true, false] },
    3: { pass: [true, true], fail: [true, false] },
  };
  for (const contract of fixture.selectiveLogicGuideLabels) {
    assert.equal(normalizeSelectiveLogic(contract.label), contract.numericValue, contract.englishMeaning);
    assert.equal(evaluateSecondaryKeys(true, truthCases[contract.numericValue].pass, contract.numericValue).ok, true);
    assert.equal(evaluateSecondaryKeys(true, truthCases[contract.numericValue].fail, contract.numericValue).ok, false);
  }
});

test('guide boundary fragments preserve start and end anchors for Cyrillic words', () => {
  const contract = fixture.boundaryComposition;
  assert.equal(contract.leftBoundary, '(?:^|[^а-яА-ЯёЁ])');
  assert.equal(contract.rightBoundary, '(?:[^а-яА-ЯёЁ]|$)');
  assertCases(contract);
});
