# ACE v5 migration notes

## When to load this file

Load this file only for `skill-maintenance`, historical auditing, or migration
completeness checks. Do not load it when creating or repairing a user's card or
lorebook.

This file is the only permitted location for old model-specific path names. In
the active core, README files, rules, scripts, tests, and all other references,
such links are stale.

## Migration goal

ACE v5 removes the parallel model-specific layer and retains one model-neutral
workflow. Useful content moves to the surface where it belongs; duplicates,
specific model claims, and unsafe shortcuts are not preserved under new names.

Migration is complete only when:

- every file listed below has a decision;
- active equivalents are linked to a rule, workflow, and test;
- the stale-reference check finds no old route outside this file;
- the removed directory is absent;
- unit, traceability, sabotage, and behavioral checks pass.

## Complete `/gpt` map

| Old path | New location | Decision |
|---|---|---|
| `gpt/README_GPT.md` | this file + future user documentation | Preserve only architecture history and the unified workflow; do not restore a separate entry point. |
| `gpt/README_GPT_EN.md` | this file + future English documentation | Same decision; remove model-specific installation and routing. |
| `gpt/SKILL_GPT.md` | `SKILL.md` | Move identity, classification, workflow, and output contract into model-neutral form. Remove workflow selection by model name. |
| `gpt/examples/bad_vs_good_gpt_prompt.md` | `SKILL.md`, domain references, and behavioral evaluations | Reduce to dangerous errors and verifiable good/bad cases. Do not preserve a long parallel prompt. |
| `gpt/examples/character_card_gpt_template.json` | `assets/character-card-template.json` | Retain only a portable character-card template; remove provider instructions and validate schema. |
| `gpt/examples/good_gpt_prompt.md` | `SKILL.md` and evaluation fixtures | Preserve a minimal output/evidence example without model branding. |
| `gpt/prompts/gpt_character_card_writer.md` | `references/character-cards.md` + character workflow/manual gates | Move user agency, voice, behavior, and validation; downgrade exact counts to judgment/default. |
| `gpt/prompts/gpt_codex_repo_agent.md` | skill-maintenance workflow, evidence contract, and repository tests | Move inspect/validate/report discipline; remove the platform-persona wrapper. |
| `gpt/prompts/gpt_key_designer.md` | `references/keys-and-regex.md` + unified CLI | Move JavaScript regex design, positive/negative cases, and key design. Replace old commands with the unified CLI. |
| `gpt/prompts/gpt_lorebook_writer.md` | `references/lorebooks.md` + lorebook workflow | Move entry design, activation, and repair loop; check technical claims against pinned source. |
| `gpt/prompts/gpt_master_instruction.md` | `SKILL.md`, rule registry, and workflow registry | Move hard invariants, state transitions, routing, and final-status semantics. Remove the second master prompt. |
| `gpt/prompts/gpt_sillytavern_preset_notes.md` | character reference and source-conflict notes | Preserve only general, safe prompt-placement cautions. Remove model-specific preset/jailbreak recipes and unproven absolutes. |
| `gpt/prompts/gpt_validator_repair.md` | unified CLI, evidence rules, and repair-loop tests | Move fail-closed validate → repair → rerun behavior. Remove self-declared PASS. |

## What not to migrate

- routing by provider/model name;
- the claim that a separate prompt can guarantee obedience to every rule;
- universal exact counts for greeting, example dialogue, or token length;
- commands that no longer exist;
- treating a warning as a successful mandatory check;
- duplicated domain rules in several active documents;
- advice to finish a task without command and artifact evidence.

## Old references and scripts

Previous thematic references are consolidated by responsibility:

- character writing → `references/character-cards.md`;
- lorebook basics, advanced mechanics, and prompt placement →
  `references/lorebooks.md`;
- keyword and regex material → `references/keys-and-regex.md`;
- disputed technical claims → `references/sources-and-conflicts.md`.

Delete old duplicates after confirming links and coverage. Do not retain them
"just in case": a model can load an obsolete copy and receive two incompatible
instructions.

Delete legacy Python validators and tracked bytecode after every useful check is
either present in the unified Node CLI or deliberately rejected and recorded
here. ACE v5 runtime is Node 20+; Python is permitted only as an isolated,
external Agent Skills validator.

## Equivalence audit

For every migrated behavior, verify:

| Responsibility | Required location | Evidence |
|---|---|---|
| activation boundary | frontmatter + trigger evaluations | held-out trigger metrics |
| workflow routing | core + workflow registry | positive and forbidden reference cases |
| technical MUST | rule registry + Node validator | unit + negative + mutant |
| required subjective quality | manual gate + domain reference | structured field-level evidence |
| repair loop | core + evidence validator | FAIL → repair → fresh-rerun evaluation |
| final status | evidence schema/orchestrator | PASS-with-FAIL mutant rejected |
| domain advice | one appropriate reference | broken-link and orphan-rule checks |

Textual similarity to the old file is not the goal. Equivalence means that the
useful responsibility is executed and verified by the new architecture.

## Release note for maintainers

Major version `5.0.0` means:

- one skill entry point;
- separated character and lorebook domains;
- machine-readable rules, workflows, sources, and manual gates;
- one Node CLI with internal modules;
- a fail-closed evidence ledger;
- trigger, behavioral, baseline, and sabotage verification.

Repository history retains the original files, so no second checkout or adjacent
"safety copy" is needed. A baseline evaluation may use a temporary `git archive`
of the original commit without `.git`; delete the temporary snapshot after the
run.
