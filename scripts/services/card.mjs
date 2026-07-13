import { isPlainObject } from '../lib/files.mjs';
import { Report } from '../lib/report.mjs';

const CORE_STRING_FIELDS = Object.freeze([
  'name',
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
]);

const V2_STRING_FIELDS = Object.freeze([
  ...CORE_STRING_FIELDS,
  'creator_notes',
  'system_prompt',
  'post_history_instructions',
  'creator',
  'character_version',
]);

function majorVersion(value) {
  const match = String(value ?? '').match(/^(\d+)/u);
  return match ? Number(match[1]) : null;
}

export function detectCardVersion(artifact) {
  if (!isPlainObject(artifact)) return { version: null, reason: 'root-not-object', payload: null };
  const spec = artifact.spec;
  const specMajor = majorVersion(artifact.spec_version);
  if (spec === 'chara_card_v3' || specMajor === 3) return { version: 3, reason: 'v3-envelope', payload: artifact.data };
  if (spec === 'chara_card_v2' || specMajor === 2) return { version: 2, reason: 'v2-envelope', payload: artifact.data };
  if (spec !== undefined || artifact.spec_version !== undefined) return { version: null, reason: 'unsupported-envelope', payload: artifact.data };
  return { version: 1, reason: 'legacy-v1-root', payload: artifact };
}

function requireString(payload, field, report) {
  if (typeof payload[field] !== 'string') {
    report.error(`Required field '${field}' must be a string`, {
      code: 'CARD_REQUIRED_STRING',
      ruleId: 'ACE-CARD-001',
      field,
    });
  }
}

function validateOptionalString(payload, field, report) {
  if (payload[field] !== undefined && typeof payload[field] !== 'string') {
    report.error(`Optional field '${field}' must be a string when present`, {
      code: 'CARD_OPTIONAL_STRING',
      ruleId: 'ACE-CARD-001',
      field,
    });
  }
}

function validateStringArray(payload, field, report, { required = false } = {}) {
  const value = payload[field];
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    report.error(`Field '${field}' must be an array`, {
      code: 'CARD_ARRAY',
      ruleId: 'ACE-CARD-001',
      field,
    });
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      report.error(`Field '${field}[${index}]' must be a string`, {
        code: 'CARD_ARRAY_ITEM',
        ruleId: 'ACE-CARD-001',
        field: `${field}[${index}]`,
      });
    }
  });
}

function validateCharacterBookEnvelope(characterBook, report) {
  if (characterBook === undefined) return;
  if (!isPlainObject(characterBook)) {
    report.error('character_book must be an object when present', {
      code: 'CARD_CHARACTER_BOOK_OBJECT',
      ruleId: 'ACE-CARD-001',
      field: 'character_book',
    });
    return;
  }
  if (!Array.isArray(characterBook.entries)) {
    report.error('character_book.entries must be an array', {
      code: 'CARD_CHARACTER_BOOK_ENTRIES',
      ruleId: 'ACE-CARD-001',
      field: 'character_book.entries',
    });
  }
}

