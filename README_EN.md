# ACE-SKILL

**ACE-SKILL** is a skill package for AI agents that create, fix, and improve SillyTavern bots.

It helps with **character cards**, **lorebooks / World Info**, activation keywords, RU/EN regex keys, and JSON files.

> Short version: clone the repository, let your agent read `SKILL.md`, then ask it to create or fix your bot.

---

## Table of contents

- [What this is](#what-this-is)
- [Features](#features)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Using ACE-SKILL with different agents](#using-ace-skill-with-different-agents)
  - [Codex CLI](#codex-cli)
  - [Claude Code](#claude-code)
  - [Antigravity CLI](#antigravity-cli)
  - [ChatGPT](#chatgpt)
- [Validation scripts](#validation-scripts)
- [Example prompts](#example-prompts)
- [Important limitations](#important-limitations)
- [License](#license)

---

## What this is

ACE-SKILL is not a normal app and not a standalone bot.

It is a set of files that tells an AI agent:

- how to improve character descriptions;
- how to structure character cards;
- how to design lorebooks / World Info;
- how to create activation keywords;
- how to write Russian and English regex keys;
- how to validate JSON and file structure.

The main skill file is:

```text
SKILL.md
```

The agent should read this file before doing the work.

---

## Features

ACE-SKILL helps agents with:

| Task | What the skill does |
|---|---|
| Bot improvement | Cleans and structures character descriptions |
| Character card | Helps build a logical character card |
| First message | Improves the bot's opening message |
| Dialogue examples | Helps format example dialogue |
| Lorebook / World Info | Creates and fixes world entries |
| Keywords | Generates activation keywords |
| RU regex | Builds Russian regex keys with word-form handling |
| EN keywords | Builds English keywords |
| JSON validation | Validates JSON with helper scripts |
| Agent workflow | Makes the agent ask questions before editing |

---

## Project structure

```text
ace-skill/
├── SKILL.md
├── README.md
├── README_EN.md
├── assets/
│   └── lorebook_template.json
├── references/
│   ├── bot_writing_rules.md
│   ├── keyword_strategies.md
│   ├── lorebook_rules.md
│   ├── prompt_architecture.md
│   ├── regex_templates.md
│   ├── ru_regex_checker_agent_prompt.md
│   └── ru_regex_checker_reference.md
└── scripts/
    ├── ru_regex_check.py
    ├── validate_bot_description.py
    └── validate_lorebook_json.py
```

### Main files

| File / folder | Purpose |
|---|---|
| `SKILL.md` | Main agent instruction |
| `assets/` | Templates |
| `references/` | Rules, references, and methods |
| `scripts/` | JSON and regex validation |
| `README.md` | Russian documentation |
| `README_EN.md` | English documentation |

---

## Quick start

Clone the repository:

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
```

Then open the folder with any AI agent and write:

```text
Read SKILL.md and use ACE-SKILL as your instruction.
I need to improve a SillyTavern bot, character card, lorebook, keywords, and JSON.
Ask clarification questions first, then propose a fix plan.
```

---

## Using ACE-SKILL with different agents

There are two ways to use this repository:

1. **As a normal repository** — the agent opens the folder and reads `SKILL.md`.
2. **As a real agent skill** — the repository is placed into the skill directory of a specific agent.

---

### Codex CLI

#### Option 1: use as a normal project

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
codex
```

After Codex starts, write:

```text
Read SKILL.md and use ACE-SKILL.
Help me improve a SillyTavern character card, lorebook, regex keys, and JSON files.
Ask clarification questions before editing.
```

#### Option 2: install as a Codex skill

Codex user skills are stored in:

```text
~/.agents/skills/
```

Install:

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/evrytests-maker/ace-skill.git ~/.agents/skills/ace-skill
```

Start Codex:

```bash
codex
```

Then ask Codex to use the skill:

```text
Use ace-skill to improve my SillyTavern bot.
```

You can also open the skill list inside Codex:

```text
/skills
```

---

### Claude Code

#### Option 1: use as a normal project

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
claude
```

After Claude Code starts, write:

```text
Read SKILL.md and follow ACE-SKILL.
Help me create, fix, or optimize a SillyTavern character card and lorebook.
Use references and scripts from this repository.
```

#### Option 2: install as a personal skill

Claude Code personal skills are stored in:

```text
~/.claude/skills/
```

Install:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/evrytests-maker/ace-skill.git ~/.claude/skills/ace-skill
```

Start Claude Code:

```bash
claude
```

Invoke the skill directly:

```text
/ace-skill
```

Or ask normally:

```text
Use ace-skill to fix my SillyTavern bot and lorebook.
```

#### Option 3: install for one project only

Inside your project:

```bash
mkdir -p .claude/skills
git clone https://github.com/evrytests-maker/ace-skill.git .claude/skills/ace-skill
```

---

### Antigravity CLI

#### Option 1: use as a normal project

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
agy
```

After Antigravity starts, write:

```text
Read SKILL.md and use ACE-SKILL as the workflow.
Help me improve a SillyTavern character card, lorebook, World Info entries, regex keys, and JSON.
```

#### Option 2: install as a workspace skill

Antigravity workspace skills are stored in:

```text
.agents/skills/
```

Install inside a project:

```bash
mkdir -p .agents/skills
git clone https://github.com/evrytests-maker/ace-skill.git .agents/skills/ace-skill
```

Start Antigravity:

```bash
agy
```

Check available skills:

```text
/skills
```

#### Option 3: install as a global skill

For global use:

```bash
mkdir -p ~/.gemini/config/skills
git clone https://github.com/evrytests-maker/ace-skill.git ~/.gemini/config/skills/ace-skill
```

After that, the skill should be available in different projects.

---

### ChatGPT

ChatGPT does not automatically install GitHub skills like CLI agents.

But you can make ChatGPT use this repository as an instruction package.

#### Option 1: use the GitHub link

Open ChatGPT with agent mode or file tools and write:

```text
Open this GitHub repository:

https://github.com/evrytests-maker/ace-skill

Read SKILL.md.
Use ACE-SKILL as your instruction.
I need to improve a SillyTavern bot, character card, lorebook, World Info, regex keys, and JSON.
Ask clarification questions first.
```

#### Option 2: use a ZIP file

1. Download the repository as ZIP.
2. Upload the ZIP to ChatGPT.
3. Write:

```text
Unpack the archive.
Read SKILL.md.
Use ACE-SKILL as the instruction for working with my SillyTavern bot.
```

---

## Validation scripts

ACE-SKILL includes Python scripts for checking results.

### Validate lorebook JSON

```bash
python3 scripts/validate_lorebook_json.py path/to/lorebook.json
```

Example:

```bash
python3 scripts/validate_lorebook_json.py my_lorebook.json
```

### Validate character card

```bash
python3 scripts/validate_bot_description.py path/to/character.json
```

Example:

```bash
python3 scripts/validate_bot_description.py character.json
```

### Check a Russian regex key

```bash
python3 scripts/ru_regex_check.py '<REGEX>' --lint --kind word --strategy regex
```

Example:

```bash
python3 scripts/ru_regex_check.py '/(?:^|[^а-яА-ЯёЁ])маг(?:ия|ический|ическое)?(?![а-яА-ЯёЁ])/iu' --lint --kind word --strategy regex
```

---

## Example prompts

```text
Fix my SillyTavern bot using ACE-SKILL.
```

```text
Create a lorebook for this character.
```

```text
Create RU/EN keywords for World Info.
```

```text
Create Russian regex keys for these terms.
```

```text
Check character.json and fix errors.
```

```text
Optimize first_mes and mes_example.
```

```text
Separate Mind, Personality, Appearance, and Scenario.
```

```text
Check why the lorebook triggers too often.
```

---

## How the agent should work

Correct workflow:

1. Read `SKILL.md`.
2. Understand the user's task.
3. Ask clarification questions.
4. Propose a plan.
5. Fix the description, lorebook, or JSON.
6. Validate the result with scripts.
7. Explain what changed.

---

## Important limitations

- ACE-SKILL does not replace manual review.
- The agent can make mistakes in regex and JSON, so validate the result.
- Python 3 is required for the helper scripts.
- Codex CLI, Claude Code, or Antigravity CLI must be installed separately.
- ChatGPT uses this repository only if you explicitly ask it to open the link or upload a ZIP.
- If an agent does not see the skill, restart the CLI or check the installation path.

---

## Updating the skill

If the skill was installed with `git clone`, update it with:

```bash
cd ~/.agents/skills/ace-skill
git pull
```

For Claude Code:

```bash
cd ~/.claude/skills/ace-skill
git pull
```

For Antigravity global skill:

```bash
cd ~/.gemini/config/skills/ace-skill
git pull
```

---

## License

There is no separate `LICENSE` file in this repository yet.

If you want other people to freely use and modify ACE-SKILL, add a license such as MIT.

