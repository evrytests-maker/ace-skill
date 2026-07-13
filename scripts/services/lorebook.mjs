import { isPlainObject } from '../lib/files.mjs';
import { Report } from '../lib/report.mjs';
import {
  evaluateKeyAndSecondary,
  getSelectiveLogicName,
  normalizeSelectiveLogic,
  validateRegexKey,
} from '../lib/st-matching.mjs';

const VALID_STRING_POSITIONS = new Set([
  'before_char', 'after_char', 'top_an', 'bottom_an', 'author_note',
  'at_depth', 'before_example', 'after_example', 'em_top', 'em_bottom', 'outlet',
]);
const VALID_NUMERIC_POSITIONS = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
const BOOLEAN_FIELDS = Object.freeze([
  'constant', 'enabled', 'use_regex', 'selective', 'vectorized', 'disable',
  'ignoreBudget', 'excludeRecursion', 'preventRecursion', 'groupOverride', 'useProbability',
]);
const KNOWN_ENTRY_FIELDS = new Set([
  'id', 'uid', 'key', 'keys', 'keysecondary', 'secondary_keys', 'content', 'comment',
  'constant', 'enabled', 'disable', 'disabled', 'use_regex', 'selective', 'selectiveLogic',
  'keysecondarylogic', 'secondary_logic', 'vectorized', 'position', 'depth', 'role', 'order',
  'insertion_order', 'outlet', 'automationId', 'automation_id', 'scanDepth', 'scan_depth',
  'probability', 'useProbability', 'ignoreBudget', 'excludeRecursion', 'preventRecursion',
  'group', 'groups', 'inclusionGroup', 'groupOverride', 'groupWeight', 'weight', 'sticky',
  'cooldown', 'delay', 'characterFilter', 'character_filter', 'personaFilter', 'persona_filter',
  'tagFilter', 'tag_filter', 'generationTypes', 'generation_types', 'scope', 'attachments',
  'extensions', 'displayIndex', 'addMemo', 'matchPersonaDescription', 'matchCharacterDescription',
  'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes',
]);
const VALID_ROLES = new Set(['system', 'user', 'assistant']);

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
}

