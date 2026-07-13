import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FakeVectorProvider, WORLD_INFO_REASON_CODES, createSeededPrng, createVectorProviderAdapter, simulateWorldInfo } from '../../scripts/lib/world-info-simulator.mjs';

const entry = (id, overrides = {}) => ({ uid: id, key: [`key${id}`], content: `entry ${id} content with enough detail`, ...overrides });
const run = (entries, overrides = {}) => simulateWorldInfo({ lorebook: { entries, settings: { tokenBudget: 1000, ...overrides.settings } }, history: ['key1 key2 key3 key4 key5'], seed: 'fixed', ...overrides });

test('selective logic IDs follow AND_ANY, NOT_ALL, NOT_ANY, AND_ALL truth table', () => {
  const expected = { 0: [false, true, true], 1: [true, true, false], 2: [true, false, false], 3: [false, false, true] };
  for (const [logic, outcomes] of Object.entries(expected)) {
    for (let hits = 0; hits <= 2; hits += 1) {
      const words = ['head', ...Array.from({ length: hits }, (_, index) => `s${index + 1}`)];
      const result = simulateWorldInfo({ seed: 1, history: [words.join(' ')], lorebook: { entries: [{
        uid: 1, key: ['head'], keysecondary: ['s1', 's2'], selective: true,
        selectiveLogic: Number(logic), content: 'selective content',
      }] } });
      assert.equal(result.includedEntryIds.includes('1'), outcomes[hits], `logic=${logic}, hits=${hits}`);
    }
  }
});

test('seeded PRNG has deterministic replay and explicit roll metadata', () => {
  const a = createSeededPrng('x'); const b = createSeededPrng('x');
  assert.deepEqual([a.next('a'), a.next('b')], [b.next('a'), b.next('b')]);
  assert.equal(a.snapshot().rolls, 2);
});

test('same input and seed produce byte-identical trace', () => {
  const input = { lorebook: { entries: [entry(1, { probability: 42 }), entry(2, { probability: 71 })] }, history: ['key1 key2'], seed: 923 };
  assert.deepEqual(simulateWorldInfo(input), simulateWorldInfo(input));
});

test('probability boundaries are exact and useProbability bypasses probability', () => {
  const result = run([entry(1, { probability: 0 }), entry(2, { probability: 100 }), entry(3, { probability: 0, useProbability: false })]);
  assert.deepEqual(result.includedEntryIds.sort(), ['2', '3']);
  assert.equal(result.trace.probability.find((item) => item.entryId === '1').passed, false);
  assert.equal(result.trace.probability.find((item) => item.entryId === '2').passed, true);
});

test('probability boundary property holds across many seeds', () => {
  for (let seed = 0; seed < 128; seed += 1) {
    const result = run([entry(1, { probability: 0 }), entry(2, { probability: 100 })], { seed });
    assert.deepEqual(result.includedEntryIds, ['2']);
  }
});

test('budget accounting, ignoreBudget, stable order and tie breaker are traced', () => {
  const result = run([entry(1, { order: 10 }), entry(2, { order: 10 }), entry(3, { order: 20, ignoreBudget: true })], { budgetPolicy: { budget: 6 }, tokenCounter: () => 4 });
  assert.deepEqual(result.includedEntryIds, ['3', '1']);
  assert.deepEqual(result.trace.budget.map(({ before, after }) => [before, after]), [[6, 6], [6, 2], [2, 2]]);
  assert.equal(result.trace.budget[2].reason, 'BUDGET_EXCEEDED');
  assert.ok(result.trace.budget.every(({ after }) => after >= 0));
});

test('recursion activates linear chain and terminates on fixed point', () => {
  const result = simulateWorldInfo({ lorebook: { entries: [entry(1, { key: ['start'], content: 'alpha' }), entry(2, { key: ['alpha'], content: 'beta' }), entry(3, { key: ['beta'], content: 'done' })], settings: { recursiveScanning: true, maxRecursionDepth: 8 } }, history: ['start'] });
  assert.deepEqual(result.trace.recursion.waves.slice(0, 3), [['1'], ['2'], ['3']]);
  assert.equal(result.trace.recursion.terminationReason, 'NO_NEW_ACTIVATIONS');
});

