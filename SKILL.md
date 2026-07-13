---
name: ace-skill
description: Create, repair, audit, and validate SillyTavern character cards, World Info/lorebooks, activation keys, JavaScript regex keys, secondary-key logic, and token budgets. Use for card fields such as description, personality, scenario, greetings, dialogue examples; lorebook JSON; keysecondary/selectiveLogic; or maintaining ACE-SKILL itself. Do not use for unrelated fiction writing, general regex/programming, or artifacts unrelated to SillyTavern character cards and lorebooks.
license: MIT
compatibility: Requires Node.js 20+ and filesystem access. Web interfaces and sandboxed agents can run the lightweight integrity check with `node verify.mjs`; it uses only built-in Node.js modules and requires no npm packages, child processes, or network access. Full validation requires `npm ci` and permission to execute local commands.
metadata:
  version: "5.0.0"
---

# ACE-SKILL

ACE is a fail-closed workflow for SillyTavern artifacts. Follow its gates; do not treat this file as optional advice.

## Scope

Use ACE for:

- creating or repairing character cards and their text fields;
- creating, auditing, or repairing World Info/lorebooks;
- designing and testing plaintext or JavaScript regex activation keys;
- testing `keysecondary` and `selectiveLogic`;
- measuring a card or lorebook token budget;
- maintaining this skill and its validators.

Do not use ACE for unrelated fiction, generic regex/programming, or general prompts that do not target a SillyTavern artifact.

## Definitions

- **MUST** — an applicable failure blocks PASS.
- **SHOULD** — follow by default; record a concrete reason for an exception.
- **MAY** — choose the method that best fits the task.
- **JUDGMENT** — quality is mandatory, but the artistic method is not prescribed; use the named manual gate.
- **Evidence** — a real command result, artifact excerpt/hash, transcript event, or independent review. A checkbox or self-claim is not evidence.
- **BLOCKED** — an obligatory check cannot run, required input is unavailable, or five repair cycles failed. BLOCKED is not PASS.

The authoritative rules, workflows, manual gates, sources, and conflicts are in `rules/*.json`. Never invent a rule ID.

## Context budget and progressive disclosure

- Inventory supplied paths, file types, byte sizes, and line/item counts before opening content. Do not recursively read a repository when filenames, targeted search, symbols, or a narrow range can locate the needed area.
- After classification, run `node scripts/ace.mjs workflow <workflow-id> --json`. Use that canonical projection instead of loading every workflow, rule, validator, manual gate, source, and conflict record.
- Read only the selected workflow's required references and the target artifacts. For files larger than 20 KiB, prefer symbol lookup, exact search, JSON-key selection, or bounded line ranges before a full read.
- Treat `rules/language-exceptions.json`, test catalogs, scenario corpora, `.ace-reports/`, command logs, and packaged evidence as machine-consumed data. Open only the exact record or failed attempt needed for the task; do not paste repeated ledgers or transcripts into model context.
- Do not create a new scenario, rule export, or report when an existing canonical record plus a focused test can express the same requirement.

## Hard invariants

1. Keep character and lorebook rules separate. A combined task runs both gate sets independently.
2. Technical SillyTavern behavior comes from the pinned official source or official documentation. Community guides explain practice; they do not override implementation.
3. Test activation regex with JavaScript semantics and both positive and meaningful negative cases. Python regex is not final evidence.
4. Treat unknown `selectiveLogic`, a missing mandatory validator, a missing command result, and an unresolved source conflict as failure.
5. Do not call an estimate exact. Record the tokenizer method.
6. Do not report PASS while any applicable mandatory gate is FAIL or BLOCKED.
7. Do not apply fixed artistic lengths, section names, or example counts as universal technical constraints.
8. Never restore a parallel model-specific workflow or routing layer.
9. For a complete character card, run the token audit. The inclusive 700–1500 total-token range is an ACE advisory: report `WARN` outside it with the actual count and counting method, and never fail a card solely for missing the range.
10. During skill maintenance, keep all active prose and exported rules in English.
   Preserve Russian regexes, keys, localized UI labels, and test literals exactly;
   never translate a technical literal when that would change matching behavior.
11. Never author replacement-by-negation rhetoric such as “X is not A; X is B,”
    “not A but/rather B,” or equivalent Russian constructions. State the intended
    fact directly. Standalone factual negation without a replacement clause is allowed.
12. ACE execution is self-contained after `npm ci`. Every operational rule and
    fixture is bundled in this repository. External URLs record provenance and
    version comparisons only; ordinary execution must not fetch them or require
    a local guide, archive, extracted folder, or machine-specific path.

## Classify one workflow

Choose exactly one workflow from `rules/workflows.json`:

| Intent | Workflow |
|---|---|
| New character/card fields | `character-create` |
| Repair/audit a character card | `character-repair` |
| New World Info/lorebook | `lorebook-create` |
| Audit/repair a lorebook | `lorebook-audit` |
| Design/test keys or regex | `key-regex-test` |
| Test secondary-key truth table | `secondary-logic-test` |
| Token measurement only | `token-budget` |
| Card and lorebook together | `combined-repair` |
| Edit/test ACE itself | `skill-maintenance` |

