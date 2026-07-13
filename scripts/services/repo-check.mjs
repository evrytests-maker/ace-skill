import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SKILL_ROOT, sha256File } from "../lib/enforcement.mjs";
import { runProcess } from "../lib/process-runner.mjs";

const DEFAULT_REPOSITORY_GATE_TIMEOUT_MS = 180_000;
const DEFAULT_GIT_TIMEOUT_MS = 30_000;
const REPOSITORY_CHECK_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_TRANSCRIPT_EXCERPT_BYTES = 4 * 1024;

function positiveInteger(raw, fallback, label) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (!/^\d+$/u.test(String(raw)) || Number(raw) <= 0 || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${label} must be a positive integer, received ${raw}`);
  }
  return Number(raw);
}

export function repositoryCheckTimeouts(env = process.env) {
  const gateMs = positiveInteger(env.ACE_REPO_GATE_TIMEOUT_MS, DEFAULT_REPOSITORY_GATE_TIMEOUT_MS, "ACE_REPO_GATE_TIMEOUT_MS");
  return {
    gateMs,
    evidenceMs: positiveInteger(env.ACE_REPO_EVIDENCE_TIMEOUT_MS, gateMs, "ACE_REPO_EVIDENCE_TIMEOUT_MS"),
    gitMs: positiveInteger(env.ACE_REPO_GIT_TIMEOUT_MS, DEFAULT_GIT_TIMEOUT_MS, "ACE_REPO_GIT_TIMEOUT_MS"),
  };
}

function repositorySnapshotSha1(root) {
  const ignoredDirectories = new Set([".git", ".ace-reports", "node_modules"]);
  const files = [];
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.isDirectory() && ignoredDirectories.has(item.name)) continue;
      const absolute = path.join(directory, item.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (item.isDirectory()) walk(absolute);
      else files.push({ absolute, relative, symlink: item.isSymbolicLink() });
    }
  };
  walk(root);
  const hash = crypto.createHash("sha1");
  for (const file of files.sort((a, b) => a.relative.localeCompare(b.relative))) {
    if (file.symlink) hash.update(`L\0${file.relative}\0${fs.readlinkSync(file.absolute)}\0`);
    else {
      const content = fs.readFileSync(file.absolute);
      hash.update(`F\0${file.relative}\0${content.length}\0`);
      hash.update(content);
      hash.update("\0");
    }
  }
  return hash.digest("hex");
}

function expandGlob(args) {
  const expanded = [];
  for (const arg of args) {
    if (!arg.includes("*")) { expanded.push(arg); continue; }
    const dir = path.join(SKILL_ROOT, path.dirname(arg));
    const suffix = path.basename(arg).replace("*", "");
    if (!fs.existsSync(dir)) continue;
    expanded.push(...fs.readdirSync(dir).filter((name) => name.endsWith(suffix)).sort().map((name) => path.relative(SKILL_ROOT, path.join(dir, name))));
  }
  return expanded;
}

function processExit(run) {
  if (run.error || run.timedOut || run.outputOverflow) return 3;
  return Number.isInteger(run.status) ? run.status : 3;
}

export function summarizeTranscript(value, maxBytes = DEFAULT_TRANSCRIPT_EXCERPT_BYTES) {
  const buffer = Buffer.from(value ?? "", "utf8");
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  if (buffer.length <= maxBytes) return { text: buffer.toString("utf8"), bytes: buffer.length, sha256, truncated: false };
  const markerReserve = Math.min(512, Math.floor(maxBytes / 4));
  const contentBudget = Math.max(2, maxBytes - markerReserve);
  const headBytes = Math.ceil(contentBudget / 2);
  const tailBytes = Math.floor(contentBudget / 2);
  const omittedBytes = Math.max(0, buffer.length - headBytes - tailBytes);
  const marker = `\n...[${omittedBytes} bytes omitted from ledger; full sha256=${sha256}]...\n`;
  return {
    text: `${buffer.subarray(0, headBytes).toString("utf8")}${marker}${buffer.subarray(buffer.length - tailBytes).toString("utf8")}`,
    bytes: buffer.length,
    sha256,
    truncated: true,
  };
}

async function execute(spec, { timeoutMs, quiet = false } = {}) {
  const args = spec.glob ? expandGlob(spec.args) : spec.args;
  const command = `${process.execPath} ${args.join(" ")}`;
  const effectiveTimeoutMs = spec.timeoutMs ?? timeoutMs ?? DEFAULT_REPOSITORY_GATE_TIMEOUT_MS;
  if (!quiet) console.log(`\n[${spec.gateId}] ${command}`);
  const run = await runProcess(process.execPath, args, {
    cwd: SKILL_ROOT,
    timeoutMs: effectiveTimeoutMs,
    maxBuffer: REPOSITORY_CHECK_MAX_BUFFER,
  });
  if (!quiet && run.stdout) process.stdout.write(run.stdout);
  if (!quiet && run.stderr) process.stderr.write(run.stderr);
  let exitCode = processExit(run);
  let status = exitCode === 0 ? "PASS" : exitCode === 3 ? "BLOCKED" : "FAIL";
  const missingArtifacts = (spec.artifacts ?? []).filter((relative) => !fs.existsSync(path.join(SKILL_ROOT, relative)));
  const artifacts = (spec.artifacts ?? []).filter((relative) => !missingArtifacts.includes(relative)).map((relative) => ({
    path: relative,
    sha256: sha256File(path.join(SKILL_ROOT, relative)),
  }));
  if (status === "PASS" && missingArtifacts.length) {
    status = "FAIL";
    exitCode = 1;
  }
  const spawnNote = run.error ? `; spawnError=${run.error.message}` : "";
  const signalNote = run.signal ? `; signal=${run.signal}` : "";
  const timeoutNote = run.timedOut ? "; timedOut=true" : "";
  const overflowNote = run.outputOverflow ? "; outputOverflow=true" : "";
  const artifactNote = missingArtifacts.length ? `; missingArtifacts=${missingArtifacts.join(",")}` : "";
  const stdoutSummary = summarizeTranscript(run.stdout);
  const stderrSummary = summarizeTranscript(run.stderr);
  return {
    gateId: spec.gateId, ruleIds: spec.ruleIds, kind: "automatic", status, command, cwd: SKILL_ROOT, exitCode,
    artifacts,
    timeoutMs: effectiveTimeoutMs,
    evidence: `${status}; timeoutMs=${effectiveTimeoutMs}; stdout=${Buffer.byteLength(run.stdout)} bytes; stderr=${Buffer.byteLength(run.stderr)} bytes${spawnNote}${signalNote}${timeoutNote}${overflowNote}${artifactNote}`,
    attempts: [{
      at: new Date().toISOString(), exitCode,
      stdout: stdoutSummary.text, stderr: stderrSummary.text,
      stdoutBytes: stdoutSummary.bytes, stderrBytes: stderrSummary.bytes,
      stdoutSha256: stdoutSummary.sha256, stderrSha256: stderrSummary.sha256,
      stdoutTruncated: stdoutSummary.truncated, stderrTruncated: stderrSummary.truncated,
      spawnError: run.error?.message ?? null, signal: run.signal, timedOut: run.timedOut,
      outputOverflow: run.outputOverflow, timeoutMs: effectiveTimeoutMs,
    }],
  };
}

export function repositoryCheckSpecs(mode) {
  const specs = [
    { gateId: "VAL-SYNTAX", ruleIds: ["ACE-REPO-002"], args: ["scripts/ace.mjs", "repo", "syntax"], artifacts: ["scripts/ace.mjs"] },
    { gateId: "VAL-RULES", ruleIds: ["ACE-REPO-003"], args: ["scripts/ace.mjs", "validate", "rules"], artifacts: ["rules/registry.json", "rules/workflows.json", "rules/manual-gates.json"] },
    { gateId: "VAL-DOCS", ruleIds: ["ACE-REPO-001", "ACE-REPO-002"], args: ["scripts/ace.mjs", "validate", "docs"], artifacts: ["SKILL.md"] },
    { gateId: "VAL-SOURCES", ruleIds: ["ACE-SOURCE-001", "ACE-REPO-005"], args: ["scripts/ace.mjs", "validate", "sources"], artifacts: ["rules/sources.json", "references/sources-and-conflicts.md"] },
    { gateId: "VAL-LANGUAGE", ruleIds: ["ACE-REPO-004"], args: ["scripts/ace.mjs", "validate", "language"], artifacts: ["rules/language-exceptions.json", "references/keys-and-regex.md"] },
    { gateId: "VAL-CARD", ruleIds: ["ACE-CARD-001"], args: ["scripts/ace.mjs", "validate", "card", "tests/fixtures/characters/v2-valid.json"], artifacts: ["tests/fixtures/characters/v2-valid.json"] },
    { gateId: "VAL-LORE", ruleIds: ["ACE-LORE-001", "ACE-LORE-003"], args: ["scripts/ace.mjs", "validate", "lorebook", "assets/lorebook_template.json"], artifacts: ["assets/lorebook_template.json"] },
    { gateId: "VAL-SIMULATOR", ruleIds: ["ACE-LORE-001"], args: ["--test", "tests/unit/world-info-simulator.test.mjs"], artifacts: ["scripts/lib/world-info-simulator.mjs", "tests/fixtures/simulator/combined-conflicts.json"] },
    { gateId: "VAL-STYLE", ruleIds: ["ACE-STYLE-001"], args: ["scripts/ace.mjs", "validate", "style", "tests/fixtures/characters/v2-valid.json"], artifacts: ["tests/fixtures/characters/v2-valid.json"] },
    { gateId: "VAL-KEY", ruleIds: ["ACE-KEY-001"], args: ["scripts/ace.mjs", "key", "--key", "/(?:Годжо|Gojo|Satoru\\s+Gojo)/iu", "--should-match", "Годжо вошёл", "--should-match", "Satoru Gojo arrived", "--should-not-match", "Geto arrived"] },
    { gateId: "VAL-SECONDARY", ruleIds: ["ACE-LORE-002"], args: ["scripts/ace.mjs", "secondary"], artifacts: ["scripts/lib/st-matching.mjs"] },
    { gateId: "VAL-TOKENS", ruleIds: ["ACE-TOKEN-001"], args: ["scripts/ace.mjs", "tokens", "assets/lorebook_template.json", "--model", "gpt-4o"], artifacts: ["assets/lorebook_template.json"] },
    { gateId: "VAL-UNIT", ruleIds: ["ACE-REPO-003"], args: ["--test", "tests/unit/*.test.mjs"], glob: true, artifacts: ["tests/catalog.json"] },
    { gateId: "VAL-SABOTAGE", ruleIds: ["ACE-REPO-003"], args: ["--test", "tests/sabotage/*.test.mjs"], glob: true, artifacts: ["tests/sabotage/targeted-mutants.test.mjs"] },
    { gateId: "VAL-E2E", ruleIds: ["ACE-REPO-003"], args: ["--test", "tests/e2e/*.test.mjs"], glob: true, artifacts: ["tests/e2e/world-info-e2e.test.mjs"] },
  ];
  if (mode === "all") specs.push({ gateId: "VAL-EVAL-DATA", ruleIds: ["ACE-TRIGGER-001", "ACE-REPO-002"], args: ["evals/run-evals.mjs", "--suite", "all", "--validate-data"], artifacts: ["evals/triggers.train.json", "evals/triggers.validation.json", "evals/behavior.json", ".ace-reports/evals-latest.json"] });
  return specs;
}

export async function runRepositoryCheck(mode = "fast", { quiet = false } = {}) {
  if (!["fast", "all"].includes(mode)) return { exitCode: 2, status: "FAIL", reportPath: null };
  let timeouts;
  try { timeouts = repositoryCheckTimeouts(); }
  catch (error) {
    if (!quiet) console.error(`Repository-check configuration error: ${error.message}`);
    return { exitCode: 2, status: "FAIL", reportPath: null };
  }
  const profile = "top-level-full";
  const startedAt = new Date().toISOString();
  const runId = `${startedAt.replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;
  const reportsDir = path.join(SKILL_ROOT, ".ace-reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${runId}-${mode}.json`);
  const gates = [];
  for (const spec of repositoryCheckSpecs(mode)) gates.push(await execute(spec, { timeoutMs: timeouts.gateMs, quiet }));
  let blocked = gates.some((gate) => gate.status === "BLOCKED");
  let failed = gates.some((gate) => gate.status === "FAIL");

  const gitRun = await runProcess("git", ["rev-parse", "HEAD"], { cwd: SKILL_ROOT, timeoutMs: timeouts.gitMs });
  const gitAvailable = !gitRun.error && !gitRun.timedOut && gitRun.status === 0 && /^[0-9a-f]{40}$/u.test(gitRun.stdout.trim());
  let head = gitAvailable ? gitRun.stdout.trim() : "UNAVAILABLE";
  let revisionKind = gitAvailable ? "git" : "unavailable";
  let snapshotError = null;
  if (!gitAvailable) {
    try {
      head = repositorySnapshotSha1(SKILL_ROOT);
      revisionKind = "snapshot";
    } catch (error) { snapshotError = error; }
  }
  const revisionAvailable = /^[0-9a-f]{40}$/u.test(head);
  const refs = ["references/skill-architecture-research.md", "references/sources-and-conflicts.md", "references/migration-notes.md"].map((relative) => {
    const file = path.join(SKILL_ROOT, relative);
    const content = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
    const firstHeading = content.toString("utf8").split(/\r?\n/u).find((line) => line.startsWith("#")) ?? "(no heading)";
    return { path: relative, sha256: content.length ? crypto.createHash("sha256").update(content).digest("hex") : "", evidence: `Opened ${content.length} bytes during LOAD; first heading: ${firstHeading}` };
  });
  const relativeReport = path.relative(SKILL_ROOT, reportPath);
  const evidenceCommand = `${process.execPath} scripts/ace.mjs validate evidence ${relativeReport}`;
  const evidenceGate = {
    gateId: "VAL-EVIDENCE", ruleIds: ["ACE-CORE-001", "ACE-CORE-002", "ACE-CORE-003", "ACE-CORE-004"], kind: "automatic",
    status: "BLOCKED", command: evidenceCommand, cwd: SKILL_ROOT, exitCode: 3, artifacts: [],
    evidence: "Pending preflight validation of the candidate ledger.", attempts: [], timeoutMs: timeouts.evidenceMs,
  };
  gates.push(evidenceGate);
  blocked = true;
  const ledger = {
    runId, repoHead: head, revisionKind, workflowId: "skill-maintenance", scope: mode, startedAt, finishedAt: new Date().toISOString(), inputs: ["repository"],
    repositoryCheck: {
      profile,
      depth: 0,
      gateTimeoutMs: timeouts.gateMs,
      evidenceTimeoutMs: timeouts.evidenceMs,
      omittedGateIds: [],
      reason: "Complete non-recursive local release profile; public environment variables cannot suppress mandatory gates.",
    },
    transitions: ["DISCOVER", "CLASSIFY", "LOAD", "PLAN", "EXECUTE", "VALIDATE", "VERIFY", "REPORT"], references: refs, gates,
    overallStatus: blocked ? "BLOCKED" : failed ? "FAIL" : "PASS",
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(ledger, null, 2)}\n`);

  const preflight = await runProcess(process.execPath, ["scripts/ace.mjs", "validate", "evidence", relativeReport], { cwd: SKILL_ROOT, timeoutMs: timeouts.evidenceMs, maxBuffer: REPOSITORY_CHECK_MAX_BUFFER });
  const preflightExit = processExit(preflight);
  evidenceGate.status = preflightExit === 0 && revisionAvailable ? "PASS" : preflightExit === 1 ? "FAIL" : "BLOCKED";
  evidenceGate.exitCode = evidenceGate.status === "PASS" ? 0 : evidenceGate.status === "FAIL" ? 1 : 3;
  const gitFailure = gitRun.error?.message ?? (gitRun.timedOut ? "timed out" : gitRun.stderr.trim() || `exit ${gitRun.status}`);
  const gitNote = gitAvailable
    ? "; revision=git-head"
    : revisionKind === "snapshot"
      ? `; revision=content-snapshot; gitUnavailable=${gitFailure}`
      : `; revision=unavailable; gitError=${gitFailure}; snapshotError=${snapshotError?.message ?? "unknown"}`;
  evidenceGate.evidence = `${evidenceGate.status}; candidate-ledger preflight exit=${preflightExit}${preflight.error ? `; spawnError=${preflight.error.message}` : ""}${preflight.timedOut ? "; timedOut=true" : ""}${gitNote}; final immutable validation follows.`;
  const preflightStdout = summarizeTranscript(preflight.stdout);
  const preflightStderr = summarizeTranscript(preflight.stderr);
  evidenceGate.attempts.push({
    at: new Date().toISOString(), exitCode: preflightExit,
    stdout: preflightStdout.text, stderr: preflightStderr.text,
    stdoutBytes: preflightStdout.bytes, stderrBytes: preflightStderr.bytes,
    stdoutSha256: preflightStdout.sha256, stderrSha256: preflightStderr.sha256,
    stdoutTruncated: preflightStdout.truncated, stderrTruncated: preflightStderr.truncated,
    spawnError: preflight.error?.message ?? null, timedOut: preflight.timedOut,
    gitExitCode: gitRun.status, gitError: gitRun.error?.message ?? null,
    gitTimedOut: gitRun.timedOut, revisionKind, snapshotError: snapshotError?.message ?? null,
  });
  blocked = gates.some((gate) => gate.status === "BLOCKED");
  failed = gates.some((gate) => gate.status === "FAIL");
  ledger.overallStatus = blocked ? "BLOCKED" : failed ? "FAIL" : "PASS";
  ledger.finishedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, `${JSON.stringify(ledger, null, 2)}\n`);

  const finalRun = await runProcess(process.execPath, ["scripts/ace.mjs", "validate", "evidence", relativeReport], { cwd: SKILL_ROOT, timeoutMs: timeouts.evidenceMs, maxBuffer: REPOSITORY_CHECK_MAX_BUFFER });
  if (!quiet && finalRun.stdout) process.stdout.write(finalRun.stdout);
  if (!quiet && finalRun.stderr) process.stderr.write(finalRun.stderr);
  const finalExit = processExit(finalRun);
  if (finalExit !== 0) {
    if (!quiet) console.error(`Final immutable evidence validation failed with exit ${finalExit}${finalRun.error ? `: ${finalRun.error.message}` : ""}.`);
    return { exitCode: finalExit === 3 ? 3 : 1, status: finalExit === 3 ? "BLOCKED" : "FAIL", reportPath };
  }
  if (!quiet) {
    console.log(`\nEvidence: ${reportPath}`);
    console.log(`Profile: ${profile}`);
    console.log(`Overall: ${ledger.overallStatus}`);
  }
  return { exitCode: blocked ? 3 : failed ? 1 : 0, status: ledger.overallStatus, reportPath };
}