test('recursion cycles terminate and depth limit is explicit', () => {
  const cycle = simulateWorldInfo({ lorebook: { entries: [entry(1, { key: ['start', 'b'], content: 'a' }), entry(2, { key: ['a'], content: 'b' })], settings: { recursiveScanning: true, maxRecursionDepth: 8 } }, history: ['start'] });
  assert.equal(new Set(cycle.includedEntryIds).size, cycle.includedEntryIds.length);
  const limit = simulateWorldInfo({ lorebook: { entries: [entry(1, { key: ['start'], content: 'a' }), entry(2, { key: ['a'], content: 'b' })], settings: { recursiveScanning: true, maxRecursionDepth: 0 } }, history: ['start'] });
  assert.equal(limit.trace.recursion.terminationReason, 'DEPTH_LIMIT');
  assert.ok(cycle.trace.recursion.cycles.some((path) => path.length > 2));
});

test('recursion graph detects a self-cycle without looping', () => {
  const result = simulateWorldInfo({ lorebook: { entries: [entry(1, { key: ['loop'], content: 'loop' })] }, history: ['loop'] });
  assert.deepEqual(result.trace.recursion.cycles, [['1', '1']]);
  assert.deepEqual(result.includedEntryIds, ['1']);
});

test('incoming and outgoing recursion flags are enforced', () => {
  const result = simulateWorldInfo({ lorebook: { settings: { recursiveScanning: true }, entries: [entry(1, { key: ['start'], content: 'alpha', preventRecursion: true }), entry(2, { key: ['alpha'], excludeRecursion: true })] }, history: ['start'] });
  assert.deepEqual(result.includedEntryIds, ['1']);
  assert.equal(result.trace.recursion.terminationReason, 'OUTGOING_RECURSION_FORBIDDEN');
});

test('weighted groups only choose eligible member and replay deterministically', () => {
  const entries = [entry(1, { group: 'g', groupWeight: 1 }), entry(2, { group: 'g', groupWeight: 9 }), entry(3, { group: 'other', groupWeight: 999, key: ['absent'] })];
  const a = run(entries); const b = run(entries);
  assert.deepEqual(a.includedEntryIds, b.includedEntryIds);
  assert.equal(a.includedEntryIds.filter((id) => ['1', '2'].includes(id)).length, 1);
  assert.equal(a.trace.groups[0].members.some((member) => member.id === '3'), false);
});

test('group override and overlapping membership exclude every non-winner', () => {
  const result = run([entry(1, { groups: ['a', 'b'] }), entry(2, { group: 'a', groupOverride: true }), entry(3, { group: 'b' })]);
  assert.equal(result.includedEntryIds.includes('1'), false);
  assert.equal(result.trace.groups.find((group) => group.group === 'a').winner, '2');
});

test('group score uses actual primary and selective secondary matches before weight', () => {
  const result = simulateWorldInfo({ seed: 4, history: ['head extra s1 s2'], lorebook: { settings: { useGroupScoring: true }, entries: [
    entry(1, { key: ['head'], group: 'g', groupWeight: 100 }),
    entry(2, { key: ['head', 'extra'], keysecondary: ['s1', 's2'], selective: true, selectiveLogic: 3, group: 'g', groupWeight: 1 }),
  ] } });
  assert.deepEqual(result.includedEntryIds, ['2']);
  assert.deepEqual(result.trace.groups[0].members.map(({ id, score }) => [id, score]), [['1', 1], ['2', 4]]);
});

test('comma-separated overlapping groups resolve one group at a time and Prioritize Inclusion wins its group', () => {
  const result = run([
    entry(1, { group: 'a, b', important: true }),
    entry(2, { groups: ['a', 'c'], key: ['key2', 'key3'] }),
    entry(3, { group: ['c'] }),
  ]);
  assert.deepEqual(result.includedEntryIds, ['1', '3']);
  assert.deepEqual(result.trace.groups.map((row) => row.group), ['a', 'b', 'c']);
  assert.equal(result.trace.groups[0].winner, '1');
  assert.equal(result.trace.groups[0].selection, 'prioritize-inclusion');
});

test('invalid group names, weights and orphan override fail validation', () => {
  const result = run([entry(1, { group: '', groupWeight: 0, groupOverride: true })]);
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(new Set(result.errors.map((error) => error.code)), new Set(['GROUP_NAME_INVALID', 'GROUP_WEIGHT_INVALID', 'GROUP_OVERRIDE_WITHOUT_GROUP']));
});

