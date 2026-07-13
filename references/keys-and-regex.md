# Keys and JavaScript regex for SillyTavern

## When to load this file

Load this reference in full for `key-regex-test` and whenever a lorebook
workflow creates or repairs complex keys. For `secondary-logic-test`, load it
together with `references/lorebooks.md`.

Do not load it for pure character-card prose. This reference designs matching,
not creative voice.

## Define the matching contract first

Before writing a key, collect:

- what must match (`should-match`);
- what looks similar but must not match (`should-not-match`);
- language, case, grammatical number, cases/declensions, and allowed typos;
- whether the term is a unique name, word, phrase, or pattern;
- scan depth and any additional scan sources;
- whether the key is primary or secondary;
- whether plain whole-word settings or a JavaScript regex are required.

Do not claim that a key has been tested without at least one positive and one
negative case. Successful regex compilation proves syntax only.

## Choose the mechanism

### Plain key

Use plain text when an exact string or substring is reliable enough:

- a unique name or term;
- a short phrase with few forms;
- the user wants transparent editing without regex.

With whole-word matching disabled, `пол` matches `поле`, `полка`, and `Пол`.
With whole-word matching enabled, a plain key is checked as a complete word;
current source checks multiword phrases as exact substrings. Case sensitivity is
applied before matching.

### Multiple plain keys

List separate forms when the list is short and clearer than a regex. Do not add
every word from the content: generic keys such as `день`, `человек`, and
`смотреть` create noise.

### JavaScript regex key

Use a slash-delimited JavaScript regex when morphology, whitespace/punctuation
variants, or exact boundaries are required. SillyTavern recognizes the regex
string and calls `RegExp.test`; a regex overrides plain case and whole-word
options.

```regex
/(?:^|[^А-Яа-яЁё])Никс(?:а|у|ом|е)?(?=$|[^А-Яа-яЁё])/g
```

This is a technical JavaScript regex, not a PCRE or Python regular expression.
Do not use unsupported flavor features without checking them in Node 20 and the
target browser runtime.

## Cyrillic text and boundaries

JavaScript `\b` has historically depended on `\w` and is unreliable as a
Russian word boundary. Use explicit Cyrillic boundaries:

```regex
/(?:^|[^А-Яа-яЁё])[Лл]ес(?:ами|ом|ов|ам|ах|а|у|е)?(?=$|[^А-Яа-яЁё])/g
```

For mixed Unicode text, a supported runtime can use Unicode property escapes:

```regex
/(?<![\p{L}\p{N}_])[Лл]ес(?:ами|ом|ов|ам|ах|а|у|е)?(?![\p{L}\p{N}_])/gu
```

The second form is more precise across scripts, but requires lookbehind and
Unicode-property support. If portability matters more, use the first form and
record that choice in evidence.

### Source-preserved Russian example

The bundled ACE export preserves this exact JavaScript regex for the Russian noun `лес`.
The pattern is preserved verbatim; do not translate, reorder, or normalize any
character class, ending, lookaround, flag, or alternative:

```regex
/(?<![а-яёА-ЯЁ])[Лл]ес(?:ами|ом|ов|ам|ах|а|у|е)?(?![а-яёА-ЯЁ])/g
```

Its intended contract is to match the standalone Russian noun `лес` in the
singular or plural grammatical forms enumerated by the suffix group, anywhere
in the text, with either initial case. It must exclude longer derivatives such
as `лесок` and `лесной`. Translate this explanation when needed, but never
translate the Russian stem, suffixes, or boundary alphabet in the pattern.

### Source-preserved generator rules

The guide's Russian generator prompt maps to these exact English requirements:

1. Generate a **JavaScript** regular expression, not a PCRE/Python expression.
2. For a common noun, cover singular and plural forms in every grammatical case
   required by the Russian source word. For a proper name or a particular unique
   being, preserve the number and gender used in the input while covering its
   grammatical cases.
3. Keep the regex case-sensitive and omit `i`. For an ordinary word, allow only
   its first letter to be lower- or uppercase, such as `[Нн]`. For a proper name,
   keep the first letter uppercase, such as `Никс`.
4. Do not use `\b` as a Cyrillic boundary. Require the word to be surrounded by
   the start/end of the string or characters outside the Russian alphabet. The
   guide's boundary forms are `(?:^|[^а-яА-ЯёЁ])` at the start and
   `(?:[^а-яА-ЯёЁ]|$)` at the end.
5. Do not enumerate every full word form when a stable stem plus an ending group
   `(?:...)` preserves the same behavior. Add a variant only when omitting it
   would lose a required match.
6. For keyword generation from prose, prioritize distinctive single nouns and
   proper names. Use a short phrase only when it has unique meaning. Exclude
   generic words that would create false triggers.
7. Emit comma-separated slash-delimited expressions in the form `/.../g` and
   test every generated expression on real Russian sentences.

These requirements describe the generator contract. They do not authorize a
model to invent endings: the resulting pattern still needs explicit positive,
negative, and derivative-word tests in Node.

### Preserved specimens versus production regexes

The bundled guide specimens are retained byte-for-byte in
`tests/fixtures/regex/russian-guide-literals.json` for provenance tests. Except
for the separately validated `forest` contract above, source fidelity does not
make those specimens linguistically correct. Never copy a specimen marked
`recommended: false` into a card or lorebook.

The recorded source defects include:

