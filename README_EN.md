# ACE-SKILL

ACE-SKILL is a simple skill for AI agents.

It helps create, fix, and improve SillyTavern bots, character cards, lorebooks / World Info, Russian and English regex keys, and JSON files.

## What ACE-SKILL can do

ACE-SKILL helps you:

- improve character descriptions;
- fix character card structure;
- split data into clear sections;
- create or fix lorebooks / World Info;
- create Russian and English keywords;
- create Russian regex keys;
- validate JSON files;
- prepare bots for SillyTavern;
- give AI agents a clear instruction for bot editing.

## Why use this skill

Use this skill if you create SillyTavern bots and want:

- stronger character consistency;
- cleaner descriptions;
- better lorebook structure;
- World Info entries that trigger correctly;
- working Russian keywords;
- valid JSON files;
- an AI agent that understands how to fix the bot.

## Project structure

```text
SKILL.md
assets/
references/
scripts/
README.md
README_EN.md
```

## What is inside

### `SKILL.md`

The main instruction file for the AI agent.

The agent should read this file first and then follow its rules.

### `assets/`

Templates and extra files.

### `references/`

Rules, references, and additional instructions.

### `scripts/`

Python scripts for checking JSON, descriptions, and regex keys.

## How to download the skill

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Replace `YOUR_USERNAME` with your GitHub username.

Example:

```bash
git clone https://github.com/kiaraweimannrdmx/ace-skill.git
cd ace-skill
```

## How to use with Codex CLI

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Run Codex CLI:

```bash
codex
```

After Codex starts, write:

```text
Read SKILL.md and use ACE-SKILL as your instruction.
Help me improve a SillyTavern bot, character card, lorebook, regex keys, and JSON.
Ask clarification questions first, then suggest fixes.
```

## How to use with Antigravity CLI

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Run Antigravity CLI:

```bash
agy
```

After it starts, write:

```text
Read SKILL.md.
Use ACE-SKILL as your working instruction.
I need to improve a SillyTavern bot: description, lorebook, World Info, regex keys, and JSON.
```

## How to use with Claude Code

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Run Claude Code:

```bash
claude
```

After Claude starts, write:

```text
Read SKILL.md and follow ACE-SKILL.
Help me create, fix, or optimize a SillyTavern character card and lorebook.
Use the files from this repository.
```

## How to use in ChatGPT

### Option 1: use GitHub

Open ChatGPT with agent mode or file tools and write:

```text
Open or download this GitHub repository:

https://github.com/YOUR_USERNAME/ace-skill

Read SKILL.md.
Use ACE-SKILL as your instruction.
Help me improve a SillyTavern bot, lorebook, World Info, regex keys, and JSON.
```

### Option 2: use ZIP

1. Download the repository as ZIP.
2. Upload the ZIP to ChatGPT.
3. Write:

```text
Unpack the archive.
Read SKILL.md.
Use ACE-SKILL as the instruction for working with my bot.
```

## Example prompts for agents

```text
Fix my SillyTavern bot using ACE-SKILL.
```

```text
Create a lorebook for this character.
```

```text
Create Russian and English regex keys for World Info.
```

```text
Check JSON and fix errors.
```

```text
Optimize first_mes and mes_example.
```

```text
Separate Mind and Personality.
```

## Validate lorebook JSON

```bash
python3 scripts/validate_lorebook_json.py path/to/lorebook.json
```

Example:

```bash
python3 scripts/validate_lorebook_json.py my_lorebook.json
```

## Validate character card

```bash
python3 scripts/validate_bot_description.py path/to/character.json
```

Example:

```bash
python3 scripts/validate_bot_description.py character.json
```

## Check Russian regex key

```bash
python3 scripts/ru_regex_check.py '<REGEX>' --lint --kind word --strategy regex
```

## Important

ACE-SKILL is not a normal app.

It is a set of instructions, templates, and validation scripts for AI agents.

It works best when the agent:

1. reads `SKILL.md`;
2. uses files from `references/`;
3. uses templates from `assets/`;
4. validates the result with scripts from `scripts/`.

## License

Use freely for personal AI-agent workflows.