test('delay, sticky, cooldown state is serializable and boundary-safe', () => {
  const delayed = run([entry(1, { delay: 2, sticky: 1, cooldown: 3 })], { messageNumber: 1 });
  assert.deepEqual(delayed.includedEntryIds, []);
  const active = run([entry(1, { delay: 2, sticky: 1, cooldown: 3 })], { messageNumber: 2 });
  assert.deepEqual(active.includedEntryIds, ['1']);
  const sticky = run([entry(1, { delay: 2, sticky: 1, cooldown: 3 })], { history: ['nothing'], messageNumber: 3, timedState: active.timedState });
  assert.deepEqual(sticky.includedEntryIds, ['1']);
  const cooldown = run([entry(1, { delay: 2, sticky: 1, cooldown: 3 })], { messageNumber: 4, timedState: active.timedState });
  assert.deepEqual(cooldown.includedEntryIds, []);
  assert.doesNotThrow(() => JSON.stringify(active.timedState));
});

test('active sticky state bypasses a new probability roll', () => {
  const initial = run([entry(1, { sticky: 2, probability: 100 })], { messageNumber: 1 });
  const sticky = run([entry(1, { sticky: 2, probability: 100 })], { history: ['nothing'], messageNumber: 2, timedState: initial.timedState });
  assert.deepEqual(sticky.includedEntryIds, ['1']);
  assert.equal(sticky.trace.probability[0].bypassReason, 'TIMED_STICKY_ACTIVE');
});

test('sticky does not extend on replay and cooldown starts only after sticky ends', () => {
  const first = run([entry(1, { sticky: 2, cooldown: 2 })], { messageNumber: 5 });
  const { entryHash, ...effect } = first.timedState.entries['1'];
  assert.deepEqual(effect, { lastActivated: 5, stickyUntil: 7, cooldownStartsAt: 8, cooldownUntil: 9 });
  assert.ok(Number.isInteger(entryHash));
  const replay = run([entry(1, { sticky: 2, cooldown: 2 })], { history: ['none'], messageNumber: 6, timedState: first.timedState });
  assert.deepEqual(replay.timedState.entries['1'], first.timedState.entries['1']);
  assert.deepEqual(run([entry(1, { sticky: 2, cooldown: 2 })], { messageNumber: 7, timedState: first.timedState }).includedEntryIds, ['1']);
  assert.deepEqual(run([entry(1, { sticky: 2, cooldown: 2 })], { messageNumber: 8, timedState: first.timedState }).includedEntryIds, []);
  assert.deepEqual(run([entry(1, { sticky: 2, cooldown: 2 })], { messageNumber: 9, timedState: first.timedState }).includedEntryIds, []);
  assert.deepEqual(run([entry(1, { sticky: 2, cooldown: 2 })], { messageNumber: 10, timedState: first.timedState }).includedEntryIds, ['1']);
});

test('negative and fractional timed values fail closed without activation', () => {
  const result = run([entry(1, { delay: -2, sticky: 0.5, cooldown: -1 })], { messageNumber: 0 });
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.includedEntryIds, []);
  assert.equal(result.errors.filter((error) => error.code === 'TIMED_VALUE_INVALID').length, 3);
});

test('filters and all configured scan sources preserve provenance', () => {
  const result = simulateWorldInfo({ lorebook: { entries: [entry(1, { key: ['secret'], characterFilter: ['Mira'], personaFilter: ['P'], tagFilter: ['night'], generationTypeFilter: ['continue'] })], settings: { scanCharacter: true, scanPersona: true, scanChatMetadata: true } }, history: ['hello'], character: { name: 'Mira', description: 'secret keeper' }, persona: { name: 'P', description: 'traveler' }, chatMetadata: { tags: ['night'], room: 'archive' }, generationType: 'continue' });
  assert.deepEqual(result.includedEntryIds, ['1']);
  assert.deepEqual(result.trace.scanBuffer.segments.map((segment) => segment.source), ['history', 'persona_description', 'character_description', 'chat_metadata']);
  assert.ok(result.trace.filters[0].checks.every((check) => check.passed));
});

