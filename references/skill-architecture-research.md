# Skill architecture research for ACE v5

## When to load this file

Load this reference in full only for `skill-maintenance`: changes to `SKILL.md`,
routing, references, rules, scripts, validators, tests, evaluations, or release
architecture.

Do not load it when creating a character card or lorebook. This file explains
how to maintain the skill itself, not how to write a domain artifact.

## Method and snapshot

The research was conducted on 2026-07-10. The task threshold was at least five
production skills from at least three GitHub repositories with more than 1,000
stars, including official repositories. Six skills from three repositories were
actually examined. Star counts are a point-in-time snapshot, not a permanent
property; the short SHA identifies the revision examined.

| Repository | Snapshot | Skills examined |
|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | 160,018 stars; `9d2f1ae…` | `skill-creator`, `webapp-testing` |
| [openai/skills](https://github.com/openai/skills) | 23,482 stars; `49f948f…` | system `skill-creator`, `gh-fix-ci` |
| [obra/superpowers](https://github.com/obra/superpowers) | 251,452 stars; `d884ae0…` | `writing-skills`, `verification-before-completion` |

The research also used the
[Agent Skills specification](https://agentskills.io/specification),
[Agent Skills best practices](https://agentskills.io/skill-creation/best-practices),
[Agent Skills evaluation guidance](https://agentskills.io/skill-creation/evaluating-skills),
and [OpenAI Build Skills documentation](https://learn.chatgpt.com/docs/build-skills).

## Observations for each skill

### Anthropic `skill-creator`

The review covered the core workflow, progressive disclosure, schemas,
grader/analyzer/comparator instructions, and scripts for evaluation loops,
aggregation, and description optimization.

Strong decisions:

- snapshot the old skill and run with-skill and baseline cases concurrently;
- use a fresh context for every case;
- define objective assertions after the run so output cannot be tailored to
  them;
- have the grader inspect the transcript and real artifacts, not a polished
  final answer;
- use blind comparison and analyze non-discriminating assertions;
- optimize the description on held-out queries with multiple runs per query.

Do not copy literally:

- dependence on one particular agent CLI;
- a mandatory subagent-only process when a deterministic Node test is stronger;
- a review UI used as a substitute for machine evidence.

### Anthropic `webapp-testing`

Strong decisions:

- discover the running target before interaction;
- turn screenshots and logs into evidence;
- test user-visible behavior, not only the absence of an exception;
- keep the core short and move details into scripts and references.

ACE application: raw-prompt and artifact inspection are analogous to a
screenshot. A lorebook cannot be declared functional solely because its JSON is
valid.

### OpenAI system `skill-creator`

Strong decisions:

- the frontmatter description is the primary trigger surface;
- keep `SKILL.md` short, with exact read conditions and focused references;
- make validation and packaging separate deterministic operations;
- describe both capability and activation boundaries in the description.

Do not copy provider-specific metadata or workflow. ACE remains model-neutral
and receives no separate model router.

### OpenAI `gh-fix-ci`

Strong decisions:

- inspect before mutation;
- separate external checks from local reproduction;
- cite specific logs/checks;
- do not claim a fix before a new run.

ACE application: every validator run records command, cwd, exit code, and
artifact hash. An unavailable external evaluator yields `BLOCKED`, not an
imagined PASS.

### Superpowers `writing-skills`

Strong decisions:

- test a skill with pressure scenarios, not only happy paths;
- procedures and examples outperform a long declaration of principles;
- a test should first demonstrate a real failure mode;
- narrow triggers and explicit anti-patterns reduce misuse.

Do not copy:

- universal "iron laws" used instead of domain reasoning;
- a requirement to delete README files or restructure a repository against the
  user's scope;
- excessive repetition of the same MUST.

### Superpowers `verification-before-completion`

Strong decisions:

- obtain fresh evidence immediately before a completion claim;
- the command must actually prove the claimed result;
- a partial or stale run cannot justify full PASS;
- confidence and self-review are not verification.

ACE application: use a fail-closed evidence ledger, forbid PASS when any
FAIL/BLOCKED exists, and use targeted sabotage tests against always-successful
validators.

## Adopted architecture patterns

### Progressive disclosure

- metadata answers "when should this activate?";
- the core answers "which workflow and which hard invariants?";
- a domain reference covers only one artifact type;
- scripts perform deterministic repetitive work without loading implementation
  detail into context.

Keep the core below 500 lines and approximately below 5,000 tokens. This is a
design target, not a reason to remove a required safety invariant.

### Calibrated enforcement

Separate:

- `MUST`: an objective structural/runtime contract;
- `SHOULD`: a strong default with a justified exception;
- `MAY`: an option;
- `JUDGMENT`: a required subjective decision through a structured manual gate.

Do not turn artistic taste into a regex to obtain a green check. Do not leave a
technical MUST solely in prose without a validator/test.

### Black-box CLI

The CLI must provide `--help`, documented inputs/outputs and exit codes,
structured stdout for automation, diagnostics on stderr, bounded output, and
idempotent checks. Internal modularity limits the blast radius of validator
changes, while the user sees one command and one report.

### Evidence over assertion

A PASS gate requires:

- applicable rule IDs;
- the actual command invocation;
- cwd, exit code, and captured result;
- hashes and reopened outputs;
- separate manual evidence for semantic gates;
- a fresh rerun after repair.

### Baseline and evaluations

Compare the new skill with an immutable snapshot of the original commit. For
trigger evaluations, use realistic positive/negative near-misses, typos, and
buried requests, a fixed train/validation split, and three runs. Select the
description by held-out score; break ties by lower false-positive rate and then
shorter length.

Behavioral evaluations inspect workflow, loaded references, validators,
outputs, and evidence—not a particular phrase in the answer. An independent
grader sees the prompt, transcript, and real artifacts but is not told which
variant is new.

### Targeted sabotage

For a small repository, transparent mutants are more useful than a full
mutation framework. Each mutant changes one enforcement joint in a temporary
copy and must fail with the expected gate/rule ID. Detect an always-successful
validator with a contract test against a known-invalid fixture, not by trusting
exit `0`.

## What ACE intentionally rejects

- separate workflows named after models;
- one enormous core containing every domain detail;
- self-reporting "I read the reference" without path/hash/transcript evidence;
- PASS when a mandatory runner is unavailable;
- exact artistic counts without a technical source;
- a validation pipeline that stops at the first failure and hides later results;
- README as the only source of an executable rule;
- an LLM grader in place of cheap deterministic JSON/exit-code checks.

## Maintenance checklist

1. Record the clean baseline commit and user scope.
2. Add or update a rule with source, gate, test, and corrective action.
3. Where possible, write a failing unit/behavior/sabotage case before
   implementation.
4. Change the smallest core/reference/script surface.
5. Run syntax, unit, negative, traceability, and sabotage checks.
6. Run fresh-context trigger/behavior evaluations and compare with baseline.
7. Reopen artifacts and the ledger.
8. Update the source snapshot and migration notes if the surface changed.
9. Report `PASS` only from a fresh ledger; otherwise report `FAIL` or `BLOCKED`.
