# ACE-SKILL

**ACE-SKILL** — skill-пакет для ИИ-агентов, которые помогают создавать, исправлять и улучшать SillyTavern-ботов.

Он нужен для работы с **character card**, **lorebook / World Info**, ключами активации, RU/EN regex-ключами и JSON-файлами.

> Коротко: скачай репозиторий, дай агенту прочитать `SKILL.md`, затем попроси его исправить или создать бота.

---

## Содержание

- [Что это](#что-это)
- [Что умеет](#что-умеет)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Использование в разных агентах](#использование-в-разных-агентах)
  - [Codex CLI](#codex-cli)
  - [Claude Code](#claude-code)
  - [Antigravity CLI](#antigravity-cli)
  - [ChatGPT](#chatgpt)
- [Проверочные скрипты](#проверочные-скрипты)
- [Примеры запросов](#примеры-запросов)
- [Важные ограничения](#важные-ограничения)
- [Лицензия](#лицензия)

---

## Что это

ACE-SKILL — это не обычная программа и не отдельный бот.

Это набор файлов, который объясняет ИИ-агенту:

- как правильно улучшать описание персонажа;
- как собирать character card;
- как проектировать lorebook / World Info;
- как делать ключи активации;
- как писать русские и английские regex-ключи;
- как проверять JSON и структуру файлов.

Главный файл skill-пакета:

```text
SKILL.md
```

Именно его должен прочитать агент перед работой.

---

## Что умеет

ACE-SKILL помогает агенту выполнять такие задачи:

| Задача | Что делает skill |
|---|---|
| Улучшение бота | Чистит и структурирует описание персонажа |
| Character card | Помогает собрать логичную структуру персонажа |
| First message | Улучшает первое сообщение бота |
| Dialogue examples | Помогает оформить примеры диалога |
| Lorebook / World Info | Создаёт и исправляет записи мира |
| Keywords | Подбирает ключи активации |
| RU regex | Делает русские regex-ключи с учётом падежей и форм слов |
| EN keywords | Делает английские ключи |
| JSON validation | Проверяет JSON через скрипты |
| Agent workflow | Заставляет агента сначала задавать вопросы, а потом редактировать |

---

## Структура проекта

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

### Главные файлы

| Файл / папка | Назначение |
|---|---|
| `SKILL.md` | Основная инструкция для агента |
| `assets/` | Шаблоны |
| `references/` | Правила, справка и методики |
| `scripts/` | Проверка JSON и regex |
| `README.md` | Русская документация |
| `README_EN.md` | Английская документация |

---

## Быстрый старт

Скачай репозиторий:

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
```

Потом открой папку в любом агенте и дай команду:

```text
Прочитай SKILL.md и используй ACE-SKILL как инструкцию.
Мне нужно улучшить SillyTavern-бота, character card, lorebook, ключи и JSON.
Сначала задай уточняющие вопросы, потом предложи план исправлений.
```

---

## Использование в разных агентах

Есть два способа использования:

1. **Как обычный репозиторий** — агент открывает папку и читает `SKILL.md`.
2. **Как настоящий skill** — репозиторий кладётся в специальную папку skills конкретного агента.

---

### Codex CLI

#### Вариант 1: использовать как обычный проект

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
codex
```

После запуска Codex напиши:

```text
Read SKILL.md and use ACE-SKILL.
Help me improve a SillyTavern character card, lorebook, regex keys, and JSON files.
Ask clarification questions before editing.
```

#### Вариант 2: установить как skill для Codex

Codex ищет пользовательские skills в папке:

```text
~/.agents/skills/
```

Установка:

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/evrytests-maker/ace-skill.git ~/.agents/skills/ace-skill
```

Запуск:

```bash
codex
```

Дальше можно попросить Codex использовать skill:

```text
Use ace-skill to improve my SillyTavern bot.
```

Или открыть список skills внутри Codex:

```text
/skills
```

---

### Claude Code

#### Вариант 1: использовать как обычный проект

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
claude
```

После запуска Claude Code напиши:

```text
Read SKILL.md and follow ACE-SKILL.
Help me create, fix, or optimize a SillyTavern character card and lorebook.
Use references and scripts from this repository.
```

#### Вариант 2: установить как personal skill

Claude Code использует personal skills из папки:

```text
~/.claude/skills/
```

Установка:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/evrytests-maker/ace-skill.git ~/.claude/skills/ace-skill
```

Запуск:

```bash
claude
```

После запуска можно вызвать skill напрямую:

```text
/ace-skill
```

Или обычным текстом:

```text
Use ace-skill to fix my SillyTavern bot and lorebook.
```

#### Вариант 3: установить skill только для одного проекта

Внутри нужного проекта:

```bash
mkdir -p .claude/skills
git clone https://github.com/evrytests-maker/ace-skill.git .claude/skills/ace-skill
```

---

### Antigravity CLI

#### Вариант 1: использовать как обычный проект

```bash
git clone https://github.com/evrytests-maker/ace-skill.git
cd ace-skill
agy
```

После запуска Antigravity напиши:

```text
Read SKILL.md and use ACE-SKILL as the workflow.
Help me improve a SillyTavern character card, lorebook, World Info entries, regex keys, and JSON.
```

#### Вариант 2: установить как workspace skill

Для текущего проекта Antigravity использует:

```text
.agents/skills/
```

Установка в проект:

```bash
mkdir -p .agents/skills
git clone https://github.com/evrytests-maker/ace-skill.git .agents/skills/ace-skill
```

Запуск:

```bash
agy
```

Проверка skills:

```text
/skills
```

#### Вариант 3: установить как global skill

Для глобального использования:

```bash
mkdir -p ~/.gemini/config/skills
git clone https://github.com/evrytests-maker/ace-skill.git ~/.gemini/config/skills/ace-skill
```

После этого skill должен быть доступен в разных проектах.

---

### ChatGPT

ChatGPT не устанавливает GitHub-skills автоматически как CLI-агенты.

Но можно заставить ChatGPT использовать этот skill как рабочую инструкцию.

#### Вариант 1: через GitHub-ссылку

Открой ChatGPT с режимом агента или инструментами для работы с файлами и напиши:

```text
Открой этот GitHub-репозиторий:

https://github.com/evrytests-maker/ace-skill

Прочитай SKILL.md.
Используй ACE-SKILL как инструкцию.
Мне нужно улучшить SillyTavern-бота, character card, lorebook, World Info, regex-ключи и JSON.
Сначала задай уточняющие вопросы.
```

#### Вариант 2: через ZIP

1. Скачай репозиторий как ZIP.
2. Загрузи ZIP в ChatGPT.
3. Напиши:

```text
Распакуй архив.
Прочитай SKILL.md.
Используй ACE-SKILL как инструкцию для работы с моим SillyTavern-ботом.
```

---

## Проверочные скрипты

ACE-SKILL содержит Python-скрипты для проверки результата.

### Проверить lorebook JSON

```bash
python3 scripts/validate_lorebook_json.py path/to/lorebook.json
```

Пример:

```bash
python3 scripts/validate_lorebook_json.py my_lorebook.json
```

### Проверить character card

```bash
python3 scripts/validate_bot_description.py path/to/character.json
```

Пример:

```bash
python3 scripts/validate_bot_description.py character.json
```

### Проверить русский regex-ключ

```bash
python3 scripts/ru_regex_check.py '<REGEX>' --lint --kind word --strategy regex
```

Пример:

```bash
python3 scripts/ru_regex_check.py '/(?:^|[^а-яА-ЯёЁ])маг(?:ия|ический|ическое)?(?![а-яА-ЯёЁ])/iu' --lint --kind word --strategy regex
```

---

## Примеры запросов

```text
Исправь моего SillyTavern-бота по ACE-SKILL.
```

```text
Создай lorebook для этого персонажа.
```

```text
Сделай RU/EN ключи для World Info.
```

```text
Сделай русские regex-ключи для этих терминов.
```

```text
Проверь character.json и исправь ошибки.
```

```text
Оптимизируй first_mes и mes_example.
```

```text
Раздели Mind, Personality, Appearance и Scenario.
```

```text
Проверь, почему lorebook срабатывает слишком часто.
```

---

## Как агент должен работать

Правильный порядок работы:

1. Прочитать `SKILL.md`.
2. Понять задачу пользователя.
3. Задать уточняющие вопросы.
4. Предложить план.
5. Исправить описание, lorebook или JSON.
6. Проверить результат скриптами.
7. Объяснить, что было изменено.

---

## Важные ограничения

- ACE-SKILL не заменяет ручную проверку.
- Агент может ошибаться в regex и JSON, поэтому результат нужно проверять.
- Для работы скриптов нужен Python 3.
- Для CLI-агентов нужны установленные Codex CLI, Claude Code или Antigravity CLI.
- ChatGPT использует этот репозиторий только если ты явно попросишь открыть ссылку или загрузишь ZIP.
- Если агент не видит skill, перезапусти CLI или проверь папку установки.

---

## Обновление skill

Если skill установлен через `git clone`, обнови его так:

```bash
cd ~/.agents/skills/ace-skill
git pull
```

Для Claude Code:

```bash
cd ~/.claude/skills/ace-skill
git pull
```

Для Antigravity global skill:

```bash
cd ~/.gemini/config/skills/ace-skill
git pull
```

---

## Лицензия

В репозитории пока нет отдельного `LICENSE` файла.

Если ты хочешь разрешить другим людям свободно использовать и изменять ACE-SKILL, добавь лицензию, например MIT.

