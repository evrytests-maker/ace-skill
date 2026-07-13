import path from "node:path";
import { readJsonFile } from "../lib/files.mjs";
import { SKILL_ROOT } from "../lib/enforcement.mjs";

function load(relative) {
  return readJsonFile(path.join(SKILL_ROOT, relative)).data;
}

export function selectWorkflowContext(workflowId) {
  const workflows = load("rules/workflows.json");
  const registry = load("rules/registry.json");
  const manual = load("rules/manual-gates.json");
  const sourceRegistry = load("rules/sources.json");
  const workflow = workflows.workflows.find((candidate) => candidate.id === workflowId);
  if (!workflow) {
    const available = workflows.workflows.map((candidate) => candidate.id).sort();
    throw new Error(`Unknown workflow: ${workflowId}. Available: ${available.join(", ")}`);
  }

  const ruleIds = new Set(workflow.rules);
  const validatorIds = new Set(workflow.validators);
  const manualGateIds = new Set(workflow.manualGates);
  const rules = registry.rules.filter((rule) => ruleIds.has(rule.id));
  const validators = registry.validators.filter((validator) => validatorIds.has(validator.id));
  const manualGates = manual.gates.filter((gate) => manualGateIds.has(gate.id));
  const sourceIds = new Set(rules.flatMap((rule) => rule.sources ?? []));
  const sources = sourceRegistry.sources.filter((source) => sourceIds.has(source.id));
  const conflicts = sourceRegistry.conflicts.filter((conflict) => (conflict.ruleIds ?? []).some((id) => ruleIds.has(id)));

  return {
    service: "workflow",
    operation: workflowId,
    status: "PASS",
    ok: true,
    exitCode: 0,
    errors: [],
    warnings: [],
    blockers: [],
    evidence: [{ kind: "projection", note: "Records are selected from canonical registries at runtime; no rule text is duplicated." }],
    data: {
      workflow,
      requiredReferences: workflow.requiredReferences,
      forbiddenReferences: workflow.forbiddenReferences,
      rules,
      validators,
      manualGates,
      sources,
      conflicts,
      counts: {
        rules: rules.length,
        validators: validators.length,
        manualGates: manualGates.length,
        sources: sources.length,
        conflicts: conflicts.length,
      },
    },
  };
}
