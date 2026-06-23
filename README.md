# ACE-SKILL v4 GPT/JS

**ACE-SKILL** — skill-пакет для ИИ-агентов, которые создают, исправляют и оптимизируют SillyTavern character cards, World Info / Lorebooks, ключи активации, JavaScript regex, greetings и token budgets.

Версия v4 добавляет отдельную GPT-ветку и переводит активные скрипты на JavaScript/Node. Python оставлен как legacy.

---

## Главное в v4

- Добавлена отдельная папка `gpt/` для ChatGPT, OpenAI API, Codex и Custom GPT prompts.
- Главный `SKILL.md` теперь сам выбирает режим: общий workflow или GPT workflow.
- GPT-промпты не применяются к Claude/Kimi/Gemini автоматически.
- Проверка ключей переведена на Node/JavaScript regex, ближе к SillyTavern.
- Добавлен universal token checker.
- `first_mes` и каждое `alternate_greetings`: минимум 250 слов, без верхнего лимита по словам.
- Старые Python-скрипты перенесены в `legacy/python/`.

---

## Структура

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
│   ├── bot_writing_rules.md
│   ├── keyword_strategies.md
│   ├── lorebook_rules.md
│   ├── prompt_architecture.md
│   ├── regex_templates.md
│   ├── ru_regex_checker_agent_prompt.md
│   └── ru_regex_checker_reference.md
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

## Быстрый старт

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
npm install
```

Минимально `npm install` не обязателен для большинства проверок, потому что скрипты используют стандартный Node.js. Для более точного OpenAI token count можно установить optional dependency из `package.json`.

Попроси агента:

```text
Прочитай SKILL.md и используй ACE-SKILL.
Мне нужно улучшить SillyTavern character card, lorebook, ключи и JSON.
Если задача про GPT/ChatGPT/Codex — используй gpt/SKILL_GPT.md.
```

---

## GPT режим

Используй GPT-режим, если работаешь с:

- ChatGPT;
- OpenAI API;
- Custom GPT;
- Codex;
- GPT-specific SillyTavern preset;
- проблемами, где GPT слишком буквально понимает промпт.

Команда для агента:

```text
Read SKILL.md. This task targets ChatGPT/Codex, so use gpt/SKILL_GPT.md and gpt/prompts/. Do not apply GPT-only prompts to Claude/Kimi unless I ask.
```

Из сторонних GPT-пресетов можно брать только безопасные правила структуры промптов: модульность, length presets, POV boundaries, character blindspot, no-user-control, plot push. Не переносить jailbreak/no-refusal/filter-bypass инструкции.

---

## Проверочные команды

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

### Один ключ

```bash
node scripts/st_key_tester.mjs '/(?:Годжо|Gojo)/iu' --text 'Годжо вошёл в комнату'
```

### Lorebook activation

```bash
node scripts/st_lorebook_key_check.mjs lorebook.json --text 'Годжо вспоминает мать и прошлое' --char 'Gojo' --user 'User'
```

---

## npm scripts

```bash
npm run validate:bot -- character.json --model gpt-4o
npm run validate:lorebook -- lorebook.json
npm run check:key -- '/(?:Годжо|Gojo)/iu' --text 'Годжо здесь'
npm run check:keys -- lorebook.json --text 'sample scan text'
npm run check:tokens -- character.json --model gpt-4o
```

---

## Новое правило greetings

Старое правило 100–200 слов удалено.

Теперь:

- `first_mes`: минимум 250 слов;
- каждое `alternate_greetings`: минимум 250 слов;
- верхнего лимита по словам нет;
- если сцена большая, проверяй токен-бюджет.

---

## JavaScript вместо Python

Активные скрипты теперь в `scripts/*.mjs`.

Python-версии сохранены здесь:

```text
legacy/python/
```

Их можно использовать только для сравнения или старого workflow. Для SillyTavern regex финальная проверка должна быть JavaScript-based.

---

## Примеры задач

```text
Проверь мой lorebook и исправь ключи под SillyTavern.
```

```text
Сделай отдельный GPT-промпт для этой character card, чтобы ChatGPT не путал Mind и Personality.
```

```text
Создай first_mes и 3 alternate_greetings, каждое минимум 250 слов, не пиши за {{user}}.
```

```text
Проверь, какие записи World Info активируются на этом фрагменте чата.
```

---

## Лицензия

MIT или лицензия исходного репозитория, если она задана отдельно.
