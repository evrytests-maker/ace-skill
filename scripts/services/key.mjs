import { Report } from '../lib/report.mjs';
import {
  evaluateKeyAndSecondary,
  matchSingleKey,
  normalizeSelectiveLogic,
  validateRegexKey,
} from '../lib/st-matching.mjs';

function list(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeKeyRequest(request = {}) {
  return {
    key: String(request.key ?? ''),
    shouldMatch: list(request.shouldMatch ?? request.positives).map(String),
    // `not` is the service-level alias used by the CLI's --not option.
    shouldNotMatch: [
      ...list(request.shouldNotMatch ?? request.negatives),
      ...list(request.not),
    ].map(String),
    secondaryKeys: list(request.secondaryKeys ?? request.keysecondary).map(String),
    selectiveLogic: request.selectiveLogic ?? request.logic ?? 0,
    matchOptions: {
      caseSensitive: request.caseSensitive === true,
      wholeWords: request.wholeWords !== false,
      macros: request.macros ?? {},
    },
    allowSyntaxOnly: request.allowSyntaxOnly === true,
  };
}

export function validateKeySyntax(key, { macros = {} } = {}) {
  const report = new Report('Key Syntax Validation', { service: 'key', operation: 'syntax' });
  if (typeof key !== 'string' || !key.trim()) {
    report.error('Key must be a non-empty string', {
      code: 'KEY_REQUIRED', ruleId: 'ACE-KEY-001', field: 'key',
    });
    return report.toJSON({ data: { key } });
  }
  const syntax = validateRegexKey(key, macros);
  if (!syntax.ok) {
    report.error(`Invalid JavaScript regex: ${syntax.message}`, {
      code: 'KEY_REGEX_SYNTAX', ruleId: 'ACE-KEY-001', field: 'key',
    });
  }
  report.setData({ key, syntax });
  report.addEvidence({ kind: 'javascript-key-syntax', key, ...syntax });
  return report.toJSON();
}

export function testKey(request = {}) {
  const normalized = normalizeKeyRequest(request);
  const report = new Report('Key Case Test', { service: 'key', operation: 'test' });
  const syntax = validateRegexKey(normalized.key, normalized.matchOptions.macros);
  if (!normalized.key.trim()) {
    report.error('Key must be a non-empty string', {
      code: 'KEY_REQUIRED', ruleId: 'ACE-KEY-001', field: 'key',
    });
  } else if (!syntax.ok) {
    report.error(`Invalid JavaScript regex: ${syntax.message}`, {
      code: 'KEY_REGEX_SYNTAX', ruleId: 'ACE-KEY-001', field: 'key',
    });
  }

  normalized.secondaryKeys.forEach((key, index) => {
    const secondarySyntax = validateRegexKey(key, normalized.matchOptions.macros);
    if (!secondarySyntax.ok) {
      report.error(`Invalid secondary JavaScript regex: ${secondarySyntax.message}`, {
        code: 'KEY_SECONDARY_REGEX_SYNTAX', ruleId: 'ACE-KEY-001', field: `secondaryKeys[${index}]`,
      });
    }
  });

  const logic = normalizeSelectiveLogic(normalized.selectiveLogic);
  if (logic === null) {
    report.error(`Unknown selectiveLogic '${normalized.selectiveLogic}'; no fallback is allowed`, {
      code: 'KEY_SELECTIVE_LOGIC', ruleId: 'ACE-LORE-002', field: 'selectiveLogic',
    });
  }

  if (!normalized.allowSyntaxOnly) {
    if (!normalized.shouldMatch.length) {
      report.error('At least one --should-match case is required', {
        code: 'KEY_POSITIVE_REQUIRED', ruleId: 'ACE-KEY-001', field: 'shouldMatch',
      });
    }
    if (!normalized.shouldNotMatch.length) {
      report.error('At least one --should-not-match/--not case is required', {
        code: 'KEY_NEGATIVE_REQUIRED', ruleId: 'ACE-KEY-001', field: 'shouldNotMatch',
      });
    }
  }

  const cases = [];
  const evaluate = (text) => {
    if (logic === null) return { matched: false, details: { valid: false, error: 'unknown selectiveLogic' } };
    if (!normalized.secondaryKeys.length) {
      return { matched: matchSingleKey(normalized.key, text, normalized.matchOptions), details: null };
    }
    const details = evaluateKeyAndSecondary({
      primaryKeys: [normalized.key],
      secondaryKeys: normalized.secondaryKeys,
      text,
      selective: true,
      selectiveLogic: logic,
      opts: normalized.matchOptions,
    });
    return { matched: details.valid !== false && details.active, details };
  };

  if (syntax.ok) {
    normalized.shouldMatch.forEach((text, index) => {
      let outcome;
      try { outcome = evaluate(text); } catch (error) { outcome = { matched: false, details: { error: error.message } }; }
      const pass = outcome.matched === true;
      const result = { kind: 'should-match', index, text, expected: true, actual: outcome.matched, pass, details: outcome.details };
      cases.push(result);
      if (!pass) report.error(`Positive case ${index} did not match`, {
        code: 'KEY_POSITIVE_MISS', ruleId: 'ACE-KEY-001', field: `shouldMatch[${index}]`, details: result,
      });
    });
    normalized.shouldNotMatch.forEach((text, index) => {
      let outcome;
      try { outcome = evaluate(text); } catch (error) { outcome = { matched: false, details: { error: error.message } }; }
      const pass = outcome.matched === false;
      const result = { kind: 'should-not-match', index, text, expected: false, actual: outcome.matched, pass, details: outcome.details };
      cases.push(result);
      if (!pass) report.error(`Negative case ${index} unexpectedly matched`, {
        code: 'KEY_NEGATIVE_HIT', ruleId: 'ACE-KEY-001', field: `shouldNotMatch[${index}]`, details: result,
      });
    });
  }

  report.setData({
    key: normalized.key,
    syntax,
    selectiveLogic: logic,
    secondaryKeys: normalized.secondaryKeys,
    cases,
    matchOptions: normalized.matchOptions,
  });
  report.addEvidence({
    kind: 'key-cases',
    positiveCount: normalized.shouldMatch.length,
    negativeCount: normalized.shouldNotMatch.length,
    passed: cases.filter((item) => item.pass).length,
    failed: cases.filter((item) => !item.pass).length,
    notAliasAccepted: list(request.not).length > 0,
  });
  return report.toJSON();
}

export const KEY_SERVICE = Object.freeze({
  name: 'key',
  validateSyntax: validateKeySyntax,
  test: testKey,
  normalizeRequest: normalizeKeyRequest,
});
