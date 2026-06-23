# ACE-SKILL

**ACE-SKILL** is a set of instructions, templates, and validation tools for creating character cards, lorebooks, and prompts for SillyTavern, ChatGPT, Codex, Claude, Kimi, and other models.

The project helps build cleaner cards and lorebooks: clear structure, working keys, checked lore, long greetings, and separate rules for GPT-based models.

## Features

- Create and improve character cards.
- Create and validate SillyTavern lorebooks.
- Check lorebook keys with JavaScript logic close to SillyTavern behavior.
- Estimate text size with a token checker.
- Use separate rules for GPT, ChatGPT, and Codex.
- Use a general workflow for Claude, Kimi, Gemini, and other models.
- Keep old Python scripts in a legacy folder.

## How to use

### In ChatGPT or another LLM chat

Upload the archive or project files and write:

```text
Use ACE-SKILL.
Use SKILL.md as the main instruction file.
If the task is about GPT, ChatGPT, or Codex, use gpt/SKILL_GPT.md.
If the task is about Claude, Kimi, or Gemini, use the general workflow.
```

### In Codex or an agent environment

Use the repository as a skill folder.

Main entry file:

```text
SKILL.md
```

For GPT-specific tasks:

```text
gpt/SKILL_GPT.md
```

### Locally

Node.js 20 or newer is recommended.

Install dependencies if the project adds any:

```bash
npm install
```

Run the basic check:

```bash
npm run check:all
```

Validate a lorebook:

```bash
node scripts/validate_lorebook_json.mjs assets/lorebook_template.json
```

Test one key:

```bash
node scripts/st_key_tester.mjs '/(?:Gojo|Satoru)/iu' --text 'Gojo entered the room'
```

Check lorebook keys against a chat sample:

```bash
node scripts/st_lorebook_key_check.mjs tests/key-fixtures/sample_lorebook.json --chat tests/key-fixtures/sample_chat.txt
```

Estimate tokens:

```bash
node scripts/token_check.mjs assets/lorebook_template.json --model gpt-4o
```

## Project structure

```text
.
├── SKILL.md                     # Main rules and task routing
├── README.md                    # Russian README
├── README_EN.md                 # English README
├── assets/                      # Templates
├── references/                  # Reference materials
├── gpt/                         # Rules and prompts for GPT, ChatGPT, and Codex
├── scripts/                     # Active JavaScript validators
├── scripts/lib/                 # Shared JS modules
├── legacy/python/               # Old Python scripts
└── tests/                       # Test fixtures
```

## Core idea

ACE-SKILL separates models by behavior.

GPT, ChatGPT, and Codex use the dedicated `gpt/` folder because they need more explicit instructions: roles, inputs, step order, output format, validation rules, and examples.

Claude, Kimi, Gemini, and other models use the general workflow from `SKILL.md` unless the user explicitly asks for GPT mode.

## Added

- A dedicated `gpt/` folder for GPT, ChatGPT, and Codex.
- Prompts for character cards, lorebooks, keys, and result validation.
- JavaScript scripts for active project checks.
- A Node.js lorebook key tester.
- A universal token checker.
- Test fixtures for keys and lorebooks.
- A 250-word minimum for greetings.
- Clear routing: GPT uses GPT rules, while other models do not use them unless needed.

## Replaced

- Main Python scripts were replaced with JavaScript scripts.
- Old Python scripts were moved to `legacy/python/`.
- README was rewritten into a simpler and clearer format.
- Key validation is now closer to SillyTavern behavior.
- The upper word limit for greetings was removed; token-budget checks are used instead.
