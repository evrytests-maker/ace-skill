import assert from 'node:assert/strict';
import test from 'node:test';

import { FakeVectorProvider, simulateWorldInfo } from '../../scripts/lib/world-info-simulator.mjs';

const entry = (uid, overrides = {}) => ({
  uid,
  key: [`key-${uid}`],
  content: `content-${uid}`,
  ...overrides,
});

function candidate(result, id, scanState = null) {
  return result.trace.candidates.find((row) => row.entryId === String(id)
    && (!scanState || row.scanState === scanState)
    && row.matching);
}

test('official Outlet contract: macro identifier is case-insensitive; name is case-sensitive, ordered, consumer-only, and non-recursive', () => {
  const result = simulateWorldInfo({
    systemPrompt: 'lowerKeyword={{outlet::Memory}}|titleKeyword={{Outlet::Memory}}|upperKeyword={{OUTLET::Memory}}|lowerName={{outlet::memory}}|missing={{outlet::Missing}}',
    mainPrompt: 'again={{outlet::Memory}}',
    character: {
      description: 'card={{outlet::Memory}}',
      examples: ['example={{outlet::Memory}}'],
    },
    authorNote: 'note={{outlet::Memory}}',
    history: ['history={{outlet::Memory}}'],
    lorebook: {
      entries: [
        entry(1, { constant: true, position: 'outlet', outlet: 'Memory', order: 100, content: 'low' }),
        entry(2, { constant: true, position: 'outlet', outlet: 'Memory', order: 200, content: 'high {{outlet::Other}}' }),
        entry(3, { constant: true, position: 'outlet', outlet: ' memory ', order: 300, content: 'padded' }),
        entry(4, { constant: true, position: 'outlet', outlet: '   ', order: 400, content: 'blank' }),
        entry(5, { constant: true, position: 'before_char', content: 'world={{outlet::Memory}}' }),
      ],
    },
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.outletEntries, {
    ' memory ': ['padded'],
    Memory: ['high {{outlet::Other}}', 'low'],
  });
  assert.equal(result.simulatedRawPrompt.some((row) => ['1', '2', '3', '4'].includes(row.entryId)), false);
  assert.equal(result.simulatedRawPrompt.find((row) => row.source === 'systemPrompt').content,
    'lowerKeyword=high {{outlet::Other}}\nlow|titleKeyword=high {{outlet::Other}}\nlow|upperKeyword=high {{outlet::Other}}\nlow|lowerName=|missing=');
  assert.equal(result.simulatedRawPrompt.find((row) => row.source === 'mainPrompt').content,
    'again=high {{outlet::Other}}\nlow');
  assert.equal(result.simulatedRawPrompt.find((row) => row.source === 'character').content,
    'card={{outlet::Memory}}');
  assert.equal(result.simulatedRawPrompt.find((row) => row.source === 'examples').content,
    'example={{outlet::Memory}}');
  assert.equal(result.simulatedRawPrompt.find((row) => row.source === 'author_note').content,
    'note={{outlet::Memory}}');
  assert.equal(result.simulatedRawPrompt.find((row) => row.source === 'history').content,
    'history={{outlet::Memory}}');
  assert.equal(result.simulatedRawPrompt.find((row) => row.entryId === '5').content,
    'world={{outlet::Memory}}');
  assert.ok(result.warnings.some((warning) => warning.code === 'OUTLET_NAME_MISSING'));
});

test('official Group Scoring keeps non-scoring members in the draw and removes only lower scored scoring members', () => {
  const result = simulateWorldInfo({
    seed: 9,
    history: ['head extra secondary'],
    lorebook: {
      entries: [
        entry(1, { key: ['head'], group: 'g', useGroupScoring: true, groupWeight: 100 }),
        entry(2, { key: ['head', 'extra'], keysecondary: ['secondary'], selectiveLogic: 0, group: 'g', useGroupScoring: true, groupWeight: 1 }),
        entry(3, { key: ['head'], group: 'g', useGroupScoring: false, groupWeight: 1 }),
      ],
    },
  });
  const group = result.trace.groups[0];
  assert.deepEqual(group.removed.filter((row) => row.reason === 'GROUP_SCORE_LOWER'), [
    { id: '1', reason: 'GROUP_SCORE_LOWER' },
  ]);
  assert.ok(group.members.find((row) => row.id === '3' && row.scoring === false));
  assert.ok(['2', '3'].includes(group.winner));
});

for (const scenario of [
  { name: 'AND ANY adds matched secondary keys', logic: 0, history: 'head s1', expectedMatch: true, expectedScore: 2 },
  { name: 'NOT ALL never adds secondary score', logic: 1, history: 'head s1', expectedMatch: true, expectedScore: 1 },
  { name: 'NOT ANY never adds secondary score', logic: 2, history: 'head', expectedMatch: true, expectedScore: 1 },
  { name: 'AND ALL adds secondary keys only when all match', logic: 3, history: 'head s1 s2', expectedMatch: true, expectedScore: 3 },
]) {
  test(`official Group Score secondary-key rule: ${scenario.name}`, () => {
    const result = simulateWorldInfo({
      history: [scenario.history],
      lorebook: { entries: [entry(1, {
        key: ['head'],
        keysecondary: ['s1', 's2'],
        selective: true,
        selectiveLogic: scenario.logic,
      })] },
    });
    const row = candidate(result, 1);
    assert.equal(row.matching.matched, scenario.expectedMatch);
    assert.equal(row.matching.score, scenario.expectedScore);
  });
}

test('official Prioritize Inclusion selects the active prioritized entry with highest Order', () => {
  const result = simulateWorldInfo({
    history: ['x'],
    lorebook: { entries: [
      entry(1, { key: ['x'], group: 'g', groupOverride: true, order: 10 }),
      entry(2, { key: ['x'], group: 'g', groupOverride: true, order: 500 }),
      entry(3, { key: ['x'], group: 'g', order: 999 }),
    ] },
  });
  assert.deepEqual(result.includedEntryIds, ['2']);
  assert.equal(result.trace.groups[0].selection, 'prioritize-inclusion');
  assert.equal(result.trace.groups[0].winner, '2');
});

test('official vector gates require extension plus World Info enablement and support Enabled for all entries', () => {
  const vectorEntry = entry(1, { key: [], vectorized: true });
  const disabled = simulateWorldInfo({ history: ['query'], lorebook: { entries: [vectorEntry] } });
  assert.equal(disabled.status, 'PASS');
  assert.deepEqual(disabled.includedEntryIds, []);
  assert.equal(disabled.trace.vector.active, false);

  const partiallyEnabled = simulateWorldInfo({
    history: ['query'],
    vector: { extensionEnabled: true, worldInfoEnabled: false },
    lorebook: { entries: [vectorEntry] },
  });
  assert.equal(partiallyEnabled.status, 'PASS');
  assert.deepEqual(partiallyEnabled.includedEntryIds, []);

  const missingProvider = simulateWorldInfo({
    history: ['query'],
    vector: { extensionEnabled: true, worldInfoEnabled: true },
    lorebook: { entries: [vectorEntry] },
  });
  assert.equal(missingProvider.status, 'BLOCKED');
  assert.equal(missingProvider.blockers[0].code, 'VECTOR_PROVIDER_UNAVAILABLE');

  const enabledForAll = simulateWorldInfo({
    history: ['old', 'middle', 'new'],
    vectorProvider: new FakeVectorProvider([{ id: 2, score: 0.9 }]),
    vector: {
      extensionEnabled: true,
      worldInfoEnabled: true,
      enabledForAllEntries: true,
      queryMessages: 2,
      maxEntries: 1,
      scoreThreshold: 0.5,
    },
    lorebook: { entries: [entry(2, { key: [], vectorized: false })] },
  });
  assert.deepEqual(enabledForAll.includedEntryIds, ['2']);
  assert.equal(enabledForAll.trace.vector.query, 'middle\nnew');
  assert.equal(enabledForAll.trace.vector.enabledForAll, true);
});

test('official character/tag filter supports Include and Exclude with name-or-tag matching', () => {
  const base = {
    history: ['x'],
    character: { name: 'Mira', avatar: 'Mira.png', tags: ['night'] },
    chatMetadata: { tags: ['archive'] },
  };
  const includeByTag = simulateWorldInfo({
    ...base,
    lorebook: { entries: [entry(1, {
      key: ['x'],
      characterFilter: { names: ['Other'], tags: ['archive'], isExclude: false },
    })] },
  });
  assert.deepEqual(includeByTag.includedEntryIds, ['1']);

  const excludeByName = simulateWorldInfo({
    ...base,
    lorebook: { entries: [entry(1, {
      key: ['x'],
      characterFilter: { names: ['Mira'], tags: [], isExclude: true },
    })] },
  });
  assert.deepEqual(excludeByName.includedEntryIds, []);

  const excludeNoMatch = simulateWorldInfo({
    ...base,
    lorebook: { entries: [entry(1, {
      key: ['x'],
      characterFilter: { names: ['Other'], tags: ['other-tag'], isExclude: true },
    })] },
  });
  assert.deepEqual(excludeNoMatch.includedEntryIds, ['1']);
});

test('official Minimum Activations expands history depth until the target or Max Depth is reached', () => {
  const found = simulateWorldInfo({
    history: ['old-key', 'recent'],
    lorebook: {
      settings: { scanDepth: 1, minActivations: 1, minActivationsDepthMax: 2 },
      entries: [entry(1, { key: ['old-key'] })],
    },
  });
  assert.deepEqual(found.includedEntryIds, ['1']);
  assert.deepEqual(found.trace.recursion.minActivationSweeps, [{
    scanSkew: 1,
    effectiveDepth: 2,
    activatedCount: 0,
  }]);
  assert.ok(found.trace.recursion.levels.some((row) => row.scanState === 'MIN_ACTIVATIONS'));

  const capped = simulateWorldInfo({
    history: ['too-old', 'middle', 'recent'],
    lorebook: {
      settings: { scanDepth: 1, minActivations: 1, minActivationsDepthMax: 2 },
      entries: [entry(1, { key: ['too-old'] })],
    },
  });
  assert.deepEqual(capped.includedEntryIds, []);
  assert.equal(capped.trace.recursion.minActivationSweeps.at(-1).effectiveDepth, 2);
});

test('Minimum Activations and Max Recursion Steps are mutually exclusive', () => {
  const result = simulateWorldInfo({
    history: ['x'],
    lorebook: {
      settings: { minActivations: 1, maxRecursionSteps: 2 },
      entries: [entry(1, { key: ['x'] })],
    },
  });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.errors.some((error) => error.code === 'MIN_ACTIVATIONS_RECURSION_STEPS_CONFLICT'));
});

