#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJsonFile } from './lib/files.mjs';
import {
  SKILL_ROOT,
  checkSyntax,
  printValidation,
  readJson,
  validateDocs,
  validateEvidence,
  validateLanguage,
  validateRuleSystem,
  validateSkillFrontmatter,
  validateSources,
} from './lib/enforcement.mjs';
import {
  auditSecondaryArtifact,
  auditTokenBudget,
  checkLorebookActivation,
  testKey,
  validateKeySyntax,
  validateStyle,
  validateCard,
  validateLorebook,
  verifyOfficialTruthTable,
} from './services/index.mjs';
import { runProcess } from './lib/process-runner.mjs';
import { runRepositoryCheck } from './services/repo-check.mjs';
import { selectWorkflowContext } from './services/workflow-context.mjs';

const EXIT = Object.freeze({ PASS: 0, FAIL: 1, USAGE: 2, BLOCKED: 3 });

const HELP_TEXT = `ACE-SKILL v5 — one CLI, isolated services

Usage:
  node scripts/ace.mjs validate rules|docs|sources|language
  node scripts/ace.mjs validate evidence <ledger.json>
  node scripts/ace.mjs validate card <card.json>
  node scripts/ace.mjs validate lorebook <lorebook.json>
  node scripts/ace.mjs validate style <card-or-lorebook.json|text-file>
  node scripts/ace.mjs key --key <key> --should-match <text> --should-not-match <text>
  node scripts/ace.mjs key <key> <positive-text> --not <negative-text>
  node scripts/ace.mjs lorebook-keys <lorebook.json> --text <chat-text> [--expect-active ID] [--expect-inactive ID]
  node scripts/ace.mjs secondary [lorebook.json]
  node scripts/ace.mjs tokens <artifact.json|text-file> [--model <profile>] [--estimate|--require-exact] [--budget N]
  node scripts/ace.mjs repo syntax|fast|all
  node scripts/ace.mjs eval triggers|behavior|all
  node scripts/ace.mjs workflow <workflow-id>

Key options:
  --should-match <text>       Repeat for every required positive case.
  --should-not-match <text>   Repeat for every required negative case.
  --not <text>                Alias for --should-not-match.
  --secondary <key>           Repeat to test secondary keys with --logic 0..3.
  --case-sensitive            Preserve plaintext-key case.
  --no-whole-words            Permit plaintext substring matching.
  --char/--user <name>        Expand matching macros.
  --syntax-only               Compile a key without claiming behavior PASS.

Lorebook-key options:
  --text <chat-text>          Required scan text.
  --expect-active <id>        Repeat for entries that must activate.
  --expect-inactive <id>      Repeat for entries that must remain inactive.
  --require-activation        Fail when no entry activates.
  --force-secondary           Diagnostic only; never final Tavern evidence.

Token options:
  --model <profile>           Tokenizer profile (default: gpt-4o).
  --estimate                  Force a disclosed estimate.
  --require-exact             BLOCKED when no exact tokenizer is available.
  --budget <n>                Fail when the measured total exceeds n.

Global options:
  --json       Emit machine-readable JSON.
  -h, --help   Show help.

Exit codes: 0 PASS, 1 validation failure, 2 usage/input error, 3 BLOCKED.`;

function usage() {
  console.log(HELP_TEXT);
}

function emit(result, json = false) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result.exitCode;
  }
  console.log(`${result.status}: ${result.service}/${result.operation}`);
  for (const evidence of result.evidence ?? []) console.log(`  EVIDENCE: ${JSON.stringify(evidence)}`);
  for (const info of result.info ?? []) console.log(`  INFO: ${info}`);
  for (const warning of result.warnings ?? []) console.log(`  WARN ${warning.code ?? ''}: ${warning.message}`);
  for (const error of result.errors ?? []) console.error(`  ERROR ${error.code ?? ''}: ${error.message}`);
  for (const blocker of result.blockers ?? []) console.error(`  BLOCKED ${blocker.code ?? ''}: ${blocker.message}`);
  if (result.data && Object.keys(result.data).length) console.log(`  DATA: ${JSON.stringify(result.data, null, 2)}`);
  return result.exitCode;
}

function readArtifact(file) {
  if (!file) throw new Error('Artifact path is required');
  if (file.toLowerCase().endsWith('.json')) return readJsonFile(file).data;
  return fs.readFileSync(path.resolve(file), 'utf8');
}

