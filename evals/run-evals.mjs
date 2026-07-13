#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runProcess } from '../scripts/lib/process-runner.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_REF = '48a8812b75e17145cc5ec66179d3e3b4ad96980e';
const EXIT = Object.freeze({ PASS: 0, FAIL: 1, USAGE: 2, BLOCKED: 3 });
const REQUIRED_BEHAVIOR_FIELDS = [
  'id', 'prompt', 'shouldTrigger', 'requiredWorkflow', 'requiredReferences', 'forbiddenReferences',
  'requiredRules', 'requiredValidators', 'requiredOutputs', 'assertions', 'prohibitedBehavior', 'evidence',
];

function usage() {
  console.log(`ACE v5 fresh-context evaluation harness

Usage:
  node evals/run-evals.mjs --suite triggers|behavior|all [options]

Options:
  --runner <executable>       Fresh-context runner (default: ACE_EVAL_RUNNER or codex)
  --runs <n>                  Repetitions per trigger query (default: 3; acceptance requires 3+)
  --versions current|baseline|both  Compared skill versions (default: both)
  --baseline-ref <git-ref>    Baseline exported with git archive (default: ${BASELINE_REF})
  --output <file>             JSON report path (default: .ace-reports/evals-latest.json)
  --json                      Print the final report object to stdout as JSON
  --validate-data             Validate datasets only; reports VALIDATED, never an eval PASS
  --help                      Show help

Runner contract:
  The executable must support the codex exec interface. Each task uses --ephemeral and a new
  process. If the executable, auth, network, or a required output is unavailable, exit is 3.
  Optional extra runner args may be supplied as a JSON array in ACE_EVAL_RUNNER_ARGS.`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function parseArgs(argv) {
  const options = {
    suite: 'all', runner: process.env.ACE_EVAL_RUNNER || 'codex', runs: 3, versions: 'both',
    baselineRef: process.env.ACE_BASELINE_REF || BASELINE_REF,
    output: path.join(ROOT, '.ace-reports/evals-latest.json'), validateData: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--suite') options.suite = argv[++i];
    else if (arg === '--runner') options.runner = argv[++i];
    else if (arg === '--runs') options.runs = Number(argv[++i]);
    else if (arg === '--versions') options.versions = argv[++i];
    else if (arg === '--baseline-ref') options.baselineRef = argv[++i];
    else if (arg === '--output') options.output = path.resolve(argv[++i]);
    else if (arg === '--validate-data') options.validateData = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') return { help: true };
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!['triggers', 'behavior', 'all'].includes(options.suite)) throw new Error(`Unknown suite: ${options.suite}`);
  if (!['current', 'baseline', 'both'].includes(options.versions)) throw new Error(`Unknown versions mode: ${options.versions}`);
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 10) throw new Error('--runs must be an integer from 1 to 10');
  if (!options.runner) throw new Error('--runner requires an executable');
  return options;
}

export function validateDatasets() {
  const errors = [];
  let train;
  let validation;
  let behavior;
  let workflows;
  let registry;
  try {
    train = readJson('evals/triggers.train.json').cases;
    validation = readJson('evals/triggers.validation.json').cases;
    behavior = readJson('evals/behavior.json').cases;
    workflows = readJson('rules/workflows.json').workflows;
    registry = readJson('rules/registry.json');
  } catch (error) {
    return { errors: [error.message], counts: {} };
  }
  const trigger = [...train, ...validation];
  if (train.length !== 20) errors.push(`trigger train count is ${train.length}, expected 20`);
  if (validation.length !== 12) errors.push(`trigger validation count is ${validation.length}, expected 12`);
  if (trigger.length !== 32) errors.push(`trigger total is ${trigger.length}, expected 32`);
  if (new Set(trigger.map((item) => item.id)).size !== trigger.length) errors.push('trigger IDs are not unique');
  if (trigger.filter((item) => item.shouldTrigger === true).length !== 16) errors.push('trigger positives must total 16');
  if (trigger.filter((item) => item.shouldTrigger === false).length !== 16) errors.push('trigger negatives must total 16');
  for (const [name, rows] of [['train', train], ['validation', validation]]) {
    if (rows.filter((item) => item.shouldTrigger === true).length !== rows.length / 2) errors.push(`${name} is not balanced`);
    for (const item of rows) {
      if (!item.id || typeof item.query !== 'string' || typeof item.shouldTrigger !== 'boolean' || !item.category || !item.rationale) errors.push(`${name}/${item.id ?? '?'} is incomplete`);
    }
  }
  for (const category of ['typo', 'near-miss', 'buried', 'multi-step', 'colloquial']) {
    if (!trigger.some((item) => item.category === category)) errors.push(`trigger corpus misses ${category}`);
  }
  if (behavior.length !== 20) errors.push(`behavior count is ${behavior.length}, expected 20`);
  if (new Set(behavior.map((item) => item.id)).size !== behavior.length) errors.push('behavior IDs are not unique');
  const repeatedAdversarial = new Set(['B07-SELECTIVE-LOGIC', 'B15-FAIL-NOT-PASS', 'B17-NEAR-MISS-NO-TRIGGER']);
  for (const item of behavior) {
    for (const field of REQUIRED_BEHAVIOR_FIELDS) if (!Object.hasOwn(item, field)) errors.push(`${item.id ?? '?'} misses ${field}`);
    for (const field of ['requiredReferences', 'forbiddenReferences', 'requiredRules', 'requiredValidators', 'requiredOutputs', 'assertions', 'prohibitedBehavior', 'evidence']) {
      if (!Array.isArray(item[field])) errors.push(`${item.id ?? '?'}/${field} must be an array`);
    }
    if (!item.assertions?.length || !item.prohibitedBehavior?.length || !item.evidence?.length) errors.push(`${item.id ?? '?'} has an empty grading contract`);
    if (item.repetitions !== undefined && (!Number.isInteger(item.repetitions) || item.repetitions < 1 || item.repetitions > 3)) errors.push(`${item.id ?? '?'} repetitions must be an integer from 1 to 3`);
    if (repeatedAdversarial.has(item.id) && item.repetitions !== 3) errors.push(`${item.id} must run three adversarial repetitions`);
    if (item.shouldTrigger) {
      const workflow = workflows.find((candidate) => candidate.id === item.requiredWorkflow);
      if (!workflow) errors.push(`${item.id ?? '?'} has unknown requiredWorkflow ${item.requiredWorkflow}`);
      else {
        for (const reference of workflow.requiredReferences) if (!item.requiredReferences.includes(reference)) errors.push(`${item.id} misses workflow reference ${reference}`);
        for (const reference of workflow.forbiddenReferences) if (!item.forbiddenReferences.includes(reference)) errors.push(`${item.id} misses forbidden reference ${reference}`);
        for (const validator of workflow.validators) if (!item.requiredValidators.includes(validator)) errors.push(`${item.id} misses workflow validator ${validator}`);
        for (const rule of item.requiredRules) if (rule !== 'ACE-TRIGGER-001' && !workflow.rules.includes(rule)) errors.push(`${item.id} requires ${rule}, which is outside ${workflow.id}`);
      }
    } else if (item.requiredWorkflow !== null || item.requiredReferences.length || item.requiredValidators.length || item.requiredRules.some((rule) => rule !== 'ACE-TRIGGER-001')) {
      errors.push(`${item.id ?? '?'} is a non-trigger case but declares ACE workflow requirements`);
    }
    const validatorIds = new Set(registry.validators.map((candidate) => candidate.id));
    const ruleIds = new Set(registry.rules.map((candidate) => candidate.id));
    for (const validator of item.requiredValidators) if (!validatorIds.has(validator)) errors.push(`${item.id} references unknown validator ${validator}`);
    for (const rule of item.requiredRules) if (!ruleIds.has(rule)) errors.push(`${item.id} references unknown rule ${rule}`);
    for (const match of item.prompt.matchAll(/\binputs\/([a-z0-9-]+\.json)\b/gu)) {
      const input = path.join(ROOT, 'evals/inputs', match[1]);
      if (!fs.existsSync(input)) errors.push(`${item.id} references missing evaluation input inputs/${match[1]}`);
    }
  }
  const inputDirectory = path.join(ROOT, 'evals/inputs');
  if (!fs.existsSync(inputDirectory)) errors.push('evals/inputs is missing');
  else {
    for (const name of fs.readdirSync(inputDirectory).filter((item) => item.endsWith('.json'))) {
      try { JSON.parse(fs.readFileSync(path.join(inputDirectory, name), 'utf8')); }
      catch (error) { errors.push(`evals/inputs/${name} is invalid JSON: ${error.message}`); }
    }
  }
  return {
    errors,
    counts: {
      triggerTrain: train.length,
      triggerValidation: validation.length,
      triggerPositive: trigger.filter((item) => item.shouldTrigger).length,
      triggerNegative: trigger.filter((item) => !item.shouldTrigger).length,
      behavior: behavior.length,
    },
  };
}

function extraRunnerArgs() {
  if (!process.env.ACE_EVAL_RUNNER_ARGS) return [];
  try {
    const parsed = JSON.parse(process.env.ACE_EVAL_RUNNER_ARGS);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) throw new Error('not a string array');
    return parsed;
  } catch (error) {
    throw new Error(`ACE_EVAL_RUNNER_ARGS must be a JSON string array: ${error.message}`);
  }
}

