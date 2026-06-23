# ACE-SKILL v4 GPT/JS

**ACE-SKILL** is a skill package for AI agents that create, fix, and optimize SillyTavern character cards, World Info / Lorebooks, activation keys, JavaScript regex keys, greetings, and token budgets.

Version v4 adds a dedicated GPT branch and moves active validation scripts to JavaScript/Node. Python is kept as legacy.

---

## What changed in v4

- Added `gpt/` for ChatGPT, OpenAI API, Codex, and Custom GPT prompts.
- `SKILL.md` now routes between the general workflow and GPT workflow.
- GPT prompts are not automatically applied to Claude/Kimi/Gemini.
- Key checking now uses Node/JavaScript regex behavior, closer to SillyTavern.
- Added a universal token checker.
- `first_mes` and every `alternate_greetings` item must be at least 250 words, with no upper word limit.
- Old Python scripts moved to `legacy/python/`.

---

## Structure

```text
ace-skill/
├── SKILL.md
├── README.md
├── README_EN.md
├── package.json
├── assets/
│   └── lorebook_template.json
├── gpt/
│   ├── README_GPT.md
│   ├── SKILL_GPT.md
│   ├── prompts/
│   └── examples/
├── references/
├── scripts/
│   ├── validate_bot_description.mjs
│   ├── validate_lorebook_json.mjs
│   ├── st_key_tester.mjs
│   ├── st_lorebook_key_check.mjs
│   ├── token_check.mjs
│   ├── token_model_map.mjs
│   └── lib/
├── legacy/
│   └── python/
└── tests/
    └── key-fixtures/
```

---

## Quick start

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
npm install
```

Most scripts work with plain Node.js. The optional dependency in `package.json` can improve OpenAI token counting when installed.

Tell your agent:

```text
Read SKILL.md and use ACE-SKILL.
I need to improve a SillyTavern character card, lorebook, keys, and JSON.
If the task targets GPT/ChatGPT/Codex, use gpt/SKILL_GPT.md.
```

---

## GPT mode

Use GPT mode for:

- ChatGPT;
- OpenAI API;
- Custom GPTs;
- Codex;
- GPT-specific SillyTavern presets;
- problems where GPT follows prompts too literally or loses logic.

Agent instruction:

```text
Read SKILL.md. This task targets ChatGPT/Codex, so use gpt/SKILL_GPT.md and gpt/prompts/. Do not apply GPT-only prompts to Claude/Kimi unless I ask.
```

Only safe prompt-structure lessons may be taken from third-party GPT presets: modular blocks, length presets, POV boundaries, character blindspot, no-user-control, and plot push. Do not copy jailbreak/no-refusal/filter-bypass instructions.

---

## Validation commands

### Character card

```bash
node scripts/validate_bot_description.mjs character.json --model gpt-4o
node scripts/token_check.mjs character.json --model gpt-4o
```

### Lorebook

```bash
node scripts/validate_lorebook_json.mjs lorebook.json
node scripts/token_check.mjs lorebook.json --model gpt-4o
```

### Single key

```bash
node scripts/st_key_tester.mjs '/(?:Годжо|Gojo)/iu' --text 'Годжо вошёл в комнату'
```

### Lorebook activation

```bash
node scripts/st_lorebook_key_check.mjs lorebook.json --text 'Gojo remembers his mother and past' --char 'Gojo' --user 'User'
```

---

## New greeting rule

The old 100–200 word rule is removed.

Now:

- `first_mes`: minimum 250 words;
- every `alternate_greetings`: minimum 250 words;
- no upper word limit;
- large scenes should be checked against the target token budget.

---

## JavaScript instead of Python

Active scripts are now in `scripts/*.mjs`.

Python versions are preserved in:

```text
legacy/python/
```

Use them only for legacy comparison. Final SillyTavern regex checks should be JavaScript-based.

---

## License

MIT or the original repository license if specified separately.