If the request contains several artifacts, use `combined-repair` only when both character and lorebook content are actually in scope. Do not ask the user for information already present in supplied files.

## Load references before planning

- For `character-create` or `character-repair`, read `references/character-cards.md`. Do not read the lorebook guide.
- For `lorebook-create` or `lorebook-audit`, read `references/lorebooks.md`. Do not use the character-writing guide.
- For `key-regex-test` or `secondary-logic-test`, read `references/keys-and-regex.md`; also read `references/lorebooks.md` when entry settings are involved.
- For `token-budget`, read the reference matching the artifact type.
- For `combined-repair`, read both domain references plus `references/keys-and-regex.md`, then keep their gates and evidence separate.
- For disputed technical behavior or `skill-maintenance`, read `references/sources-and-conflicts.md`.
- For `skill-maintenance`, also read `references/skill-architecture-research.md` and `references/migration-notes.md`.

Record each required path, SHA-256, and read evidence. A statement such as “references checked” without the path and evidence fails `ACE-CORE-002`.

## Mandatory state machine

Execute these states in order:

`DISCOVER → CLASSIFY → LOAD → PLAN → EXECUTE → VALIDATE → REPAIR* → VERIFY → REPORT`

### DISCOVER

Inventory all supplied artifacts and constraints, then inspect only the target files and relevant sections. Identify missing input only when it cannot be recovered from files or context.

### CLASSIFY

Select one workflow. Run `node scripts/ace.mjs workflow <workflow-id> --json` and use its focused rule IDs, validators, manual gates, required references, forbidden references, sources, and conflicts.

### LOAD

Read the required references and record their evidence. Do not load a forbidden domain reference.

### PLAN

Map each applicable rule to an output and a gate. Do not continue with an orphan MUST.

### EXECUTE

Create or repair the requested artifact. Preserve user constraints. Within the invariants, choose the strongest reasonable artistic or technical method.

### VALIDATE

Run every applicable validator through the single CLI:

```bash
node scripts/ace.mjs --help
node scripts/ace.mjs validate card <card.json>
node scripts/ace.mjs validate lorebook <lorebook.json>
node scripts/ace.mjs validate style <card-or-lorebook.json|text-file>
node scripts/ace.mjs key --key '<key>' --should-match '<positive>' --should-not-match '<negative>'
node scripts/ace.mjs secondary [fixture.json]
node scripts/ace.mjs tokens <artifact.json> --model <profile>
node scripts/ace.mjs validate language
```

Read complete output and exit code. For JUDGMENT rules, answer every structured manual gate with direct field excerpts.

### REPAIR

For each FAIL:

1. record the failed rule/gate and cause;
2. repair the artifact or implementation;
3. rerun the same gate from fresh state;
4. retain both failed and repaired attempts in evidence.

Use at most five full repair cycles. If the same mandatory problem remains, report BLOCKED.

### VERIFY

Reopen final artifacts. Validate the evidence ledger. When an independent fresh-context grader is available, give it the prompt, real output, transcript, artifacts, rules, and evidence—never only the primary agent's summary.

### REPORT

Report only `PASS`, `FAIL`, `N/A`, or `BLOCKED` per gate. Overall PASS requires all applicable MUST and manual gates to pass, no FAIL/BLOCKED, and justified allowed N/A entries.

When summarizing lorebook or simulator results, preserve each entry's UID or index, source field path, final status, and stable reason code in every derived per-entry row. A condensed report must not discard provenance that exists in the trace.

## Output contract

For an artifact task, return:

1. the requested artifact or exact file path;
2. selected workflow and applied rule IDs;
3. validators/manual gates actually run;
4. failures and repairs, including the first failed attempt;
5. final status and evidence path;
6. limitations or BLOCKED cause.

For an uploaded ZIP, extracted folder, or installed skill, begin with the dependency-free structural precheck:

```bash
node verify.mjs [path-to-skill-or-zip]
```

It uses one Node process, built-in modules only, no network, and no package installation. `ACE WEB PRECHECK: PASS` confirms structural integrity only; it is not a release PASS. See `AI_CHECK_INDEX.md` for accepted input layouts.

For repository maintenance, use:

```bash
npm run check:web
npm run check:local
npm run evals:all
npm run check:all
npm run check:runtime
```

Exit codes are `0 PASS`, `1 validation failure`, `2 usage/input error`, and `3 BLOCKED/unavailable capability`.

## Critical examples

Bad: “The lorebook looks valid, so PASS.”

Good: “`VAL-LORE` ran on `book.json`, exit `0`; the ledger contains the command, cwd, artifact hash, and output summary.”

Bad: applying a fixed greeting word count as a SillyTavern format requirement.

Good: validating the card structure automatically, then reviewing greeting playability and user agency with `MG-CARD-GREETING`.

Bad: accepting an unknown secondary mode as the default.

Good: fail, repair the value to `0..3`, then rerun positive and negative truth-table cases.

## Agent autonomy

The agent may choose prose style, organization, number of examples, entry length, key strategy, and repair method. It may not skip classification, required reading, applicable gates, repair, independent verification when available, or evidence. User-specified creative constraints override defaults but never override technical truth or the no-false-PASS rule.
