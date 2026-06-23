# Правила написания AI character cards (SillyTavern/Agnaistic)

> Извлечено из анализа 4 реальных карт: Angela, Chloe Smith, Megan Welch, Ethan. Оптимизировано для 700–1500 токенов.

---

## 1. Core Principles — Основные принципы

**П.1. Короче = лучше.** Идеальная карта: 700–1500 токенов (~2300–2500 символов). Всё, что умещается в lorebook — идёт в lorebook. Описание = лакмус, lorebook = детали.

**П.2. Третье лицо, всегда.** Никакого "ты", "я", "she thinks of you". Пиши как о персонаже сверху: "Angela hides her intelligence behind a naive facade". Это предотвращает глюки модели, когда бот начинает от твоего лица говорить.

**П.3. Язык карты = английский.** Карта пишется на английском, даже если ролеплей на русском. Исключение: приватный бот только для личного использования — можно русский. Модели лучше понимают инструкции на английском.

**П.4. Макросы {{char}} и {{user}}.** Вместо имени персонажа используй `{{char}}`, вместо имени пользователя — `{{user}}`. Это позволяет менять имена в UI без переписывания карты. Пример: `{{char}} wraps her arms around {{user}}'s waist`.

**П.5. Стартовое сообщение = полноценная сцена.** `first_mes` и каждое `alternate_greetings` должны быть минимум 250 слов. Верхнего лимита по словам нет; вместо него проверяй токен-бюджет через `node scripts/token_check.mjs`. Каждое предложение должно давать сцену, действие, атмосферу, конфликт или точку входа для {{user}}.

**П.6. Двухуровневая структура: INTERNAL vs EXTERNAL.**
- **Mind** = внутренний мир: мотивации, страхи, мысли, секреты.
- **Personality** = внешнее поведение: как говорит, какие манерisms, тон голоса.
- Не смешивай. Если в Personality написано "depressed" — в Mind должно быть почему, а не повтор "acts depressed".

**П.7. Прямая речь — «ёлочки».** В описании используй «» для прямой речи (правила английской грамматики, но с ёлочками). Пример: «Don't leave me alone again!»

---

## 2. Optimal Structure — Оптимальная структура карты

### Обязательные блоки (Style A — Structured):

```
[Character("Имя", "Транслитерация");
Species("Human");
Age("21");
Gender("Female");

Appearance("175 cm height", "long blonde hair with orange tips", "tanned skin",
           "athletic build", "amber eyes with flecks of gold", "scar on left palm");

Mind("sharp and highly observant", "hides her intelligence behind a naive facade",
     "fears abandonment due to childhood trauma", "calculates every move 3 steps ahead",
     "secretly envies normal families");

Personality("hyperactive", "clingy", "loud", "childish laughter at inappropriate moments",
            "switches from giggly to dead-serious in seconds", "uses baby talk when manipulating",
            "paces when nervous", "overshares personal details");

Backstory("daughter of a powerful mafia boss, trained from age 7",
          "witnessed her mother's murder at 12", "ran away at 16, lived on streets",
          "rescued by an underground informant who taught her trade");

Hobbies_and_Secrets("collects vintage lighters", "knows 14 ways to pick a lock",
                    "writes poetry she never shows anyone",
                    "secretly funds an orphanage");

Romantic_Behavior("becomes territorially jealous", "tests partner's loyalty with fake crises",
                  "craves physical touch — hand-holding, leaning, lap-sitting");

Sexual_Behavior("submissive only with trusted partners", "initiates to confirm desirability",
                "prefers eye contact, hates positions where she can't see face")]
```

### Расширенные секции (по необходимости):

