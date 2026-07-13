# Lorebooks / World Info: ACE practical guide

## When to load this file

Load this reference in full for `lorebook-create`, `lorebook-audit`,
`secondary-logic-test`, a lorebook `token-budget`, and the lorebook portion of
`combined-repair`.

Also load `references/keys-and-regex.md` when designing complex plain or regex
keys. Do not load the character-card reference for a pure lorebook task.

This file is the self-contained English practical rule export. It includes the
accepted mental models, workflows, cautions, and corrections needed at runtime;
the original user-supplied archive or extraction is not required. Technical
claims remain checked against the pinned SillyTavern source at
`8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`.

## A mental model for ordinary users

Lorebook and World Info mean the same thing here: a set of entries that
SillyTavern can add to a prompt. Each entry has two separate concerns:

- **activation**: when the entry becomes a candidate;
- **insertion**: where and in what order its `content` enters the prompt.

First ask, "Under which observable condition is this information needed?" Then
ask, "Where should it appear in the assembled prompt?" Do not try to repair an
activation error by changing position, or an insertion error by changing keys.

This practical classification is useful but is not a schema:

- world lore: world rules, locations, and factions;
- character lore: extended character facts;
- chat lore: events specific to one branch;
- NPC, chronology, conditional-instruction, and event systems: specialized
  variants.

Attach the book to the appropriate scope: character, chat/group, persona, or
global world. UI behavior and exports change between versions, so do not promise
that a particular button always exports an attachment. Inspect the current UI
and the resulting JSON.

Only sources attached to the active context participate in evaluation. A
chat-bound book applies to that conversation; persona lore follows the selected
persona; character lore follows that character; global lore applies across
chats. Current documented collection order is Chat Lore, Persona Lore, then the
Character/Global pool. The pool has three strategies:

- **Sorted Evenly** sorts all character and global entries together by insertion
  order;
- **Character Lore First** processes character entries by insertion order, then
  global entries;
- **Global Lore First** reverses those two source groups.

The official documentation labels **Sorted Evenly** as the default, while the
pinned `world-info.js` initializes `world_info_character_strategy` to
`character_first`. ACE follows the pinned code: **Character Lore First** is the
initial default for this implementation, while an explicitly stored or selected
strategy still overrides that initial value. This documentation/source conflict
is tracked as `CONFLICT-WI-STRATEGY-DEFAULT`.

One primary character lorebook is embedded when the character is exported.
Additional character links, chat lore, and persona lore remain external to that
card. Reopen the exported JSON before claiming that a binding travelled with an
artifact.

## Container and native fields

A native World Info export normally uses an `entries` object keyed by UID:

```json
{
  "entries": {
    "0": {
      "uid": 0,
      "key": ["Никс", "кот Серафины"],
      "keysecondary": ["гром", "взрыв"],
      "comment": "Nix is afraid of loud noises",
      "content": "Nix is startled by abrupt loud noises and seeks Seraphina.",
      "constant": false,
      "vectorized": false,
      "selective": true,
      "selectiveLogic": 0,
      "order": 100,
      "position": 0,
      "disable": false
    }
  }
}
```

An embedded Character Book may represent entries as an array and use fields
from the card standard. The validator must identify the container before
normalization. Do not replace native `key`, `keysecondary`, `order`, or numeric
`position` with internal ACE aliases in the final export.

`comment`/Title/Memo helps a person find an entry. Current source does not add it
to the World Info prompt. It is not a keyword and does not replace `content`.

## Minimum entry

An ordinary keyword entry needs:

- non-empty, self-contained `content`;
- at least one tested primary key in `key`;
- a normal/enabled state;
- appropriate default position, order, and activation settings.

Add advanced fields only for a stated reason. More switches do not mean better
quality.

Choose the narrowest binding scope that still satisfies the task. Information
needed only for one chat or character should not become global World Info, and a
global setting should not be duplicated into chat-local memory without a reason.

### Content

Give each entry one semantic responsibility. When activated, its text must make
sense without the entry title or an adjacent entry. Keep only information that
can change the response: a fact, rule, relationship, behavior, or event.

The 50–100-token recommendation from community guides is useful as a signal to
trim encyclopedic prose, but it is not a limit. Length depends on the task, the
overall World Info budget, and model quality. Do not copy an entire article; do
not split one coherent fact into meaningless fragments merely to hit a number.