function sourceOrder(strategy) {
  const result = simulateWorldInfo({
    history: ['history'],
    character: { name: 'Mira' },
    persona: { name: 'P' },
    chatMetadata: { room: 'R' },
    lorebook: {
      settings: { sourceStrategy: strategy },
      entries: [entry('global', { constant: true, order: 300 })],
    },
    additionalCharacterLorebooks: [{ entries: [entry('character', { constant: true, order: 100 })] }],
    personaLorebooks: [{ entries: [entry('persona', { constant: true, order: 50 })] }],
    chatLorebooks: [{ entries: [entry('chat', { constant: true, order: 10 })] }],
  });
  assert.equal(result.status, 'PASS');
  return result.trace.order.map((row) => row.sourceKind);
}

test('official source merge strategies keep Chat then Persona and apply character/global strategy', () => {
  assert.deepEqual(sourceOrder('character_first'), ['chat', 'persona', 'character', 'global']);
  assert.deepEqual(sourceOrder('global_first'), ['chat', 'persona', 'global', 'character']);
  assert.deepEqual(sourceOrder('evenly'), ['chat', 'persona', 'global', 'character']);
});

test('official release defaults are represented by executable behavior', () => {
  const result = simulateWorldInfo({
    history: [
      { name: 'Old', content: 'third-message-key' },
      { name: 'Speaker', content: 'CONCATENATE' },
      { name: 'User', content: 'recent' },
    ],
    character: { description: 'character-only-key' },
    lorebook: { entries: [
      entry(1, { key: ['Speaker: concatenate'] }),
      entry(2, { key: ['cat'] }),
      entry(3, { key: ['third-message-key'] }),
      entry(4, { key: ['character-only-key'] }),
      entry(5, { key: ['recent'], content: 'descendant-key' }),
      entry(6, { key: ['descendant-key'] }),
    ] },
  });
  assert.ok(result.includedEntryIds.includes('1'), 'Include Names defaults to true');
  assert.ok(result.includedEntryIds.includes('2'), 'matching defaults to case-insensitive substring');
  assert.equal(result.includedEntryIds.includes('3'), false, 'Scan Depth defaults to 2');
  assert.equal(result.includedEntryIds.includes('4'), false, 'character description scanning defaults off');
  assert.equal(result.includedEntryIds.includes('6'), false, 'recursive scanning defaults off');
  assert.equal(result.trace.recursion.terminationReason, 'RECURSION_DISABLED');
  assert.ok(result.promptSegments.every((row) => row.order === 100));
});

