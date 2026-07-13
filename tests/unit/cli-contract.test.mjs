import assert from 'node:assert/strict';
import test from 'node:test';
import { main } from '../../scripts/ace.mjs';

async function cli(args) {
  const stdout = [];
  const stderr = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => stdout.push(values.join(' '));
  console.error = (...values) => stderr.push(values.join(' '));
  try {
    const status = await main(args);
    return { status, stdout: `${stdout.join('\n')}${stdout.length ? '\n' : ''}`, stderr: `${stderr.join('\n')}${stderr.length ? '\n' : ''}` };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function jsonResult(args, expectedExit) {
  const run = await cli([...args, '--json']);
  assert.equal(run.status, expectedExit, `${run.stdout}\n${run.stderr}`);
  assert.doesNotThrow(() => JSON.parse(run.stdout), run.stdout);
  return JSON.parse(run.stdout);
}

test('help is available in text and JSON modes', async () => {
  const text = await cli(['--help']);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /Exit codes: 0 PASS, 1 validation failure, 2 usage\/input error, 3 BLOCKED/);
  assert.match(text.stdout, /--force-secondary\s+Diagnostic only/);
  assert.match(text.stdout, /--should-not-match/);
  assert.match(text.stdout, /--require-exact/);
  const json = await jsonResult(['--help'], 0);
  assert.equal(json.status, 'PASS');
  assert.match(json.data.usage, /validate rules\|docs\|sources\|language/);
});

test('usage errors use exit code 2 and structured diagnostics', async () => {
  assert.equal((await cli(['does-not-exist'])).status, 2);
  const missing = await jsonResult(['validate', 'card'], 2);
  assert.equal(missing.errors[0].code, 'CLI_USAGE');
  assert.equal((await cli(['key', '--key'])).status, 2);
});

test('card validation uses exit 0 for valid input and exit 1 for invalid input', async () => {
  const valid = await jsonResult(['validate', 'card', 'tests/fixtures/characters/v2-valid.json'], 0);
  assert.equal(valid.service, 'card');
  assert.equal(valid.data.version, 2);
  const invalid = await jsonResult(['validate', 'card', 'tests/fixtures/characters/v2-invalid.json'], 1);
  assert.equal(invalid.status, 'FAIL');
  assert.ok(invalid.errors.some((issue) => issue.ruleId === 'ACE-CARD-001'));
});

test('key CLI executes named assertions, positional positives, and the --not alias', async () => {
  const named = await jsonResult(['key', '--key', '/Mira/iu', '--should-match', 'Mira arrived', '--should-not-match', 'Nix arrived'], 0);
  assert.equal(named.data.cases.length, 2);
  const positional = await jsonResult(['key', '/Mira/iu', 'Mira arrived', '--not', 'Nix arrived'], 0);
  assert.equal(positional.evidence.find((item) => item.kind === 'key-cases').notAliasAccepted, true);
  assert.equal((await cli(['key', '/Mira/iu', '--should-match', 'Mira arrived'])).status, 1);
});

test('lorebook activation assertions fail on the wrong expected decision', async () => {
  const pass = await jsonResult([
    'lorebook-keys', 'tests/fixtures/lorebooks/native-valid.json',
    '--text', 'Mira entered the sealed archive door.', '--expect-active', '0',
  ], 0);
  assert.deepEqual(pass.data.activeIds, ['0']);
  const fail = await jsonResult([
    'lorebook-keys', 'tests/fixtures/lorebooks/native-valid.json',
    '--text', 'The library was empty.', '--expect-active', '0',
  ], 1);
  assert.ok(fail.errors.some((issue) => issue.code === 'LORE_EXPECT_ACTIVE'));
});

test('style validation rejects replacement-by-negation prose', async () => {
  const valid = await jsonResult(['validate', 'style', 'tests/fixtures/characters/v2-valid.json'], 0);
  assert.equal(valid.status, 'PASS');
  const payload = await jsonResult(['validate', 'style', 'tests/fixtures/style/contrastive-invalid.txt'], 1);
  assert.equal(payload.errors[0].ruleId, 'ACE-STYLE-001');
});

test('unavailable mandatory exact tokenizer uses exit code 3', async () => {
  const blocked = await jsonResult(['tokens', 'assets/lorebook_template.json', '--model', 'claude', '--require-exact'], 3);
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.blockers[0].code, 'TOKEN_EXACT_UNAVAILABLE');
});

test("workflow command returns only the selected canonical context", async () => {
  const result = await jsonResult(["workflow", "skill-maintenance"], 0);
  assert.equal(result.service, "workflow");
  assert.equal(result.data.workflow.id, "skill-maintenance");
  assert.ok(result.data.rules.some((rule) => rule.id === "ACE-REPO-003"));
  assert.equal(result.data.rules.some((rule) => rule.id === "ACE-CARD-001"), false);
  assert.deepEqual(result.data.rules.map((rule) => rule.id), result.data.workflow.rules);
  assert.deepEqual(result.data.validators.map((validator) => validator.id), result.data.workflow.validators);
  assert.ok(result.data.sources.length > 0);
  assert.ok(result.data.conflicts.some((conflict) => conflict.id === "CONFLICT-WI-STRATEGY-DEFAULT"));
});

test("workflow command rejects an unknown ID with the available choices", async () => {
  const result = await jsonResult(["workflow", "not-a-workflow"], 2);
  assert.equal(result.errors[0].code, "CLI_USAGE");
  assert.match(result.errors[0].message, /Available:/u);
});
