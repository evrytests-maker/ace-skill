const REGEX_FLAG_PATTERN = /^[dgimsuvy]*$/;

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

export function validateRegexKey(key, macros = {}) {
  try {
    const regex = buildRegexFromKey(key, macros);
    if (!regex) return { isRegex: false, ok: true, message: 'plaintext key' };
    return { isRegex: true, ok: true, message: `/${regex.source}/${regex.flags}` };
  } catch (error) {
    return { isRegex: true, ok: false, message: error.message };
  }
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
