# RU/EN Regex Key Checker Reference v4

Активная проверка ключей ACE-SKILL v4 выполняется через Node/JavaScript, потому что SillyTavern regex-ключи — это JavaScript regex literals вида `/pattern/flags`.

Python-чекер сохранён только как legacy:

```text
legacy/python/ru_regex_check.py
```

---

## Основные команды

### Проверить один ключ

```bash
node scripts/st_key_tester.mjs '/(?:Годжо|Сатору\s+Годжо|Gojo)/iu' --text 'Годжо вошёл в комнату'
```

### Проверить позитивные и негативные кандидаты

```bash
node scripts/st_key_tester.mjs '/(?:Годжо|Сатору\s+Годжо|Gojo)/iu' \
  'Годжо вошёл' \
  'Satoru Gojo smiled' \
  'СуперГоджо' \
  'Нанами здесь'
```

### Проверить lorebook against scan text

```bash
node scripts/st_lorebook_key_check.mjs lorebook.json \
  --text 'Годжо вспоминает мать и прошлое' \
  --char 'Gojo' \
  --user 'User'
```

---

## Правила SillyTavern-compatible regex

1. Regex key должен быть JavaScript literal: `/pattern/flags`.
2. Для RU/EN чаще всего используй `iu` flags.
3. Не полагайся на Python-only синтаксис.
4. Не используй слишком короткие стемы: `лес`, `маг`, `кро` дают ложные срабатывания.
5. Для имён лучше точные варианты, чем широкий stem.
6. Для словоформ лучше явно перечислить окончания, если ключ важный.

---

## Шаблоны

### Имя

```text
/(?:Годжо|Сатору\s+Годжо|Gojo|Satoru\s+Gojo)/u
```

### Семья

```text
/(?:family|mother|father|parents|мама|мать|отец|папа|родител[ьи]|семь[яеию])/iu
```

### Прошлое / травма

```text
/(?:past|backstory|childhood|trauma|memory|прошл(?:ое|ом)|детств[оае]|травм[аыуе]|воспоминан(?:ие|ия|ий))/iu
```

### Локация с пробелом или дефисом

```text
/(?:Токио[-\s]+техникум|Tokyo[-\s]+Jujutsu[-\s]+High)/iu
```

---

## Checklist

- [ ] Regex компилируется в Node.
- [ ] Есть позитивные тесты.
- [ ] Есть негативные тесты.
- [ ] Ключ не ловит склеенные слова, если это не нужно.
- [ ] Ключ не активирует слишком общие слова.
- [ ] Для lorebook проверен `st_lorebook_key_check.mjs`.