test('official timed effects reset on swipe/delete/entry edit and are inherited by a branch', () => {
  const spec = entry(1, { key: ['trigger'], sticky: 2, cooldown: 2 });
  const first = simulateWorldInfo({ messageNumber: 5, history: ['trigger'], lorebook: { entries: [spec] } });
  assert.deepEqual(first.includedEntryIds, ['1']);

  for (const mutation of ['swipe', 'delete']) {
    const reset = simulateWorldInfo({
      messageNumber: 6,
      chatMutation: mutation,
      history: ['nothing'],
      timedState: first.timedState,
      lorebook: { entries: [spec] },
    });
    assert.deepEqual(reset.includedEntryIds, []);
    assert.ok(reset.trace.timedInvalidations.some((row) => row.reason === `CHAT_${mutation.toUpperCase()}`));
  }

  const branch = simulateWorldInfo({
    messageNumber: 6,
    chatMutation: 'branch',
    branchId: 'branch-b',
    history: ['nothing'],
    timedState: first.timedState,
    lorebook: { entries: [spec] },
  });
  assert.deepEqual(branch.includedEntryIds, ['1']);
  assert.equal(branch.timedState.branchId, 'branch-b');

  const edited = simulateWorldInfo({
    messageNumber: 6,
    history: ['nothing'],
    timedState: first.timedState,
    lorebook: { entries: [{ ...spec, content: 'edited content' }] },
  });
  assert.deepEqual(edited.includedEntryIds, []);
  assert.ok(edited.trace.timedInvalidations.some((row) => row.reason === 'ENTRY_HASH_CHANGED'));
});

