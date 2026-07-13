# Official SillyTavern World Info reference

Captured for this implementation from official SillyTavern source pinned at `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8` and official documentation; rechecked on 2026-07-13.

## Authority order

1. `https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/world-info.js`
2. `https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/macros.js`
3. `https://github.com/SillyTavern/SillyTavern/blob/8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8/public/scripts/extensions/vectors/index.js`
4. `https://docs.sillytavern.app/usage/core-concepts/worldinfo/`

When prose and pinned code disagree, this simulator follows pinned code and records the discrepancy in tests and `rules/sources.json`.

## Release-code defaults

- Scan depth: 2
- Minimum activations: 0
- Maximum minimum-activation depth: 0
- Include names: true
- Recursive scanning: false
- Case-sensitive keys: false
- Match whole words: false
- Group scoring: false
- Character/global insertion strategy: Character Lore First
- Documentation conflict: docs label Sorted Evenly as default; pinned code initializes Character Lore First, which takes priority
- Max recursion steps: 0
- Entry order: 100
- At-depth default depth: 4
- Group weight: 100
- Entry scan-source toggles: false

## Selective key score

- Primary matches add one point each.
- AND ANY adds matched secondary keys.
- AND ALL adds secondary keys only when all secondary keys matched.
- NOT ANY and NOT ALL never add secondary points.

## Inclusion groups

- Process comma-separated group names.
- Sticky members suppress non-sticky members in the same group.
- Group scoring removes only scoring-enabled members below the maximum score; members with scoring disabled remain.
- `groupOverride` / Prioritize Inclusion chooses the active override with highest Order.
- Otherwise choose by Group Weight, whose default is 100.
- A group already activated during an earlier recursion pass rejects later members.

## Outlets

- Outlet entries are not inserted automatically.
- Entries require a non-empty `outletName`.
- Same-name entries are sorted by descending `Order` and joined with newlines.
- The `outlet` macro identifier is case-insensitive.
- Outlet names are case-sensitive; unmatched names become an empty string.
- Leading/trailing whitespace in a macro name is ignored.
- Outlet macros are unsupported inside World Info entries, character-card fields, and Author's Note.
- Nested outlets are unsupported.

## Timed effects

- Effect lengths are message counts.
- Sticky and cooldown metadata stores entry hash, start index and end index.
- Effects are removed when the chat does not advance unless protected by sticky-to-cooldown transition.
- Entry edits invalidate effects because the hash changes.
- Re-triggering does not refresh an active effect.
- Delay requires at least N chat messages.
- Cooldown begins after sticky ends.

## Vectors

Vector matching requires all of:

1. Vector Storage enabled and a provider configured.
2. World Info vector matching enabled.
3. The entry is vectorized, or `enabled_for_all` is true.

Query messages are independent from World Info scan depth. Vector matching replaces only the keyword gate; all downstream filters still apply.

## Automation

Automation IDs are emitted in actual activation/sort order and deduplicated. A matching Quick Reply command executes once even when several entries share the same ID. Local simulation queues the event; only a genuine SillyTavern adapter may claim runtime execution.
