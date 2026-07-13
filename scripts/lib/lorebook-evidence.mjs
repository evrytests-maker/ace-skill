const ADVANCED_FIELDS = new Set([
  'position', 'depth', 'role', 'order', 'insertion_order', 'outlet', 'automationId',
  'automation_id', 'probability', 'useProbability', 'ignoreBudget', 'excludeRecursion',
  'preventRecursion', 'group', 'groups', 'inclusionGroup', 'groupOverride', 'groupWeight',
  'weight', 'sticky', 'cooldown', 'delay', 'vectorized', 'scanDepth', 'scan_depth',
  'characterFilter', 'character_filter', 'personaFilter', 'persona_filter', 'tagFilter',
  'tag_filter', 'generationTypes', 'generation_types', 'scope', 'attachments',
]);

function entriesOf(artifact) {
  const value = artifact?.entries ?? artifact?.character_book?.entries ?? artifact?.data?.character_book?.entries;
  if (Array.isArray(value)) return value.map((entry, index) => ({ entry, uid: entry?.uid ?? entry?.id ?? index, index }));
  if (value && typeof value === 'object') return Object.entries(value).map(([key, entry], index) => ({
    entry, uid: entry?.uid ?? entry?.id ?? key, index,
  }));
  return [];
}

export function advancedFieldEvidence(artifact) {
  const evidence = [];
  for (const { entry, uid, index } of entriesOf(artifact)) {
    if (!entry || typeof entry !== 'object') continue;
    for (const field of Object.keys(entry)) {
      if (ADVANCED_FIELDS.has(field)) evidence.push({ entryUid: uid, entryIndex: index, fieldPath: field });
    }
    for (const field of Object.keys(entry.extensions ?? {})) {
      if (ADVANCED_FIELDS.has(field) || ['position', 'depth', 'role', 'outlet', 'automation_id'].includes(field)) {
        evidence.push({ entryUid: uid, entryIndex: index, fieldPath: `extensions.${field}` });
      }
    }
  }
  return evidence;
}

export function classifyLorebookWorkflow(artifact) {
  const advancedFields = advancedFieldEvidence(artifact);
  return {
    workflow: advancedFields.length ? 'advanced' : 'basic',
    requiredGates: advancedFields.length ? ['VAL-LORE', 'VAL-SIMULATOR'] : ['VAL-LORE'],
    evidence: advancedFields,
  };
}

export function runtimeGateResult({ adapter, evidence, ruleId, name = 'world-info-runtime' } = {}) {
  if (!adapter) return {
    status: 'BLOCKED',
    kind: 'runtime',
    ruleId,
    blocker: 'RUNTIME_ADAPTER_UNAVAILABLE',
    evidence: { adapter: null, runtimeObserved: false, simulated: false, name },
  };
  if (!evidence || evidence.runtimeObserved !== true || !evidence.runId) return {
    status: 'BLOCKED',
    kind: 'runtime',
    ruleId,
    blocker: 'RUNTIME_EVIDENCE_MISSING',
    evidence: { adapter: adapter.name ?? 'anonymous', runtimeObserved: false, simulated: false, name },
  };
  return { status: 'PASS', kind: 'runtime', ruleId, evidence: { ...evidence, simulated: false, adapter: adapter.name ?? 'anonymous', name } };
}

/** Execute a real runtime adapter and validate the observation before allowing PASS. */
export async function executeRuntimeGate({ adapter, input, ruleId, name = 'world-info-runtime' } = {}) {
  if (!adapter) return runtimeGateResult({ adapter, ruleId, name });
  if (adapter.kind === 'fake' || adapter.kind === 'simulation') return {
    status: 'BLOCKED', kind: 'runtime', ruleId, blocker: 'RUNTIME_ADAPTER_SIMULATED',
    evidence: { adapter: adapter.name ?? adapter.kind, runtimeObserved: false, simulated: true, name },
  };
  const execute = adapter.verify ?? adapter.run ?? adapter.observe;
  if (typeof execute !== 'function') return {
    status: 'BLOCKED', kind: 'runtime', ruleId, blocker: 'RUNTIME_ADAPTER_METHOD_MISSING',
    evidence: { adapter: adapter.name ?? 'anonymous', runtimeObserved: false, simulated: false, name },
  };
  let observation;
  try {
    observation = await execute.call(adapter, input);
  } catch (error) {
    return {
      status: 'BLOCKED', kind: 'runtime', ruleId, blocker: 'RUNTIME_ADAPTER_ERROR',
      evidence: { adapter: adapter.name ?? 'anonymous', runtimeObserved: false, simulated: false, name, error: error.message },
    };
  }
  const evidence = { ...(observation?.evidence ?? observation), adapterInvoked: true };
  if (evidence.runtimeObserved !== true || !evidence.runId) return runtimeGateResult({ adapter, evidence, ruleId, name });
  const status = observation?.status ?? 'PASS';
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(status)) return {
    status: 'BLOCKED', kind: 'runtime', ruleId, blocker: 'RUNTIME_STATUS_UNKNOWN',
    evidence: { ...evidence, simulated: false, adapter: adapter.name ?? 'anonymous', name },
  };
  if (status !== 'PASS') return {
    status, kind: 'runtime', ruleId,
    ...(status === 'BLOCKED' ? { blocker: observation?.blocker ?? 'RUNTIME_REPORTED_BLOCKED' } : {}),
    evidence: { ...evidence, simulated: false, adapter: adapter.name ?? 'anonymous', name },
  };
  return runtimeGateResult({ adapter, evidence, ruleId, name });
}

export function simulationEvidence({ trace, ruleId }) {
  return {
    status: trace?.errors?.length ? 'FAIL' : trace?.blockers?.length ? 'BLOCKED' : 'PASS',
    kind: 'simulation',
    ruleId,
    evidence: { simulated: true, runtimeObserved: false, seed: trace?.seed, trace },
  };
}
