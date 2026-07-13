import fs from 'node:fs';
import path from 'node:path';

const VALID_KINDS = new Set(['validator', 'simulator', 'manual-gate', 'runtime-adapter', 'advisory', 'serializer']);
const EXECUTABLE_KINDS = new Set(['validator', 'simulator', 'serializer']);
const VALID_STATUS = new Set(['covered', 'qualified', 'BLOCKED', 'ADVISORY', 'REJECTED']);
const VALID_AUTHORITY = new Set([
  'pinned-source-confirmed',
  'community-guide-qualified-by-pinned-source',
  'community-advisory',
  'task-contract',
  'pinned-source-correction',
  'runtime-contract-unavailable',
]);
const VALID_VERIFICATION = new Set(['automatic', 'qualified-simulation', 'runtime-only', 'advisory', 'rejected-claim']);
const LEGACY_DUPLICATE_FIELDS = new Set(['statement', 'applicability', 'evidenceContract', 'caseIds']);

function readJson(file, label, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return null;
  }
}
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function uniqueRecords(records, label, errors) {
  const map = new Map();
  for (const record of records ?? []) {
    if (!nonEmptyString(record?.id)) {
      errors.push(`${label} has an empty ID`);
      continue;
    }
    if (map.has(record.id)) errors.push(`Duplicate ${label} ID: ${record.id}`);
    else map.set(record.id, record);
  }
  return map;
}
function expectedVerification(status) {
  return {
    covered: 'automatic',
    qualified: 'qualified-simulation',
    BLOCKED: 'runtime-only',
    ADVISORY: 'advisory',
    REJECTED: 'rejected-claim',
  }[status];
}

export function loadGuideRulePacks(root) {
  const errors = [];
  const indexPath = path.join(root, 'rules/guide/index.json');
  const index = readJson(indexPath, 'guide rule-pack index', errors);
  if (!index) return { index: null, packs: [], rules: [], errors };
  const packs = [];
  for (const descriptor of index.packs ?? []) {
    if (!nonEmptyString(descriptor?.file)) {
      errors.push(`Guide pack ${descriptor?.id ?? '<unknown>'} has no file`);
      continue;
    }
    const file = path.join(root, 'rules/guide', descriptor.file);
    const pack = readJson(file, `guide pack ${descriptor.file}`, errors);
    if (pack) packs.push({ descriptor, file, pack });
  }
  return { index, packs, rules: packs.flatMap(({ pack }) => pack.rules ?? []), errors };
}