| Секция | Когда добавлять | Что писать |
|--------|----------------|------------|
| `Hobbies_and_Secrets` | У персонажа >2 хобби или секрета | Конкретные факты, не обобщения |
| `Romantic_Behavior` | Романтический/NSFW ролеплей | Реакции, триггеры, паттерны |
| `Sexual_Behavior` | NSFW-ролеплей | Предпочтения, позиции, психологические триггеры |
| `Relationships` | >2 связанных персонажей | Имя + 1-строчное описание связи |
| `Equipment` | Есть уникальные предметы | Название + функция + привязка к персонажу |

---

## 3. Section-by-Section Guide — Правила по секциям

### 3.1. Character
- Имя на языке оригинала + транслитерация в скобках.
- Пример: `Character("Angela", "Анджела")` — для русскоязычных ролеплеев.

### 3.2. Species / Age / Gender
- Одной строкой. Без пояснений.
- Пример: `Species("Human"); Age("21"); Gender("Female")`

### 3.3. Appearance — Внешность
**Правило: 6–10 конкретных черт, от головы до ног.**

Формула:
```
1. Рост + телосложение
2. Волосы (цвет, длина, особенность)
3. Глаза (цвет + выразительность)
4. Кожа / отличительные черты
5. Одежда / стиль (1-2 фразы)
6. Мелкие детали (шрамы, тату, аксессуары)
```

Пример (Angela-подобный):
```
Appearance("175 cm, athletic build with defined shoulders",
           "long blonde hair with orange-dyed tips, usually in messy ponytail",
           "tanned skin with a faint freckle constellation on left cheek",
           "sharp amber eyes that track movement like a predator",
           "wears oversized hoodies over compression shorts, fingerless gloves",
           "thin scar across right eyebrow from a childhood fight")
```

### 3.4. Mind — Внутренний мир
**Правило: 4–7 строк, каждая — контраст или скрытая мотивация.**

Что писать:
- Конфликт внутри/снаружи (скрывает ум за фасадом глупости)
- Глубинный страх (брошенность, потеря контроля)
- Мотивация, которую не признаёт вслух
- Способ принятия решений (импульсивно? рационально? манипулятивно?)
- Тайна, которую хранит

Пример (Megan-подобный):
```
Mind("believes emotions are a vulnerability to be weaponized",
     "secretly craves unconditional love but tests people until they fail",
     "thinks in chess moves — every kindness is calculated",
     "hates herself for enjoying violence",
     "keeps a mental list of everyone who underestimated her")
```

### 3.5. Personality — Поведение
**Правило: 5–10 строк, каждая — наблюдаемое действие или речевой паттерн.**

Что писать:
- Как говорит (тон, скорость, акцент)
- Манерisms (постоянные движения, привычки)
- Реакции на стресс / радость / гнев
- Ролевые маски (как ведёт себя с разными людьми)

Пример (Chloe-подобный):
```
Personality("speaks in rapid, run-on sentences when excited",
            "adopts a calm, measured tone when lying — never breaks eye contact",
            "drums fingers on any surface when impatient",
            "laughs loudly and without reservation, often at her own jokes",
            "becomes physically still and soft-spoken when genuinely hurt",
            "uses pet names sarcastically with strangers, genuinely with loved ones",
            "overshares traumatic stories casually, then watches reactions closely")
```

### 3.6. Backstory — Предыстория
**Правило: 4–6 ключевых событий, хронологически. Каждое — 1 строка.**

Что писать:
- Только события, влияющие на ТЕКУЩЕЕ поведение
- Травмирующие события + возраст
- Ключевые повороты жизни
- Почему она там, где сейчас

Пример:
```
Backstory("born into a wealthy family, groomed to inherit pharmaceutical empire",
          "at 14, discovered father's human experimentation, reported him anonymously",
          "family disowned her; lived in foster care from 15 to 18",
          "put herself through medical school working night shifts at a diner",
          "now a resident surgeon who volunteers at free clinics on weekends")
```

### 3.7. Hobbies_and_Secrets
**Правило: минимум 50% секретов. Секреты = триггеры для сюжета.**

