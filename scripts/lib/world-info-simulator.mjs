/** Deterministic, runtime-independent model of the SillyTavern World Info pipeline.
 *
 * The behavior in this file follows the official SillyTavern `release` branch.
 * Runtime-only effects (Quick Reply execution and real embeddings) remain explicit adapters.
 */

const POSITION_NAMES = Object.freeze({
  0: 'before_char',
  1: 'after_char',
  2: 'top_an',
  3: 'bottom_an',
  4: 'at_depth',
  5: 'em_top',
  6: 'em_bottom',
  7: 'outlet',
});
const POSITION_RANK = Object.freeze({
  before_char: 0,
  after_char: 1,
  before_example: 2,
  em_top: 2,
  after_example: 3,
  em_bottom: 3,
  top_an: 4,
  author_note: 4,
  bottom_an: 5,
  at_depth: 6,
  outlet: 7,
});
const GENERATION_TYPES = new Set(['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet']);
const SOURCE_STRATEGIES = Object.freeze({
  evenly: 0,
  character_first: 1,
  global_first: 2,
});
const DEFAULTS = Object.freeze({
  scanDepth: 2,
  minActivations: 0,
  minActivationsDepthMax: 0,
  includeNames: true,
  recursiveScanning: false,
  caseSensitive: false,
  matchWholeWords: false,
  useGroupScoring: false,
  sourceStrategy: SOURCE_STRATEGIES.character_first,
  maxRecursionSteps: 0,
  entryOrder: 100,
  entryDepth: 4,
  groupWeight: 100,
  vectorQueryMessages: 2,
  vectorScoreThreshold: 0.25,
  vectorMaxEntries: 5,
});
const KNOWN_FIELDS = new Set([
  'id', 'uid', 'key', 'keys', 'keysecondary', 'secondary_keys', 'content', 'comment',
  'constant', 'vectorized', 'selective', 'selectiveLogic', 'secondary_logic',
  'keysecondarylogic', 'order', 'insertion_order', 'position', 'depth', 'role',
  'outlet', 'outletName', 'automationId', 'automation_id', 'enabled', 'disable',
  'probability', 'useProbability', 'ignoreBudget', 'excludeRecursion',
  'preventRecursion', 'delayUntilRecursion', 'group', 'groups', 'groupOverride',
  'groupWeight', 'important', 'prioritize', 'sticky', 'cooldown', 'delay',
  'characterFilter', 'personaFilter', 'tagFilter', 'generationTypeFilter',
  'triggers', 'scanDepth', 'scan_depth', 'scanSources', 'scan_sources',
  'caseSensitive', 'matchWholeWords', 'wholeWords', 'useGroupScoring',
  'matchPersonaDescription', 'matchCharacterDescription',
  'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario',
  'matchCreatorNotes', 'use_regex', 'extensions', 'scope',
]);

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}
function array(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
function finiteInteger(value, fallback = 0, min = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min ? number : fallback;
}
function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function hashSeed(seed) {
  const text = typeof seed === 'string' ? seed : JSON.stringify(seed ?? 0);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function stableEntryHash(entry) {
  const {
    entryHash: _entryHash,
    index: _index,
    sourceKey: _sourceKey,
    containerPath: _containerPath,
    ...behavior
  } = entry;
  return hashSeed(stableJson(behavior));
}
function strategyValue(value) {
  if (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 2) return Number(value);
  const text = String(value ?? '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  return Object.hasOwn(SOURCE_STRATEGIES, text) ? SOURCE_STRATEGIES[text] : DEFAULTS.sourceStrategy;
}
function sourceBucket(sourceKind, strategy) {
  if (sourceKind === 'chat') return 0;
  if (sourceKind === 'persona') return 1;
  if (strategy === SOURCE_STRATEGIES.evenly) return 2;
  if (strategy === SOURCE_STRATEGIES.global_first) return sourceKind === 'global' ? 2 : 3;
  return sourceKind === 'character' ? 2 : 3;
}
function activationCompare(a, b, strategy = DEFAULTS.sourceStrategy) {
  const aEntry = a.entry ?? a;
  const bEntry = b.entry ?? b;
  const constantOrder = Number(Boolean(bEntry.constant)) - Number(Boolean(aEntry.constant));
  if (constantOrder) return constantOrder;
  const sourceOrder = sourceBucket(aEntry.sourceKind, strategy) - sourceBucket(bEntry.sourceKind, strategy);
  if (sourceOrder) return sourceOrder;
  return (bEntry.order - aEntry.order)
    || (aEntry.index - bEntry.index)
    || String(aEntry.id).localeCompare(String(bEntry.id));
}
function synchronous(value, label) {
  if (value && typeof value.then === 'function') {
    throw new Error(`${label} returned a Promise; deterministic simulation requires a synchronous adapter`);
  }
  return value;
}

export function createSeededPrng(seed = 0) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  let count = 0;
  return Object.freeze({
    next(label = 'roll') {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      count += 1;
      return { value: result, label, index: count };
    },
    snapshot() {
      return { seed, state: state >>> 0, rolls: count };
    },
  });
}

export class FakeVectorProvider {
  constructor(candidates = []) {
    this.candidates = candidates;
    this.kind = 'fake';
  }

  embed({ texts }) {
    return array(texts).map((text) => deterministicEmbedding(text));
  }

  retrieve({
    query,
    queryEmbedding,
    entries,
    entryEmbeddings,
    maxEntries = DEFAULTS.vectorMaxEntries,
    threshold = DEFAULTS.vectorScoreThreshold,
  }) {
    const supplied = this.candidates.length
      ? this.candidates
      : entries.map((entry, index) => ({
        id: entry.id,
        score: queryEmbedding && entryEmbeddings?.[index]
          ? cosine(queryEmbedding, entryEmbeddings[index])
          : lexicalScore(query, entry.content),
      }));
    return supplied
      .map((item) => ({ id: String(item.id), score: Number(item.score) }))
      .filter((item) => Number.isFinite(item.score) && item.score >= threshold)
      .sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, maxEntries));
  }

  query(request) {
    return this.retrieve(request);
  }
}

