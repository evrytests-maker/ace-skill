import { Report } from '../lib/report.mjs';
import {
  evaluateKeyAndSecondary,
  evaluateSecondaryKeys,
  getSelectiveLogicName,
  normalizeSelectiveLogic,
  SELECTIVE_LOGIC,
} from '../lib/st-matching.mjs';
import {
  getEntryKeys,
  getEntrySecondaryKeys,
  getEntrySelectiveLogic,
  getLorebookEntryRecords,
  hasDeclaredSelectiveLogic,
} from './lorebook.mjs';

const SECONDARY_VECTORS = Object.freeze([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
]);

function expectedFor(logic, vector) {
  const any = vector.some(Boolean);
  const all = vector.every(Boolean);
  if (logic === SELECTIVE_LOGIC.AND_ANY) return any;
  if (logic === SELECTIVE_LOGIC.NOT_ALL) return !all;
  if (logic === SELECTIVE_LOGIC.NOT_ANY) return !any;
  if (logic === SELECTIVE_LOGIC.AND_ALL) return all;
  return false;
}

export function verifyOfficialTruthTable() {
  const report = new Report('selectiveLogic Truth Table', { service: 'secondary', operation: 'truth-table' });
  const cases = [];
  for (const logic of Object.values(SELECTIVE_LOGIC)) {
    for (const vector of SECONDARY_VECTORS) {
      const evaluated = evaluateSecondaryKeys(true, vector, logic);
      const expected = expectedFor(logic, vector);
      const pass = evaluated.valid === true && evaluated.ok === expected;
      const record = {
        primaryMatched: true,
        secondaryMatches: vector,
        selectiveLogic: logic,
        selectiveLogicName: getSelectiveLogicName(logic),
        expected,
        actual: evaluated.ok,
        pass,
      };
      cases.push(record);
      if (!pass) {
        report.error(`Truth-table mismatch for ${getSelectiveLogicName(logic)} and ${JSON.stringify(vector)}`, {
          code: 'SECONDARY_TRUTH_TABLE', ruleId: 'ACE-LORE-002', details: record,
        });
      }
    }
    const noPrimary = evaluateSecondaryKeys(false, [true, true], logic);
    const primaryRecord = {
      primaryMatched: false,
      secondaryMatches: [true, true],
      selectiveLogic: logic,
      selectiveLogicName: getSelectiveLogicName(logic),
      expected: false,
      actual: noPrimary.ok,
      pass: noPrimary.valid === true && noPrimary.ok === false,
    };
    cases.push(primaryRecord);
    if (!primaryRecord.pass) {
      report.error(`Primary-key guard failed for ${getSelectiveLogicName(logic)}`, {
        code: 'SECONDARY_PRIMARY_GUARD', ruleId: 'ACE-LORE-002', details: primaryRecord,
      });
    }
  }

  const unknown = evaluateSecondaryKeys(true, [true, false], 99);
  const unknownRejected = unknown.valid === false && unknown.ok === false && Boolean(unknown.error);
  cases.push({ selectiveLogic: 99, expected: 'rejected', actual: unknown, pass: unknownRejected });
  if (!unknownRejected) {
    report.error('Unknown selectiveLogic did not fail closed', {
      code: 'SECONDARY_UNKNOWN_ACCEPTED', ruleId: 'ACE-LORE-002', details: unknown,
    });
  }

  report.setData({ cases, mapping: { ...SELECTIVE_LOGIC } });
  report.addEvidence({
    kind: 'selective-logic-truth-table',
    totalCases: cases.length,
    passedCases: cases.filter((item) => item.pass).length,
    unknownRejected,
  });
  return report.toJSON();
}

export function evaluateSecondaryEntry(entry, text, {
  forceSecondary = false, caseSensitive = false, wholeWords = true, macros = {},
} = {}) {
  const logicValue = getEntrySelectiveLogic(entry);
  const logic = normalizeSelectiveLogic(logicValue);
  if (logic === null) {
    return {
      valid: false,
      active: false,
      error: `unknown selectiveLogic '${logicValue}'`,
      selectiveLogic: null,
      selectiveLogicName: getSelectiveLogicName(logicValue),
    };
  }
  return evaluateKeyAndSecondary({
    primaryKeys: getEntryKeys(entry),
    secondaryKeys: getEntrySecondaryKeys(entry),
    text,
    selective: entry?.selective === true,
    selectiveLogic: logic,
    constant: entry?.constant === true,
    forceSecondary,
    opts: { caseSensitive, wholeWords, macros },
  });
}