test('official Automation ID queue follows trigger order, deduplicates IDs, and requires an adapter for execution', () => {
  const calls = [];
  const result = simulateWorldInfo({
    history: ['x'],
    automationAdapter(event) {
      calls.push(event.automationId);
      return { quickReply: event.automationId };
    },
    lorebook: { entries: [
      entry(1, { constant: true, automationId: 'same', order: 300 }),
      entry(2, { constant: true, automationId: 'same', order: 200 }),
      entry(3, { constant: true, automationId: 'other', order: 100 }),
    ] },
  });
  assert.deepEqual(calls, ['same', 'other']);
  assert.deepEqual(result.automationEvents.map((row) => [row.automationId, row.entryId, row.status]), [
    ['same', '1', 'EXECUTED'],
    ['other', '3', 'EXECUTED'],
  ]);
  assert.ok(result.automationEvents.every((row) => row.evidenceType === 'runtime-adapter'));

  const queued = simulateWorldInfo({
    history: ['x'],
    lorebook: { entries: [entry(1, { constant: true, automationId: 'queued' })] },
  });
  assert.equal(queued.automationEvents[0].status, 'QUEUED');
  assert.equal(queued.automationEvents[0].evidenceType, 'simulation');
});

for (const scenario of [
  { field: 'queryMessages', value: -1, code: 'VECTOR_QUERY_MESSAGES_INVALID' },
  { field: 'maxEntries', value: 1.5, code: 'VECTOR_MAX_ENTRIES_INVALID' },
  { field: 'scoreThreshold', value: 1.01, code: 'VECTOR_SCORE_THRESHOLD_INVALID' },
]) {
  test(`vector settings fail closed: ${scenario.field}=${scenario.value}`, () => {
    const result = simulateWorldInfo({
      history: ['q'],
      vectorProvider: new FakeVectorProvider([]),
      vector: {
        extensionEnabled: true,
        worldInfoEnabled: true,
        [scenario.field]: scenario.value,
      },
      lorebook: { entries: [entry(1, { key: [], vectorized: true })] },
    });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.errors.some((error) => error.code === scenario.code));
  });
}