Write entry facts directly. ACE-authored content must not use mirrored
replacement-by-negation phrasing such as “X is not A; X is B” or “not A
but/rather B.” Rewrite the replacement as a plain positive fact and run
`node scripts/ace.mjs validate style <artifact>`.

## Activation modes

### Normal

An entry activates on a primary-key match and, when `keysecondary` is non-empty,
the selected secondary logic. This is the controllable default for most facts.

### Constant

`constant: true` bypasses keyword matching. It does not bypass `disable`, some
filters or timed effects, the group/budget/placement pipeline, and it does not
gain a mystical priority over every other entry. Use it for a short rule that is
genuinely required on every turn. Many long constants consume context
continuously.

### Vectorized

Vector Storage compares a chat-text query against the embedding of each entry's
content. In current source, one entry's content is synchronized as one vector
item `{hash, text, index}`; a retrieved result force-activates the original
entry.

- keyword activation remains possible when `key` is non-empty;
- `Enable for World Info` is required for World Info retrieval;
- `Enabled for all entries` widens vector eligibility beyond entries marked
  Vectorized and should be enabled only with an explicit reason;
- the selected provider/model, `Query messages`, `Max Entries`, and score
  threshold affect retrieval;
- `Query messages` supplies the vector query and replaces `Scan Depth` only for
  vector lookup; plain keyword lookup keeps its own scan depth;
- vector retrieval still passes through probability, character filters,
  inclusion groups, entry state, budget, and the other insertion checks;
- `Max Entries` limits retrieved vector candidates while the ordinary World
  Info token budget still controls what can be inserted;
- semantic retrieval is less predictable than keys, so test positive cases and
  confusing near-neighbors;
- current source does not support the claim that short entries are "merged into
  a Frankenstein entry";
- do not divide a provider's embedding input limit by `Max Entries` to invent a
  universal maximum entry length;
- embedding truncation or an embedding error does not mean SillyTavern
  intentionally inserts truncated `content` into the prompt.

When the provider limit is unknown, record it as an external risk and check the
provider instead of inventing a number.

## Scan settings and plaintext matching

`scan depth` is the number of individual chat messages in the scan buffer, not
the number of user/assistant pairs. During generation, the response that does
not yet exist is not a completed message; do not encode a community zero-index
explanation as schema.

- `Scan Depth = 0` disables ordinary chat-key scanning; recursed entries and
  Author's Note evaluation remain eligible;
- `Include Names` prefixes each scanned message with its participant name;
  disabling it removes those prefixes;
- current per-message scan text begins with the separator character `\x01`
  before `name:`. An advanced regex such as
  `/\x01{{user}}:[^\x01]*?hello/` can therefore target one participant's
  message. Treat this as a version-sensitive raw-buffer contract and test it in
  the target SillyTavern build;
- nonzero `Min Activations` scans backward beyond ordinary depth until the
  requested number of direct activations is found, bounded by `Max Depth` and
  the token budget;
- Min-Activation sweeps examine chat messages and extension prompts. Entries
  found on those sweeps may begin normal recursion, while entries found by an
  earlier recursion step do not satisfy a later Min-Activation sweep;
- `Min Activations` and `Max Recursion Steps` are mutually exclusive controls.

- case-sensitive matching compares the case of plain keys;
- match-whole-words requires boundaries around a plain key;
- whole-word matching can harm languages that do not separate words with
  whitespace; disable or replace it with a tested regex for such languages;
- a regex key fully controls its own matching and overrides these plain-text
  options;
- an entry-level setting can override the global default;
- extra scan sources can include persona, character description, personality,
  character depth prompt, scenario, and creator notes.

Do not enable extra sources "just in case": every source widens the
false-positive surface.

## Secondary keys: exact truth table

ACE-authored output with non-empty `keysecondary` must set `selective: true`.
At least one primary key must match first. Then apply this table:

| `selectiveLogic` | Stable name | Entry passes when... |
|---:|---|---|
| `0` | `AND_ANY` | at least one secondary key matches |
| `1` | `NOT_ALL` | the secondary keys do not all match simultaneously |
| `2` | `NOT_ANY` | no secondary key matches |
| `3` | `AND_ALL` | every secondary key matches |