export function runSecondaryCases(cases = []) {
  const report = new Report('Secondary-key Cases', { service: 'secondary', operation: 'cases' });
  const results = [];
  if (!Array.isArray(cases) || !cases.length) {
    report.error('At least one secondary-key case is required', {
      code: 'SECONDARY_CASES_REQUIRED', ruleId: 'ACE-LORE-002', field: 'cases',
    });
    return report.toJSON({ data: { cases: [] } });
  }

  cases.forEach((testCase, index) => {
    if (typeof testCase?.expected !== 'boolean') {
      report.error(`Secondary case ${index} requires a boolean expected value`, {
        code: 'SECONDARY_EXPECTED_BOOLEAN', ruleId: 'ACE-LORE-002', field: `cases[${index}].expected`,
      });
      results.push({ index, expected: testCase?.expected, actual: null, pass: false, evaluation: null });
      return;
    }
    const logic = normalizeSelectiveLogic(testCase.selectiveLogic ?? testCase.logic ?? 0);
    let evaluation;
    if (logic === null) {
      evaluation = { valid: false, active: false, error: `unknown selectiveLogic '${testCase.selectiveLogic ?? testCase.logic}'` };
    } else if (Array.isArray(testCase.secondaryMatches)) {
      const result = evaluateSecondaryKeys(testCase.primaryMatched !== false, testCase.secondaryMatches, logic);
      evaluation = { ...result, active: result.ok };
    } else {
      evaluation = evaluateKeyAndSecondary({
        primaryKeys: testCase.primaryKeys ?? [],
        secondaryKeys: testCase.secondaryKeys ?? [],
        text: testCase.text ?? '',
        selective: testCase.selective !== false,
        selectiveLogic: logic,
        forceSecondary: testCase.forceSecondary === true,
        opts: testCase.matchOptions ?? {},
      });
    }
    const expected = testCase.expected === true;
    const pass = evaluation.valid !== false && evaluation.active === expected;
    const record = { index, expected, actual: evaluation.active, pass, evaluation };
    results.push(record);
    if (!pass) {
      report.error(`Secondary case ${index} failed`, {
        code: 'SECONDARY_CASE_FAILED', ruleId: 'ACE-LORE-002', field: `cases[${index}]`, details: record,
      });
    }
  });

  report.setData({ cases: results });
  report.addEvidence({
    kind: 'secondary-cases', total: results.length,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass).length,
  });
  return report.toJSON();
}

export function auditSecondaryArtifact(artifact) {
  const report = new Report('Secondary-key Artifact Audit', { service: 'secondary', operation: 'audit' });
  const container = getLorebookEntryRecords(artifact);
  if (!container) {
    report.error('No supported lorebook entries container found', {
      code: 'SECONDARY_ENTRIES_CONTAINER', ruleId: 'ACE-LORE-001', field: 'entries',
    });
    return report.toJSON({ data: { entries: [], truthTable: null } });
  }

  const entries = [];
  for (const { entry, fallbackId, sourceKey } of container.records) {
    const secondaryKeys = getEntrySecondaryKeys(entry);
    if (!secondaryKeys.length && !hasDeclaredSelectiveLogic(entry)) continue;
    const value = getEntrySelectiveLogic(entry);
    const logic = normalizeSelectiveLogic(value);
    const id = entry?.uid ?? entry?.id ?? fallbackId;
    const record = {
      id, sourceKey, secondaryKeyCount: secondaryKeys.length,
      selective: entry?.selective === true,
      selectiveLogic: logic,
      selectiveLogicName: getSelectiveLogicName(value),
      valid: logic !== null,
    };
    entries.push(record);
    if (logic === null) {
      report.error(`Entry ${id} declares unknown selectiveLogic '${value}'`, {
        code: 'SECONDARY_UNKNOWN_LOGIC', ruleId: 'ACE-LORE-002', entryId: id, field: 'selectiveLogic',
      });
    }
    // This audit explains actual SillyTavern behavior. The lorebook service is
    // the policy gate that rejects ignored secondary keys in ACE-authored output.
    if (secondaryKeys.length && entry?.selective !== true) {
      report.warn('Secondary keys are ignored because selective is not true', {
        code: 'SECONDARY_IGNORED', ruleId: 'ACE-LORE-003', entryId: id, field: 'selective',
      });
    }
  }

  const truthTable = verifyOfficialTruthTable();
  for (const issue of truthTable.errors) report.error(issue.message, issue);
  for (const evidence of truthTable.evidence) report.addEvidence(evidence);
  report.setData({
    containerPath: container.containerPath,
    format: container.format,
    entries,
    truthTable: truthTable.data,
  });
  report.addEvidence({ kind: 'secondary-artifact', auditedEntries: entries.length });
  return report.toJSON();
}

export const SECONDARY_SERVICE = Object.freeze({
  name: 'secondary',
  verifyTruthTable: verifyOfficialTruthTable,
  evaluateEntry: evaluateSecondaryEntry,
  runCases: runSecondaryCases,
  audit: auditSecondaryArtifact,
});