function deterministicEmbedding(text, dimensions = 16) {
  const vector = Array(dimensions).fill(0);
  for (const token of String(text).toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    vector[hashSeed(token) % dimensions] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}
function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}
function lexicalScore(query, content) {
  const words = new Set(String(query).toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  const target = new Set(String(content).toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  if (!words.size) return 0;
  let hits = 0;
  for (const word of words) if (target.has(word)) hits += 1;
  return hits / words.size;
}
function closestField(field) {
  let winner = null;
  let distance = Infinity;
  for (const candidate of KNOWN_FIELDS) {
    const current = editDistance(field, candidate);
    if (current < distance) {
      winner = candidate;
      distance = current;
    }
  }
  return distance <= 3 ? winner : null;
}
function editDistance(a, b) {
  const left = String(a);
  const right = String(b);
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + Number(left[i - 1] !== right[j - 1]),
      );
    }
  }
  return matrix[left.length][right.length];
}
function sourceKindFrom(scope, fallback = 'global') {
  const value = String(scope ?? fallback).toLowerCase();
  if (value.includes('chat')) return 'chat';
  if (value.includes('persona')) return 'persona';
  if (value.includes('character') || value.includes('embedded')) return 'character';
  return 'global';
}
function normalizeCharacterFilter(value, legacyTags = []) {
  if (Array.isArray(value)) {
    return { isExclude: false, names: value.map(String), tags: array(legacyTags).map(String) };
  }
  if (value && typeof value === 'object') {
    return {
      isExclude: Boolean(value.isExclude ?? value.exclude),
      names: array(value.names ?? value.characters).map(String),
      tags: array(value.tags).map(String),
    };
  }
  return { isExclude: false, names: [], tags: array(legacyTags).map(String) };
}
function normalizeEntries(input, errors, warnings) {
  const root = input?.lorebook ?? input?.artifact ?? input ?? {};
  const candidates = [
    ['entries', root.entries, 'global'],
    ['character_book.entries', root.character_book?.entries, 'embedded-character'],
    ['data.character_book.entries', root.data?.character_book?.entries, 'embedded-character'],
  ];
  const present = candidates.filter(([, value]) => Array.isArray(value) || (value && typeof value === 'object'));
  if (present.length > 1) {
    errors.push({
      code: 'ATTACHMENT_CONFLICT',
      message: 'Multiple primary lorebook containers are attached',
      paths: present.map(([path]) => path),
    });
  }
  const containers = present.length ? [present[0]] : [['entries', [], 'global']];

  for (const [index, book] of array(input.additionalCharacterLorebooks ?? input.additional_character_lorebooks).entries()) {
    const raw = book?.entries ?? book?.character_book?.entries ?? book?.data?.character_book?.entries;
    if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
      containers.push([`additionalCharacterLorebooks.${index}.entries`, raw, book?.scope ?? 'character']);
    } else {
      errors.push({ code: 'ATTACHMENT_CONTAINER_MISSING', fieldPath: `additionalCharacterLorebooks.${index}` });
    }
  }

  for (const [index, book] of array(input.chatLorebooks ?? input.chat_lorebooks).entries()) {
    const raw = book?.entries ?? book;
    if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
      containers.push([`chatLorebooks.${index}.entries`, raw, 'chat']);
    }
  }
  for (const [index, book] of array(input.personaLorebooks ?? input.persona_lorebooks).entries()) {
    const raw = book?.entries ?? book;
    if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
      containers.push([`personaLorebooks.${index}.entries`, raw, 'persona']);
    }
  }

  const containerPath = containers.length === 1 ? containers[0][0] : 'multiple';
  const records = containers.flatMap(([path, raw, scope]) => {
    const pairs = Array.isArray(raw)
      ? raw.map((entry, index) => [String(index), entry])
      : Object.entries(raw ?? {});
    return pairs.map(([sourceKey, entry]) => ({ path, scope, sourceKey, entry }));
  });

  const localIds = new Set();
  const entries = records.map(({ path, scope, sourceKey, entry }, index) => {
    const ext = entry?.extensions ?? {};
    const artifactId = String(entry?.uid ?? entry?.id ?? sourceKey ?? index);
    const localId = `${path}#${artifactId}`;
    const id = path === 'entries' || path === 'character_book.entries' || path === 'data.character_book.entries'
      ? artifactId
      : localId;
    if (localIds.has(localId)) {
      errors.push({ code: 'DUPLICATE_ENTRY_ID', entryId: id, artifactId, fieldPath: `${path}.${sourceKey}` });
    }
    localIds.add(localId);

    for (const field of Object.keys(entry ?? {})) {
      if (!KNOWN_FIELDS.has(field)) {
        const suggestion = closestField(field);
        if (suggestion) {
          errors.push({
            code: 'UNKNOWN_FIELD',
            entryId: id,
            fieldPath: `${path}.${sourceKey}.${field}`,
            suggestion,
          });
        }
      }
    }

    const declaredGroups = [...array(entry?.group), ...array(entry?.groups)]
      .flatMap((group) => typeof group === 'string' ? group.split(',') : [group]);
    declaredGroups.forEach((group, groupIndex) => {
      if (typeof group !== 'string' || !group.trim()) {
        errors.push({
          code: 'GROUP_NAME_INVALID',
          entryId: id,
          fieldPath: `${path}.${sourceKey}.groups.${groupIndex}`,
        });
      }
    });
    if (own(entry, 'groupWeight') && (!Number.isFinite(Number(entry.groupWeight)) || Number(entry.groupWeight) <= 0)) {
      errors.push({ code: 'GROUP_WEIGHT_INVALID', entryId: id, fieldPath: `${path}.${sourceKey}.groupWeight` });
    }
    const hasGroup = declaredGroups.some((group) => typeof group === 'string' && group.trim());
    if ((entry?.groupOverride === true || entry?.important === true || entry?.prioritize === true) && !hasGroup) {
      errors.push({ code: 'GROUP_OVERRIDE_WITHOUT_GROUP', entryId: id, fieldPath: `${path}.${sourceKey}.groupOverride` });
    }

    const invalidTimed = ['delay', 'sticky', 'cooldown'].filter((field) => own(entry, field)
      && (!Number.isInteger(Number(entry[field])) || Number(entry[field]) < 0 || Number(entry[field]) > 100000));
    for (const field of invalidTimed) {
      errors.push({
        code: 'TIMED_VALUE_INVALID',
        entryId: id,
        fieldPath: `${path}.${sourceKey}.${field}`,
        value: entry[field],
      });
    }

    const position = POSITION_NAMES[entry?.position]
      ?? entry?.position
      ?? POSITION_NAMES[ext.position]
      ?? ext.position
      ?? 'before_char';
    if (!(position in POSITION_RANK)) {
      errors.push({
        code: 'POSITION_INVALID',
        entryId: id,
        fieldPath: `${path}.${sourceKey}.position`,
        value: position,
      });
    }
    const roleRaw = entry?.role ?? ext.role ?? 'system';
    const role = typeof roleRaw === 'number'
      ? ({ 0: 'system', 1: 'user', 2: 'assistant' }[roleRaw] ?? roleRaw)
      : roleRaw;
    if (!['system', 'user', 'assistant'].includes(role)) {
      errors.push({ code: 'ROLE_INVALID', entryId: id, fieldPath: `${path}.${sourceKey}.role`, value: role });
    }

    const outletName = String(
      entry?.outletName
      ?? ext.outlet_name
      ?? (position === 'outlet' ? entry?.outlet : '')
      ?? '',
    );
    if (position === 'outlet' && !outletName.trim()) {
      warnings.push({
        code: 'OUTLET_NAME_MISSING',
        entryId: id,
        message: 'SillyTavern skips outlet entries without an Outlet Name',
      });
    }

    const normalized = {
      ...entry,
      id,
      artifactId,
      index,
      sourceKey,
      containerPath: path,
      enabled: entry?.disable !== true && entry?.enabled !== false,
      invalid: invalidTimed.length > 0,
      keys: array(entry?.key ?? entry?.keys).filter((key) => typeof key === 'string'),
      secondaryKeys: array(entry?.keysecondary ?? entry?.secondary_keys).filter((key) => typeof key === 'string'),
      selective: entry?.selective !== false,
      selectiveLogic: Number(
        entry?.selectiveLogic
        ?? ext.selectiveLogic
        ?? entry?.keysecondarylogic
        ?? entry?.secondary_logic
        ?? 0
      ),
      order: finiteInteger(entry?.order ?? entry?.insertion_order, DEFAULTS.entryOrder),
      position,
      depth: finiteInteger(entry?.depth ?? ext.depth, DEFAULTS.entryDepth),
      role,
      outlet: (entry?.outlet ?? outletName) || null,
      outletName,
      groups: [...new Set(
        declaredGroups
          .filter((group) => typeof group === 'string' && group.trim())
          .map((group) => group.trim())
      )],
      groupWeight: Number.isFinite(Number(entry?.groupWeight ?? ext.group_weight))
        && Number(entry?.groupWeight ?? ext.group_weight) > 0
        ? Number(entry?.groupWeight ?? ext.group_weight)
        : DEFAULTS.groupWeight,
      groupOverride: Boolean(entry?.groupOverride ?? ext.group_override ?? entry?.important ?? entry?.prioritize),
      useGroupScoring: entry?.useGroupScoring ?? ext.use_group_scoring ?? null,
      automationId: String(entry?.automationId ?? entry?.automation_id ?? ext.automation_id ?? ''),
      scanDepth: own(entry, 'scanDepth') || own(entry, 'scan_depth') || own(ext, 'scan_depth')
        ? finiteInteger(entry?.scanDepth ?? entry?.scan_depth ?? ext.scan_depth, 0)
        : null,
      caseSensitive: entry?.caseSensitive ?? ext.case_sensitive ?? null,
      matchWholeWords: entry?.matchWholeWords ?? entry?.wholeWords ?? ext.match_whole_words ?? null,
      matchPersonaDescription: Boolean(entry?.matchPersonaDescription ?? ext.match_persona_description),
      matchCharacterDescription: Boolean(entry?.matchCharacterDescription ?? ext.match_character_description),
      matchCharacterPersonality: Boolean(entry?.matchCharacterPersonality ?? ext.match_character_personality),
      matchCharacterDepthPrompt: Boolean(entry?.matchCharacterDepthPrompt ?? ext.match_character_depth_prompt),
      matchScenario: Boolean(entry?.matchScenario ?? ext.match_scenario),
      matchCreatorNotes: Boolean(entry?.matchCreatorNotes ?? ext.match_creator_notes),
      scanSources: array(entry?.scanSources ?? entry?.scan_sources).map(String),
      characterFilter: normalizeCharacterFilter(entry?.characterFilter, entry?.tagFilter),
      personaFilter: array(entry?.personaFilter).map(String),
      triggers: array(entry?.triggers ?? entry?.generationTypeFilter).map(String),
      sourceKind: sourceKindFrom(entry?.scope, sourceKindFrom(scope)),
      scope: entry?.scope ?? scope,
      sticky: finiteInteger(entry?.sticky, 0),
      cooldown: finiteInteger(entry?.cooldown, 0),
      delay: finiteInteger(entry?.delay, 0),
      vectorized: Boolean(entry?.vectorized ?? ext.vectorized),
      ignoreBudget: Boolean(entry?.ignoreBudget ?? ext.ignore_budget),
      excludeRecursion: Boolean(entry?.excludeRecursion ?? ext.exclude_recursion),
      preventRecursion: Boolean(entry?.preventRecursion ?? ext.prevent_recursion),
      delayUntilRecursion: finiteInteger(entry?.delayUntilRecursion ?? ext.delay_until_recursion, 0),
      probability: Number.isFinite(Number(entry?.probability ?? ext.probability))
        ? Number(entry?.probability ?? ext.probability)
        : 100,
      useProbability: entry?.useProbability ?? ext.useProbability ?? true,
      constant: Boolean(entry?.constant),
      content: String(entry?.content ?? ''),
    };
    normalized.entryHash = stableEntryHash(normalized);
    return normalized;
  });

  return { containerPath, entries };
}