async function probeRunner(executable) {
  const probe = await runProcess(executable, ['--version'], { timeoutMs: 20_000 });
  if (probe.error) return { ok: false, reason: probe.error.message };
  if (probe.timedOut) return { ok: false, reason: 'runner version probe timed out' };
  if (probe.outputOverflow) return { ok: false, reason: 'runner version output exceeded the safety limit' };
  if (probe.status !== 0) return { ok: false, reason: (probe.stderr || probe.stdout || `exit ${probe.status}`).trim() };
  return { ok: true, version: probe.stdout.trim() };
}

function copySkill(source, workspace) {
  const destination = path.join(workspace, '.agents/skills/ace-skill');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (candidate) => !['.git', 'node_modules', '.ace-reports'].includes(path.basename(candidate)),
  });
  const dependencies = path.join(source, 'node_modules');
  if (fs.existsSync(dependencies)) fs.symlinkSync(dependencies, path.join(destination, 'node_modules'), 'dir');
  return destination;
}

function copyEvaluationInputs(workspace) {
  const source = path.join(ROOT, 'evals/inputs');
  const destination = path.join(workspace, 'inputs');
  if (!fs.existsSync(source)) throw new Error('evals/inputs is missing');
  fs.cpSync(source, destination, { recursive: true });
  return destination;
}