export function validateCard(artifact, options = {}) {
  const report = new Report('Character Card Validation', { service: 'card', operation: 'validate' });
  const detected = detectCardVersion(artifact);

  if (!isPlainObject(artifact)) {
    report.error('Character-card root must be an object', {
      code: 'CARD_ROOT_OBJECT',
      ruleId: 'ACE-CARD-001',
    });
    return report.toJSON({ data: { version: null } });
  }
  if (detected.version === null) {
    report.error(`Unsupported or inconsistent character-card envelope: spec=${JSON.stringify(artifact.spec)}, spec_version=${JSON.stringify(artifact.spec_version)}`, {
      code: 'CARD_UNSUPPORTED_VERSION',
      ruleId: 'ACE-CARD-001',
      field: 'spec',
    });
    return report.toJSON({ data: { version: null } });
  }

  const payload = detected.payload;
  if (!isPlainObject(payload)) {
    report.error(`Character Card V${detected.version} payload must be an object`, {
      code: 'CARD_DATA_OBJECT',
      ruleId: 'ACE-CARD-001',
      field: detected.version === 1 ? '$' : 'data',
    });
    return report.toJSON({ data: { version: detected.version } });
  }

  if (detected.version === 1) {
    CORE_STRING_FIELDS.forEach((field) => requireString(payload, field, report));
    validateStringArray(payload, 'alternate_greetings', report);
  } else if (detected.version === 2) {
    const expectedSpec = `chara_card_v${detected.version}`;
    if (artifact.spec !== expectedSpec) {
      report.error(`spec must be '${expectedSpec}' for V${detected.version}`, {
        code: 'CARD_SPEC_MISMATCH',
        ruleId: 'ACE-CARD-001',
        field: 'spec',
      });
    }
    if (typeof artifact.spec_version !== 'string') {
      report.error('spec_version must be a string', {
        code: 'CARD_SPEC_VERSION_TYPE',
        ruleId: 'ACE-CARD-001',
        field: 'spec_version',
      });
    } else if (majorVersion(artifact.spec_version) !== detected.version) {
      report.error(`spec_version must start with '${detected.version}.'`, {
        code: 'CARD_SPEC_VERSION_MISMATCH',
        ruleId: 'ACE-CARD-001',
        field: 'spec_version',
      });
    }
    V2_STRING_FIELDS.forEach((field) => requireString(payload, field, report));
    validateStringArray(payload, 'alternate_greetings', report, { required: true });
    validateStringArray(payload, 'tags', report, { required: true });
    if (!isPlainObject(payload.extensions)) {
      report.error("Required field 'extensions' must be an object", {
        code: 'CARD_EXTENSIONS_OBJECT',
        ruleId: 'ACE-CARD-001',
        field: 'extensions',
      });
    }
    validateCharacterBookEnvelope(payload.character_book, report);
  } else {
    if (artifact.spec !== 'chara_card_v3') {
      report.error("spec must be 'chara_card_v3' for V3", {
        code: 'CARD_SPEC_MISMATCH',
        ruleId: 'ACE-CARD-001',
        field: 'spec',
      });
    }
    if (typeof artifact.spec_version !== 'string') {
      report.error('spec_version must be a string', {
        code: 'CARD_SPEC_VERSION_TYPE',
        ruleId: 'ACE-CARD-001',
        field: 'spec_version',
      });
    } else if (majorVersion(artifact.spec_version) !== 3) {
      report.error("spec_version must start with '3.'", {
        code: 'CARD_SPEC_VERSION_MISMATCH',
        ruleId: 'ACE-CARD-001',
        field: 'spec_version',
      });
    }

    // Pinned TavernCardValidator deliberately checks only the V3 envelope.
    // Known payload fields are type-checked when present, never promoted to
    // invented V3 requirements.
    V2_STRING_FIELDS.forEach((field) => validateOptionalString(payload, field, report));
    validateStringArray(payload, 'alternate_greetings', report);
    validateStringArray(payload, 'tags', report);
    if (payload.extensions !== undefined && !isPlainObject(payload.extensions)) {
      report.error("Optional V3 field 'extensions' must be an object", {
        code: 'CARD_EXTENSIONS_OBJECT',
        ruleId: 'ACE-CARD-001',
        field: 'extensions',
      });
    }
    validateCharacterBookEnvelope(payload.character_book, report);
  }

  // V3 additions are validated when present. SillyTavern currently accepts a
  // deliberately small V3 envelope, so this service does not invent extra MUSTs.
  if (detected.version === 3) {
    validateOptionalString(payload, 'nickname', report);
    validateStringArray(payload, 'source', report);
    validateStringArray(payload, 'group_only_greetings', report);
    if (payload.assets !== undefined && !Array.isArray(payload.assets)) {
      report.error("Optional V3 field 'assets' must be an array", {
        code: 'CARD_V3_ASSETS_ARRAY',
        ruleId: 'ACE-CARD-001',
        field: 'assets',
      });
    }
  }

  const checkedFields = detected.version === 1
    ? CORE_STRING_FIELDS
    : detected.version === 2
      ? V2_STRING_FIELDS
      : V2_STRING_FIELDS.filter((field) => payload[field] !== undefined);
  report.addEvidence({
    kind: 'structural-validation',
    detectedVersion: detected.version,
    detector: detected.reason,
    checkedFields,
  });
  report.setData({
    version: detected.version,
    spec: artifact.spec ?? null,
    specVersion: artifact.spec_version ?? null,
    checkedFields,
    hasEmbeddedCharacterBook: isPlainObject(payload.character_book),
  });
  return report.toJSON();
}

export const CARD_SERVICE = Object.freeze({
  name: 'card',
  validate: validateCard,
  detectVersion: detectCardVersion,
});