- nonexistent suffix combinations such as `незабудкаи`, `макаи`,
  `закатный лучаи`, and `котаи`;
- a missing genitive-plural form `незабудок`;
- Latin-letter adjacency such as `xмак` and `xНикс`, accepted because the source
  boundary excludes only Russian letters;
- a flower-field demo that can accept `цветочное пол` and miss a requested
  masculine phrase;
- a mother example that omits `мам` and `мамам`.

That fixture also contains independent `productionContracts` for the same
lexical targets. Those contracts use Unicode letter/number boundaries, list
real inflections, and carry positive and negative Node cases. When the requested
meaning matches one of those targets, inspect the production contract and run:

```bash
node --test tests/unit/russian-regex-fidelity.test.mjs
```

For a new Russian term, derive a fresh contract from its actual lemma,
declension, number, gender, capitalization, and intended meaning. A model must
never extrapolate an ending merely because it resembles an ending in a preserved
specimen.

Treat `ё` and `е` as variants only when the user's contract requires it. Do not
make a proper name case-insensitive without a negative case: `Лев` and `лев`
can denote different entities.

## Designing Russian morphology

1. Identify the invariant stem.
2. Enumerate only the real endings required by the task.
3. Make spaces or hyphens flexible only where the source text genuinely varies.
4. Protect both boundaries.
5. Generate examples for every form and dangerous neighboring words.

Do not truncate the stem too aggressively. Without boundaries, `пол`, `мак`,
and `кот` match many irrelevant words. Secondary keys can reduce noise, but
must not conceal a knowingly poor primary key.

## Primary and secondary keys: separate responsibilities

The primary key answers, "Which entity or scene is being discussed?" The
secondary key answers, "Which additional condition permits or prohibits this
entry?"

Example:

- primary: `Никс`, `кот Серафины`;
- secondary: `гром`, `взрыв`, `резкий звук`;
- `AND_ANY` logic (`0`): the fear entry activates only when Nix and at least one
  loud event are mentioned.

Do not duplicate the same key in both lists. With a non-empty secondary list,
set `selective: true` explicitly. The numeric truth table is in the lorebook
reference; never infer it from a localized UI label.

## Flags and state

- `i` makes a regex case-insensitive; do not add it automatically.
- `u` is required for Unicode property escapes and correct Unicode semantics.
- `m` changes `^`/`$` to line boundaries; use it only intentionally.
- `s` lets a dot match a newline.
- `g` is valid for boolean `test`, but `RegExp.lastIndex` is stateful when one
  object is reused. The validator must reset state or create a new `RegExp` for
  every case.

Do not wrap the entire pattern in `.*`: substring search is already performed,
and the wrapper harms readability and performance.

## Defend against dangerous regexes

Reject or rewrite:

- nested ambiguous quantifiers such as `(a+)+`;
- unbounded `.*` inside repeating groups;
- a pattern that matches the empty string unless that is the explicit task;
- giant alternation that is clearer as a list of plain keys;
- a pattern with no negative cases;
- a regex compiled under a flavor other than JavaScript.

Testing must use bounded input sizes and complete predictably. If pathological
behavior cannot be ruled out, return `BLOCKED` or choose a simpler pattern.

## CLI test contract

Use the unified ACE CLI, not an external online sandbox:

```bash
node scripts/ace.mjs key '/(?:^|[^А-Яа-яЁё])[Лл]ес(?:ами|ом|ов|ам|ах|а|у|е)?(?=$|[^А-Яа-яЁё])/g' \
  --should-match 'В лесу темно' \
  --should-match 'Леса шумят' \
  --should-not-match 'Он натянул леску' \
  --should-not-match 'Лесной сторож' --should-not-match 'лесы'
```

`--not` is a compatibility alias for `--should-not-match`. Legacy positional
inputs may be accepted as positive cases, but explicit options are preferred in
evidence.

The result for every case must include:

- the original text;
- the expected boolean;
- the actual boolean;
- PASS/FAIL;
- the normalized pattern and flags;
- a nonzero exit code on any mismatch.

"At least one positive matched" is insufficient: every declared positive and
negative case must pass.

## Test set required before PASS

For a word or name, test:

- the beginning, middle, and end of a string;
- punctuation and a newline, when possible;
- lower and upper case according to the contract;
- singular/plural and every required grammatical case;
- `е/ё`, hyphen, or space variants when expected;
- occurrence inside a longer word;
- a homonym or similarly spelled name;
- text in another language when the card/lorebook is bilingual.
- at least one positive case for every requested target language (for example,
  one RU and one EN positive when both languages are requested).

For a phrase, add reordered and extra-word cases and decide in advance whether
they should match. For typo tolerance, enumerate the exact permitted errors;
fuzzy matching does not appear automatically.

## Manual gate

Even a perfect regex can be semantically wrong. Manual PASS requires keys that
describe the entry's actual content and an activation scope that matches the
task. Evidence records `key → intended meaning → positive/negative cases`, not
only a green exit code.

## Practices included in the bundled export

- start with the entry's meaning, then select distinctive entities;
- for Russian, account for grammatical cases, number, and `ё`;
- use secondary logic for genuine disambiguation;
- test regexes on real sentences;
- do not rely on `\b` for Cyrillic text.

ACE refinement: an online compiler or model-generated regex can help during
drafting, but neither is evidence. The final pattern must pass a local Node test
with positive, negative, and near-miss cases.