Russian UI labels have changed over time and can read counterintuitively. In
evidence, always show the numeric value, stable English name, and positive and
negative cases. Any other value is FAIL, not a fallback to `0`.

For the localized labels documented by the Russian guide, preserve the verified
numeric semantics rather than translating the words literally: `НЕ ВСЕ` maps to
`NOT_ANY` (`2`), while `НЕ ЛЮБОЙ` maps to `NOT_ALL` (`1`). These labels are UI
literals; the numeric truth table above is authoritative.

## Insertion: position and order

`position` selects a channel or location: before/after character data, at depth,
near Author's Note, outlet, or another supported target. Check exact numeric
positions against the validator/source for the current version.

For the pinned SillyTavern source used by this skill, the native numeric map is:

| Value | Native anchor |
|---:|---|
| `0` | before character data |
| `1` | after character data |
| `2` | top of Author's Note |
| `3` | bottom of Author's Note |
| `4` | at chat depth |
| `5` | top of example messages (`EMTop`) |
| `6` | bottom of example messages (`EMBottom`) |
| `7` | outlet |

The deterministic prompt model resolves these anchors against real character,
example, Author's Note, history, and outlet segments. String aliases such as
`before_example` and `after_example` normalize to the example-message anchors;
they do not change the native numeric export.

`order` participates in entry sorting (`b.order - a.order` in pinned source),
but final adjacency depends on position, how the particular bucket is assembled,
the preset, and other entries. Do not promise a universal "higher order means
stronger" rule. Inspect the actual raw prompt.

Do not assume that every position nearer the end is "guaranteed to have more
influence": recency and primacy depend on the model and preset. Select position
for its intended function, not by a magical strength scale.

Top-of-Author's-Note and Bottom-of-Author's-Note positions are ignored when
Author's Note is disabled by an insertion frequency of `0`.

### Outlet insertion

Outlet stores activated content under a name for deliberate macro placement.
Its complete contract is:

- `Outlet Name` is required, non-empty, case-sensitive, and free of leading or
  trailing padding;
- the macro identifier `outlet` is case-insensitive, so `{{outlet::Memory}}`,
  `{{Outlet::Memory}}`, and `{{OUTLET::Memory}}` are equivalent;
- the captured Outlet name is trimmed and then looked up case-sensitively, so
  `{{outlet::memory}}` does not consume an Outlet named `Memory`;
- all activated entries sharing the exact name are sorted by descending `Order`
  and combined with newline separators;
- Outlet entries are never inserted automatically: content appears only through
  a supported consumer macro;
- the macro belongs in a macro-aware Prompt Manager or Advanced Formatting
  field;
- expansion inside another World Info entry, another outlet, character-card
  fields, or the Author's Note editor is unsupported;
- an absent Outlet name skips the entry, while a missing or case-mismatched
  consumer expands to an empty string.

Do not invent a no-internal-spaces rule for names. After configuration, inspect
the raw prompt to prove the content appeared once, at the intended location,
and in the intended order.

## Probability, budget, and filters

- `useProbability`/`probability` performs a probability roll after candidate and
  group processing; 100% needs no random roll.
- probability `0` prevents insertion and behaves as a practical disable for
  that activation path;
- Mandatory safety, continuity, and world-law content must not sit behind a
  chance below 100%. Use deterministic activation for required content and
  lower probability only for genuinely optional variation.
- The World Info budget is calculated from context percentage and may also have
  a token cap. Use `ignoreBudget` only for an explicitly critical entry.
- budget selection processes constants first, then higher-order entries; direct
  chat-key candidates have priority over candidates found through recursion.
- character/tag filters, exclusion mode, and generation triggers constrain
  applicability before insertion.
- `disable: true` always excludes the entry.

One run proves nothing about probabilistic logic. Test deterministic boundaries
and statistical behavior separately; do not call a single favorable roll PASS
evidence of a percentage.

## Recursion

With recursive scanning enabled, the `content` of newly activated entries is
added to the recursion buffer and can activate other entries. This can build
chains or trees, but can also activate an unexpectedly large part of a book.

Control fields:

- `excludeRecursion`: the entry cannot be obtained during a recursion step, but
  ordinary scanning remains possible;
- `preventRecursion`: the entry may activate, but its content does not continue
  the chain;