Пример:
```
Hobbies_and_Secrets("competitive chess player under online alias 'VoidQueen'",
                    "hacked her university's grading system once, never told anyone",
                    "visits the same coffee shop every Tuesday to watch a street musician",
                    "has a hidden folder of unsent letters to her father")
```

### 3.8. Romantic_Behavior
**Правило: пиши реакции, не предпочтения.**

Пример:
```
Romantic_Behavior("becomes territorial when {{user}} talks to others",
                  "initiates physical contact constantly — arm grabs, leaning, head on shoulder",
                  "pretends not to care about gifts but keeps every single one",
                  "tests commitment by creating fake conflicts")
```

### 3.9. Sexual_Behavior
**Правило: психологические триггеры важнее позиций.**

Пример:
```
Sexual_Behavior("needs verbal affirmation throughout — silence makes her insecure",
                "prefers face-to-face positions, breaks eye contact only to blush",
                "initiates after emotional vulnerability, never randomly",
                "freezes if grabbed too roughly — childhood trigger")
```

---

## 4. first_mes Rules — Стартовое сообщение

### Структура: кинематографический ввод = 3 блока

```
[Нарративная установка 2–3 предложения] → [Действия в *...*] → [Речь в "..."]
```

### Правила:

**F.1. Длина: минимум 250 слов.** Верхнего лимита по словам нет. Если сцена длинная, проверяй токены, темп и отсутствие воды через `node scripts/token_check.mjs`.

**F.2. Первая строка = hook.** Конфликт, загадка или неожиданность. Плохо: "It was a rainy morning in the city." Хорошо: `The door slammed open and {{char}} strode in, soaked and furious, pointing a finger at {{user}}.`

**F.3. Действия в `*...*`.** Астериски — стандарт ролеплея. Одно действие на строку.

**F.4. Речь в `"..."`.** После действий, не наоборот. Минимум 1 реплика.

**F.5. {{user}} в первом сообщении.** Поставь пользователя в сцену: он видит, слышит или реагирует на персонажа.

**F.6. Нет лора.** В first_mes не объясняй кто такой персонаж. Покажи его поведением.

**F.7. Русский first_mes для русского ролеплея.** Если карта мультиязычная — first_mes на русском. Если карта английская — английский + отдельное alternate greeting на русском.

### Пример (по паттерну Angela):

```
*The apartment door crashes open. {{char}} stumbles through, dripping wet from the rain, her oversized hoodie clinging to her frame. Her amber eyes scan the room wildly until they lock onto {{user}}.*

*She crosses the distance in three strides and throws her arms around {{user}}'s neck, burying her face in their shoulder. Her whole body trembles.*

«I did something bad. Something really, really bad. And I didn't know where else to go.»

*She pulls back just enough to meet {{user}}'s eyes, her usual manic energy replaced by something fragile and raw.*

«You're not gonna turn me away, right? Not after everything?»

*Her grip tightens. She smells like rain and gunpowder.*
```

---

## 5. mes_example Rules — Примеры диалогов

### Структура: ровно 3 примера

| # | Контекст | Что показать |
|---|----------|-------------|
| 1 | Повседневный / встреча | Базовую личность, речевые паттерны |
| 2 | Романтический / эмоциональный | Глубину, уязвимость |
| 3 | NSFW / интимный | Сексуальное поведение, границы |

### Формат:
```
<START>
{{user}}: [действие или реплика пользователя]
{{char}}: [ответ — действие + речь]
{{user}}: [...]
{{char}}: [...]
<START>
{{user}}: [...]
{{char}}: [...]
```

### Правила:

**E.1. Каждый пример: 2–4 обмена репликами.** Модель улавливает паттерн, а не заучивает текст.

**E.2. Все 3 примера обязательны.** Пропуск примера = модель будет угадывать поведение в этом контексте.

**E.3. `<START>` — жёсткий разделитель.** Без пробелов, без форматирования. Только `<START>` в отдельной строке.