function isolateGrader(workspace) {
  const placeholder = path.join(workspace, '.agents/skills/ace-skill');
  fs.mkdirSync(placeholder, { recursive: true });
  fs.writeFileSync(path.join(placeholder, 'SKILL.md'), `---\nname: ace-skill\ndescription: Disabled placeholder for an independent evaluation grader. Never invoke this skill.\n---\n\n# Disabled\n\nDo not load domain rules or perform the actor task. Grade only the evidence supplied in the evaluator prompt.\n`);
}

async function exportBaseline(ref, tempRoot) {
  const destination = path.join(tempRoot, 'baseline-source');
  fs.mkdirSync(destination, { recursive: true });
  const archive = await runProcess('git', ['archive', '--format=tar', ref], {
    cwd: ROOT,
    timeoutMs: 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (archive.error || archive.timedOut || archive.outputOverflow) {
    const reason = archive.error?.message ?? (archive.timedOut ? 'timed out' : 'output exceeded the safety limit');
    throw Object.assign(new Error(`git archive is unavailable: ${reason}`), { blocked: true });
  }
  if (archive.status !== 0) throw new Error(`git archive ${ref} failed: ${archive.stderr.trim() || archive.status}`);
  const extract = await runProcess('tar', ['-x', '-C', destination], {
    input: archive.stdoutBuffer,
    timeoutMs: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (extract.error || extract.timedOut || extract.outputOverflow) {
    const reason = extract.error?.message ?? (extract.timedOut ? 'timed out' : 'output exceeded the safety limit');
    throw Object.assign(new Error(`baseline tar extraction is unavailable: ${reason}`), { blocked: true });
  }
  if (extract.status !== 0) throw new Error(`baseline tar extraction failed: ${extract.stderr || extract.status}`);
  if (!fs.existsSync(path.join(destination, 'SKILL.md'))) throw new Error(`baseline ${ref} has no SKILL.md`);
  return destination;
}

function writeSchema(directory, name, schema) {
  const file = path.join(directory, `${name}.schema.json`);
  fs.writeFileSync(file, `${JSON.stringify(schema, null, 2)}\n`);
  return file;
}

const TRIGGER_SCHEMA = {
  type: 'object',
  required: ['triggered', 'skills', 'reason'],
  properties: {
    triggered: { type: 'boolean' },
    skills: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  additionalProperties: false,
};

const GRADE_SCHEMA = {
  type: 'object',
  required: ['pass', 'assertions', 'prohibitedChecks', 'evidenceChecks', 'violations', 'missingEvidence', 'summary'],
  properties: {
    pass: { type: 'boolean' },
    assertions: {
      type: 'array',
      items: {
        type: 'object', required: ['text', 'pass', 'evidence'],
        properties: { text: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } },
        additionalProperties: false,
      },
    },
    prohibitedChecks: {
      type: 'array',
      items: {
        type: 'object', required: ['text', 'present', 'evidence'],
        properties: { text: { type: 'string' }, present: { type: 'boolean' }, evidence: { type: 'string' } },
        additionalProperties: false,
      },
    },
    evidenceChecks: {
      type: 'array',
      items: {
        type: 'object', required: ['text', 'present', 'evidence'],
        properties: { text: { type: 'string' }, present: { type: 'boolean' }, evidence: { type: 'string' } },
        additionalProperties: false,
      },
    },
    violations: { type: 'array', items: { type: 'string' } },
    missingEvidence: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  additionalProperties: false,
};

function snapshotWorkspace(workspace) {
  const files = new Map();
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const relative = path.relative(workspace, file);
        const content = fs.readFileSync(file);
        files.set(relative, crypto.createHash('sha256').update(content).digest('hex'));
      }
    }
  };
  walk(workspace);
  return files;
}

function collectChangedArtifacts(workspace, before) {
  const artifacts = [];
  const textExtensions = new Set(['.json', '.md', '.txt', '.mjs', '.js', '.yaml', '.yml']);
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const relative = path.relative(workspace, file);
        const content = fs.readFileSync(file);
        const fingerprint = crypto.createHash('sha256').update(content).digest('hex');
        if (before.get(relative) === fingerprint) continue;
        const record = { path: relative, size: content.length, sha256: fingerprint };
        if (textExtensions.has(path.extname(file)) && content.length <= 256_000) record.content = content.toString('utf8');
        else record.contentOmitted = 'binary or larger than 256000 bytes';
        artifacts.push(record);
      }
    }
  };
  walk(workspace);
  return artifacts.sort((a, b) => a.path.localeCompare(b.path));
}

