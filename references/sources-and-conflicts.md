# Sources, authority, and conflict decisions

## When to load this file

Load this reference in full for `skill-maintenance` and for any task where:

- a user or community guide asserts technical SillyTavern behavior;
- source claims conflict;
- schema fields, activation order, vector behavior, or validators change;
- the pinned source is stale or does not cover a required claim.

Do not load it for ordinary character prose. A domain reference is enough for a
standard lorebook task; return here only for a dispute or source drift.

## Source hierarchy

Apply these levels from highest to lowest authority:

1. **Current pinned SillyTavern source**: technical mechanics and field behavior.
2. **Current official SillyTavern documentation/specification/tests**: public
   contract and expected user-facing meaning.
3. **The bundled ACE lorebook rule export**: the self-contained practical
   reference for clear mental models, real scenarios, and verification workflow.
4. **StatuoTW**: ACE's primary practical reference for character-card writing
   only.
5. **Other community material**: ideas and heuristics, not technical MUST rules.
6. **Model assumption**: never evidence.

The bundled export contains all accepted practical rules needed by ACE. It is
kept separate from official technical truth because its source material was
authorial experience from an older version. Use the export for workflow and
clarity; obtain exact numeric mappings and runtime branches from code.

## Pinned source set

Checked on 2026-07-11:

| ID | Source | Role |
|---|---|---|
| `SRC-ST-WORLD-INFO` | [SillyTavern `world-info.js` at `8172dcd0…`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/world-info.js) | activation, secondary logic, scan buffer, groups, timed effects, positions |
| `SRC-ST-MACROS` | [SillyTavern `macros.js` at `8172dcd0…`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/macros.js) | macro identifier matching and Outlet-name lookup |
| `SRC-ST-VECTORS` | [SillyTavern vectors extension at `8172dcd0…`](https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions/vectors/index.js) | vector synchronization, query, and force activation |
| `SRC-ST-DOCS` | [Official World Info documentation](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) | public terminology and UI behavior |
| `SRC-ST-REGEX-DOCS` | [Official Regex documentation](https://docs.sillytavern.app/extensions/regex/) | SillyTavern regex context |
| `SRC-JS-REGEX` | [MDN JavaScript regular expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions) | JavaScript regex syntax |
| `SRC-ST-CARD-VALIDATOR` | [SillyTavern card validator tests in the pinned tree](https://github.com/SillyTavern/SillyTavern/tree/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/tests) | actual accepted card structures; do not claim full V3 coverage without current tests/specification |
| `SRC-ACE-LORE-EXPORT` | `references/lorebooks.md` | self-contained English practical lorebook rules; no external archive required |
| `SRC-ACE-KEY-EXPORT` | `references/keys-and-regex.md` | self-contained key/regex rules and exact RU test literals; no external archive required |
| `SRC-STATUO-GUIDE` | [StatuoTW's Guide to Making Bots](https://rentry.co/statuobotmakie) | character-writing practices only; checked on 2026-07-12; page revision 2026-05-22 |

Never present stars, dates, model limits, or the current release as fresh without
a new check. A pinned commit makes rules reproducible, not automatically current
forever.

## Confirmed technical claims

### Secondary logic

`world_info_logic` in the pinned source:

```text
0 AND_ANY
1 NOT_ALL
2 NOT_ANY
3 AND_ALL
```

`AND_ANY` and `NOT_ALL` can resolve during iteration over secondary keys;
`NOT_ANY` and `AND_ALL` resolve after the complete iteration. ACE must reject an
unknown value even if the UI/source occasionally substitutes default `0`.

### Scan buffer

Scan depth applies to an array of individual messages. Entry-level `scanDepth`
can override global depth. Persona, description, personality, scenario, and
other global scan sources are added separately. Recursion content has a separate
buffer and is not part of the minimum-activations scan branch.

### Constant and disabled states

Source first excludes disabled, filtered, and timed cases; constant then
bypasses keyword matching. Therefore, "constant is always active" is a useful
approximation but not the complete technical contract.

### Groups

Candidates are grouped first; sticky/cooldown/delay, scoring, override, and
weight affect the winner. A multi-group entry is processed through a shared
candidate array, so the result of one group can affect another. Test exact
overlapping-group behavior on the specific artifact.

### Timed effects

Sticky, cooldown, and delay count messages. Active sticky bypasses a repeated
probability roll. When an entry has sticky and cooldown, cooldown begins after
sticky ends. Runtime metadata and chat-history edits can affect the observed
sequence.

### Outlet macros

The pinned macro implementation matches the literal `outlet` identifier with a
case-insensitive regular expression, trims the captured name, and passes that
name to the World Info Outlet lookup without case folding. The World Info source
skips activated Outlet entries without a name, groups exact-name matches in the
already sorted activation sequence, joins them with newlines, performs no
automatic insertion, and returns an empty string when no exact name exists.

### Character/global strategy default

The official World Info documentation labels **Sorted Evenly** as the default.
The pinned source initializes `world_info_character_strategy` to
`character_first`. Because source code has higher authority for executable
semantics, ACE uses **Character Lore First** as the initial default and records
the documentation text as a conflict rather than silently blending the claims.
An explicit stored/user selection still controls the active strategy.

### Vectors

The current vector extension:

- groups entries by world;
- hashes and indexes the entire `entry.content` as one text item;
- returns hashes from a query;
- force-activates the original World Info entry whose hash was found.

There is no code step that combines two short entry contents into a new
"Frankenstein entry," and no step that truncates final `content` to embedding
context before World Info insertion.

## Source conflict matrix

| Claim | Practical source | Technical evidence | ACE decision |
|---|---|---|---|
| Lorebook = World Info; entries are conditional prompt fragments | Bundled export | Official documentation/source | **Accept.** This is the basic mental model. |
| Character/chat/persona/global attachments usefully separate scope | Bundled export | UI/version-sensitive | **Accept as workflow.** Inspect current UI/export; do not make it a schema MUST. |
| The raw prompt is the best way to observe actual insertion | Bundled export | Runtime observation | **Accept as a mandatory runtime check** when placement, order, or advanced mechanics matter. |
| An entry is always stronger when placed closer to the end of the prompt | Bundled export and StatuoTW | Not a SillyTavern invariant; depends on model/preset | **Reject as a technical rule.** Position chooses location; evaluate influence for the task. |
| Higher `order` universally means greater influence | Community explanation | Source sorts descending, but buckets are assembled differently | **Qualify.** Record sorting and inspect the raw prompt; do not promise influence. |
| The default character/global source strategy is Sorted Evenly | Official World Info documentation | Pinned `world-info.js` initializes `character_first` | **Resolve in favor of code.** ACE defaults to Character Lore First; explicit stored/user selection overrides the initial value. |
| A constant entry is always inserted | Bundled export | Source bypasses keys, but filters, disabled/timed state, groups, and budget remain | **Qualify.** "Always" applies only to the keyword requirement. |
| Scan depth counts messages backward from the end | Bundled export | Source buffer slices the message array | **Accept.** Do not count a user/assistant pair as one unit or encode a doubtful zero-index scheme. |
| Russian secondary labels unambiguously describe the logic | Bundled export/UI | Numeric source map above | **Reject as evidence.** Always record number + stable English name + truth cases. |
| Group scoring awards points for positive-key matches | Bundled export | `getScore` source | **Accept with limits.** Negative logic adds no score; the winner pipeline contains other filters. |
| A complex multi-group scheme always propagates winners/losers identically | Bundled export | Current candidate mutation and version-sensitive branches | **Do not generalize.** A runtime test of the exact JSON is mandatory. |
| Sticky/cooldown/delay count messages | Bundled export | Official documentation/source | **Accept.** State the sticky → cooldown transition and metadata caveats. |
| Very short vector entries are merged into a Frankenstein entry | Bundled export | Current vector source indexes entries separately | **Reject.** Source does not do this. Semantic retrieval can return several entries, but they remain separate. |
| Embedding context / `Max Entries` sets the maximum token length of an entry | Bundled export | `max_entries` limits query results and does not divide provider input context | **Reject.** Check provider limits separately. |
| An overlong vector entry is inserted into the prompt in truncated form | Bundled export | Source force-activates original entry content | **Reject as a SillyTavern invariant.** A provider may reject or truncate embedding input, but this code does not truncate insertion content. |
| 50–100 tokens is the correct length for every entry | Community guides | No schema limit | **JUDGMENT.** A useful concision heuristic, not a FAIL threshold. |
| `comment` affects the prompt | Possible user assumption | Source uses it as memo/UI text | **Reject.** Inspect `content` and `key`. |
| 400–700 permanent tokens is a character-card format requirement | StatuoTW | Community recommendation | **JUDGMENT.** An optimization default, not SillyTavern schema. |
| Motivation is better than a rigid list of goals | StatuoTW, updated 2026-05-22 | Authorial practical testing | **Accept as writing practice.** The manual gate evaluates behavior, not the presence of a particular label. |
| A greeting must not decide the user's actions or emotions | StatuoTW | Cross-model prompting practice | **Accept as a manual quality gate** unless the user explicitly specified the action. |
| The particular StatuoTW list/bracket template is mandatory | StatuoTW | No SillyTavern schema requirement | **Reject as MUST.** It may be used as a draft while preserving the user's voice. |

## Resolving a new conflict

1. Restate the claim faithfully in your own words; do not replace it with a more
   convenient claim.
2. Record the version/date of every source.
3. Find the smallest current source branch or official contract that resolves
   the issue.
4. If source remains ambiguous, create a minimal runtime fixture and inspect the
   raw prompt/JSON.
5. Classify the decision as `accepted`, `accepted-with-conditions`, `judgment`,
   `rejected`, or `blocked`.
6. Link the decision to a rule ID, validator/test, and corrective action.
7. Update this matrix and `rules/sources.json` in one change set.

Do not resolve a conflict by voting among sources or by preferring whichever
community text is easier to understand. Clarity governs explanation; current,
reproducible evidence governs the technical result.

## Source refresh protocol

During `skill-maintenance`:

1. Check the upstream commit/release and official documentation.
2. Obtain new versions only in a temporary directory; do not create a second
   checkout of the target repository.
3. Compare the exact source symbols on which rules depend.
4. Run source and traceability tests before changing explanations.
5. Update the pinned commit, `checkedAt`, `reviewDue`, claims, and conflict
   decisions.
6. Run unit, sabotage, and behavioral evaluations.

If the network is unavailable and the review due date has passed, local checks
may still produce useful results, but technical freshness receives `BLOCKED`.