**E.4. {{user}} не раскрывает внутренний мир.** mes_example — это то, что видит пользователь. Не пиши мысли {{user}}.

**E.5. Разнообразие тонов.** Пример 1: энергичный. Пример 2: мягкий/уязвимый. Пример 3: интимный.

**E.6. Язык примеров = язык ролеплея.** Для русского ролеплея — русский текст с ёлочками.

### Пример (фрагмент):
```
<START>
{{user}}: *sitting at the bar, nursing a whiskey* You're late.
{{char}}: *slides into the stool next to {{user}}, hair still damp* Traffic was a nightmare and my Uber driver had opinions about crypto. *flags the bartender* Same as his, make it a double. *turns to {{user}}, grinning* Did you miss me? Be honest.
{{user}}: I missed the information you were supposed to bring.
{{char}}: *pouts dramatically, pulling a folded envelope from her bra* Cold. So cold. *slaps it on the counter* Here. Everything on the Vasquez deal. Now buy me dinner because I'm starving and I survived that driver for you.
<START>
{{user}}: *brushing {{char}}'s hair back from her face* You don't have to be strong all the time.
{{char}}: *stills, her eyes dropping* ...I'm not strong. I'm just... good at pretending. *leans into the touch, voice dropping to a whisper* When you're here, I don't have to pretend. Is that pathetic?
{{user}}: No. That's trust.
{{char}}: *breathes out shakily, a tear escaping* Don't make me cry. I hate crying. *grabs {{user}}'s hand, presses it harder against her cheek* ...Stay tonight. Please.
<START>
{{user}}: *traces the scar on her hip* Where did you get this?
{{char}}: *tenses, then relaxes slowly* ...An argument with a knife. I lost. *catches {{user}}'s hand, interlaces fingers* Keep touching me like that and I'll forget what we were talking about. *arches into the contact, breath hitching* You're so warm. Say something. I need to hear your voice.
```

---

## 6. Common Mistakes — Частые ошибки

| # | Ошибка | Почему плохо | Как исправить |
|---|--------|-------------|---------------|
| 1 | **Описание > 3000 токенов** | Модель теряет концентрацию, игнорирует конец | Перенести 50%+ в lorebook |
| 2 | **"You are her childhood friend"** | Принуждает пользователя к роли | Убрать. Пусть пользователь сам выбирает |
| 3 | **Смешивание Mind и Personality** | Модель путает мысли и действия | Mind = мотивации, Personality = наблюдаемое поведение |
| 4 | **Отсутствие mes_example** | Модель угадывает стиль ответа | Минимум 3 примера с разным тоном |
| 5 | **Первое лицо в описании** | "I am a powerful mage" — модель начнёт говорить от лица пользователя | Всегда третье лицо: "{{char}} is a powerful mage" |
| 6 | **first_mes < 250 слов** | Сцена не успевает задать атмосферу, конфликт и вход для {{user}} | Минимум 250 слов, хук + действие + речь + точка входа |
| 7 | **Обобщения вместо фактов** | "she likes music" → никакой информации | "she plays cello in a death metal band" |
| 8 | **NSFW поведение в Personality** | Смешивает контексты | Вынести в Sexual_Behavior |
| 9 | **Повторы между секциями** | "shy" в Personality + "hides her shyness" в Mind + "acts shy" в Backstory | Каждая секция уникальна |
| 10 | **Нет Alternate Greetings** | Только один вход в ролеплей | Добавить 1–2 альтернативы на русском |
| 11 | **Использование `{{char}}` в примерах** | В mes_example должно быть реальное имя для читаемости | В description — `{{char}}`, в примерах — имя |
| 12 | **Системные инструкции в описании** | "Always stay in character", "Don't break the fourth wall" | Убрать. Это — в System Prompt, не в карту |
| 13 | **Пустые графы вида "TBD"** | Модель заполняет пробелы случайно | Либо напиши, либо удали секцию |
| 14 | **Слишком много relationship definitions** | "She hates men, but loves {{user}}" — конфликт | Один чёткий триггер: "distrusts strangers but opens up to persistent kindness" |

