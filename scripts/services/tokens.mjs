import { isPlainObject } from '../lib/files.mjs';
import { Report } from '../lib/report.mjs';
import { countWords, estimateTokensForModel, resolveTokenizerProfile } from '../token_model_map.mjs';

export const CARD_TOTAL_TOKEN_ADVISORY = Object.freeze({
  id: 'ACE-CARD-TOTAL-TOKENS-ADVISORY',
  minTokens: 700,
  maxTokens: 1500,
});

function isCharacterCardArtifact(artifact) {
  if (!isPlainObject(artifact)) return false;
  if (artifact.spec === 'chara_card_v2' || artifact.spec === 'chara_card_v3') return isPlainObject(artifact.data);
  return ['description', 'personality', 'scenario', 'first_mes', 'mes_example']
    .some((field) => Object.hasOwn(artifact, field));
}

function pushString(rows, field, value) {
  if (typeof value === 'string' && value.trim()) rows.push({ field, text: value });
}

function entryContainers(artifact) {
  return [
    { value: artifact?.entries, path: 'entries' },
    { value: artifact?.character_book?.entries, path: 'character_book.entries' },
    { value: artifact?.data?.character_book?.entries, path: 'data.character_book.entries' },
  ];
}

function entriesFrom(value) {
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry]);
  if (isPlainObject(value)) return Object.entries(value);
  return [];
}

export function collectTokenFields(artifact) {
  if (typeof artifact === 'string') return [{ field: '$', text: artifact }];
  if (!isPlainObject(artifact)) return [{ field: '$', text: JSON.stringify(artifact) }];
  const rows = [];
  const card = isPlainObject(artifact.data) ? artifact.data : artifact;
  for (const field of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions']) {
    pushString(rows, card === artifact ? field : `data.${field}`, card[field]);
  }
  if (Array.isArray(card.alternate_greetings)) {
    card.alternate_greetings.forEach((value, index) => pushString(rows, `${card === artifact ? '' : 'data.'}alternate_greetings[${index}]`, value));
  }

  const visited = new Set();
  for (const container of entryContainers(artifact)) {
    if (!container.value || visited.has(container.value)) continue;
    visited.add(container.value);
    for (const [sourceKey, entry] of entriesFrom(container.value)) {
      if (!isPlainObject(entry)) continue;
      const id = entry.uid ?? entry.id ?? sourceKey;
      const base = `${container.path}[${id}]`;
      pushString(rows, `${base}.content`, entry.content);
      const keys = Array.isArray(entry.key) ? entry.key : Array.isArray(entry.keys) ? entry.keys : [];
      const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : Array.isArray(entry.secondary_keys) ? entry.secondary_keys : [];
      if (keys.length) pushString(rows, `${base}.keys`, keys.join(', '));
      if (secondary.length) pushString(rows, `${base}.secondary_keys`, secondary.join(', '));
    }
  }
  return rows.length ? rows : [{ field: '$', text: JSON.stringify(artifact, null, 2) }];
}

async function loadExactEncoder(profile) {
  if (profile.family !== 'openai') {
    return { encoder: null, reason: `no bundled exact tokenizer for ${profile.family}` };
  }
  const moduleNames = profile.tokenizer === 'cl100k_base'
    ? ['gpt-tokenizer/encoding/cl100k_base', 'gpt-tokenizer/model/gpt-3.5-turbo']
    : ['gpt-tokenizer/model/gpt-4o', 'gpt-tokenizer/encoding/o200k_base'];
  for (const moduleName of moduleNames) {
    try {
      const mod = await import(moduleName);
      if (typeof mod.encode === 'function') return { encoder: mod.encode, moduleName, reason: null };
      if (typeof mod.default?.encode === 'function') return { encoder: mod.default.encode, moduleName, reason: null };
    } catch {
      // Try the next supported export path. Missing optional packages are
      // represented in the returned method instead of being silently hidden.
    }
  }
  return { encoder: null, reason: `exact ${profile.tokenizer} encoder is unavailable` };
}

export async function countTokenText(text, {
  model = 'gpt-4o', forceEstimate = false, requireExact = false, encoder = null,
} = {}) {
  const value = String(text ?? '');
  const profile = resolveTokenizerProfile(model);
  if (forceEstimate) {
    const estimate = estimateTokensForModel(value, model);
    return {
      ...estimate,
      method: { kind: 'estimate', name: estimate.method, tokenizer: profile.tokenizer, forced: true },
      exactAvailable: false,
      blocked: requireExact,
      reason: requireExact ? 'requireExact conflicts with forceEstimate' : null,
    };
  }

  const loaded = encoder
    ? { encoder, moduleName: 'caller-supplied', reason: null }
    : await loadExactEncoder(profile);
  if (loaded.encoder) {
    try {
      return {
        tokens: loaded.encoder(value).length,
        words: countWords(value),
        chars: value.length,
        model: profile.name,
        tokenizer: profile.tokenizer,
        method: { kind: 'exact', name: loaded.moduleName, tokenizer: profile.tokenizer, forced: false },
        exactAvailable: true,
        blocked: false,
        reason: null,
      };
    } catch (error) {
      loaded.reason = `exact encoder failed: ${error.message}`;
    }
  }

  const estimate = estimateTokensForModel(value, model);
  return {
    ...estimate,
    method: { kind: 'estimate', name: estimate.method, tokenizer: profile.tokenizer, forced: false },
    exactAvailable: false,
    blocked: requireExact,
    reason: loaded.reason,
  };
}