function validateAttachments(entries, input, errors, blockers) {
  const attachments = input.attachments ?? {};
  for (const [scope, values] of Object.entries(attachments)) {
    if (!Array.isArray(values)) continue;
    const ids = values.map((value, index) => String(
      value?.bindingId ?? value?.id ?? value?.path ?? (typeof value === 'string' ? value : index)
    ));
    if (new Set(ids).size !== ids.length) {
      errors.push({ code: 'DUPLICATE_SCOPE_ATTACHMENT', scope });
    }
  }
  for (const entry of entries) {
    if (entry.sourceKind === 'persona' && !input.persona) {
      blockers.push({ code: 'SCOPE_ATTACHMENT_MISSING', scope: 'persona', entryId: entry.id });
    }
    if (entry.sourceKind === 'chat' && !(input.chatMetadata ?? input.chat_metadata)) {
      blockers.push({ code: 'SCOPE_ATTACHMENT_MISSING', scope: 'chat', entryId: entry.id });
    }
    if (entry.sourceKind === 'character' && !input.character && !entry.containerPath.includes('character_book')) {
      blockers.push({
        code: 'CHARACTER_CONTEXT_UNAVAILABLE',
        entryId: entry.id,
        message: 'Character-scoped lore requires character context',
      });
    }
  }
}
function validateSimulationCombinations(entries, blockers) {
  for (const entry of entries) {
    if (entry.position === 'at_depth' && !Number.isInteger(entry.depth)) {
      blockers.push({ code: 'AT_DEPTH_RUNTIME_REQUIRED', entryId: entry.id });
    }
  }
}
function recursionGraph(entries, settings) {
  const edges = [];
  for (const source of entries) {
    if (source.preventRecursion) continue;
    for (const target of entries) {
      if (target.excludeRecursion) continue;
      const searchable = String(source.content ?? '');
      if (target.keys.some((key) => regexOrTextMatch(key, searchable, {
        caseSensitive: target.caseSensitive ?? Boolean(settings.caseSensitive ?? settings.case_sensitive ?? DEFAULTS.caseSensitive),
        wholeWords: target.matchWholeWords ?? Boolean(settings.matchWholeWords ?? settings.wholeWords ?? DEFAULTS.matchWholeWords),
      }).matched)) {
        edges.push([source.id, target.id]);
      }
    }
  }
  const adjacency = new Map(entries.map((entry) => [entry.id, []]));
  for (const [from, to] of edges) adjacency.get(from)?.push(to);
  const cycles = [];
  const walk = (node, path) => {
    const index = path.indexOf(node);
    if (index >= 0) {
      cycles.push([...path.slice(index), node]);
      return;
    }
    if (path.length > entries.length) return;
    for (const next of adjacency.get(node) ?? []) walk(next, [...path, node]);
  };
  for (const entry of entries) walk(entry.id, []);
  const unique = [];
  const keys = new Set();
  for (const cycle of cycles) {
    const key = cycle.join('>');
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(cycle);
    }
  }
  return { edges, cycles: unique };
}
function normalizeMessage(message, includeNames) {
  if (typeof message === 'string') return message.trim();
  const content = String(message?.content ?? message?.mes ?? '');
  if (!includeNames) return content.trim();
  const name = message?.name ?? message?.speaker ?? message?.role;
  return name ? `${name}: ${content}`.trim() : content.trim();
}
function resolveSettings(input) {
  const raw = { ...(input.lorebook?.settings ?? input.settings ?? input.globalSettings ?? {}) };
  return {
    ...raw,
    scanDepth: finiteInteger(raw.scanDepth ?? raw.scan_depth ?? raw.world_info_depth, DEFAULTS.scanDepth),
    minActivations: finiteInteger(
      raw.minActivations ?? raw.min_activations ?? raw.world_info_min_activations,
      DEFAULTS.minActivations,
    ),
    minActivationsDepthMax: finiteInteger(
      raw.minActivationsDepthMax
      ?? raw.min_activations_depth_max
      ?? raw.world_info_min_activations_depth_max,
      DEFAULTS.minActivationsDepthMax,
    ),
    includeNames: raw.includeNames ?? raw.include_names ?? raw.world_info_include_names ?? DEFAULTS.includeNames,
    recursiveScanning: raw.recursiveScanning
      ?? raw.recursive_scanning
      ?? raw.world_info_recursive
      ?? DEFAULTS.recursiveScanning,
    caseSensitive: raw.caseSensitive
      ?? raw.case_sensitive
      ?? raw.world_info_case_sensitive
      ?? DEFAULTS.caseSensitive,
    matchWholeWords: raw.matchWholeWords
      ?? raw.wholeWords
      ?? raw.match_whole_words
      ?? raw.world_info_match_whole_words
      ?? DEFAULTS.matchWholeWords,
    useGroupScoring: raw.useGroupScoring
      ?? raw.use_group_scoring
      ?? raw.world_info_use_group_scoring
      ?? DEFAULTS.useGroupScoring,
    sourceStrategy: strategyValue(
      raw.sourceStrategy
      ?? raw.characterStrategy
      ?? raw.world_info_character_strategy
      ?? DEFAULTS.sourceStrategy,
    ),
    maxRecursionSteps: finiteInteger(
      raw.maxRecursionSteps ?? raw.max_recursion_steps ?? raw.world_info_max_recursion_steps,
      DEFAULTS.maxRecursionSteps,
    ),
    legacyMaxRecursionDepth: own(raw, 'maxRecursionDepth') || own(raw, 'max_recursion_depth')
      ? finiteInteger(raw.maxRecursionDepth ?? raw.max_recursion_depth, 0)
      : null,
    tokenBudget: finiteInteger(raw.tokenBudget ?? raw.token_budget, Number.MAX_SAFE_INTEGER),
  };
}
function buildEntryScanBuffer(entry, input, settings, {
  scanSkew = 0,
  scanState = 'INITIAL',
  recursiveText = '',
} = {}) {
  const history = array(input.history ?? input.messages);
  const includeNames = Boolean(settings.includeNames);
  const baseDepth = entry.scanDepth ?? settings.scanDepth;
  const effectiveDepth = entry.scanDepth == null ? baseDepth + scanSkew : baseDepth;
  const selected = new Set(entry.scanSources);
  const explicit = selected.size > 0;
  const allows = (...names) => !explicit || names.some((name) => selected.has(name));
  const sliced = effectiveDepth <= 0 || !allows('history') ? [] : history.slice(-effectiveDepth);
  const segments = sliced.map((message, index) => ({
    source: 'history',
    index: history.length - sliced.length + index,
    text: normalizeMessage(message, includeNames),
    supplied: true,
  }));

  const character = input.character ?? {};
  const persona = input.persona ?? {};
  const metadata = input.chatMetadata ?? input.chat_metadata ?? {};
  const add = (enabled, source, text) => {
    if (enabled && text) segments.push({ source, index: 0, text: String(text), supplied: true });
  };
  add(allows('persona_description') && (entry.matchPersonaDescription || settings.matchPersonaDescription || settings.scanPersona), 'persona_description', persona.description);
  add(allows('character_description') && (entry.matchCharacterDescription || settings.matchCharacterDescription || settings.scanCharacter), 'character_description', character.description);
  add(allows('character_personality') && (entry.matchCharacterPersonality || settings.matchCharacterPersonality), 'character_personality', character.personality);
  add(allows('character_note', 'character_depth_prompt') && (entry.matchCharacterDepthPrompt || settings.matchCharacterDepthPrompt), 'character_note', character.note ?? character.depthPrompt);
  add(allows('scenario') && (entry.matchScenario || settings.matchScenario), 'scenario', character.scenario);
  add(allows('creator_notes') && (entry.matchCreatorNotes || settings.matchCreatorNotes), 'creator_notes', character.creatorNotes);
  add(allows('chat_metadata') && settings.scanChatMetadata, 'chat_metadata', Object.values(metadata).flat().join(' '));

  for (const [index, prompt] of array(input.scanInjections ?? input.extensionPrompts).entries()) {
    const text = typeof prompt === 'string' ? prompt : prompt?.text ?? prompt?.value;
    if (text) segments.push({ source: 'extension_prompt', index, text: String(text), supplied: true });
  }
  if (recursiveText && scanState !== 'MIN_ACTIVATIONS') {
    segments.push({ source: 'recursion', index: 0, text: recursiveText, supplied: false });
  }

  const joiner = '\n\x01';
  const text = segments.length ? `\x01${segments.map((segment) => segment.text).join(joiner)}` : '';
  return { text, segments, scanDepth: effectiveDepth, scanState };
}
function regexOrTextMatch(key, text, { caseSensitive = false, wholeWords = false } = {}) {
  if (!key) return { matched: false, code: 'KEY_EMPTY' };
  const source = String(key);
  if (source.startsWith('/')) {
    const last = source.lastIndexOf('/');
    if (last > 0) {
      try {
        const regex = new RegExp(source.slice(1, last), source.slice(last + 1));
        return { matched: regex.test(text), code: 'REGEX' };
      } catch (error) {
        return { matched: false, code: 'REGEX_INVALID', error: error.message };
      }
    }
  }
  const needle = caseSensitive ? source : source.toLowerCase();
  const haystack = caseSensitive ? String(text) : String(text).toLowerCase();
  if (!wholeWords) return { matched: haystack.includes(needle), code: 'TEXT' };
  const words = needle.split(/\s+/);
  if (words.length > 1) return { matched: haystack.includes(needle), code: 'TEXT_MULTIWORD' };
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    matched: new RegExp(`(?:^|\\W)(${escaped})(?:$|\\W)`, caseSensitive ? '' : 'i').test(String(text)),
    code: 'TEXT_WHOLE',
  };
}
function evaluateKeys(entry, scanText, settings) {
  if (entry.constant) {
    return {
      matched: true,
      type: 'constant',
      primary: [],
      secondary: [],
      score: 0,
      selective: null,
    };
  }
  const matchSettings = {
    caseSensitive: entry.caseSensitive ?? settings.caseSensitive,
    wholeWords: entry.matchWholeWords ?? settings.matchWholeWords,
  };
  const primary = entry.keys.map((key) => ({ key, ...regexOrTextMatch(key, scanText, matchSettings) }));
  const secondary = entry.secondaryKeys.map((key) => ({ key, ...regexOrTextMatch(key, scanText, matchSettings) }));
  const primaryHits = primary.filter((item) => item.matched).length;
  const secondaryHits = secondary.filter((item) => item.matched).length;
  const primaryHit = primaryHits > 0;
  if (!entry.selective || secondary.length === 0) {
    return {
      matched: primaryHit,
      type: 'normal',
      primary,
      secondary,
      score: primaryHits,
      selective: null,
    };
  }
  const logic = Number(entry.selectiveLogic);
  const all = secondaryHits === secondary.length;
  const any = secondaryHits > 0;
  const secondaryHit = logic === 0
    ? any
    : logic === 1
      ? !all
      : logic === 2
        ? !any
        : logic === 3
          ? all
          : false;
  const score = logic === 0
    ? primaryHits + secondaryHits
    : logic === 3 && all
      ? primaryHits + secondaryHits
      : primaryHits;
  return {
    matched: Number.isInteger(logic) && logic >= 0 && logic <= 3 && primaryHit && secondaryHit,
    type: 'selective',
    primary,
    secondary,
    score,
    selective: {
      logic,
      valid: Number.isInteger(logic) && logic >= 0 && logic <= 3,
      primaryHit,
      secondaryHit,
      hits: secondaryHits,
    },
  };
}
function currentCharacterNames(input) {
  const character = input.character ?? {};
  const avatar = String(character.avatar ?? '').replace(/\.[^/.]+$/, '');
  return new Set([character.name, avatar].filter(Boolean).map(String));
}
function currentCharacterTags(input) {
  return new Set([
    ...array(input.character?.tags),
    ...array(input.chatMetadata?.tags ?? input.chat_metadata?.tags),
  ].map(String));
}
function filterEntry(entry, input, settings) {
  const checks = [];
  const names = currentCharacterNames(input);
  const tags = currentCharacterTags(input);
  const filter = entry.characterFilter;
  if (filter.names.length || filter.tags.length) {
    const nameMatch = filter.names.some((name) => names.has(String(name)));
    const tagMatch = filter.tags.some((tag) => tags.has(String(tag)));
    const selected = nameMatch || tagMatch;
    checks.push({
      filter: 'character',
      mode: filter.isExclude ? 'exclude' : 'include',
      expectedNames: filter.names,
      expectedTags: filter.tags,
      actualNames: [...names],
      actualTags: [...tags],
      passed: filter.isExclude ? !selected : selected,
    });
  }
  if (entry.personaFilter.length) {
    const actual = String(input.persona?.name ?? '');
    checks.push({
      filter: 'persona',
      expected: entry.personaFilter,
      actual,
      passed: entry.personaFilter.includes(actual),
    });
  }
  const generation = String(input.generationType ?? input.generation_type ?? 'normal');
  if (entry.triggers.length) {
    checks.push({
      filter: 'generationType',
      expected: entry.triggers,
      actual: generation,
      passed: entry.triggers.includes(generation),
    });
  }
  return { passed: checks.every((check) => check.passed), checks };
}
function normalizeState(value = {}) {
  const cloned = value && typeof value === 'object' ? structuredClone(value) : {};
  return {
    version: 2,
    messageNumber: Number.isInteger(cloned.messageNumber) ? cloned.messageNumber : null,
    branchId: cloned.branchId ?? null,
    entries: cloned.entries && typeof cloned.entries === 'object' ? cloned.entries : {},
  };
}
function prepareTimedState(state, entries, input, messageNumber, trace) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const mutation = String(input.chatMutation ?? input.chat_mutation ?? '').toLowerCase();
  for (const [id, effect] of Object.entries(state.entries)) {
    const entry = byId.get(id);
    if (!entry || (effect.entryHash != null && Number(effect.entryHash) !== Number(entry.entryHash))) {
      delete state.entries[id];
      trace.timedInvalidations.push({ entryId: id, reason: entry ? 'ENTRY_HASH_CHANGED' : 'ENTRY_MISSING' });
      continue;
    }
    if (mutation === 'swipe' || mutation === 'delete') {
      delete state.entries[id];
      trace.timedInvalidations.push({ entryId: id, reason: `CHAT_${mutation.toUpperCase()}` });
      continue;
    }
    if (mutation !== 'branch' && Number.isInteger(effect.lastActivated) && messageNumber <= effect.lastActivated) {
      delete state.entries[id];
      trace.timedInvalidations.push({ entryId: id, reason: 'CHAT_NOT_ADVANCED' });
    }
  }
}
function timedDecision(entry, state, messageNumber) {
  const previous = state.entries[entry.id] ?? {};
  if (messageNumber < entry.delay) {
    return { passed: false, forced: false, code: 'TIMED_DELAY', previous, delay: entry.delay };
  }
  if (previous.stickyUntil != null
    && messageNumber > previous.lastActivated
    && messageNumber <= previous.stickyUntil) {
    return { passed: true, forced: true, code: 'TIMED_STICKY_ACTIVE', previous };
  }
  if (previous.cooldownStartsAt != null
    && messageNumber >= previous.cooldownStartsAt
    && messageNumber <= previous.cooldownUntil) {
    return { passed: false, forced: false, code: 'TIMED_COOLDOWN', previous };
  }
  return { passed: true, forced: false, code: 'TIMED_ELIGIBLE', previous };
}
function setTimedEffect(state, entry, messageNumber) {
  const prior = state.entries[entry.id];
  if (prior && (
    (prior.stickyUntil != null && messageNumber <= prior.stickyUntil)
    || (prior.cooldownUntil != null && messageNumber <= prior.cooldownUntil)
  )) {
    return;
  }
  const stickyUntil = entry.sticky ? messageNumber + entry.sticky : null;
  const base = stickyUntil ?? messageNumber;
  state.entries[entry.id] = {
    lastActivated: messageNumber,
    stickyUntil,
    cooldownStartsAt: entry.cooldown ? base + 1 : null,
    cooldownUntil: entry.cooldown ? base + entry.cooldown : null,
    entryHash: entry.entryHash,
  };
}
function resolvedGroupScoring(entry, settings) {
  return entry.useGroupScoring ?? Boolean(settings.useGroupScoring);
}
function removeCandidate(active, candidate) {
  const index = active.indexOf(candidate);
  if (index >= 0) active.splice(index, 1);
}
function applyGroups(candidates, prng, trace, settings, activatedGroups) {
  const active = [...candidates];
  const grouped = new Map();
  for (const candidate of candidates) {
    for (const group of candidate.entry.groups) {
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(candidate);
    }
  }

  for (const [groupName, originalMembers] of grouped) {
    let members = originalMembers.filter((candidate) => active.includes(candidate));
    if (!members.length) continue;
    const row = {
      group: groupName,
      groups: [groupName],
      members: members.map((candidate) => ({
        id: candidate.entry.id,
        score: candidate.matching?.score ?? 0,
        weight: candidate.entry.groupWeight,
        important: candidate.entry.groupOverride,
        groupOverride: candidate.entry.groupOverride,
        scoring: resolvedGroupScoring(candidate.entry, settings),
        sticky: Boolean(candidate.timed?.forced),
      })),
      winner: null,
      selection: null,
      removed: [],
    };

    const sticky = members.filter((candidate) => candidate.timed?.forced);
    if (sticky.length) {
      for (const candidate of members) {
        if (!sticky.includes(candidate)) {
          removeCandidate(active, candidate);
          row.removed.push({ id: candidate.entry.id, reason: 'NON_STICKY_GROUP_MEMBER' });
        }
      }
      row.selection = 'sticky';
      row.winner = sticky.length === 1 ? sticky[0].entry.id : null;
      trace.groups.push(row);
      continue;
    }

    const scoringMembers = members.filter((candidate) => resolvedGroupScoring(candidate.entry, settings));
    const maxScore = scoringMembers.length
      ? Math.max(...scoringMembers.map((candidate) => candidate.matching?.score ?? 0))
      : null;
    for (const candidate of [...scoringMembers]) {
      if ((candidate.matching?.score ?? 0) < maxScore) {
        removeCandidate(active, candidate);
        row.removed.push({ id: candidate.entry.id, reason: 'GROUP_SCORE_LOWER' });
      }
    }
    members = originalMembers.filter((candidate) => active.includes(candidate));

    if (activatedGroups.has(groupName)) {
      for (const candidate of members) {
        removeCandidate(active, candidate);
        row.removed.push({ id: candidate.entry.id, reason: 'GROUP_ALREADY_ACTIVATED' });
      }
      row.selection = 'prior-recursion';
      trace.groups.push(row);
      continue;
    }
    if (members.length <= 1) {
      row.winner = members[0]?.entry.id ?? null;
      row.selection = 'single';
      trace.groups.push(row);
      continue;
    }

    const priority = members
      .filter((candidate) => candidate.entry.groupOverride)
      .sort((a, b) => (b.entry.order - a.entry.order)
        || (a.entry.index - b.entry.index)
        || String(a.entry.id).localeCompare(String(b.entry.id)));
    let winner;
    if (priority.length) {
      winner = priority[0];
      row.selection = 'prioritize-inclusion';
    } else {
      const totalWeight = members.reduce((sum, candidate) => sum + candidate.entry.groupWeight, 0);
      const roll = prng.next(`group:${groupName}`);
      let cursor = 0;
      winner = members.at(-1);
      for (const candidate of members) {
        cursor += candidate.entry.groupWeight;
        if (roll.value * totalWeight <= cursor) {
          winner = candidate;
          break;
        }
      }
      row.selection = 'weighted';
      row.roll = roll;
      row.totalWeight = totalWeight;
    }
    row.winner = winner?.entry.id ?? null;
    for (const candidate of members) {
      if (candidate !== winner) {
        removeCandidate(active, candidate);
        row.removed.push({ id: candidate.entry.id, reason: 'GROUP_LOST' });
      }
    }
    trace.groups.push(row);
  }
  return active;
}
function validateVectorConfiguration(input, entries, errors, warnings) {
  const vector = input.vector ?? {};
  const provider = input.vectorProvider ?? input.vector_provider;
  const explicitEnable = [
    'extensionEnabled', 'enabled', 'worldInfoEnabled', 'enableForWorldInfo',
    'enabled_world_info', 'enabledForAllEntries', 'enabledForAll', 'enabled_for_all',
  ].some((key) => own(vector, key));
  const legacyImplicit = !explicitEnable && Boolean(provider);
  if (legacyImplicit) {
    warnings.push({
      code: 'VECTOR_LEGACY_IMPLICIT_ENABLE',
      message: 'Provider presence implicitly enabled vectors for backward compatibility; set explicit flags',
    });
  }
  const extensionEnabled = Boolean(
    vector.extensionEnabled
    ?? vector.enabled
    ?? vector.extension_enabled
    ?? legacyImplicit
  );
  const worldInfoEnabled = Boolean(
    vector.worldInfoEnabled
    ?? vector.enableForWorldInfo
    ?? vector.enabled_world_info
    ?? legacyImplicit
  );
  const enabledForAll = Boolean(
    vector.enabledForAllEntries
    ?? vector.enabledForAll
    ?? vector.enabled_for_all
    ?? false
  );
  const queryMessagesRaw = vector.queryMessages ?? vector.query_messages ?? DEFAULTS.vectorQueryMessages;
  const maxEntriesRaw = vector.maxEntries ?? vector.max_entries ?? DEFAULTS.vectorMaxEntries;
  const thresholdRaw = vector.scoreThreshold ?? vector.score_threshold ?? DEFAULTS.vectorScoreThreshold;
  if (!Number.isInteger(Number(queryMessagesRaw)) || Number(queryMessagesRaw) < 0) {
    errors.push({ code: 'VECTOR_QUERY_MESSAGES_INVALID', value: queryMessagesRaw });
  }
  if (!Number.isInteger(Number(maxEntriesRaw)) || Number(maxEntriesRaw) < 0) {
    errors.push({ code: 'VECTOR_MAX_ENTRIES_INVALID', value: maxEntriesRaw });
  }
  if (!Number.isFinite(Number(thresholdRaw)) || Number(thresholdRaw) < 0 || Number(thresholdRaw) > 1) {
    errors.push({ code: 'VECTOR_SCORE_THRESHOLD_INVALID', value: thresholdRaw });
  }
  const eligible = entries.filter((entry) => entry.enabled
    && !entry.constant
    && (entry.vectorized || enabledForAll));
  return {
    extensionEnabled,
    worldInfoEnabled,
    enabledForAll,
    queryMessages: finiteInteger(queryMessagesRaw, DEFAULTS.vectorQueryMessages),
    maxEntries: finiteInteger(maxEntriesRaw, DEFAULTS.vectorMaxEntries),
    scoreThreshold: Number.isFinite(Number(thresholdRaw))
      ? Number(thresholdRaw)
      : DEFAULTS.vectorScoreThreshold,
    provider,
    eligible,
    active: extensionEnabled && worldInfoEnabled,
  };
}
function retrieveVectors(config, input, blockers, trace) {
  if (!config.active || !config.eligible.length) {
    trace.vector = {
      active: false,
      extensionEnabled: config.extensionEnabled,
      worldInfoEnabled: config.worldInfoEnabled,
      enabledForAll: config.enabledForAll,
      results: [],
    };
    return new Set();
  }
  const provider = config.provider;
  if (!provider || (typeof provider.retrieve !== 'function' && typeof provider.query !== 'function')) {
    blockers.push({
      code: 'VECTOR_PROVIDER_UNAVAILABLE',
      message: 'Enabled World Info vector matching requires a configured provider',
    });
    trace.vector = { active: true, blocked: true, results: [] };
    return new Set();
  }
  try {
    const history = array(input.history ?? input.messages);
    const query = config.queryMessages === 0
      ? ''
      : history.slice(-config.queryMessages)
        .map((message) => typeof message === 'string' ? message : message?.content ?? message?.mes ?? '')
        .join('\n');
    let queryEmbedding = null;
    let entryEmbeddings = null;
    if (typeof provider.embed === 'function') {
      const texts = [query, ...config.eligible.map((entry) => entry.content)];
      const embeddings = synchronous(provider.embed({ texts, purpose: 'world-info-retrieval' }), 'vector embed');
      if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
        throw new Error('vector embed must return one embedding per input text');
      }
      [queryEmbedding, ...entryEmbeddings] = embeddings;
    }
    const request = {
      query,
      queryEmbedding,
      entries: config.eligible,
      entryEmbeddings,
      maxEntries: config.maxEntries,
      threshold: config.scoreThreshold,
    };
    const results = synchronous(
      typeof provider.query === 'function' ? provider.query(request) : provider.retrieve(request),
      'vector retrieval',
    );
    if (!Array.isArray(results)) throw new Error('vector retrieval must return an array');
    const ids = new Set();
    for (const item of results.slice(0, config.maxEntries)) {
      if (!Number.isFinite(Number(item.score)) || Number(item.score) < config.scoreThreshold) continue;
      const resultId = String(item.id);
      const exact = config.eligible.find((entry) => entry.id === resultId);
      if (exact) {
        ids.add(exact.id);
        continue;
      }
      const artifactMatches = config.eligible.filter((entry) => entry.artifactId === resultId);
      if (artifactMatches.length === 1) ids.add(artifactMatches[0].id);
      else if (artifactMatches.length > 1) {
        blockers.push({
          code: 'VECTOR_RESULT_ID_AMBIGUOUS',
          resultId,
          message: `Vector result '${resultId}' matches multiple attached lorebooks`,
        });
      }
    }
    trace.vector = {
      active: true,
      provider: provider.kind ?? 'adapter',
      evidenceType: provider.kind === 'fake' ? 'simulation' : 'runtime-adapter',
      interface: typeof provider.embed === 'function' ? 'embed+query' : 'legacy-retrieve',
      queryEmbedding,
      extensionEnabled: config.extensionEnabled,
      worldInfoEnabled: config.worldInfoEnabled,
      enabledForAll: config.enabledForAll,
      query,
      queryMessages: config.queryMessages,
      maxEntries: config.maxEntries,
      scoreThreshold: config.scoreThreshold,
      results,
    };
    return ids;
  } catch (error) {
    blockers.push({ code: 'VECTOR_PROVIDER_ERROR', message: error.message });
    trace.vector = { active: true, blocked: true, results: [] };
    return new Set();
  }
}
function basePromptSkeleton(input) {
  const segments = [];
  const push = (source, text, {
    role = 'system',
    macroAware = false,
    kind = 'base',
  } = {}) => {
    if (text == null || String(text) === '') return;
    segments.push({
      kind,
      source,
      role,
      text: String(text),
      macroAware,
      provenance: { source },
    });
  };

  for (const segment of array(input.promptSkeleton ?? input.prompt_skeleton)) {
    if (!segment) continue;
    push(segment.source ?? 'prompt', segment.text ?? segment.content, {
      role: segment.role ?? 'system',
      macroAware: segment.macroAware !== false,
      kind: segment.kind ?? 'base',
    });
  }
  push('systemPrompt', input.systemPrompt ?? input.system_prompt, { macroAware: true });
  push('mainPrompt', input.mainPrompt ?? input.main_prompt, { macroAware: true });
  push('character', input.character?.description, { macroAware: false });
  push('character_personality', input.character?.personality, { macroAware: false });
  push('scenario', input.character?.scenario, { macroAware: false });
  for (const [index, example] of array(input.character?.examples).entries()) {
    push('examples', typeof example === 'string' ? example : example?.content, {
      macroAware: false,
      kind: 'example',
    });
  }
  push('author_note', input.authorNote ?? input.author_note, { macroAware: false });
  for (const [index, message] of array(input.history ?? input.messages).entries()) {
    push('history', typeof message === 'string' ? message : message?.content ?? message?.mes, {
      role: message?.role ?? 'user',
      macroAware: false,
      kind: 'history',
    });
  }
  push('jailbreakPrompt', input.jailbreakPrompt ?? input.jailbreak_prompt, { macroAware: true });
  return segments;
}
function placeEntries(included, input, trace) {
  const segments = [];
  const outletEntries = {};
  const sorted = [...included].sort((a, b) => activationCompare(a, b, trace.settings.sourceStrategy));
  for (const candidate of sorted) {
    const entry = candidate.entry;
    if (entry.position === 'outlet') {
      const key = entry.outletName;
      if (!key.trim()) {
        trace.outlets.skipped.push({ entryId: entry.id, reason: 'OUTLET_NAME_MISSING' });
        continue;
      }
      if (!outletEntries[key]) outletEntries[key] = [];
      outletEntries[key].push(entry.content);
      trace.outlets.entries.push({ entryId: entry.id, outletName: key, order: entry.order });
      continue;
    }
    const segment = {
      kind: 'world-info',
      source: 'world-info',
      role: entry.role,
      text: entry.content,
      position: entry.position,
      depth: entry.position === 'at_depth' ? entry.depth : null,
      outlet: entry.outlet || null,
      order: entry.order,
      entryId: entry.id,
      macroAware: false,
      provenance: {
        entryId: entry.id,
        artifactId: entry.artifactId,
        containerPath: entry.containerPath,
        fieldPath: `${entry.containerPath}.${entry.sourceKey}.content`,
        scope: entry.scope,
        sourceKind: entry.sourceKind,
      },
    };
    segments.push(segment);
    trace.placement.push({
      entryId: entry.id,
      position: entry.position,
      depth: segment.depth,
      role: entry.role,
    });
  }
  trace.outlets.values = outletEntries;
  return { segments, outletEntries };
}
function expandOutletMacros(text, outletEntries, trace, source) {
  return String(text).replace(/{{outlet::([^}]+)}}/gi, (_match, rawName) => {
    const name = String(rawName).trim();
    const value = outletEntries[name]?.join('\n') ?? '';
    trace.outlets.consumers.push({
      source,
      requested: name,
      matched: Object.hasOwn(outletEntries, name),
      contentCount: outletEntries[name]?.length ?? 0,
    });
    return value;
  });
}
function assemblePrompt(worldInfo, outletEntries, input, trace) {
  const base = basePromptSkeleton(input);
  trace.basePrompt = structuredClone(base);
  const byPosition = new Map();
  for (const segment of worldInfo) {
    if (!byPosition.has(segment.position)) byPosition.set(segment.position, []);
    byPosition.get(segment.position).push(segment);
  }
  const result = [];
  const take = (position) => {
    for (const segment of byPosition.get(position) ?? []) result.push(structuredClone(segment));
  };
  const expandedBase = base.map((segment) => ({
    ...segment,
    text: segment.macroAware
      ? expandOutletMacros(segment.text, outletEntries, trace, segment.source)
      : segment.text,
  }));

  take('before_char');
  for (const segment of expandedBase.filter((item) => item.source === 'systemPrompt' || item.source === 'mainPrompt')) {
    result.push(segment);
  }
  for (const segment of expandedBase.filter((item) => ['character', 'character_personality', 'scenario'].includes(item.source))) {
    result.push(segment);
  }
  take('after_char');
  take('em_top');
  for (const segment of expandedBase.filter((item) => item.kind === 'example')) result.push(segment);
  take('em_bottom');
  take('top_an');
  for (const segment of expandedBase.filter((item) => item.source === 'author_note')) result.push(segment);
  take('bottom_an');

  const history = expandedBase.filter((item) => item.kind === 'history');
  const atDepth = [...(byPosition.get('at_depth') ?? [])]
    .sort((a, b) => (b.depth - a.depth) || (b.order - a.order));
  for (let index = 0; index <= history.length; index += 1) {
    const beforeIndex = history.length - index;
    for (const segment of atDepth.filter((item) => item.depth === beforeIndex)) result.push(structuredClone(segment));
    if (history[index]) result.push(history[index]);
  }
  for (const segment of atDepth.filter((item) => item.depth > history.length)) result.unshift(structuredClone(segment));
  for (const segment of expandedBase.filter((item) => item.source === 'jailbreakPrompt')) result.push(segment);

  return result.map((segment, finalIndex) => ({ ...segment, finalIndex }));
}
function automationEvents(included, input, trace, settings) {
  const adapter = input.automationAdapter ?? input.automation_adapter;
  const seen = new Set();
  const events = [];
  for (const candidate of [...included].sort((a, b) => activationCompare(a, b, settings.sourceStrategy))) {
    const automationId = candidate.entry.automationId.trim();
    if (!automationId || seen.has(automationId)) continue;
    seen.add(automationId);
    const event = {
      automationId,
      entryId: candidate.entry.id,
      order: candidate.entry.order,
      status: 'QUEUED',
      evidenceType: 'simulation',
    };
    if (adapter) {
      try {
        const result = synchronous(
          typeof adapter === 'function'
            ? adapter(event)
            : adapter.execute(event),
          'automation adapter',
        );
        event.status = 'EXECUTED';
        event.evidenceType = 'runtime-adapter';
        event.result = result ?? null;
      } catch (error) {
        event.status = 'ERROR';
        event.error = error.message;
      }
    }
    events.push(event);
  }
  trace.automation = events;
  return events;
}
function summary(candidate, status) {
  return {
    entryId: candidate.entry.id,
    index: candidate.entry.index,
    fieldPath: `${candidate.entry.containerPath}.${candidate.entry.sourceKey}`,
    level: candidate.level,
    scanState: candidate.scanState,
    status,
    reasons: [...candidate.reasons],
    matching: candidate.matching ?? null,
  };
}
function updateCandidate(trace, id, status, reason) {
  const item = [...trace.candidates].reverse().find((candidate) => candidate.entryId === id);
  if (item) {
    item.status = status;
    item.reasons.push(reason);
  }
}