test('entry matching settings override global case and whole-word settings', () => {
  const result = simulateWorldInfo({ lorebook: { entries: [entry(1, { key: ['Key'], caseSensitive: true, matchWholeWords: true }), entry(2, { key: ['key'], caseSensitive: false, matchWholeWords: false })], settings: { caseSensitive: false, wholeWords: false } }, history: ['KEYSTONE'] });
  assert.deepEqual(result.includedEntryIds, ['2']);
});

test('entry scanDepth and scan source list override global scan buffer', () => {
  const result = simulateWorldInfo({ history: ['old-secret', 'recent'], character: { name: 'Mira', description: 'character-secret' }, lorebook: { settings: { scanDepth: 2, scanCharacter: true }, entries: [
    entry(1, { key: ['old-secret'], scanDepth: 1 }),
    entry(2, { key: ['character-secret'], scanSources: ['history'] }),
    entry(3, { key: ['character-secret'], scanSources: ['character_description'] }),
  ] } });
  assert.deepEqual(result.includedEntryIds, ['3']);
  assert.equal(result.trace.scanBuffers.find((row) => row.entryId === '1').segments.filter((segment) => segment.source === 'history').length, 1);
  assert.deepEqual(result.trace.scanBuffers.find((row) => row.entryId === '2').segments.map((segment) => segment.source), ['history', 'history']);
});

test('missing required scan source is BLOCKED, never PASS', () => {
  const result = simulateWorldInfo({ lorebook: { entries: [entry(1)], settings: { scanPersona: true, requirePersona: true } }, history: ['key1'] });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.blockers[0].code, 'SCAN_SOURCE_UNAVAILABLE');
});

test('vector adapter is required and fake candidates pass through filters/probability/budget', () => {
  const vectorEntry = entry(1, { key: [], vectorized: true, probability: 100, characterFilter: ['Mira'] });
  const disabled = simulateWorldInfo({ lorebook: { entries: [vectorEntry] }, history: ['stars'] });
  assert.equal(disabled.status, 'PASS');
  assert.deepEqual(disabled.includedEntryIds, []);
  const blocked = simulateWorldInfo({ lorebook: { entries: [vectorEntry] }, history: ['stars'], vector: { extensionEnabled: true, worldInfoEnabled: true } });
  assert.equal(blocked.status, 'BLOCKED');
  const provider = new FakeVectorProvider([{ id: 1, score: 0.9 }]);
  const result = simulateWorldInfo({ lorebook: { entries: [vectorEntry] }, history: ['stars'], character: { name: 'Mira' }, vectorProvider: provider, vector: { extensionEnabled: true, worldInfoEnabled: true, scoreThreshold: 0.5, maxEntries: 1 }, budgetPolicy: { budget: 100 } });
  assert.deepEqual(result.includedEntryIds, ['1']);
  assert.equal(result.trace.vector.evidenceType, 'simulation');
  assert.equal(createVectorProviderAdapter(() => []).kind, 'runtime-adapter');
});

test('vector max entries, threshold and ties are deterministic', () => {
  const provider = new FakeVectorProvider([{ id: 2, score: .8 }, { id: 1, score: .8 }, { id: 3, score: .2 }]);
  const result = simulateWorldInfo({ lorebook: { entries: [1, 2, 3].map((id) => entry(id, { key: [], vectorized: true })) }, history: ['q'], vectorProvider: provider, vector: { scoreThreshold: .5, maxEntries: 1 } });
  assert.deepEqual(result.includedEntryIds, ['1']);
});

test('vector embed+query interface is traced and legacy retrieve adapter stays compatible', () => {
  const modern = simulateWorldInfo({ history: ['star map'], vectorProvider: new FakeVectorProvider(), lorebook: { entries: [entry(1, { key: [], vectorized: true, content: 'star map archive' })] } });
  assert.equal(modern.trace.vector.interface, 'embed+query');
  assert.equal(Array.isArray(modern.trace.vector.queryEmbedding), true);
  const legacy = createVectorProviderAdapter(({ entries }) => [{ id: entries[0].id, score: 1 }]);
  assert.deepEqual(simulateWorldInfo({ history: ['q'], vectorProvider: legacy, lorebook: { entries: [entry(1, { key: [], vectorized: true })] } }).includedEntryIds, ['1']);
  const asyncProvider = { query: async () => [] };
  const blocked = simulateWorldInfo({ history: ['q'], vectorProvider: asyncProvider, lorebook: { entries: [entry(1, { key: [], vectorized: true })] } });
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.blockers[0].code, 'VECTOR_PROVIDER_ERROR');
});

