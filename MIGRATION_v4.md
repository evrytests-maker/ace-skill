# Migration to ACE-SKILL v4

## Active scripts moved to JavaScript

Old:

```bash
python3 scripts/validate_bot_description.py character.json
python3 scripts/validate_lorebook_json.py lorebook.json
python3 scripts/ru_regex_check.py '/.../' --lint
```

New:

```bash
node scripts/validate_bot_description.mjs character.json --model gpt-4o
node scripts/validate_lorebook_json.mjs lorebook.json
node scripts/st_key_tester.mjs '/.../' --text 'sample text'
node scripts/st_lorebook_key_check.mjs lorebook.json --text 'sample scan text'
node scripts/token_check.mjs character.json --model gpt-4o
```

## Python legacy location

```text
legacy/python/
```

Use legacy Python only for old projects or comparison. Do not use it as the final SillyTavern regex authority.

## Greeting rule changed

Old: `first_mes` 100–200 words.

New:

- `first_mes` minimum 250 words;
- each `alternate_greetings` item minimum 250 words;
- no upper word limit;
- token budget is checked separately.

## GPT branch added

Use:

```text
gpt/SKILL_GPT.md
gpt/prompts/*.md
```

only for ChatGPT, OpenAI API, Codex, Custom GPT, or GPT-specific prompt work.
