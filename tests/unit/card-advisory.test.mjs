import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  auditTokenBudget,
  CARD_TOTAL_TOKEN_ADVISORY,
} from '../../scripts/services/tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function cardAtTokenCount(tokens) {
  return auditTokenBudget({ description: 'counted card text' }, {
    encoder: () => Array.from({ length: tokens }),
  });
}

test('ST-CC-TOTAL-700-1500-P: card total advisory has inclusive 700 and 1500 token boundaries', async () => {
  assert.deepEqual(CARD_TOTAL_TOKEN_ADVISORY, {
    id: 'ACE-CARD-TOTAL-TOKENS-ADVISORY',
    minTokens: 700,
    maxTokens: 1500,
  });
  for (const tokens of [700, 1500]) {
    const result = await cardAtTokenCount(tokens);
    assert.equal(result.status, 'PASS');
    assert.equal(result.exitCode, 0);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.data.cardAdvisory.actualTokens, tokens);
    assert.equal(result.data.cardAdvisory.withinRange, true);
    assert.equal(result.data.cardAdvisory.methodKind, 'exact');
  }
});

test('ST-CC-TOTAL-699-1501-N: card totals 699 and 1501 emit WARN with complete exact evidence, never FAIL', async () => {
  for (const tokens of [699, 1501]) {
    const result = await cardAtTokenCount(tokens);
    assert.equal(result.status, 'PASS');
    assert.equal(result.exitCode, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 1);
    const warning = result.warnings[0];
    assert.equal(warning.code, 'CARD_TOTAL_TOKEN_ADVISORY');
    assert.equal(warning.ruleId, 'ACE-CARD-005');
    assert.deepEqual(warning.details, {
      advisoryId: 'ACE-CARD-TOTAL-TOKENS-ADVISORY',
      classification: 'ADVISORY',
      actualTokens: tokens,
      minTokens: 700,
      maxTokens: 1500,
      withinRange: false,
      methodKind: 'exact',
      exact: true,
    });
    const evidence = result.evidence.find((item) => item.kind === 'card-total-token-advisory');
    assert.equal(evidence.status, 'OUTSIDE_ADVISORY_RANGE');
    assert.equal(evidence.evidenceType, 'exact-tokenizer');
  }
});

test('estimated card totals are labeled estimate and non-card artifacts are N/A', async () => {
  const estimated = await auditTokenBudget({ description: 'short card' }, { forceEstimate: true });
  assert.equal(estimated.data.cardAdvisory.methodKind, 'estimate');
  assert.equal(estimated.data.cardAdvisory.exact, false);
  assert.equal(
    estimated.evidence.find((item) => item.kind === 'card-total-token-advisory').evidenceType,
    'token-estimate',
  );

  const lorebook = await auditTokenBudget({ entries: [{ content: 'world fact' }] }, {
    encoder: () => Array.from({ length: 699 }),
  });
  assert.equal(lorebook.data.cardAdvisory, null);
  assert.equal(lorebook.warnings.some((item) => item.code === 'CARD_TOTAL_TOKEN_ADVISORY'), false);
});

function cardGateContractErrors(gates) {
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  const requirements = {
    'MG-CARD-CHARACTERIZATION': ['motivation', 'outward behavior', 'every present in-scope prose field', 'runtime transcript', 'blocked reason'],
    'MG-CARD-GREETING': ['every reviewed greeting', 'playable handoff', 'user agency'],
    'MG-CARD-VOICE': ['every claimed mode', 'user agency', 'card consistency'],
  };
  const errors = [];
  for (const [id, phrases] of Object.entries(requirements)) {
    const gate = byId.get(id);
    const evidence = gate?.requiredEvidence?.join(' ').toLowerCase() ?? '';
    for (const phrase of phrases) if (!evidence.includes(phrase)) errors.push(`${id} misses ${phrase}`);
  }
  return errors;
}

test('card manual gates require field-level motivation, greeting, agency and voice evidence', () => {
  const gates = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules/manual-gates.json'), 'utf8')).gates;
  assert.deepEqual(cardGateContractErrors(gates), []);
});

test('sabotage: removing greeting coverage or motivation evidence is detected', () => {
  const gates = structuredClone(JSON.parse(fs.readFileSync(path.join(ROOT, 'rules/manual-gates.json'), 'utf8')).gates);
  gates.find((gate) => gate.id === 'MG-CARD-GREETING').requiredEvidence = ['Quote one greeting.'];
  gates.find((gate) => gate.id === 'MG-CARD-CHARACTERIZATION').requiredEvidence = ['Looks plausible.'];
  assert.match(cardGateContractErrors(gates).join('\n'), /MG-CARD-GREETING misses every reviewed greeting/u);
  assert.match(cardGateContractErrors(gates).join('\n'), /MG-CARD-CHARACTERIZATION misses motivation/u);
  assert.match(cardGateContractErrors(gates).join('\n'), /MG-CARD-CHARACTERIZATION misses runtime transcript/u);
});
