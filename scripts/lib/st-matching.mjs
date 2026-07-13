// SillyTavern World Info / Lorebook key matching helpers.
// Numeric selectiveLogic values intentionally follow official SillyTavern JSON/source:
// 0 = AND ANY, 1 = NOT ALL, 2 = NOT ANY, 3 = AND ALL.
const REGEX_FLAG_PATTERN = /^[dgimsuvy]*$/;

export const SELECTIVE_LOGIC = Object.freeze({
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
});

export const SELECTIVE_LOGIC_NAMES = Object.freeze({
  0: 'AND ANY',
  1: 'NOT ALL',
  2: 'NOT ANY',
  3: 'AND ALL',
});

const SELECTIVE_LOGIC_ALIASES = new Map([
  ['0', SELECTIVE_LOGIC.AND_ANY],
  ['and_any', SELECTIVE_LOGIC.AND_ANY],
  ['and any', SELECTIVE_LOGIC.AND_ANY],
  ['and-any', SELECTIVE_LOGIC.AND_ANY],
  ['andany', SELECTIVE_LOGIC.AND_ANY],
  // Preserve the guide/UI label as a technical literal. Do not infer the
  // mapping by translating the Russian words literally.
  ['и любой', SELECTIVE_LOGIC.AND_ANY],
  ['1', SELECTIVE_LOGIC.NOT_ALL],
  ['not_all', SELECTIVE_LOGIC.NOT_ALL],
  ['not all', SELECTIVE_LOGIC.NOT_ALL],
  ['not-all', SELECTIVE_LOGIC.NOT_ALL],
  ['notall', SELECTIVE_LOGIC.NOT_ALL],
  ['не любой', SELECTIVE_LOGIC.NOT_ALL],
  ['2', SELECTIVE_LOGIC.NOT_ANY],
  ['not_any', SELECTIVE_LOGIC.NOT_ANY],
  ['not any', SELECTIVE_LOGIC.NOT_ANY],
  ['not-any', SELECTIVE_LOGIC.NOT_ANY],
  ['notany', SELECTIVE_LOGIC.NOT_ANY],
  ['не все', SELECTIVE_LOGIC.NOT_ANY],
  ['3', SELECTIVE_LOGIC.AND_ALL],
  ['and_all', SELECTIVE_LOGIC.AND_ALL],
  ['and all', SELECTIVE_LOGIC.AND_ALL],
  ['and-all', SELECTIVE_LOGIC.AND_ALL],
  ['andall', SELECTIVE_LOGIC.AND_ALL],
  ['и все', SELECTIVE_LOGIC.AND_ALL],
]);

export function parseRegexLiteral(value) {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('/')) return null;

  let escaped = false;
  let end = -1;
  for (let i = 1; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '/') {
      end = i;
    }
  }

  if (end <= 0) return null;
  const pattern = raw.slice(1, end);
  const flags = raw.slice(end + 1);
  if (!REGEX_FLAG_PATTERN.test(flags)) {
    throw new Error(`Invalid JavaScript regex flags: ${flags}`);
  }
  return { pattern, flags, raw };
}

export function buildRegexFromKey(key, macros = {}) {
  const replaced = replaceMacros(String(key ?? ''), macros);
  const parsed = parseRegexLiteral(replaced);
  if (!parsed) return null;
  return new RegExp(parsed.pattern, parsed.flags);
}

export function replaceMacros(text, macros = {}) {
  return String(text ?? '')
    .replaceAll('{{char}}', macros.char ?? '{{char}}')
    .replaceAll('{{user}}', macros.user ?? '{{user}}');
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeForCase(text, caseSensitive) {
  return caseSensitive ? String(text) : String(text).toLocaleLowerCase('ru-RU');
}

export function hasOnlyOneWord(key) {
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return false;
  return !/[\s,;|/()[\]{}]+/u.test(trimmed);
}

export function matchPlainKey(key, text, { caseSensitive = false, wholeWords = true, macros = {} } = {}) {
  const sourceKey = replaceMacros(key, macros).trim();
  if (!sourceKey) return false;
  const activeKey = normalizeForCase(sourceKey, caseSensitive);
  const haystack = normalizeForCase(text, caseSensitive);

  if (wholeWords && hasOnlyOneWord(sourceKey)) {
    const escaped = escapeRegExp(activeKey);
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u');
    return re.test(haystack);
  }
  return haystack.includes(activeKey);
}

export function matchSingleKey(key, text, opts = {}) {
  const regex = buildRegexFromKey(key, opts.macros);
  if (regex) return regex.test(replaceMacros(text, opts.macros));
  return matchPlainKey(key, text, opts);
}

export function matchKeyList(keys = [], text = '', opts = {}) {
  return keys.map((key) => ({ key, matched: matchSingleKey(key, text, opts) }));
}

export function matchedKeys(keys = [], text = '', opts = {}) {
  return matchKeyList(keys, text, opts).filter((item) => item.matched).map((item) => item.key);
}

export function validateRegexKey(key, macros = {}) {
  try {
    const regex = buildRegexFromKey(key, macros);
    if (!regex) return { isRegex: false, ok: true, message: 'plaintext key' };
    return { isRegex: true, ok: true, message: `/${regex.source}/${regex.flags}` };
  } catch (error) {
    return { isRegex: true, ok: false, message: error.message };
  }
}

export function normalizeSelectiveLogic(value = 0) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) return value;
  const normalized = String(value ?? 0).trim().toLocaleLowerCase('ru-RU');
  return SELECTIVE_LOGIC_ALIASES.has(normalized) ? SELECTIVE_LOGIC_ALIASES.get(normalized) : null;
}