/**
 * Simulate the local, deterministic portion of SillyTavern World Info.
 */
export function simulateWorldInfo(input = {}) {
  const errors = [];
  const warnings = [];
  const blockers = [];
  const settings = resolveSettings(input);
  const normalized = normalizeEntries(input, errors, warnings);
  const seed = input.seed ?? 0;
  const prng = createSeededPrng(seed);
  const history = array(input.history ?? input.messages);
  const messageNumber = finiteInteger(
    input.messageNumber ?? input.message_number,
    history.length,
  );
  const state = normalizeState(input.timedState ?? input.timed_state);
  const graph = recursionGraph(normalized.entries, settings);
  const trace = {
    version: 2,
    seed,
    settings,
    containerPath: normalized.containerPath,
    scanBuffer: null,
    scanBuffers: [],
    candidates: [],
    filters: [],
    probability: [],
    recursion: {
      edges: graph.edges,
      cycles: graph.cycles,
      levels: [],
      waves: [],
      terminationReason: null,
      minActivationSweeps: [],
    },
    groups: [],
    timed: [],
    timedInvalidations: [],
    budget: [],
    order: [],
    placement: [],
    outlets: { entries: [], values: {}, consumers: [], skipped: [] },
    automation: [],
    promptSegments: [],
    basePrompt: [],
    assembledPrompt: [],
    vector: null,
    errors,
    warnings,
    blockers,
  };

  validateAttachments(normalized.entries, input, errors, blockers);
  validateSimulationCombinations(normalized.entries, blockers);
  if (settings.requirePersona && settings.scanPersona && !input.persona) blockers.push({ code: 'SCAN_SOURCE_UNAVAILABLE', source: 'persona' });
  if (settings.requireCharacter && settings.scanCharacter && !input.character) blockers.push({ code: 'SCAN_SOURCE_UNAVAILABLE', source: 'character' });
  if (settings.requireChatMetadata && settings.scanChatMetadata && !(input.chatMetadata ?? input.chat_metadata)) blockers.push({ code: 'SCAN_SOURCE_UNAVAILABLE', source: 'chat_metadata' });
  prepareTimedState(state, normalized.entries, input, messageNumber, trace);
  const generation = String(input.generationType ?? input.generation_type ?? 'normal');
  if (!GENERATION_TYPES.has(generation)) warnings.push({ code: 'UNKNOWN_GENERATION_TYPE', value: generation });
  if (settings.minActivations > 0 && settings.maxRecursionSteps > 0) {
    errors.push({
      code: 'MIN_ACTIVATIONS_RECURSION_STEPS_CONFLICT',
      message: 'SillyTavern treats Min Activations and Max Recursion Steps as mutually exclusive',
    });
  }

  const vectorConfig = validateVectorConfiguration(input, normalized.entries, errors, warnings);
  const vectorIds = retrieveVectors(vectorConfig, input, blockers, trace);

  const tokenCounter = input.tokenCounter
    ?? input.token_counter
    ?? ((text) => Math.ceil(String(text).length / 4));
  let remaining = Math.max(
    0,
    finiteInteger(
      input.budgetPolicy?.worldInfoBudget
      ?? input.budgetPolicy?.budget
      ?? settings.tokenBudget,
      Number.MAX_SAFE_INTEGER,
    ),
  );
  const included = [];
  const includedIds = new Set();
  const activatedGroups = new Set();
  let recursiveText = '';
  let scanSkew = 0;
  let scanState = 'INITIAL';
  let recursionLevel = 0;
  let loopCount = 0;
  let termination = 'NO_NEW_ACTIVATIONS';
  const hardLoopLimit = Math.max(16, normalized.entries.length * 4 + history.length * 2 + 8);

  const canAdvanceMinActivation = () => {
    if (settings.minActivations <= 0 || included.length >= settings.minActivations) return false;
    const currentDepth = settings.scanDepth + scanSkew;
    const hardMax = settings.minActivationsDepthMax > 0
      ? Math.min(settings.minActivationsDepthMax, history.length)
      : history.length;
    return currentDepth < hardMax && remaining > 0;
  };
  const recursionLimitReached = () => {
    if (settings.maxRecursionSteps > 0) return loopCount >= settings.maxRecursionSteps;
    if (settings.legacyMaxRecursionDepth != null) return recursionLevel >= settings.legacyMaxRecursionDepth;
    return false;
  };

  while (loopCount < hardLoopLimit) {
    loopCount += 1;
    const levelCandidates = [];
    for (const entry of normalized.entries) {
      if (includedIds.has(entry.id)) continue;
      const candidate = {
        entry,
        level: recursionLevel,
        scanState,
        reasons: [],
      };
      if (!entry.enabled) {
        candidate.reasons.push('ENTRY_DISABLED');
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }
      if (entry.invalid) {
        candidate.reasons.push('ENTRY_INVALID');
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }
      if (scanState === 'INITIAL' && entry.delayUntilRecursion > 0) {
        candidate.reasons.push('RECURSION_DELAY_PENDING');
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }
      if (scanState === 'RECURSION' && entry.excludeRecursion) {
        candidate.reasons.push('RECURSION_INCOMING_FORBIDDEN');
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }

      const filters = filterEntry(entry, input, settings);
      trace.filters.push({ entryId: entry.id, scanState, ...filters });
      if (!filters.passed) {
        candidate.reasons.push('FILTER_REJECTED');
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }

      const timed = timedDecision(entry, state, messageNumber);
      candidate.timed = timed;
      trace.timed.push({ entryId: entry.id, messageNumber, scanState, ...timed });
      if (!timed.passed) {
        candidate.reasons.push(timed.code);
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }

      const buffer = buildEntryScanBuffer(entry, input, settings, {
        scanSkew,
        scanState,
        recursiveText,
      });
      if (!trace.scanBuffer) trace.scanBuffer = buffer;
      trace.scanBuffers.push({ entryId: entry.id, level: recursionLevel, ...buffer });
      const matching = evaluateKeys(entry, buffer.text, settings);
      candidate.matching = matching;
      const vectorHit = vectorConfig.active
        && (entry.vectorized || vectorConfig.enabledForAll)
        && vectorIds.has(entry.id);
      if (!matching.matched && !vectorHit && !timed.forced) {
        candidate.reasons.push(
          entry.vectorized || vectorConfig.enabledForAll
            ? 'VECTOR_NOT_RETRIEVED'
            : 'KEY_NOT_MATCHED'
        );
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }
      candidate.reasons.push(
        timed.forced
          ? 'STICKY_REACTIVATION'
          : vectorHit
            ? 'VECTOR_RETRIEVED'
            : matching.type === 'constant'
              ? 'CONSTANT_ACTIVE'
              : 'KEY_MATCHED'
      );

      const threshold = entry.useProbability === false
        ? 100
        : Math.max(0, Math.min(100, finiteNumber(entry.probability, 100)));
      const roll = threshold === 0 || threshold === 100
        ? { value: 0, label: `probability:${entry.id}`, index: null }
        : prng.next(`probability:${entry.id}`);
      const probabilityPassed = timed.forced
        || entry.useProbability === false
        || threshold === 100
        || (threshold > 0 && roll.value * 100 < threshold);
      trace.probability.push({
        entryId: entry.id,
        useProbability: entry.useProbability !== false,
        threshold,
        roll,
        passed: probabilityPassed,
        bypassReason: timed.forced
          ? 'TIMED_STICKY_ACTIVE'
          : entry.useProbability === false
            ? 'USE_PROBABILITY_DISABLED'
            : null,
      });
      if (!probabilityPassed) {
        candidate.reasons.push('PROBABILITY_REJECTED');
        trace.candidates.push(summary(candidate, 'REJECTED'));
        continue;
      }
      levelCandidates.push(candidate);
    }

    const selected = applyGroups(levelCandidates, prng, trace, settings, activatedGroups);
    const selectedIds = new Set(selected.map((candidate) => candidate.entry.id));
    for (const candidate of levelCandidates) {
      if (!selectedIds.has(candidate.entry.id)) {
        candidate.reasons.push('GROUP_LOST');
        trace.candidates.push(summary(candidate, 'REJECTED'));
      }
    }

    const wave = [];
    const insertedThisWave = [];
    for (const candidate of [...selected].sort((a, b) => activationCompare(a, b, settings.sourceStrategy))) {
      trace.candidates.push(summary(candidate, 'ELIGIBLE'));
      const tokens = Number(tokenCounter(candidate.entry.content));
      if (!Number.isFinite(tokens) || tokens < 0) {
        errors.push({ code: 'TOKEN_COUNTER_INVALID', entryId: candidate.entry.id });
        updateCandidate(trace, candidate.entry.id, 'REJECTED', 'TOKEN_COUNTER_INVALID');
        continue;
      }
      const before = remaining;
      const ignoreBudget = candidate.entry.ignoreBudget;
      if (!ignoreBudget && tokens > remaining) {
        trace.budget.push({
          entryId: candidate.entry.id,
          level: recursionLevel,
          tokenCount: tokens,
          before,
          after: before,
          ignoreBudget: false,
          included: false,
          reason: 'BUDGET_EXCEEDED',
        });
        updateCandidate(trace, candidate.entry.id, 'REJECTED', 'BUDGET_EXCEEDED');
        continue;
      }
      if (!ignoreBudget) remaining -= tokens;
      trace.budget.push({
        entryId: candidate.entry.id,
        level: recursionLevel,
        tokenCount: tokens,
        before,
        after: remaining,
        ignoreBudget,
        included: true,
        reason: ignoreBudget ? 'IGNORE_BUDGET' : 'WITHIN_BUDGET',
      });
      included.push(candidate);
      includedIds.add(candidate.entry.id);
      insertedThisWave.push(candidate);
      wave.push(candidate.entry.id);
      for (const group of candidate.entry.groups) activatedGroups.add(group);
      updateCandidate(trace, candidate.entry.id, 'INCLUDED', 'PROMPT_INCLUDED');
    }

    trace.recursion.levels.push({
      level: recursionLevel,
      scanState,
      scanSkew,
      candidates: levelCandidates.map((candidate) => candidate.entry.id),
      eligible: selected.map((candidate) => candidate.entry.id),
      activated: wave,
    });
    trace.recursion.waves.push(wave);

    const recurseContent = insertedThisWave
      .filter((candidate) => !candidate.entry.preventRecursion)
      .map((candidate) => candidate.entry.content)
      .join('\n');
    if (wave.length
      && settings.recursiveScanning
      && recurseContent
      && !recursionLimitReached()) {
      recursiveText += `${recursiveText ? '\n' : ''}${recurseContent}`;
      scanState = 'RECURSION';
      recursionLevel += 1;
      continue;
    }

    if (wave.length && settings.recursiveScanning && recurseContent && recursionLimitReached()) {
      termination = 'DEPTH_LIMIT';
    } else if (wave.length && !settings.recursiveScanning) {
      termination = 'RECURSION_DISABLED';
    } else if (wave.length && settings.recursiveScanning && !recurseContent) {
      termination = 'OUTGOING_RECURSION_FORBIDDEN';
    } else if (!wave.length && selected.length && remaining <= 0) {
      termination = 'BUDGET_REJECTED_ALL_SOURCES';
    } else {
      termination = 'NO_NEW_ACTIVATIONS';
    }

    if (canAdvanceMinActivation()) {
      scanSkew += 1;
      scanState = 'MIN_ACTIVATIONS';
      trace.recursion.minActivationSweeps.push({
        scanSkew,
        effectiveDepth: settings.scanDepth + scanSkew,
        activatedCount: included.length,
      });
      continue;
    }
    break;
  }

  if (loopCount >= hardLoopLimit) termination = 'SAFETY_LOOP_LIMIT';
  trace.recursion.terminationReason = termination;
  trace.order = included.map((candidate, index) => ({
    entryId: candidate.entry.id,
    order: candidate.entry.order,
    sourceKind: candidate.entry.sourceKind,
    finalIndex: index,
  }));

  const placed = placeEntries(included, input, trace);
  trace.promptSegments = placed.segments;
  const assembled = assemblePrompt(placed.segments, placed.outletEntries, input, trace);
  trace.assembledPrompt = assembled;

  for (const candidate of included) {
    if (!candidate.timed?.forced) setTimedEffect(state, candidate.entry, messageNumber);
  }
  state.messageNumber = messageNumber;
  state.branchId = input.branchId ?? input.branch_id ?? state.branchId;

  const automations = automationEvents(included, input, trace, settings);
  const finalIncludedIds = new Set(included.map((candidate) => candidate.entry.id));
  const status = errors.length ? 'FAIL' : blockers.length ? 'BLOCKED' : 'PASS';

  return {
    status,
    ok: status === 'PASS',
    evidenceType: 'simulation',
    seed,
    includedEntryIds: [...finalIncludedIds],
    excludedEntryIds: [...new Set(
      trace.candidates
        .filter((candidate) => candidate.status === 'REJECTED' && !finalIncludedIds.has(candidate.entryId))
        .map((candidate) => candidate.entryId)
    )],
    promptSegments: placed.segments,
    outletEntries: placed.outletEntries,
    automationEvents: automations,
    rawPrompt: placed.segments.map((segment) => ({
      role: segment.role,
      content: segment.text,
      position: segment.position,
      depth: segment.depth,
      outlet: segment.outlet,
      entryId: segment.entryId,
    })),
    simulatedRawPrompt: assembled.map((segment) => ({
      kind: segment.kind,
      source: segment.source,
      role: segment.role,
      content: segment.text,
      position: segment.position ?? null,
      depth: segment.depth ?? null,
      outlet: segment.outlet ?? null,
      order: segment.order ?? null,
      entryId: segment.entryId ?? null,
      finalIndex: segment.finalIndex,
      provenance: segment.provenance,
    })),
    timedState: state,
    trace,
    errors,
    warnings,
    blockers,
  };
}