test('budget-rejected recursion source cannot activate descendants', () => {
  const result = simulateWorldInfo({ history: ['start'], tokenCounter: () => 10, budgetPolicy: { budget: 0 }, lorebook: { entries: [entry(1, { key: ['start'], content: 'descendant-key' }), entry(2, { key: ['descendant-key'] })] } });
  assert.deepEqual(result.includedEntryIds, []);
  assert.equal(result.trace.recursion.terminationReason, 'BUDGET_REJECTED_ALL_SOURCES');
  assert.equal(result.trace.candidates.some((candidate) => candidate.entryId === '2' && candidate.reasons.includes('KEY_MATCHED')), false);
});

test('advanced placement models position, role, depth and keeps Outlet outside automatic insertion', () => {
  const result = run([entry(1, { position: 'outlet', outlet: 'memory', role: 'assistant', order: 10 }), entry(2, { position: 'at_depth', depth: 2, role: 'system', order: 20 }), entry(3, { position: 'before_char', role: 'user', order: 30 })]);
  assert.deepEqual(result.promptSegments.map((item) => item.entryId), ['3', '2']);
  assert.deepEqual(result.rawPrompt.map(({ role, outlet }) => [role, outlet]), [['user', null], ['system', null]]);
  assert.deepEqual(result.outletEntries, { memory: ['entry 1 content with enough detail'] });
  assert.ok(result.promptSegments.every((segment) => segment.provenance.fieldPath.endsWith('.content')));
  assert.equal(result.evidenceType, 'simulation');
});

test('assembled prompt places entries into character/examples/AN/history skeleton', () => {
  const result = simulateWorldInfo({ character: { description: 'CHAR', examples: ['EXAMPLE'] }, authorNote: 'NOTE', history: [{ role: 'user', content: 'H1' }, { role: 'assistant', content: 'H2' }], lorebook: { entries: [
    entry(1, { constant: true, position: 'before_char', role: 'system' }),
    entry(2, { constant: true, position: 'at_depth', depth: 1, role: 'assistant' }),
    entry(3, { constant: true, position: 'outlet', outlet: 'memory', role: 'user' }),
  ] } });
  const sources = result.simulatedRawPrompt.map((segment) => segment.entryId ?? segment.source);
  assert.ok(sources.indexOf('1') < sources.indexOf('character'));
  assert.deepEqual(sources.slice(sources.indexOf('history'), sources.lastIndexOf('history') + 1), ['history', '2', 'history']);
  assert.equal(result.simulatedRawPrompt.some((segment) => segment.entryId === '3'), false);
  assert.deepEqual(result.outletEntries, { memory: ['entry 3 content with enough detail'] });
});

test('numeric positions follow current SillyTavern anchors and actual prompt segment order', () => {
  const result = simulateWorldInfo({
    character: { description: 'CHAR', examples: ['EXAMPLE'] },
    authorNote: 'NOTE',
    history: [{ role: 'user', content: 'H1' }, { role: 'assistant', content: 'H2' }],
    lorebook: { entries: Array.from({ length: 8 }, (_, position) => entry(position, {
      constant: true,
      position,
      depth: position === 4 ? 1 : 0,
      outlet: position === 7 ? 'memory' : null,
    })) },
  });
  const normalized = Object.fromEntries(result.promptSegments.map((segment) => [segment.entryId, segment.position]));
  assert.deepEqual(normalized, {
    0: 'before_char', 1: 'after_char', 2: 'top_an', 3: 'bottom_an',
    4: 'at_depth', 5: 'em_top', 6: 'em_bottom',
  });
  assert.deepEqual(result.outletEntries, { memory: ['entry 7 content with enough detail'] });
  const sources = result.simulatedRawPrompt.map((segment) => segment.entryId ?? segment.source);
  assert.deepEqual(sources, ['0', 'character', '1', '5', 'examples', '6', '2', 'author_note', '3', 'history', '4', 'history']);
});