export async function auditTokenBudget(artifact, {
  model = 'gpt-4o', forceEstimate = false, requireExact = false, budget = null, encoder = null,
} = {}) {
  const report = new Report('Token Budget Audit', { service: 'tokens', operation: 'audit' });
  if (forceEstimate && requireExact) {
    report.error('forceEstimate and requireExact cannot both be true', {
      code: 'TOKEN_METHOD_CONFLICT', ruleId: 'ACE-TOKEN-001',
    });
    return report.toJSON({ data: { rows: [], totalTokens: 0, methodKind: null } });
  }
  if (budget !== null && (!Number.isInteger(budget) || budget < 0)) {
    report.error('budget must be a non-negative integer or null', {
      code: 'TOKEN_BUDGET_VALUE', ruleId: 'ACE-TOKEN-001', field: 'budget',
    });
    return report.toJSON({ data: { rows: [], totalTokens: 0, methodKind: null } });
  }

  const fields = collectTokenFields(artifact);
  const rows = [];
  for (const field of fields) {
    rows.push({ field: field.field, ...(await countTokenText(field.text, { model, forceEstimate, requireExact, encoder })) });
  }
  const blockedRows = rows.filter((row) => row.blocked);
  if (blockedRows.length) {
    report.block(`Exact token counting was required but unavailable: ${blockedRows[0].reason}`, {
      code: 'TOKEN_EXACT_UNAVAILABLE', ruleId: 'ACE-TOKEN-001', details: { fields: blockedRows.map((row) => row.field) },
    });
  }
  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  if (budget !== null && totalTokens > budget) {
    report.error(`Token budget exceeded: ${totalTokens} > ${budget}`, {
      code: 'TOKEN_BUDGET_EXCEEDED', ruleId: 'ACE-TOKEN-001', field: 'budget',
    });
  }

  const kinds = [...new Set(rows.map((row) => row.method.kind))];
  const methodKind = kinds.length === 1 ? kinds[0] : 'mixed';
  const cardAdvisory = isCharacterCardArtifact(artifact)
    ? {
        advisoryId: CARD_TOTAL_TOKEN_ADVISORY.id,
        classification: 'ADVISORY',
        actualTokens: totalTokens,
        minTokens: CARD_TOTAL_TOKEN_ADVISORY.minTokens,
        maxTokens: CARD_TOTAL_TOKEN_ADVISORY.maxTokens,
        withinRange: totalTokens >= CARD_TOTAL_TOKEN_ADVISORY.minTokens
          && totalTokens <= CARD_TOTAL_TOKEN_ADVISORY.maxTokens,
        methodKind,
        exact: methodKind === 'exact',
      }
    : null;
  if (cardAdvisory && !cardAdvisory.withinRange) {
    report.warn(
      `Character-card total is ${totalTokens} tokens; advisory range is ${cardAdvisory.minTokens}-${cardAdvisory.maxTokens} (${methodKind}).`,
      {
        code: 'CARD_TOTAL_TOKEN_ADVISORY',
        ruleId: 'ACE-CARD-005',
        field: 'totalTokens',
        details: cardAdvisory,
      },
    );
  }
  report.setData({
    model,
    profile: resolveTokenizerProfile(model),
    totalTokens,
    budget,
    methodKind,
    exact: methodKind === 'exact',
    cardAdvisory,
    rows,
  });
  report.addEvidence({
    kind: 'token-method',
    methodKind,
    requireExact,
    forceEstimate,
    exactAvailableForAllFields: rows.every((row) => row.exactAvailable),
    rowCount: rows.length,
  });
  if (cardAdvisory) {
    report.addEvidence({
      kind: 'card-total-token-advisory',
      ...cardAdvisory,
      status: cardAdvisory.withinRange ? 'WITHIN_ADVISORY_RANGE' : 'OUTSIDE_ADVISORY_RANGE',
      evidenceType: cardAdvisory.exact ? 'exact-tokenizer' : 'token-estimate',
    });
  }
  return report.toJSON();
}

export const TOKEN_SERVICE = Object.freeze({
  name: 'tokens',
  collectFields: collectTokenFields,
  countText: countTokenText,
  audit: auditTokenBudget,
});