export function createVectorProviderAdapter(provider, { kind = 'runtime-adapter' } = {}) {
  if (typeof provider === 'function') return Object.freeze({ kind, retrieve: provider });
  if (!provider || (typeof provider.retrieve !== 'function' && typeof provider.query !== 'function')) {
    throw new TypeError('provider must expose retrieve/query or be a legacy retrieve function');
  }
  return Object.freeze({
    kind,
    ...(typeof provider.embed === 'function' ? { embed: provider.embed.bind(provider) } : {}),
    ...(typeof provider.query === 'function' ? { query: provider.query.bind(provider) } : {}),
    ...(typeof provider.retrieve === 'function' ? { retrieve: provider.retrieve.bind(provider) } : {}),
  });
}

export const WORLD_INFO_REASON_CODES = Object.freeze([
  'ENTRY_DISABLED',
  'ENTRY_INVALID',
  'FILTER_REJECTED',
  'TIMED_DELAY',
  'TIMED_COOLDOWN',
  'TIMED_STICKY_ACTIVE',
  'KEY_NOT_MATCHED',
  'KEY_MATCHED',
  'CONSTANT_ACTIVE',
  'VECTOR_NOT_RETRIEVED',
  'VECTOR_RETRIEVED',
  'PROBABILITY_REJECTED',
  'GROUP_LOST',
  'BUDGET_EXCEEDED',
  'PROMPT_INCLUDED',
  'RECURSION_INCOMING_FORBIDDEN',
  'RECURSION_DELAY_PENDING',
]);