export function getSelectiveLogicName(value = 0) {
  const logic = normalizeSelectiveLogic(value);
  return logic === null ? `UNKNOWN(${value})` : SELECTIVE_LOGIC_NAMES[logic];
}

export function evaluateSecondaryKeys(primaryMatched, secondaryMatches = [], logicValue = 0) {
  const logic = normalizeSelectiveLogic(logicValue);
  if (logic === null) {
    return {
      ok: false,
      logic: null,
      valid: false,
      error: `unknown selective logic '${logicValue}'`,
      reason: `blocked: unknown selective logic '${logicValue}'`,
    };
  }

  if (!primaryMatched) {
    return { ok: false, logic, valid: true, error: null, reason: 'primary key did not match' };
  }

  if (!secondaryMatches.length) {
    return { ok: true, logic, valid: true, error: null, reason: 'no secondary filters' };
  }

  const hitCount = secondaryMatches.filter(Boolean).length;
  const all = hitCount === secondaryMatches.length;
  const any = hitCount > 0;

  if (logic === SELECTIVE_LOGIC.AND_ANY) {
    return { ok: any, logic, valid: true, error: null, reason: any ? 'primary matched and at least one secondary matched' : 'primary matched, but no secondary matched' };
  }
  if (logic === SELECTIVE_LOGIC.NOT_ALL) {
    return { ok: !all, logic, valid: true, error: null, reason: !all ? 'primary matched and not all secondary filters matched' : 'blocked: all secondary filters matched' };
  }
  if (logic === SELECTIVE_LOGIC.NOT_ANY) {
    return { ok: !any, logic, valid: true, error: null, reason: !any ? 'primary matched and no secondary filters matched' : 'blocked: at least one secondary filter matched' };
  }
  if (logic === SELECTIVE_LOGIC.AND_ALL) {
    return { ok: all, logic, valid: true, error: null, reason: all ? 'primary matched and all secondary filters matched' : 'primary matched, but not all secondary filters matched' };
  }

  // Defensive exhaustiveness guard. normalizeSelectiveLogic only returns 0..3.
  return { ok: false, logic: null, valid: false, error: `unsupported selective logic '${logicValue}'`, reason: 'blocked: unsupported selective logic' };
}

export function evaluateKeyAndSecondary({ primaryKeys = [], secondaryKeys = [], text = '', selective = false, selectiveLogic = 0, constant = false, forceSecondary = false, opts = {} } = {}) {
  const primaryMatchList = matchKeyList(primaryKeys, text, opts);
  const secondaryMatchList = matchKeyList(secondaryKeys, text, opts);
  const primaryMatched = constant || primaryMatchList.some((item) => item.matched);
  const hasSecondary = secondaryKeys.length > 0;
  const secondaryUsed = Boolean((selective === true || forceSecondary === true) && hasSecondary);
  const secondaryResult = secondaryUsed
    ? evaluateSecondaryKeys(primaryMatched, secondaryMatchList.map((item) => item.matched), selectiveLogic)
    : {
      ok: true,
      logic: normalizeSelectiveLogic(selectiveLogic),
      valid: normalizeSelectiveLogic(selectiveLogic) !== null,
      error: normalizeSelectiveLogic(selectiveLogic) === null ? `unknown selective logic '${selectiveLogic}'` : null,
      reason: hasSecondary && selective !== true
        ? 'secondary filters not used because selective is not true'
        : 'secondary filters not used',
    };

  return {
    active: secondaryResult.valid !== false && primaryMatched && secondaryResult.ok,
    primaryMatched,
    secondaryOk: secondaryResult.ok,
    valid: secondaryResult.valid !== false,
    error: secondaryResult.error ?? null,
    secondaryReason: secondaryResult.reason,
    secondaryUsed,
    secondaryIgnored: hasSecondary && !secondaryUsed,
    forceSecondary: forceSecondary === true,
    logic: secondaryResult.logic,
    logicName: getSelectiveLogicName(selectiveLogic),
    primaryMatches: primaryMatchList,
    secondaryMatches: secondaryMatchList,
  };
}

export function normalizeChatScan(messages) {
  if (!Array.isArray(messages)) return String(messages ?? '');
  return messages
    .map((msg) => {
      if (typeof msg === 'string') return msg;
      const name = msg.name || msg.role || 'unknown';
      const text = msg.content || msg.text || '';
      return `\x01${name}: ${text}`;
    })
    .join('\n');
}