- `delayUntilRecursion`: the entry waits for recursion and, when numeric, for
  the required recursion level;
- global maximum recursion steps limits cycles; `0` means no limit from this
  setting specifically, but the budget still applies;
- maximum recursion steps `1` effectively disables recursive expansion, while
  `2` permits one recursive sweep;
- minimum activations and maximum recursion steps are mutually exclusive.

Before enabling recursion, draw the expected graph `entry → keys found in
content` and verify that generic keys do not create cycles. Test each head, tail,
and undesired neighboring entry.

## Inclusion groups

A group selects one option from the group's activated candidates:

- ordinary selection uses relative `groupWeight`;
- `groupOverride` gives priority to a matching override entry; when several
  match, current sorting considers `order`;
- group scoring retains entries with the highest key-match score among entries
  to which scoring applies;
- an active sticky entry can displace non-sticky members;
- an entry can list multiple groups, so overlaps require a runtime test.

Do not restate a complicated multi-group scheme from a community guide as a
guaranteed algorithm. The current implementation splits the group string,
removes losers from the shared candidate array, and contains version-sensitive
details. For overlapping groups, only a test of that exact JSON is sufficient
evidence.

Group scoring uses an exact score contract before override/weight selection:

- every matched primary key contributes one point;
- `AND_ANY` contributes one point for every matched secondary key;
- `AND_ALL` contributes one point per secondary only when every secondary key
  matches;
- `NOT_ANY` and `NOT_ALL` contribute no secondary points.

Only the highest-scoring subset remains eligible. Ties then proceed through the
configured inclusion-priority and group-weight logic.

## Automation and generation filters

`Automation ID` connects an activated World Info entry to a Quick Reply STscript
using the same identifier. Automations follow activation and sorting order:
constants first, then other entries by order, followed by recursively activated
entries in the same ordering scheme. When several activated entries share an
Automation ID, the matching command runs once for that ID.

An empty generation-trigger list permits every generation type. A non-empty
list limits activation to the selected types: Normal, Continue, Impersonate,
Swipe, Regenerate, or Quiet/background generation. In group chats, Regenerate
deletes and queues the last replies through the Normal generation path, so the
solo-chat Regenerate filter does not apply. Prove any automation or trigger
filter with the target Quick Reply/runtime and a captured transcript.

## Timed effects

- `sticky: N` retains an already activated entry for N messages;
- `cooldown: N` suppresses reactivation for a period after the effect; when
  sticky is present, cooldown begins after sticky ends;
- `delay: N` prevents the entry until chat history reaches the required length.

Triggering an entry again while its timed effect is already active does not
refresh that effect's duration. The active effect must expire before a later
activation can start a fresh duration.

These values count messages. Swiping, editing, deleting, branching, and
persisted chat metadata can change observed results, so test the time sequence
in a real chat. Sticky does not necessarily roll probability again while active.

## Import, export, and prompt inspection

Import a lorebook as valid JSON in the native World Info object or embedded
Character Book shape. Changing a `.txt` filename to `.json` is safe only when
the file already contains valid JSON with compatible fields; an extension does
not convert arbitrary text into a lorebook. Run the ACE lorebook validator
before import and reopen the exported artifact afterwards.

World Info is prompt material, not passive database metadata. A preset decides
where each supported insertion position appears, so never infer effectiveness
from a field name or a successful schema check. For normal, constant, outlet,
group, recursion, vector, probability, or timed behavior, capture the target
SillyTavern raw prompt and verify the inserted text, location, order, and
absence/presence expected by the test.

## Mandatory result verification

For every entry, prepare at least:

1. positive activation text;
2. negative text without a primary key;
3. a near-miss that must not activate the entry;
4. secondary truth cases when `keysecondary` is present;
5. a recursion/group/time sequence when an advanced mechanism is used.

Run the structural validator, key/secondary tests, and token check. Then reopen
the artifact. For runtime-sensitive mechanisms, inspect the SillyTavern raw
prompt: only it shows what was actually inserted, where, and in which order.

Manual PASS requires both of these pieces of evidence:

- content is self-contained and performs one clear task;
- keys semantically match the content, and constant/vector/group/recursion
  settings have a stated purpose.

If runtime is unavailable, deterministic checks may pass, but a required runtime
check receives `BLOCKED`, not PASS.