test('at-depth uses the SillyTavern default depth when unset and stale outlet metadata does not change placement', () => {
  const result = run([entry(1, { position: 'at_depth', depth: null, outlet: 'memory' })]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.promptSegments[0].position, 'at_depth');
  assert.equal(result.promptSegments[0].depth, 4);
  assert.deepEqual(result.outletEntries, {});
});

test('embedded lorebook, disabled entries, attachment conflicts and typo suggestions are explicit', () => {
  const embedded = simulateWorldInfo({ data: { character_book: { entries: [entry(1, { enabled: false }), entry(2, { positon: 'before_char' })] } }, history: ['key1 key2'], character: { name: 'Mira' } });
  assert.equal(embedded.includedEntryIds.includes('1'), false);
  assert.equal(embedded.errors.find((error) => error.code === 'UNKNOWN_FIELD').suggestion, 'position');
  const conflict = simulateWorldInfo({ entries: [entry(1)], character_book: { entries: [entry(2)] }, history: ['key1'] });
  assert.equal(conflict.status, 'FAIL');
  assert.equal(conflict.errors[0].code, 'ATTACHMENT_CONFLICT');
});

test('scope attachments fail closed when missing or duplicated', () => {
  const missing = run([entry(1, { scope: 'persona' })], { persona: null });
  assert.equal(missing.status, 'BLOCKED');
  assert.equal(missing.blockers[0].code, 'SCOPE_ATTACHMENT_MISSING');
  const duplicate = run([entry(1, { scope: 'chat' })], { chatMetadata: { room: 'x' }, attachments: { chat: ['a', 'a'] } });
  assert.equal(duplicate.status, 'FAIL');
  assert.equal(duplicate.errors[0].code, 'DUPLICATE_SCOPE_ATTACHMENT');
});

test('multiple distinct character lorebooks namespace UIDs while local duplicates fail', () => {
  const valid = simulateWorldInfo({ character: { name: 'Mira' }, history: ['a b'], additionalCharacterLorebooks: [
    { entries: [entry(1, { key: ['a'] })] },
    { entries: [entry(2, { key: ['b'] })] },
  ] });
  assert.equal(valid.status, 'PASS');
  assert.deepEqual(valid.includedEntryIds, ['additionalCharacterLorebooks.0.entries#1', 'additionalCharacterLorebooks.1.entries#2']);
  assert.ok(valid.promptSegments.every((segment) => segment.provenance.containerPath.startsWith('additionalCharacterLorebooks.')));
  const sameUidDifferentBooks = simulateWorldInfo({ character: { name: 'Mira' }, history: ['a'], additionalCharacterLorebooks: [{ entries: [entry(1, { key: ['a'] })] }, { entries: [entry(1, { key: ['a'] })] }] });
  assert.equal(sameUidDifferentBooks.status, 'PASS');
  assert.equal(new Set(sameUidDifferentBooks.includedEntryIds).size, 2);
  const duplicate = simulateWorldInfo({ character: { name: 'Mira' }, history: ['a'], additionalCharacterLorebooks: [{ entries: [entry(1, { key: ['a'] }), entry(1, { key: ['a'] })] }] });
  assert.equal(duplicate.status, 'FAIL');
  assert.ok(duplicate.errors.some((error) => error.code === 'DUPLICATE_ENTRY_ID'));
});

test('combined fixture satisfies pipeline invariants', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/simulator/combined-conflicts.json', import.meta.url), 'utf8'));
  fixture.vectorProvider = new FakeVectorProvider([{ id: 5, score: .9 }]);
  const result = simulateWorldInfo(fixture);
  assert.equal(result.status, 'PASS');
  assert.equal(result.includedEntryIds.includes('4'), false);
  assert.equal(new Set(result.includedEntryIds).size, result.includedEntryIds.length);
  assert.ok(result.trace.budget.every(({ after }) => after >= 0));
  assert.ok(result.trace.candidates.every((candidate) => !(candidate.status === 'INCLUDED' && candidate.reasons.includes('ENTRY_DISABLED'))));
});

test('simulation core contains no direct random source and reason codes stay stable', () => {
  const source = fs.readFileSync(new URL('../../scripts/lib/world-info-simulator.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('Math.' + 'random('), false);
  assert.ok(WORLD_INFO_REASON_CODES.includes('BUDGET_EXCEEDED'));
});