export function validateGuideCoverage(root) {
  const loaded = loadGuideRulePacks(root);
  const errors = [...loaded.errors];
  const warnings = [];
  const blocked = [];
  if (!loaded.index) return { id: 'VAL-GUIDE-COVERAGE', errors, warnings, blocked, evidence: [] };

  const { index, packs } = loaded;
  if (fs.existsSync(path.join(root, 'rules/guide-coverage.json'))) {
    errors.push('Legacy monolithic rules/guide-coverage.json must not exist');
  }
  if (fs.existsSync(path.join(root, 'tests/guide-cases.json'))) {
    errors.push('Legacy duplicated tests/guide-cases.json must not exist');
  }
  if (!nonEmptyString(index.authorityPolicy)) errors.push('Guide index has no authorityPolicy');
  if (!nonEmptyString(index.defaultAgentContract?.applicability)
      || !nonEmptyString(index.defaultAgentContract?.onNotApplicable)
      || !nonEmptyString(index.defaultAgentContract?.onFailure)) {
    errors.push('Guide index has an incomplete default AI agent contract');
  }

  const sources = uniqueRecords([index.source, ...(index.additionalSources ?? [])], 'coverage source', errors);
  if (!/^[a-f0-9]{64}$/.test(index.source?.sha256 ?? '')) {
    errors.push('Primary guide source has no pinned SHA-256');
  }
  if (!Number.isInteger(index.source?.lineCount) || index.source.lineCount <= 0) {
    errors.push('Primary guide source has no valid lineCount');
  }
  const mechanisms = uniqueRecords(index.mechanisms, 'coverage mechanism', errors);
  const packIds = new Set();
  const packFiles = new Set();
  const allRules = [];

  for (const { descriptor, file, pack } of packs) {
    if (packIds.has(pack.id)) errors.push(`Duplicate guide pack ID: ${pack.id}`);
    packIds.add(pack.id);
    const relative = path.relative(path.join(root, 'rules/guide'), file);
    if (packFiles.has(relative)) errors.push(`Duplicate guide pack file: ${relative}`);
    packFiles.add(relative);
    if (descriptor.id !== pack.id) errors.push(`Guide pack descriptor ${descriptor.id} loads mismatched pack ${pack.id}`);
    if (!nonEmptyString(pack.title)) errors.push(`Guide pack ${pack.id} has no title`);
    if (!Array.isArray(pack.loadWhen) || !pack.loadWhen.every(nonEmptyString)) errors.push(`Guide pack ${pack.id} has invalid loadWhen`);
    if (!nonEmptyString(pack.agentPrompt)) errors.push(`Guide pack ${pack.id} has no AI agent prompt`);
    if (!Array.isArray(pack.rules) || !pack.rules.length) errors.push(`Guide pack ${pack.id} has no rules`);
    if (fs.statSync(file).size > 32768) errors.push(`Guide pack ${pack.id} exceeds the 32 KiB focused-load limit`);
    for (const rule of pack.rules ?? []) allRules.push({ ...rule, packId: pack.id });
  }

  const rules = uniqueRecords(allRules, 'guide rule', errors);
  const expected = new Set();
  for (const id of index.expectedRuleIds ?? []) {
    if (!nonEmptyString(id)) errors.push('expectedRuleIds contains an empty ID');
    else if (expected.has(id)) errors.push(`Duplicate expected guide rule ID: ${id}`);
    else expected.add(id);
  }
  if (!expected.size) errors.push('Guide index has no expectedRuleIds catalog');
  for (const id of expected) if (!rules.has(id)) errors.push(`Missing guide rule record: ${id}`);
  for (const id of rules.keys()) if (!expected.has(id)) errors.push(`Unknown/orphan guide rule record: ${id}`);

  const usedMechanisms = new Set();
  for (const mechanism of mechanisms.values()) {
    if (!VALID_KINDS.has(mechanism.kind)) errors.push(`Unknown mechanism kind: ${mechanism.kind}`);
    if (!nonEmptyString(mechanism.path)) errors.push(`${mechanism.id} has no implementation path`);
    else if (!fs.existsSync(path.join(root, mechanism.path))) errors.push(`${mechanism.id} points to missing path: ${mechanism.path}`);
    if (!Array.isArray(mechanism.testFiles) || !mechanism.testFiles.length) {
      errors.push(`${mechanism.id} has no executable test files`);
    } else {
      for (const testFile of mechanism.testFiles) {
        if (!nonEmptyString(testFile) || !fs.existsSync(path.join(root, testFile))) {
          errors.push(`${mechanism.id} points to missing mechanism test: ${testFile}`);
        }
      }
    }
  }

  for (const rule of rules.values()) {
    const label = `Guide rule ${rule.id}`;
    for (const field of LEGACY_DUPLICATE_FIELDS) {
      if (Object.hasOwn(rule, field)) errors.push(`${label} retains forbidden duplicated field: ${field}`);
    }
    if (!nonEmptyString(rule.action)) errors.push(`${label} has no AI action`);
    else {
      if (rule.action.startsWith('Enforce and verify this requirement:')) {
        errors.push(`${label} retains generic user-guide wrapper instead of an AI action`);
      }
      if (rule.action.length > 320) errors.push(`${label} AI action exceeds 320 characters`);
    }
    if (!nonEmptyString(rule.source?.sourceId)
        || !nonEmptyString(rule.source?.section)
        || !nonEmptyString(rule.source?.locator)) {
      errors.push(`${label} has no exact source record`);
    } else if (!sources.has(rule.source.sourceId)) {
      errors.push(`${label} references unknown source: ${rule.source.sourceId}`);
    }
    if (!Array.isArray(rule.inputs) || !rule.inputs.length || !rule.inputs.every(nonEmptyString)) {
      errors.push(`${label} has no focused input list`);
    }
    if (!VALID_AUTHORITY.has(rule.authority)) errors.push(`${label} has unknown authority ${rule.authority}`);
    if (!VALID_STATUS.has(rule.status)) errors.push(`${label} has unknown status ${rule.status}`);
    if (!VALID_VERIFICATION.has(rule.verification)) errors.push(`${label} has unknown verification ${rule.verification}`);
    if (VALID_STATUS.has(rule.status) && rule.verification !== expectedVerification(rule.status)) {
      errors.push(`${label} status ${rule.status} conflicts with verification ${rule.verification}`);
    }
    if (!Array.isArray(rule.mechanisms) || !rule.mechanisms.length) errors.push(`${label} has no mechanisms`);
    const kinds = [];
    for (const id of rule.mechanisms ?? []) {
      usedMechanisms.add(id);
      const mechanism = mechanisms.get(id);
      if (!mechanism) errors.push(`${label} references unknown mechanism: ${id}`);
      else kinds.push(mechanism.kind);
    }
    if (rule.status === 'covered' && !kinds.some((kind) => EXECUTABLE_KINDS.has(kind))) {
      errors.push(`${label} falsely claims covered without executable evidence`);
    }
    if (rule.status === 'ADVISORY' && !kinds.includes('advisory')) errors.push(`${label} ADVISORY without advisory mechanism`);
    if (rule.status === 'BLOCKED' && !kinds.includes('runtime-adapter')) errors.push(`${label} BLOCKED without runtime mechanism`);
  }
  for (const id of mechanisms.keys()) if (!usedMechanisms.has(id)) errors.push(`Orphan coverage mechanism: ${id}`);

  return {
    id: 'VAL-GUIDE-COVERAGE',
    errors,
    warnings,
    blocked,
    evidence: [`${rules.size} guide rules in ${packs.length} focused AI packs, ${mechanisms.size} mechanisms; behavior scenarios are parameterized in executable tests`],
  };
}