async function runFresh({ executable, workspace, prompt, schema, tempRoot, label, sandbox = 'read-only', captureArtifacts = false }) {
  const output = path.join(tempRoot, `${label}.final.json`);
  const schemaFile = schema ? writeSchema(tempRoot, label, schema) : null;
  const before = captureArtifacts ? snapshotWorkspace(workspace) : null;
  const args = [
    'exec', ...extraRunnerArgs(), '--ephemeral', '--skip-git-repo-check', '--sandbox', sandbox,
    '--cd', workspace, '--color', 'never', '--json', '--output-last-message', output,
  ];
  if (schemaFile) args.push('--output-schema', schemaFile);
  args.push(prompt);
  const run = await runProcess(executable, args, { timeoutMs: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.error || run.timedOut || run.outputOverflow || run.status !== 0) {
    return {
      blocked: true,
      reason: run.error?.message || (run.timedOut ? 'runner timed out' : run.outputOverflow ? 'runner output exceeded the safety limit' : (run.stderr || run.stdout || `runner exit ${run.status}`).slice(-8000)),
      command: [executable, ...args.slice(0, -1), '<prompt>'],
      exitCode: run.status,
    };
  }
  if (!fs.existsSync(output)) return { blocked: true, reason: 'runner succeeded without --output-last-message artifact', command: [executable, ...args.slice(0, -1), '<prompt>'], exitCode: run.status };
  const finalText = fs.readFileSync(output, 'utf8').trim();
  let parsed = null;
  if (schema) {
    try { parsed = JSON.parse(finalText); } catch { /* A malformed model response is a case failure, not fabricated success. */ }
  }
  return {
    blocked: false,
    command: [executable, ...args.slice(0, -1), '<prompt>'],
    exitCode: run.status,
    transcript: run.stdout,
    diagnostics: run.stderr,
    finalText,
    parsed,
    artifacts: captureArtifacts ? collectChangedArtifacts(workspace, before) : [],
  };
}

function triggerPrompt(query) {
  return `This is a routing-only evaluation. Do not perform the user's task. Inspect the installed skill descriptions and decide whether ACE-SKILL should be applied to the exact request below. "triggered" means ACE-SKILL itself applies; list the matching skill name when true. Do not treat this evaluator instruction as part of the user request.\n\n<user_request>\n${query}\n</user_request>`;
}

function metrics(rows) {
  let tp = 0; let tn = 0; let fp = 0; let fn = 0;
  for (const row of rows) {
    if (row.expected && row.actual) tp += 1;
    else if (!row.expected && !row.actual) tn += 1;
    else if (!row.expected && row.actual) fp += 1;
    else fn += 1;
  }
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const specificity = tn + fp ? tn / (tn + fp) : 0;
  return { tp, tn, fp, fn, recall, specificity, falsePositiveRate: 1 - specificity, balancedAccuracy: (recall + specificity) / 2 };
}

async function runTriggerVersion(options, version, workspace, tempRoot) {
  const splits = {
    train: readJson('evals/triggers.train.json').cases,
    validation: readJson('evals/triggers.validation.json').cases,
  };
  const output = { version, runsPerQuery: options.runs, cases: [], metrics: {} };
  for (const [split, cases] of Object.entries(splits)) {
    const rows = [];
    for (const item of cases) {
      const attempts = [];
      for (let attempt = 1; attempt <= options.runs; attempt += 1) {
        const result = await runFresh({
          executable: options.runner, workspace, prompt: triggerPrompt(item.query), schema: TRIGGER_SCHEMA,
          tempRoot, label: `trigger-${version}-${item.id}-${attempt}`,
        });
        if (result.blocked) return { blocked: true, reason: `${item.id}/${attempt}: ${result.reason}`, partial: output };
        const actual = result.parsed?.triggered === true && (result.parsed.skills ?? []).some((skill) => /ace-skill|ace skill/i.test(skill));
        const validResponse = result.parsed !== null;
        rows.push({ expected: item.shouldTrigger, actual: validResponse ? actual : !item.shouldTrigger });
        attempts.push({ attempt, expected: item.shouldTrigger, actual: validResponse ? actual : null, pass: validResponse && actual === item.shouldTrigger, reason: result.parsed?.reason ?? 'invalid JSON response', command: result.command, exitCode: result.exitCode });
      }
      output.cases.push({ id: item.id, split, category: item.category, expected: item.shouldTrigger, attempts });
    }
    output.metrics[split] = metrics(rows);
  }
  return { blocked: false, output };
}

function behaviorActorPrompt(item) {
  return `Use installed skills when they apply. Handle the user request below in an isolated writable evaluation workspace. Save created outputs under artifacts/ and real evidence under .ace-reports/ when the workflow requires them. You may inspect the installed skill and run its validators. Never invent a command result or artifact. If required input, auth, or a mandatory validator is unavailable, say BLOCKED. Your final answer must make the selected workflow, references actually read, validators actually run, output paths, and evidence status auditable.\n\n<user_request>\n${item.prompt}\n</user_request>`;
}

function caseInputArtifacts(item) {
  const records = [];
  for (const match of item.prompt.matchAll(/\binputs\/([a-z0-9-]+\.json)\b/gu)) {
    const relative = `inputs/${match[1]}`;
    if (records.some((record) => record.path === relative)) continue;
    const file = path.join(ROOT, 'evals/inputs', match[1]);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    records.push({ path: relative, sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex'), content });
  }
  return records;
}

function graderPrompt(item, actor) {
  const instructions = fs.readFileSync(path.join(ROOT, 'evals/grader.md'), 'utf8');
  return `${instructions}\n\n<case_contract>\n${JSON.stringify(item, null, 2)}\n</case_contract>\n\n<case_inputs>\n${JSON.stringify(caseInputArtifacts(item), null, 2)}\n</case_inputs>\n\n<actor_transcript>\n${actor.transcript}\n</actor_transcript>\n\n<actor_diagnostics>\n${actor.diagnostics}\n</actor_diagnostics>\n\n<actor_final>\n${actor.finalText}\n</actor_final>\n\n<actor_artifacts>\n${JSON.stringify(actor.artifacts, null, 2)}\n</actor_artifacts>`;
}

function cloneEvaluationWorkspace(template, target) {
  fs.mkdirSync(target, { recursive: true });
  copySkill(path.join(template, '.agents/skills/ace-skill'), target);
  fs.cpSync(path.join(template, 'inputs'), path.join(target, 'inputs'), { recursive: true });
}

function gradeContract(item, parsed) {
  const assertionChecks = Array.isArray(parsed?.assertions) ? parsed.assertions : [];
  const prohibitedChecks = Array.isArray(parsed?.prohibitedChecks) ? parsed.prohibitedChecks : [];
  const evidenceChecks = Array.isArray(parsed?.evidenceChecks) ? parsed.evidenceChecks : [];
  const assertionMap = new Map(assertionChecks.map((check) => [check.text, check]));
  const prohibitedMap = new Map(prohibitedChecks.map((check) => [check.text, check]));
  const evidenceMap = new Map(evidenceChecks.map((check) => [check.text, check]));
  const violations = Array.isArray(parsed?.violations) ? parsed.violations : ['invalid violations field'];
  const missingEvidence = Array.isArray(parsed?.missingEvidence) ? parsed.missingEvidence : ['invalid missingEvidence field'];
  return Boolean(parsed?.pass)
    && assertionChecks.length === item.assertions.length && assertionMap.size === item.assertions.length
    && prohibitedChecks.length === item.prohibitedBehavior.length && prohibitedMap.size === item.prohibitedBehavior.length
    && evidenceChecks.length === item.evidence.length && evidenceMap.size === item.evidence.length
    && item.assertions.every((text) => assertionMap.get(text)?.pass === true)
    && item.prohibitedBehavior.every((text) => prohibitedMap.get(text)?.present === false)
    && item.evidence.every((text) => evidenceMap.get(text)?.present === true)
    && violations.length === 0
    && missingEvidence.length === 0;
}

async function runBehaviorVersion(options, version, workspace, graderWorkspace, tempRoot) {
  const cases = readJson('evals/behavior.json').cases;
  const output = { version, cases: [] };
  for (const item of cases) {
    const repetitions = item.repetitions ?? 1;
    const attempts = [];
    for (let attempt = 1; attempt <= repetitions; attempt += 1) {
      const caseWorkspace = path.join(tempRoot, `behavior-workspace-${version}-${item.id}-${attempt}`);
      cloneEvaluationWorkspace(workspace, caseWorkspace);
      const actor = await runFresh({
        executable: options.runner, workspace: caseWorkspace, prompt: behaviorActorPrompt(item), schema: null,
        tempRoot, label: `behavior-${version}-${item.id}-${attempt}-actor`, sandbox: 'workspace-write', captureArtifacts: true,
      });
      if (actor.blocked) return { blocked: true, reason: `${item.id}/${attempt}/actor: ${actor.reason}`, partial: output };
      const grade = await runFresh({
        executable: options.runner, workspace: graderWorkspace, prompt: graderPrompt(item, actor), schema: GRADE_SCHEMA,
        tempRoot, label: `behavior-${version}-${item.id}-${attempt}-grader`,
      });
      if (grade.blocked) return { blocked: true, reason: `${item.id}/${attempt}/grader: ${grade.reason}`, partial: output };
      const parsed = grade.parsed;
      attempts.push({
        attempt,
        pass: gradeContract(item, parsed),
        grade: parsed ?? { pass: false, summary: 'grader returned invalid JSON', assertions: [], prohibitedChecks: [], evidenceChecks: [], violations: ['invalid grader output'], missingEvidence: [] },
        actor: { command: actor.command, exitCode: actor.exitCode, final: actor.finalText, transcript: actor.transcript, artifacts: actor.artifacts },
        grader: { command: grade.command, exitCode: grade.exitCode, final: grade.finalText },
      });
    }
    output.cases.push({
      id: item.id,
      shouldTrigger: item.shouldTrigger,
      repetitions,
      pass: attempts.every((attempt) => attempt.pass),
      attempts,
    });
  }
  output.passCount = output.cases.filter((item) => item.pass).length;
  output.total = output.cases.length;
  output.passRate = output.total ? output.passCount / output.total : 0;
  return { blocked: false, output };
}

function acceptance(report, options) {
  const failures = [];
  if (options.versions !== 'both') failures.push('acceptance requires both baseline and current fresh-context runs');
  if (options.runs < 3 && (options.suite === 'triggers' || options.suite === 'all')) failures.push('acceptance requires at least three trigger runs per query');
  const currentTrigger = report.triggers?.current;
  if (currentTrigger) {
    const validation = currentTrigger.metrics.validation;
    if (validation.recall < 0.90) failures.push(`current validation recall ${validation.recall.toFixed(3)} < 0.90`);
    if (validation.specificity < 0.90) failures.push(`current validation specificity ${validation.specificity.toFixed(3)} < 0.90`);
    const baseline = report.triggers?.baseline?.metrics.validation;
    if (baseline) {
      const improved = validation.balancedAccuracy >= baseline.balancedAccuracy + 0.05 || validation.balancedAccuracy === 1;
      if (!improved) failures.push('current validation balanced accuracy neither improves baseline by 0.05 nor reaches 1.00');
      if (validation.falsePositiveRate > baseline.falsePositiveRate) failures.push('current validation false-positive rate regresses from baseline');
    }
  }
  const currentBehavior = report.behavior?.current;
  if (currentBehavior && currentBehavior.passCount !== currentBehavior.total) failures.push(`current behavioral eval passed ${currentBehavior.passCount}/${currentBehavior.total}`);
  const baselineBehavior = report.behavior?.baseline;
  if (currentBehavior && baselineBehavior && currentBehavior.passRate < baselineBehavior.passRate) failures.push('current behavioral pass rate regresses from baseline');
  return failures;
}

function writeReport(report, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error(`ERROR: ${error.message}`); usage(); return EXIT.USAGE; }
  if (options.help) { usage(); return EXIT.PASS; }
  const data = validateDatasets();
  if (data.errors.length) {
    console.error(`FAIL: eval data\n${data.errors.map((error) => `  - ${error}`).join('\n')}`);
    return EXIT.FAIL;
  }
  if (options.validateData) {
    const report = { status: 'VALIDATED', note: 'Dataset validation is not an evaluation PASS.', checkedAt: new Date().toISOString(), data: data.counts };
    writeReport(report, options.output);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`VALIDATED: ${data.counts.triggerTrain + data.counts.triggerValidation} trigger cases and ${data.counts.behavior} behavior cases. No model evaluation was claimed.`);
    return EXIT.PASS;
  }
  const probe = await probeRunner(options.runner);
  if (!probe.ok) {
    const report = { status: 'BLOCKED', reason: `runner unavailable: ${probe.reason}`, checkedAt: new Date().toISOString(), data: data.counts };
    writeReport(report, options.output);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.error(`BLOCKED: ${report.reason}`);
    return EXIT.BLOCKED;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-v5-evals-'));
  const report = {
    status: 'RUNNING', checkedAt: new Date().toISOString(), runner: { executable: options.runner, version: probe.version },
    suite: options.suite, versions: options.versions, runsPerTrigger: options.runs, baselineRef: options.baselineRef,
    data: data.counts, triggers: {}, behavior: {},
  };
  try {
    const sources = { current: ROOT };
    if (options.versions !== 'current') sources.baseline = await exportBaseline(options.baselineRef, tempRoot);
    const selected = options.versions === 'both' ? ['baseline', 'current'] : [options.versions];
    const workspaces = {};
    for (const version of selected) {
      const workspace = path.join(tempRoot, `workspace-${version}`);
      fs.mkdirSync(workspace, { recursive: true });
      copySkill(sources[version], workspace);
      copyEvaluationInputs(workspace);
      workspaces[version] = workspace;
    }
    const graderWorkspace = path.join(tempRoot, 'workspace-independent-grader');
    fs.mkdirSync(graderWorkspace, { recursive: true });
    isolateGrader(graderWorkspace);

    for (const version of selected) {
      if (options.suite === 'triggers' || options.suite === 'all') {
        const result = await runTriggerVersion(options, version, workspaces[version], tempRoot);
        if (result.blocked) throw Object.assign(new Error(result.reason), { blocked: true });
        report.triggers[version] = result.output;
      }
      if (options.suite === 'behavior' || options.suite === 'all') {
        const result = await runBehaviorVersion(options, version, workspaces[version], graderWorkspace, tempRoot);
        if (result.blocked) throw Object.assign(new Error(result.reason), { blocked: true });
        report.behavior[version] = result.output;
      }
    }
    const failures = acceptance(report, options);
    report.acceptanceFailures = failures;
    report.status = failures.length ? 'FAIL' : 'PASS';
    report.finishedAt = new Date().toISOString();
    writeReport(report, options.output);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`${report.status}: eval report ${path.relative(ROOT, options.output)}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return failures.length ? EXIT.FAIL : EXIT.PASS;
  } catch (error) {
    report.status = error.blocked ? 'BLOCKED' : 'FAIL';
    report.reason = error.message;
    report.finishedAt = new Date().toISOString();
    writeReport(report, options.output);
    console.error(`${report.status}: ${error.message}`);
    return error.blocked ? EXIT.BLOCKED : EXIT.FAIL;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
