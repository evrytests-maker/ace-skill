import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readJson(relative, root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

export function writeJson(relative, value, root) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(relative, root = ROOT) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
}

export function makeRepoFixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-v5-test-'));
  for (const directory of ['rules', 'schemas', 'scripts', 'references', 'evals']) {
    const source = path.join(ROOT, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, directory), { recursive: true });
  }
  fs.mkdirSync(path.join(target, 'tests'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tests/catalog.json'), path.join(target, 'tests/catalog.json'));
  fs.cpSync(path.join(ROOT, 'tests/fixtures'), path.join(target, 'tests/fixtures'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(target, 'assets'), { recursive: true });
  for (const file of ['SKILL.md', 'package.json']) {
    if (fs.existsSync(path.join(ROOT, file))) fs.copyFileSync(path.join(ROOT, file), path.join(target, file));
  }
  const dependencies = path.join(ROOT, 'node_modules');
  if (fs.existsSync(dependencies)) fs.symlinkSync(dependencies, path.join(target, 'node_modules'), 'dir');
  return target;
}

export function removeFixture(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function buildValidLedger(workflowId = 'token-budget', root = ROOT) {
  const registry = readJson('rules/registry.json', root);
  const workflows = readJson('rules/workflows.json', root);
  const manualRegistry = readJson('rules/manual-gates.json', root);
  const workflow = workflows.workflows.find((candidate) => candidate.id === workflowId);
  if (!workflow) throw new Error(`Unknown test workflow: ${workflowId}`);
  const rules = new Map(registry.rules.map((rule) => [rule.id, rule]));
  const grouped = new Map();
  const artifactByGate = {
    'VAL-CARD': 'tests/fixtures/characters/v2-valid.json',
    'VAL-LORE': 'tests/fixtures/lorebooks/native-valid.json',
    'VAL-STYLE': 'tests/fixtures/characters/v2-valid.json',
    'VAL-TOKENS': 'assets/lorebook_template.json',
  };
  for (const ruleId of workflow.rules) {
    const rule = rules.get(ruleId);
    if (!rule) continue;
    const key = `${rule.gate.kind}:${rule.gate.id}`;
    if (!grouped.has(key)) grouped.set(key, { kind: rule.gate.kind, gateId: rule.gate.id, ruleIds: [] });
    grouped.get(key).ruleIds.push(rule.id);
  }
  const gates = [...grouped.values()].map((gate) => gate.kind === 'automatic'
    ? {
      ...gate,
      status: 'PASS',
      command: `fixture:${gate.gateId}`,
      cwd: root,
      exitCode: 0,
      artifacts: artifactByGate[gate.gateId] ? [{ path: artifactByGate[gate.gateId], sha256: sha256(artifactByGate[gate.gateId], root) }] : [],
      evidence: `Fresh fixture evidence for ${gate.gateId}.`,
      attempts: [{ at: '2026-07-10T12:00:00.500Z', exitCode: 0, stdout: `PASS: ${gate.gateId}\n`, stderr: '' }],
    }
    : {
      ...gate,
      status: 'PASS',
      reviewerRunId: `reviewer-${gate.gateId.toLocaleLowerCase('en-US')}`,
      evidence: `Independent fixture review for ${gate.gateId}.`,
      reviewEvidence: (manualRegistry.gates.find((candidate) => candidate.id === gate.gateId)?.requiredEvidence ?? []).map((criterion) => ({
        criterion,
        evidence: `Verified independently for fixture: ${criterion}`,
      })),
    });

  const artifactType = workflow.referenceCases ? 'lorebook' : undefined;
  const referencePolicy = artifactType ? workflow.referenceCases[artifactType] : null;
  return {
    runId: `fixture-${workflowId}`,
    repoHead: '48a8812b75e17145cc5ec66179d3e3b4ad96980e',
    workflowId,
    ...(artifactType ? { artifactType } : {}),
    startedAt: '2026-07-10T12:00:00.000Z',
    finishedAt: '2026-07-10T12:00:01.000Z',
    inputs: ['fixture input'],
    transitions: ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE', 'VERIFY', 'REPORT'],
    references: [...workflow.requiredReferences, ...(referencePolicy?.requiredReferences ?? [])].map((reference) => ({
      path: reference,
      sha256: sha256(reference, root),
      evidence: `Read ${reference} in a fresh test run.`,
    })),
    gates,
    overallStatus: 'PASS',
  };
}
