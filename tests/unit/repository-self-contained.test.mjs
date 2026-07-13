import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { repositoryCheckSpecs, repositoryCheckTimeouts, summarizeTranscript } from "../../scripts/services/repo-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("package metadata preserves the MIT license in the manifest and lockfile", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const lockfile = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  assert.equal(manifest.license, "MIT");
  assert.equal(lockfile.packages?.[""]?.license, "MIT");
});

test("external model checks report BLOCKED when their runner is unavailable", () => {
  const missingRunner = `ace-missing-runner-${process.pid}`;
  const run = spawnSync(process.execPath, ["scripts/ace.mjs", "eval", "all", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ACE_EVAL_RUNNER: missingRunner },
    timeout: 120_000,
  });
  assert.equal(run.status, 3, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.status, "BLOCKED");
  assert.match(report.reason, /runner unavailable/u);
  assert.doesNotMatch(`${run.stdout}\n${run.stderr}`, /\bPASS\b/u);
});

test("all-mode repository profile always contains every mandatory local gate", () => {
  const gateIds = repositoryCheckSpecs("all").map((spec) => spec.gateId);
  assert.equal(gateIds.filter((id) => id === "VAL-UNIT").length, 1);
  assert.ok(gateIds.includes("VAL-SABOTAGE"));
  assert.ok(gateIds.includes("VAL-E2E"));
  assert.ok(gateIds.includes("VAL-EVAL-DATA"));
  assert.equal(new Set(gateIds).size, gateIds.length);
});

test("public environment cannot select a reduced repository-check profile", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts/services/repo-check.mjs"), "utf8");
  assert.doesNotMatch(source, /ACE_REPO_CHECK_DEPTH/u);
  assert.doesNotMatch(source, /nested-nonrecursive/u);
  assert.doesNotMatch(source, /omittedGateIds:\s*\[[^\]]+\]/u);
  assert.ok(repositoryCheckSpecs("all").some((spec) => spec.gateId === "VAL-UNIT"));
});

test("unit tests never launch the complete release gate recursively", () => {
  const forbidden = ["npm", "run", "check:all"].join(" ");
  const unitDir = path.join(ROOT, "tests/unit");
  for (const name of fs.readdirSync(unitDir).filter((item) => item.endsWith(".test.mjs"))) {
    const content = fs.readFileSync(path.join(unitDir, name), "utf8");
    assert.equal(content.includes(forbidden), false, `${name} recursively launches the release gate`);
  }
});

test("repository timeout configuration uses one validated per-process policy", () => {
  assert.deepEqual(repositoryCheckTimeouts({}), { gateMs: 180_000, evidenceMs: 180_000, gitMs: 30_000 });
  assert.deepEqual(repositoryCheckTimeouts({ ACE_REPO_GATE_TIMEOUT_MS: "900", ACE_REPO_EVIDENCE_TIMEOUT_MS: "800", ACE_REPO_GIT_TIMEOUT_MS: "700" }), { gateMs: 900, evidenceMs: 800, gitMs: 700 });
  assert.throws(() => repositoryCheckTimeouts({ ACE_REPO_GATE_TIMEOUT_MS: "0" }), /positive integer/u);
  assert.throws(() => repositoryCheckTimeouts({ ACE_REPO_EVIDENCE_TIMEOUT_MS: "later" }), /positive integer/u);
});

test("release ledgers preserve transcript identity without embedding unbounded duplicate output", () => {
  const short = summarizeTranscript("PASS: concise evidence\n", 1_024);
  assert.deepEqual(
    { text: short.text, bytes: short.bytes, truncated: short.truncated },
    { text: "PASS: concise evidence\n", bytes: 23, truncated: false },
  );
  assert.match(short.sha256, /^[0-9a-f]{64}$/u);

  const original = `BEGIN\n${"x".repeat(20_000)}\nEND`;
  const compact = summarizeTranscript(original, 1_024);
  assert.equal(compact.bytes, Buffer.byteLength(original));
  assert.equal(compact.truncated, true);
  assert.match(compact.sha256, /^[0-9a-f]{64}$/u);
  assert.match(compact.text, /^BEGIN/u);
  assert.match(compact.text, /bytes omitted from ledger/u);
  assert.match(compact.text, /END$/u);
  assert.ok(Buffer.byteLength(compact.text) < 1_300, "ledger excerpt grew beyond its bounded envelope");
});