function requiredIndexedValue(args, index, option) {
  const value = args[index];
  if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function requiredShiftedValue(args, option) {
  const value = args.shift();
  if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function assertNoExtraArgs(args, context) {
  if (args.length) throw new Error(`${context} does not accept extra arguments: ${args.join(' ')}`);
}

function parseKeyArgs(args) {
  const request = { key: '', shouldMatch: [], shouldNotMatch: [], not: [], secondaryKeys: [], caseSensitive: false, wholeWords: true, macros: {} };
  let i = 0;
  if (args[0] && !args[0].startsWith('-')) request.key = args[i++];
  while (i < args.length) {
    const arg = args[i++];
    if (arg === '--key') request.key = requiredIndexedValue(args, i++, arg);
    else if (arg === '--should-match') request.shouldMatch.push(requiredIndexedValue(args, i++, arg));
    else if (arg === '--should-not-match') request.shouldNotMatch.push(requiredIndexedValue(args, i++, arg));
    else if (arg === '--not') request.not.push(requiredIndexedValue(args, i++, arg));
    else if (arg === '--secondary' || arg === '--keysecondary') request.secondaryKeys.push(requiredIndexedValue(args, i++, arg));
    else if (arg === '--logic' || arg === '--selective-logic') request.selectiveLogic = requiredIndexedValue(args, i++, arg);
    else if (arg === '--case-sensitive') request.caseSensitive = true;
    else if (arg === '--no-whole-words') request.wholeWords = false;
    else if (arg === '--char') request.macros.char = requiredIndexedValue(args, i++, arg);
    else if (arg === '--user') request.macros.user = requiredIndexedValue(args, i++, arg);
    else if (arg === '--syntax-only') request.allowSyntaxOnly = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown key option: ${arg}`);
    else request.shouldMatch.push(arg);
  }
  if (!request.key) throw new Error('key requires a positional value or --key <value>');
  const caseCount = request.shouldMatch.length + request.shouldNotMatch.length + request.not.length;
  if (request.allowSyntaxOnly && caseCount) throw new Error('--syntax-only cannot be combined with match assertions');
  if (!request.allowSyntaxOnly && !caseCount) throw new Error('key requires match assertions or --syntax-only');
  return request;
}

function parseLorebookKeyArgs(args) {
  const file = requiredShiftedValue(args, 'lorebook-keys');
  const options = { text: '', forceSecondary: false, caseSensitive: false, wholeWords: true, macros: {}, expectedActive: [], expectedInactive: [], requireActivation: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--text') options.text = requiredShiftedValue(args, arg);
    else if (arg === '--force-secondary') options.forceSecondary = true;
    else if (arg === '--expect-active') options.expectedActive.push(requiredShiftedValue(args, arg));
    else if (arg === '--expect-inactive') options.expectedInactive.push(requiredShiftedValue(args, arg));
    else if (arg === '--require-activation') options.requireActivation = true;
    else if (arg === '--case-sensitive') options.caseSensitive = true;
    else if (arg === '--no-whole-words') options.wholeWords = false;
    else if (arg === '--char') options.macros.char = requiredShiftedValue(args, arg);
    else if (arg === '--user') options.macros.user = requiredShiftedValue(args, arg);
    else if (arg === '--explain') continue;
    else throw new Error(`Unknown lorebook-keys option: ${arg}`);
  }
  return { file, options };
}

function parseTokenArgs(args) {
  const file = requiredShiftedValue(args, 'tokens');
  const options = { model: 'gpt-4o', forceEstimate: false, requireExact: false, budget: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--model') options.model = requiredShiftedValue(args, arg);
    else if (arg === '--estimate') options.forceEstimate = true;
    else if (arg === '--require-exact') options.requireExact = true;
    else if (arg === '--budget') {
      const raw = requiredShiftedValue(args, arg);
      if (!/^\d+$/u.test(raw)) throw new Error('--budget requires a non-negative integer');
      options.budget = Number(raw);
    }
    else throw new Error(`Unknown token option: ${arg}`);
  }
  if (options.forceEstimate && options.requireExact) throw new Error('--estimate and --require-exact are mutually exclusive');
  return { file, options };
}

async function runEval(suite, json) {
  const runner = path.join(SKILL_ROOT, 'evals/run-evals.mjs');
  if (!fs.existsSync(runner)) {
    const blocked = { service: 'evals', operation: suite, status: 'BLOCKED', ok: false, exitCode: 3, errors: [], warnings: [], blockers: [{ code: 'EVAL_RUNNER_MISSING', message: 'evals/run-evals.mjs is missing' }], evidence: [], data: {} };
    return emit(blocked, json);
  }
  const run = await runProcess(process.execPath, [runner, '--suite', suite, ...(json ? ['--json'] : [])], {
    cwd: SKILL_ROOT,
    timeoutMs: 3_600_000,
  });
  if (run.error || run.timedOut || run.outputOverflow) {
    const reason = run.error?.message ?? (run.timedOut ? 'evaluation wrapper timed out' : 'evaluation output exceeded the safety limit');
    const blocked = { service: 'evals', operation: suite, status: 'BLOCKED', ok: false, exitCode: 3, errors: [], warnings: [], blockers: [{ code: 'EVAL_RUNNER_UNAVAILABLE', message: reason }], evidence: [], data: {} };
    return emit(blocked, json);
  }
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  return Number.isInteger(run.status) ? run.status : EXIT.BLOCKED;
}

export async function main(inputArgv = process.argv.slice(2)) {
  const argv = [...inputArgv];
  const json = argv.includes('--json');
  for (let index = argv.length - 1; index >= 0; index -= 1) if (argv[index] === '--json') argv.splice(index, 1);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    if (json) return emit({
      service: 'cli', operation: 'help', status: 'PASS', ok: true, exitCode: 0,
      errors: [], warnings: [], blockers: [], evidence: [], data: { usage: HELP_TEXT },
    }, true);
    usage();
    return EXIT.PASS;
  }
  const command = argv.shift();

  try {
    if (command === 'validate') {
      const target = argv.shift();
      if (target === 'rules') {
        assertNoExtraArgs(argv, 'validate rules');
        const combined = validateRuleSystem();
        const frontmatter = validateSkillFrontmatter();
        combined.errors.push(...frontmatter.errors);
        combined.blocked.push(...frontmatter.blocked);
        combined.warnings.push(...frontmatter.warnings);
        combined.evidence.push(...frontmatter.evidence);
        return printValidation(combined, json);
      }
      if (target === 'docs') { assertNoExtraArgs(argv, 'validate docs'); return printValidation(validateDocs(), json); }
      if (target === 'sources') { assertNoExtraArgs(argv, 'validate sources'); return printValidation(validateSources(), json); }
      if (target === 'language') { assertNoExtraArgs(argv, 'validate language'); return printValidation(validateLanguage(), json); }
      if (target === 'evidence') {
        const file = requiredShiftedValue(argv, 'validate evidence');
        assertNoExtraArgs(argv, 'validate evidence');
        return printValidation(validateEvidence(readJson(file)), json);
      }
      if (target === 'card') {
        const file = requiredShiftedValue(argv, 'validate card');
        assertNoExtraArgs(argv, 'validate card');
        return emit(validateCard(readArtifact(file)), json);
      }
      if (target === 'lorebook') {
        const file = requiredShiftedValue(argv, 'validate lorebook');
        assertNoExtraArgs(argv, 'validate lorebook');
        return emit(validateLorebook(readArtifact(file)), json);
      }
      if (target === 'style') {
        const file = requiredShiftedValue(argv, 'validate style');
        assertNoExtraArgs(argv, 'validate style');
        return emit(validateStyle(readArtifact(file)), json);
      }
      throw new Error(`Unknown validate target: ${target ?? '(missing)'}`);
    }
    if (command === 'key') {
      const request = parseKeyArgs(argv);
      return emit(request.allowSyntaxOnly ? validateKeySyntax(request.key, { macros: request.macros }) : testKey(request), json);
    }
    if (command === 'lorebook-keys') {
      const { file, options } = parseLorebookKeyArgs(argv);
      return emit(checkLorebookActivation(readArtifact(file), options), json);
    }
    if (command === 'secondary') {
      if (argv.length > 1) throw new Error('secondary accepts at most one lorebook path');
      if (!argv[0]) return emit(verifyOfficialTruthTable(), json);
      return emit(auditSecondaryArtifact(readArtifact(argv[0])), json);
    }
    if (command === 'tokens') {
      const { file, options } = parseTokenArgs(argv);
      return emit(await auditTokenBudget(readArtifact(file), options), json);
    }
    if (command === 'repo' && argv[0] === 'syntax') {
      assertNoExtraArgs(argv.slice(1), 'repo syntax');
      return printValidation(checkSyntax(), json);
    }
    if (command === 'repo' && ['fast', 'all'].includes(argv[0])) {
      assertNoExtraArgs(argv.slice(1), `repo ${argv[0]}`);
      const result = await runRepositoryCheck(argv[0], { quiet: json });
      if (!json) return result.exitCode;
      return emit({
        service: 'repo', operation: argv[0], status: result.status, ok: result.exitCode === 0, exitCode: result.exitCode,
        errors: [], warnings: [], blockers: [], evidence: [{ kind: 'ledger', path: result.reportPath }], data: { reportPath: result.reportPath },
      }, true);
    }
    if (command === 'eval' && ['triggers', 'behavior', 'all'].includes(argv[0])) {
      assertNoExtraArgs(argv.slice(1), `eval ${argv[0]}`);
      return await runEval(argv[0], json);
    }
    if (command === 'workflow') {
      const workflowId = requiredShiftedValue(argv, 'workflow');
      assertNoExtraArgs(argv, 'workflow');
      return emit(selectWorkflowContext(workflowId), json);
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    const payload = { service: 'cli', operation: command, status: 'FAIL', ok: false, exitCode: EXIT.USAGE, errors: [{ code: 'CLI_USAGE', message: error.message }], warnings: [], blockers: [], evidence: [], data: {} };
    if (json) console.log(JSON.stringify(payload, null, 2)); else console.error(`ERROR: ${error.message}`);
    return EXIT.USAGE;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