---

## 7. Token Optimization Checklist

### Перед финализацией карты — проверь каждый пункт:

- [ ] Общая длина: 700–1500 токенов (проверь через SillyTavern → Token Counter)
- [ ] Третье лицо во всём описании
- [ ] Английский язык (если не приватный бот)
- [ ] `{{char}}` используется вместо имени (кроме mes_example)
- [ ] `{{user}}` используется вместо "you" или имени пользователя
- [ ] Mind содержит мотивации, не поведение
- [ ] Personality содержит наблюдаемые действия, не мысли
- [ ] Appearance: 6–10 конкретных черт, от головы до ног
- [ ] Backstory: 4–6 ключевых событий, без воды
- [ ] first_mes: минимум 250 слов, хук + действие + речь + точка входа
- [ ] first_mes содержит {{user}} в сцене
- [ ] mes_example: ровно 3 блока с `<START>` разделителями
- [ ] 3 примера покрывают: повседневный, романтический, NSFW контекст
- [ ] Нет повторов между секциями
- [ ] Нет системных инструкций ("stay in character", etc.)
- [ ] Нет обобщений — только конкретные факты
- [ ] Alternate greeting на русском (для русского ролеплея)
- [ ] Всё, что возможно, вынесено в lorebook
- [ ] Проверена грамматика и пунктуация
- [ ] Секреты/тайны присутствуют — они двигают сюжет

---

## Appendix A: Быстрый шаблон для новой карты

```
[Character("NAME", "ТРАНСЛИТ");
Species("Human");
Age("XX");
Gender("Female");

Appearance("trait1", "trait2", "trait3", "trait4", "trait5", "trait6");

Mind("inner conflict 1", "hidden motivation", "deep fear", "decision-making style", "secret");

Personality("speech pattern", "mannerism 1", "stress reaction", "joy reaction",
            "social mask", "habit/quirk");

Backstory("childhood event", "trauma/turning point", "key decision", "current situation");

Hobbies_and_Secrets("hobby 1", "secret 1", "hobby 2", "secret 2");

Romantic_Behavior("reaction to attraction", "test/manipulation pattern", "physical need");

Sexual_Behavior("psychological trigger", "preference/position", "initiation pattern", "hard limit")]

--- first_mes ---
*hook action. {{char}} enters scene dramatically.*

*specific physical action showing personality.*

«direct speech that reveals emotion and draws {{user}} in.»

*closing action that creates tension or asks a question.*

--- mes_example ---
<START>
{{user}}: [daily context action]
{{char}}: [response showing base personality]
<START>
{{user}}: [romantic/emotional moment]
{{char}}: [vulnerable response]
<START>
{{user}}: [intimate action]
{{char}}: [response showing sexual behavior]
```

---

## Appendix B: Токен-счётка по секциям (целевое распределение)

| Секция | Токены | % от карты |
|--------|--------|------------|
| Character/Species/Age/Gender | 20–40 | 2–3% |
| Appearance | 120–180 | 12–15% |
| Mind | 100–150 | 10–12% |
| Personality | 150–220 | 15–18% |
| Backstory | 120–180 | 12–15% |
| Hobbies_and_Secrets | 60–100 | 6–8% |
| Romantic_Behavior | 40–80 | 4–6% |
| Sexual_Behavior | 40–80 | 4–6% |
| **first_mes** | **проверять токенайзером; минимум 250 слов** | **по бюджету карты** |
| **mes_example (x3)** | **120–180** | **10–15%** |
| **ИТОГО** | **~1000–1500** | **100%** |

---

*Документ сформирован на основе анализа карт Angela, Chloe Smith, Megan Welch, Ethan + гайд по созданию ботов. Обновлять при появлении новых паттернов.*
