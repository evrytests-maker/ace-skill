import { isPlainObject } from '../lib/files.mjs';
import { Report } from '../lib/report.mjs';

const CARD_PROSE_FIELDS = Object.freeze([
  'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'creator_notes', 'system_prompt', 'post_history_instructions',
]);

// These patterns target replacement-by-negation rhetoric, not standalone
// factual negation. Keep every expression bounded so unrelated sentences do
// not become one match merely because a later sentence contains "but".
const FORBIDDEN_PATTERNS = Object.freeze([
  {
    id: 'EN-NOT-BUT',
    regex: /(?:\b(?:is|are|was|were)\s+(?:not|no)|\b(?:isn't|aren't|wasn't|weren't)|\bnot\s+(?:just|merely|simply|only)|(?:^|[.!?]\s+)not)\s+[^.!?\n]{1,160}?(?:(?:[,;:]|\s[—–-]\s)\s*|\s+)(?:but|rather|instead)\b/giu,
  },
  {
    id: 'EN-REPEATED-SUBJECT',
    regex: /\b(she|he|it|they|this|that)\s*(?:(?:is|are|was|were)\s+(?:not|no)|isn't|aren't|wasn't|weren't|'s\s+no|'re\s+no)\s+[^\n]{1,160}?[.!?;,:—–]\s*\1\s*(?:is|are|was|were|'s|'re)\b[^.!?\n]{1,160}/giu,
  },
  {
    id: 'EN-NAMED-SUBJECT',
    regex: /(?<![\p{L}\p{N}_])(?!(?:She|He|It|They|This|That)\b)([A-Z][\p{L}'-]{1,40})\s+(?:(?:is|was)\s+(?:not|no)|isn't|wasn't)\s+[^\n]{1,160}?[.!?;,:—–]\s*\1\s+(?:is|was|'s)\b[^.!?\n]{1,160}/gu,
  },
  {
    id: 'RU-NE-A-NO',
    regex: /(?<![\p{L}\p{N}_])не\s+(?:(?:просто|только|всего\s+лишь)\s+)?[^.!?\n]{1,160}?(?:(?:[,;:]|\s[—–-]\s)\s*|\s+)(?:а|но|зато|скорее|вместо)(?![\p{L}\p{N}_])/giu,
  },
  {
    id: 'RU-REPEATED-SUBJECT',
    regex: /(?<![\p{L}\p{N}_])(она|он|оно|они|это)\s+(?:(?:был(?:а|о|и)?|являл(?:ся|ась|ись))\s+)?не\s+[^\n]{1,160}?[.!?;,:—–]\s*\1\s+(?:(?:был(?:а|о|и)?|являл(?:ся|ась|ись))\s+)?[^.!?\n]{1,160}/giu,
  },
  {
    id: 'RU-NAMED-SUBJECT',
    regex: /(?<![\p{L}\p{N}_])([А-ЯЁ][а-яё-]{1,40})\s+(?:(?:был(?:а|о|и)?|являл(?:ся|ась|ись))\s+)?не\s+[^\n]{1,160}?[.!?;,:—–]\s*\1\s+(?:(?:был(?:а|о|и)?|являл(?:ся|ась|ись))\s+)?[^.!?\n]{1,160}/gu,
  },
]);

function pushSegment(segments, field, value) {
  if (typeof value === 'string' && value.trim()) segments.push({ field, text: value });
}

function entryRows(value) {
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry]);
  if (isPlainObject(value)) return Object.entries(value);
  return [];
}

export function collectStyleSegments(artifact) {
  if (typeof artifact === 'string') return [{ field: '$', text: artifact }];
  if (!isPlainObject(artifact)) return [];
  const segments = [];
  const card = isPlainObject(artifact.data) ? artifact.data : artifact;
  const prefix = card === artifact ? '' : 'data.';
  for (const field of CARD_PROSE_FIELDS) pushSegment(segments, `${prefix}${field}`, card[field]);
  if (Array.isArray(card.alternate_greetings)) {
    card.alternate_greetings.forEach((value, index) => pushSegment(segments, `${prefix}alternate_greetings[${index}]`, value));
  }

  const containers = [
    ['entries', artifact.entries],
    ['character_book.entries', artifact.character_book?.entries],
    ['data.character_book.entries', artifact.data?.character_book?.entries],
  ];
  const visited = new Set();
  for (const [containerPath, value] of containers) {
    if (!value || visited.has(value)) continue;
    visited.add(value);
    for (const [key, entry] of entryRows(value)) {
      if (isPlainObject(entry)) pushSegment(segments, `${containerPath}[${entry.uid ?? entry.id ?? key}].content`, entry.content);
    }
  }
  return segments;
}

export function findForbiddenContrast(text) {
  const matches = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of String(text ?? '').matchAll(pattern.regex)) {
      matches.push({
        patternId: pattern.id,
        index: match.index,
        excerpt: match[0].replace(/\s+/gu, ' ').trim(),
      });
    }
  }
  return matches.sort((a, b) => a.index - b.index || a.patternId.localeCompare(b.patternId));
}

export function validateStyle(artifact) {
  const report = new Report('Contrastive Negation Style Validation', { service: 'style', operation: 'validate' });
  const segments = collectStyleSegments(artifact);
  if (!segments.length) {
    report.error('No character or lorebook prose fields were found', {
      code: 'STYLE_NO_PROSE', ruleId: 'ACE-STYLE-001', field: '$',
    });
  }
  const violations = [];
  for (const segment of segments) {
    for (const match of findForbiddenContrast(segment.text)) {
      const violation = { field: segment.field, ...match };
      violations.push(violation);
      report.error(`Forbidden contrastive-negation construction (${match.patternId}): ${match.excerpt}`, {
        code: 'STYLE_CONTRASTIVE_NEGATION', ruleId: 'ACE-STYLE-001', field: segment.field, details: violation,
      });
    }
  }
  report.addEvidence({ kind: 'style-pattern-scan', segmentCount: segments.length, violationCount: violations.length, patternIds: FORBIDDEN_PATTERNS.map((item) => item.id) });
  report.setData({ segmentCount: segments.length, violations });
  return report.toJSON();
}

export const STYLE_SERVICE = Object.freeze({
  name: 'style',
  collectSegments: collectStyleSegments,
  findForbiddenContrast,
  validate: validateStyle,
});
