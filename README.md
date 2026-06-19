# ACE-SKILL

ACE-SKILL — это простой skill для ИИ-агентов.

Он помогает создавать, исправлять и улучшать SillyTavern-ботов, character card, lorebook / World Info, русские и английские regex-ключи, а также JSON-файлы.

## Что умеет ACE-SKILL

ACE-SKILL помогает:

- улучшить описание персонажа;
- исправить структуру character card;
- разделить данные на понятные блоки;
- создать или исправить lorebook / World Info;
- создать русские и английские ключи;
- создать regex-ключи для русского языка;
- проверить JSON-файлы;
- подготовить бота для SillyTavern;
- дать ИИ-агенту понятную инструкцию, как работать с ботом.

## Для чего нужен этот skill

Этот skill нужен, если ты делаешь бота для SillyTavern и хочешь, чтобы:

- персонаж лучше держал характер;
- описание было аккуратным;
- lorebook не был хаотичным;
- World Info включался по правильным словам;
- русские ключи работали нормально;
- JSON не ломался;
- ИИ-агент понимал, как именно исправлять бота.

## Структура проекта

```text
SKILL.md
assets/
references/
scripts/
README.md
README_EN.md
```

## Что находится внутри

### `SKILL.md`

Главная инструкция для ИИ-агента.

Агент должен сначала прочитать этот файл, а потом работать по его правилам.

### `assets/`

Шаблоны и дополнительные файлы.

### `references/`

Правила, справка и дополнительные инструкции.

### `scripts/`

Python-скрипты для проверки JSON, описаний и regex-ключей.

## Как скачать skill

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Замени `YOUR_USERNAME` на свой GitHub-ник.

Пример:

```bash
git clone https://github.com/kiaraweimannrdmx/ace-skill.git
cd ace-skill
```

## Как использовать с Codex CLI

Скачай репозиторий:

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Запусти Codex CLI:

```bash
codex
```

После запуска напиши агенту:

```text
Прочитай SKILL.md и используй ACE-SKILL как инструкцию.
Помоги мне улучшить SillyTavern-бота, character card, lorebook, regex-ключи и JSON.
Сначала задай уточняющие вопросы, потом предложи исправления.
```

## Как использовать с Antigravity CLI

Скачай репозиторий:

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Запусти Antigravity CLI:

```bash
agy
```

После запуска напиши:

```text
Прочитай SKILL.md.
Используй ACE-SKILL как рабочую инструкцию.
Мне нужно улучшить SillyTavern-бота: описание, lorebook, World Info, regex-ключи и JSON.
```

## Как использовать с Claude Code

Скачай репозиторий:

```bash
git clone https://github.com/YOUR_USERNAME/ace-skill.git
cd ace-skill
```

Запусти Claude Code:

```bash
claude
```

После запуска напиши:

```text
Read SKILL.md and follow ACE-SKILL.
Help me create, fix, or optimize a SillyTavern character card and lorebook.
Use the files from this repository.
```

## Как использовать в ChatGPT

### Способ 1: через GitHub

Открой ChatGPT с режимом агента или инструментами для работы с файлами и напиши:

```text
Открой или скачай этот GitHub-репозиторий:

https://github.com/YOUR_USERNAME/ace-skill

Прочитай SKILL.md.
Используй ACE-SKILL как инструкцию.
Помоги мне улучшить SillyTavern-бота, lorebook, World Info, regex-ключи и JSON.
```

### Способ 2: через ZIP

1. Скачай репозиторий как ZIP.
2. Загрузи ZIP в ChatGPT.
3. Напиши:

```text
Распакуй архив.
Прочитай SKILL.md.
Используй ACE-SKILL как инструкцию для работы с моим ботом.
```

## Примеры запросов к агенту

```text
Исправь моего SillyTavern-бота по ACE-SKILL.
```

```text
Создай lorebook для этого персонажа.
```

```text
Сделай русские и английские regex-ключи для World Info.
```

```text
Проверь JSON и исправь ошибки.
```

```text
Оптимизируй first_mes и mes_example.
```

```text
Раздели Mind и Personality.
```

## Проверка lorebook JSON

```bash
python3 scripts/validate_lorebook_json.py path/to/lorebook.json
```

Пример:

```bash
python3 scripts/validate_lorebook_json.py my_lorebook.json
```

## Проверка character card

```bash
python3 scripts/validate_bot_description.py path/to/character.json
```

Пример:

```bash
python3 scripts/validate_bot_description.py character.json
```

## Проверка русского regex-ключа

```bash
python3 scripts/ru_regex_check.py '<REGEX>' --lint --kind word --strategy regex
```

## Важно

ACE-SKILL — это не обычная программа.

Это набор инструкций, шаблонов и проверочных скриптов для ИИ-агентов.

Лучше всего он работает, когда агент:

1. читает `SKILL.md`;
2. использует файлы из `references/`;
3. использует шаблоны из `assets/`;
4. проверяет результат скриптами из `scripts/`.

## Лицензия

Можно использовать свободно для личных AI-agent workflows.
