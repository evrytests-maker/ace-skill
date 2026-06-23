# ACE-SKILL GPT Edition

Эта папка содержит отдельную GPT-совместимую ветку ACE-SKILL.

Используй её, когда работаешь с ChatGPT, Codex, Custom GPT, OpenAI API prompts или когда пользователь явно просит “версию под GPT”. Для Claude/Kimi/Gemini эта папка не является обязательной и не должна автоматически подмешиваться в общий workflow.

---

## Почему GPT-ветка отдельная

GPT-модели обычно лучше следуют инструкциям, когда задача описана явно:

- что является входом;
- какие файлы читать;
- какой режим выбрать;
- какие шаги делать;
- какой формат вывода вернуть;
- какие проверки выполнить;
- что считать ошибкой.

Поэтому GPT-промпты в этой папке написаны как контракты: `Role → Inputs → Decision Tree → Workflow → Output Contract → Self-check`.

---

## Что брать из SillyTavern GPT presets

Разрешено брать только правила написания промптов и безопасную структуру:

- модульность;
- явные блоки genre/style/length;
- POV boundaries;
- knowledge boundaries / character blindspot;
- правила “не писать за {{user}}”;
- scene continuation / plot push;
- формат prose rules;
- bad/good examples.

Не переносить:

- jailbreak;
- no-refusal;
- filter-bypass;
- override safety;
- инструкции обходить политики модели.

---

## Файлы

```text
gpt/
├── README_GPT.md
├── SKILL_GPT.md
├── prompts/
│   ├── gpt_master_instruction.md
│   ├── gpt_character_card_writer.md
│   ├── gpt_lorebook_writer.md
│   ├── gpt_key_designer.md
│   ├── gpt_validator_repair.md
│   ├── gpt_codex_repo_agent.md
│   └── gpt_sillytavern_preset_notes.md
└── examples/
    ├── good_gpt_prompt.md
    ├── bad_vs_good_gpt_prompt.md
    └── character_card_gpt_template.json
```

---

## Быстрый GPT-start

Скажи агенту:

```text
Read SKILL.md. Because this task targets ChatGPT/Codex, use gpt/SKILL_GPT.md and the files in gpt/prompts/. Do not apply GPT-only prompt rules to Claude/Kimi unless I ask.
```

Для проверки:

```bash
node scripts/validate_bot_description.mjs character.json --model gpt-4o
node scripts/validate_lorebook_json.mjs lorebook.json
node scripts/st_lorebook_key_check.mjs lorebook.json --text "sample scan text"
node scripts/token_check.mjs character.json --model gpt-4o
```