function nearestKnownField(field) {
  let best = null;
  for (const known of KNOWN_ENTRY_FIELDS) {
    const distance = editDistance(field.toLowerCase(), known.toLowerCase());
    if (distance <= 2 && (!best || distance < best.distance)) best = { field: known, distance };
  }
  return best?.field ?? null;
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function candidateContainers(artifact) {
  return [
    { value: artifact?.entries, path: 'entries', kind: 'world-info' },
    { value: artifact?.character_book?.entries, path: 'character_book.entries', kind: 'embedded-character-book' },
    { value: artifact?.data?.character_book?.entries, path: 'data.character_book.entries', kind: 'embedded-character-book' },
  ];
}

export function getLorebookEntryRecords(artifact) {
  if (!isPlainObject(artifact)) return null;
  for (const candidate of candidateContainers(artifact)) {
    if (Array.isArray(candidate.value)) {
      return {
        containerPath: candidate.path,
        format: `${candidate.kind}-array`,
        records: candidate.value.map((entry, index) => ({ entry, sourceKey: String(index), fallbackId: index })),
      };
    }
    if (isPlainObject(candidate.value)) {
      return {
        containerPath: candidate.path,
        format: `${candidate.kind}-object`,
        records: Object.entries(candidate.value).map(([sourceKey, entry], index) => ({
          entry,
          sourceKey,
          fallbackId: /^\d+$/u.test(sourceKey) ? Number(sourceKey) : index,
        })),
      };
    }
  }
  return null;
}

export function getEntryKeys(entry) {
  if (Array.isArray(entry?.key)) return entry.key;
  if (Array.isArray(entry?.keys)) return entry.keys;
  return [];
}

export function getEntrySecondaryKeys(entry) {
  if (Array.isArray(entry?.keysecondary)) return entry.keysecondary;
  if (Array.isArray(entry?.secondary_keys)) return entry.secondary_keys;
  return [];
}

export function getEntrySelectiveLogic(entry) {
  if (!isPlainObject(entry)) return 0;
  if (hasOwn(entry, 'selectiveLogic')) return entry.selectiveLogic;
  if (isPlainObject(entry.extensions) && hasOwn(entry.extensions, 'selectiveLogic')) return entry.extensions.selectiveLogic;
  if (hasOwn(entry, 'keysecondarylogic')) return entry.keysecondarylogic;
  if (hasOwn(entry, 'secondary_logic')) return entry.secondary_logic;
  return 0;
}

export function hasDeclaredSelectiveLogic(entry) {
  return isPlainObject(entry) && (
    hasOwn(entry, 'selectiveLogic')
    || hasOwn(entry, 'keysecondarylogic')
    || hasOwn(entry, 'secondary_logic')
    || (isPlainObject(entry.extensions) && hasOwn(entry.extensions, 'selectiveLogic'))
  );
}

function entryId(entry, fallbackId) {
  return entry?.uid ?? entry?.id ?? fallbackId;
}

function validateArrayType(entry, field, id, report) {
  if (hasOwn(entry, field) && !Array.isArray(entry[field])) {
    report.error(`${field} must be an array`, {
      code: 'LORE_ARRAY_FIELD', ruleId: 'ACE-LORE-001', entryId: id, field,
    });
  }
}

function validateKeys(keys, field, id, report, macros) {
  keys.forEach((key, index) => {
    if (typeof key !== 'string') {
      report.error(`${field}[${index}] must be a string`, {
        code: 'LORE_KEY_STRING', ruleId: 'ACE-LORE-001', entryId: id, field: `${field}[${index}]`,
      });
      return;
    }
    if (!key.trim()) {
      report.error(`${field}[${index}] must not be empty`, {
        code: 'LORE_KEY_EMPTY', ruleId: 'ACE-KEY-001', entryId: id, field: `${field}[${index}]`,
      });
      return;
    }
    const syntax = validateRegexKey(key, macros);
    if (!syntax.ok) {
      report.error(`Invalid JavaScript regex key: ${syntax.message}`, {
        code: 'LORE_KEY_REGEX', ruleId: 'ACE-KEY-001', entryId: id, field: `${field}[${index}]`,
      });
    }
  });
}

function validatePosition(value, field, id, report) {
  if (value === undefined) return;
  const valid = typeof value === 'number'
    ? Number.isInteger(value) && VALID_NUMERIC_POSITIONS.has(value)
    : typeof value === 'string' && VALID_STRING_POSITIONS.has(value);
  if (!valid) {
    report.error(`Unknown or invalid SillyTavern position: ${JSON.stringify(value)}`, {
      code: 'LORE_POSITION', ruleId: 'ACE-LORE-001', entryId: id, field,
    });
  }
}

function validateInteger(value, field, id, report, { min = null, max = null, nullable = false } = {}) {
  if (value === undefined || (nullable && value === null)) return;
  if (!Number.isInteger(value)) {
    report.error(`${field} must be an integer${nullable ? ' or null' : ''}`, {
      code: 'LORE_INTEGER', ruleId: 'ACE-LORE-001', entryId: id, field,
    });
    return;
  }
  if ((min !== null && value < min) || (max !== null && value > max)) {
    report.error(`${field} must be between ${min ?? '-∞'} and ${max ?? '∞'}`, {
      code: 'LORE_INTEGER_RANGE', ruleId: 'ACE-LORE-001', entryId: id, field,
    });
  }
}

function validateEntry(entry, fallbackId, report, options) {
  const id = entryId(entry, fallbackId);
  if (!isPlainObject(entry)) {
    report.error('Entry must be an object', {
      code: 'LORE_ENTRY_OBJECT', ruleId: 'ACE-LORE-001', entryId: id,
    });
    return;
  }

  for (const idField of ['id', 'uid']) {
    if (entry[idField] !== undefined && !Number.isInteger(entry[idField])) {
      report.error(`${idField} must be an integer when present`, {
        code: 'LORE_ENTRY_ID', ruleId: 'ACE-LORE-001', entryId: id, field: idField,
      });
    }
  }

  for (const field of Object.keys(entry)) {
    if (KNOWN_ENTRY_FIELDS.has(field)) continue;
    const suggestion = nearestKnownField(field);
    if (suggestion) report.warn(`Unknown field '${field}'; did you mean '${suggestion}'?`, {
      code: 'LORE_FIELD_TYPO', ruleId: 'ACE-LORE-ADVANCED', entryId: id,
      field, details: { suggestion },
    });
  }

  ['key', 'keys', 'keysecondary', 'secondary_keys'].forEach((field) => validateArrayType(entry, field, id, report));
  const keys = getEntryKeys(entry);
  const secondaryKeys = getEntrySecondaryKeys(entry);
  validateKeys(keys, hasOwn(entry, 'key') ? 'key' : 'keys', id, report, options.macros);
  validateKeys(secondaryKeys, hasOwn(entry, 'keysecondary') ? 'keysecondary' : 'secondary_keys', id, report, options.macros);

  if (hasOwn(entry, 'key') && hasOwn(entry, 'keys')) {
    const same = JSON.stringify(entry.key) === JSON.stringify(entry.keys);
    (same ? report.warn.bind(report) : report.error.bind(report))(
      same ? 'Both native key and alias keys are present with the same value' : 'Conflicting key and keys aliases must be resolved explicitly', {
        code: same ? 'LORE_DUPLICATE_KEY_ALIAS' : 'LORE_KEY_ALIAS_CONFLICT',
        ruleId: 'ACE-LORE-001', entryId: id, field: 'key/keys',
      },
    );
  }
  if (hasOwn(entry, 'keysecondary') && hasOwn(entry, 'secondary_keys')) {
    const same = JSON.stringify(entry.keysecondary) === JSON.stringify(entry.secondary_keys);
    (same ? report.warn.bind(report) : report.error.bind(report))(
      same ? 'Both secondary-key aliases are present with the same value' : 'Conflicting secondary-key aliases must be resolved explicitly', {
        code: same ? 'LORE_DUPLICATE_SECONDARY_ALIAS' : 'LORE_SECONDARY_ALIAS_CONFLICT',
        ruleId: 'ACE-LORE-001', entryId: id, field: 'keysecondary/secondary_keys',
      },
    );
  }

  for (const [leftPath, left, rightPath, right] of [
    ['order', entry.order, 'insertion_order', entry.insertion_order],
    ['position', entry.position, 'extensions.position', entry.extensions?.position],
    ['depth', entry.depth, 'extensions.depth', entry.extensions?.depth],
    ['automationId', entry.automationId, 'automation_id', entry.automation_id],
  ]) {
    if (left !== undefined && right !== undefined && left !== right) report.error(`Conflicting ${leftPath} and ${rightPath} aliases must be resolved explicitly`, {
      code: 'LORE_ADVANCED_ALIAS_CONFLICT', ruleId: 'ACE-LORE-ADVANCED', entryId: id, field: `${leftPath}/${rightPath}`,
    });
  }

  if (typeof entry.content !== 'string' || !entry.content.trim()) {
    report.error('content must be a non-empty string', {
      code: 'LORE_CONTENT', ruleId: 'ACE-LORE-001', entryId: id, field: 'content',
    });
  } else if (entry.content.trim().length < 20) {
    report.warn('content is very short; review its standalone meaning manually', {
      code: 'LORE_CONTENT_SHORT', ruleId: 'ACE-LORE-004', entryId: id, field: 'content',
    });
  }

  if (entry.comment !== undefined && typeof entry.comment !== 'string') {
    report.error('comment must be a string when present', {
      code: 'LORE_COMMENT_STRING', ruleId: 'ACE-LORE-001', entryId: id, field: 'comment',
    });
  }

  const logicValue = getEntrySelectiveLogic(entry);
  const logic = normalizeSelectiveLogic(logicValue);
  if ((secondaryKeys.length || hasDeclaredSelectiveLogic(entry)) && logic === null) {
    report.error(`Unknown selectiveLogic '${logicValue}'; no fallback is allowed`, {
      code: 'LORE_SELECTIVE_LOGIC', ruleId: 'ACE-LORE-002', entryId: id, field: 'selectiveLogic',
    });
  }
  if (secondaryKeys.length && entry.selective !== true) {
    report.error('Non-empty secondary keys require selective=true in ACE-authored/audited output', {
      code: 'LORE_SECONDARY_IGNORED', ruleId: 'ACE-LORE-003', entryId: id, field: 'selective',
    });
  }
  if (entry.selective === true && !secondaryKeys.length) {
    report.warn('selective=true has no secondary keys', {
      code: 'LORE_SELECTIVE_EMPTY', entryId: id, field: 'keysecondary',
    });
  }

  validatePosition(entry.position, 'position', id, report);
  validatePosition(entry.extensions?.position, 'extensions.position', id, report);
  validateInteger(entry.order ?? entry.insertion_order, 'order', id, report, { min: 0, max: 100000 });
  validateInteger(entry.depth ?? entry.extensions?.depth, 'depth', id, report, { min: 0, max: 1000, nullable: true });
  validateInteger(entry.scanDepth ?? entry.scan_depth, 'scanDepth', id, report, { min: 0, max: 1000, nullable: true });
  validateInteger(entry.probability, 'probability', id, report, { min: 0, max: 100, nullable: true });
  for (const field of ['sticky', 'cooldown', 'delay']) {
    validateInteger(entry[field], field, id, report, { min: 0, max: 100000, nullable: true });
  }

  const role = entry.role ?? entry.extensions?.role;
  if (role !== undefined && !VALID_ROLES.has(role)) report.error('role must be system, user, or assistant', {
    code: 'LORE_ROLE', ruleId: 'ACE-LORE-ADVANCED', entryId: id, field: 'role',
  });
  const outlet = entry.outlet ?? entry.extensions?.outlet;
  if (outlet !== undefined && (typeof outlet !== 'string' || !outlet.trim())) report.error('outlet must be a non-empty string', {
    code: 'LORE_OUTLET', ruleId: 'ACE-LORE-ADVANCED', entryId: id, field: 'outlet',
  });
  const automationId = entry.automationId ?? entry.automation_id ?? entry.extensions?.automation_id;
  if (automationId !== undefined && (typeof automationId !== 'string' || !automationId.trim())) report.error('Automation ID must be a non-empty string', {
    code: 'LORE_AUTOMATION_ID', ruleId: 'ACE-LORE-ADVANCED', entryId: id, field: 'automationId',
  });
  if (entry.enabled !== undefined && entry.disable !== undefined && entry.enabled === entry.disable) {
    report.error('enabled and disable aliases conflict', {
      code: 'LORE_ENABLE_CONFLICT', ruleId: 'ACE-LORE-ADVANCED', entryId: id, field: 'enabled/disable',
    });
  }

  BOOLEAN_FIELDS.forEach((field) => {
    if (entry[field] !== undefined && entry[field] !== null && typeof entry[field] !== 'boolean') {
      report.error(`${field} must be boolean`, {
        code: 'LORE_BOOLEAN', ruleId: 'ACE-LORE-001', entryId: id, field,
      });
    }
  });

  if (!keys.length && entry.constant !== true && entry.vectorized !== true) {
    report.warn('Entry has no primary keys and is neither constant nor vectorized', {
      code: 'LORE_NO_ACTIVATION', entryId: id, field: 'key',
    });
  }
  if (entry.constant === true && keys.length) {
    report.warn('constant=true bypasses keyword matching; primary keys are unnecessary', {
      code: 'LORE_CONSTANT_KEYS', entryId: id, field: 'key',
    });
  }

  report.addEvidence({
    kind: 'entry-validation', entryId: id, primaryKeyCount: keys.length,
    secondaryKeyCount: secondaryKeys.length, selectiveLogic: logic,
    selectiveLogicName: getSelectiveLogicName(logicValue),
  });
}

export function validateLorebook(artifact, options = {}) {
  const report = new Report('Lorebook Validation', { service: 'lorebook', operation: 'validate' });
  if (!isPlainObject(artifact)) {
    report.error('Lorebook/card root must be an object', {
      code: 'LORE_ROOT_OBJECT', ruleId: 'ACE-LORE-001',
    });
    return report.toJSON({ data: { entryCount: 0, containerPath: null, format: null } });
  }
  const container = getLorebookEntryRecords(artifact);
  if (!container) {
    report.error('No supported entries container found (entries or data.character_book.entries)', {
      code: 'LORE_ENTRIES_CONTAINER', ruleId: 'ACE-LORE-001', field: 'entries',
    });
    return report.toJSON({ data: { entryCount: 0, containerPath: null, format: null } });
  }

  container.records.forEach(({ entry, fallbackId }) => validateEntry(entry, fallbackId, report, options));
  const ids = container.records
    .filter(({ entry }) => isPlainObject(entry))
    .map(({ entry, fallbackId }) => entryId(entry, fallbackId));
  const seen = new Set();
  ids.forEach((id) => {
    if (seen.has(String(id))) {
      report.error(`Duplicate entry id/uid '${id}'`, {
        code: 'LORE_DUPLICATE_ID', ruleId: 'ACE-LORE-001', entryId: id,
      });
    }
    seen.add(String(id));
  });
  if (!container.records.length) report.warn('entries container is empty', { code: 'LORE_EMPTY' });

  report.setData({
    entryCount: container.records.length,
    containerPath: container.containerPath,
    format: container.format,
  });
  report.addEvidence({ kind: 'container-detection', ...report.data });
  return report.toJSON();
}

function copyResultIssues(result, report) {
  for (const issue of result.errors ?? []) report.error(issue.message, issue);
  for (const issue of result.warnings ?? []) report.warn(issue.message, issue);
  for (const issue of result.blockers ?? []) report.block(issue.message, issue);
  for (const evidence of result.evidence ?? []) report.addEvidence(evidence);
}

export function checkLorebookActivation(artifact, {
  text = '', caseSensitive = false, wholeWords = true, macros = {}, forceSecondary = false,
  expectedActive = [], expectedInactive = [], requireActivation = false,
} = {}) {
  const report = new Report('Lorebook Activation Check', { service: 'lorebook', operation: 'activation' });
  const validation = validateLorebook(artifact, { macros });
  copyResultIssues(validation, report);
  const container = getLorebookEntryRecords(artifact);
  if (!container) return report.toJSON({ data: { entries: [], activatedCount: 0 } });
  if (!text) report.warn('No scan text supplied; activation evidence is incomplete', { code: 'LORE_SCAN_TEXT_MISSING' });

  const results = [];
  for (const { entry, fallbackId, sourceKey } of container.records) {
    if (!isPlainObject(entry)) continue;
    const id = entryId(entry, fallbackId);
    const keys = getEntryKeys(entry);
    const secondaryKeys = getEntrySecondaryKeys(entry);
    const logicValue = getEntrySelectiveLogic(entry);
    const logic = normalizeSelectiveLogic(logicValue);
    const disabled = entry.disable === true || entry.enabled === false;
    let evaluation = {
      active: entry.constant === true,
      valid: logic !== null,
      error: logic === null ? `unknown selective logic '${logicValue}'` : null,
      primaryMatched: entry.constant === true,
      secondaryOk: logic !== null,
      secondaryReason: entry.constant === true ? 'constant entry' : 'no scan text',
      secondaryUsed: false,
      secondaryIgnored: secondaryKeys.length > 0,
      primaryMatches: [],
      secondaryMatches: [],
      logic,
      logicName: getSelectiveLogicName(logicValue),
    };
    if (text && entry.constant !== true && logic !== null) {
      try {
        evaluation = evaluateKeyAndSecondary({
          primaryKeys: keys,
          secondaryKeys,
          text,
          selective: entry.selective === true,
          selectiveLogic: logic,
          forceSecondary,
          opts: { caseSensitive, wholeWords, macros },
        });
      } catch (error) {
        evaluation = { ...evaluation, active: false, valid: false, error: error.message, secondaryReason: error.message };
      }
    }
    const active = !disabled && evaluation.valid !== false && evaluation.active;
    results.push({ ...evaluation, id, sourceKey, active, disabled, constant: entry.constant === true });
  }

  const activeIds = results.filter((item) => item.active).map((item) => String(item.id));
  const knownIds = new Set(results.map((item) => String(item.id)));
  const normalizeExpected = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).map(String);
  const mustActivate = normalizeExpected(expectedActive);
  const mustNotActivate = normalizeExpected(expectedInactive);
  const hasAssertions = requireActivation || mustActivate.length > 0 || mustNotActivate.length > 0;
  if (hasAssertions && !text) {
    report.error('Activation assertions require non-empty scan text', {
      code: 'LORE_ASSERTION_TEXT_REQUIRED', ruleId: 'ACE-KEY-001', field: 'text',
    });
  }
  const contradictoryIds = mustActivate.filter((id) => mustNotActivate.includes(id));
  for (const id of contradictoryIds) {
    report.error(`Entry ${id} cannot be expected both active and inactive`, {
      code: 'LORE_EXPECTATION_CONFLICT', ruleId: 'ACE-KEY-001', entryId: id, field: 'expectedActive/expectedInactive',
    });
  }
  if (requireActivation && !activeIds.length) {
    report.error('No lorebook entry activated, but activation was required', {
      code: 'LORE_EXPECTED_ACTIVATION', ruleId: 'ACE-KEY-001', field: 'expectedActive',
    });
  }
  for (const id of mustActivate) {
    if (!knownIds.has(id)) report.error(`Expected-active entry ${id} does not exist`, {
      code: 'LORE_EXPECTATION_UNKNOWN_ENTRY', ruleId: 'ACE-KEY-001', entryId: id, field: 'expectedActive',
    });
    else if (!activeIds.includes(id)) report.error(`Expected entry ${id} to activate`, {
      code: 'LORE_EXPECT_ACTIVE', ruleId: 'ACE-KEY-001', entryId: id, field: 'expectedActive',
    });
  }
  for (const id of mustNotActivate) {
    if (!knownIds.has(id)) report.error(`Expected-inactive entry ${id} does not exist`, {
      code: 'LORE_EXPECTATION_UNKNOWN_ENTRY', ruleId: 'ACE-KEY-001', entryId: id, field: 'expectedInactive',
    });
    else if (activeIds.includes(id)) report.error(`Expected entry ${id} to remain inactive`, {
      code: 'LORE_EXPECT_INACTIVE', ruleId: 'ACE-KEY-001', entryId: id, field: 'expectedInactive',
    });
  }

  report.setData({
    containerPath: container.containerPath,
    format: container.format,
    scanTextProvided: Boolean(text),
    activatedCount: activeIds.length,
    activeIds,
    assertions: { expectedActive: mustActivate, expectedInactive: mustNotActivate, requireActivation },
    entries: results,
  });
  report.addEvidence({
    kind: 'activation-cases',
    scanTextProvided: Boolean(text),
    entryCount: results.length,
    activatedIds: results.filter((item) => item.active).map((item) => item.id),
    expectedActive: mustActivate,
    expectedInactive: mustNotActivate,
  });
  return report.toJSON();
}

export const LOREBOOK_SERVICE = Object.freeze({
  name: 'lorebook',
  validate: validateLorebook,
  checkActivation: checkLorebookActivation,
  getEntries: getLorebookEntryRecords,
});
