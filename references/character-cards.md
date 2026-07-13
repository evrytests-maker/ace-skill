# Character cards: ACE practical guide

## When to load this file

Load this reference in full for the `character-create`, `character-repair`, and
character portion of `combined-repair` workflows.

Do not load it for pure World Info, lorebook-key, regex, or `selectiveLogic`
work. Use the lorebook references for those tasks. This separation prevents
rules for another artifact from leaking into the card.

The primary practical source for this file is
[StatuoTW's Guide to Making Bots](https://rentry.org/statuobotmakie), checked on
2026-07-12 (page revision shown as 2026-05-22). It is an authorial bot-writing guide, not a SillyTavern
specification. The current ACE validator, checked against SillyTavern source,
determines structural JSON validity.

## Establish the contract first

Before writing, determine and record:

- who or what `{{char}}` is: one character, several NPCs, or a narrator;
- the role of `{{user}}`, if specified, and how much freedom the player must
  retain;
- the premise, genre, point in time, and initial tension;
- required facts, prohibitions, and desired length;
- whether the user needs complete JSON, individual fields, or only an audit;
- which card version/wrapper an existing artifact uses.

Do not invent consequential biographical facts, relationships, sexual details,
or user constraints merely to fill a template. If the input is insufficient for
an irreversible creative choice, request the missing choice. An empty optional
field is better than an invented canonical detail.

## Card structure

Bracketed conventions such as `[Character(...)]`, PList blocks, XML-like
sections, and prose templates inside `description` remain ordinary prompt text.
They are not Character Card JSON schema and must not be validated as structural
fields unless the user explicitly chose that template.

ACE accepts three data families:

1. A legacy/V1-like object with fields such as `name`, `description`,
   `personality`, `scenario`, `first_mes`, and `mes_example`.
2. A V2 Character Card object with `spec`, `spec_version`, and nested `data`.
3. A V3 envelope with `spec: chara_card_v3`, `spec_version`, and object `data`.
   The pinned SillyTavern validator currently proves only this minimum envelope;
   known optional fields are type-checked when present, but ACE does not promote
   the V2 core into invented V3 requirements.

Do not declare a card fully V3-compliant merely because it has `spec_version`.
Run the CLI structural check. An unknown required field or version means
`BLOCKED` until the source is checked again. When repairing, preserve unknown
extension fields unless the user asks to remove them or they make the artifact
invalid.

Useful semantic fields:

- `description`: stable facts about the character and their behavior;
- `personality`: a compact reinforcement of key traits, not a second copy of
  the description;
- `scenario`: the current play frame; it may be empty when greetings must start
  mutually incompatible scenarios;
- `first_mes`: the opening playable scene and an example of expected length and
  tone;
- `alternate_greetings`: genuinely different entry points, not a rearrangement
  of a few words;
- `mes_example`: a demonstration of voice and behavior;
- `system_prompt` and `post_history_instructions`: do not fill these with generic
  jailbreak phrases; preserve user overrides during repair and change them only
  when explicitly requested;
- `character_book`: a separate embedded lorebook. Load the lorebook reference
  for its content and validate both parts independently.

## Write behavior, not a questionnaire of labels

The description must give the model causes and observable behavior:

- `motivation` explains why the character chooses actions;
- `personality` establishes a stable tendency but does not replace
  demonstration;
- `external presentation` shows what other people observe;
- `internal state` shows hidden fears, needs, or contradictions;
- `speaking style` establishes the general speech register;
- `quirks` add occasional concrete manifestations without turning every line
  into the same gimmick.

A strong formulation connects these elements:

> `{{char}}` jokes during danger to conceal a fear of becoming a burden; when
> the joke fails, he starts checking exits and speaks in shorter sentences.

A weak formulation merely lists: `sarcastic, anxious, intelligent`.

Use `{{char}}` and `{{user}}` where the system must substitute a name or role.
This is a useful portable default, but do not replace exact names in quotations
or canonical documents without a reason.

## Tokens: a budget, not a quality score

StatuoTW recommends roughly 400–700 permanent tokens for beginners and suggests
reviewing cards above 1,000. ACE treats this as `JUDGMENT`, not a universal
MUST:

- first preserve everything required for behavior;
- remove repetition, decorative biography with no behavioral consequence, and
  generic instructions already supplied by the system prompt;
- move extensive world facts into a lorebook only when they should be invoked
  conditionally;
- label a token result `exact` only when a real tokenizer was used; otherwise
  it is an `estimate`;
- do not shorten below the point where motivation, voice, or user constraints
  are lost.

`400–700`, `no more than 200 backstory tokens`, exact numbers of traits or
quirks, and a particular bracket template are StatuoTW authorial defaults. They
are not part of the SillyTavern format and must not cause an automatic FAIL.

### Total-card token advisory

`ACE-CARD-TOTAL-TOKENS-ADVISORY` defines 700–1500 tokens as the preferred total
tokenizable size of a complete character-card artifact. This project advisory
is separate from StatuoTW's 400–700 permanent-token beginner recommendation.
Run `node scripts/ace.mjs tokens <card.json>` to evaluate it.

The total uses the existing token service and therefore covers every collected
card field, alternate greeting, and embedded character-book field. A result of
699 or 1501 produces `CARD_TOTAL_TOKEN_ADVISORY` as `WARN`; 700 and 1500 are
inside the inclusive range. This advisory never changes a structurally valid
card to `FAIL`. Evidence records the actual count, inclusive minimum and
maximum, model profile, and whether the method was `exact`, `estimate`, or
`mixed`. Do not present an estimate as an exact measurement.

## Greeting: the scene must hand the turn to the user

A good first message:

1. immediately establishes place, moment, and the active state of `{{char}}`;
2. demonstrates action, perception, and at least some character speech;
3. creates a clear reason to respond;
4. leaves open who `{{user}}` is and what they decide unless the user specified
   those facts in advance;
5. ends with a stimulus, question, threat, or unresolved situation rather than
   a decision completed on the user's behalf.

It is acceptable to describe an observable fact: `{{char}} hears footsteps at
the door`. Without an explicit contract, it is not acceptable to decide the
user's inner state or choice: `{{user}} becomes frightened, enters, and agrees
to help`.

The first message gives the model an example of length and rhythm. A very short
greeting therefore often leads to short replies, while an overloaded greeting
can lead to verbosity. This is an observed heuristic, not guaranteed mechanics.

State characterization directly. ACE-authored prose must not define a person by
first denying one label and then replacing it with another. This includes
mirrored “X is not A; X is B” phrasing and “not A but/rather B” variants. Rewrite
the intended trait, action, or motive as a positive statement and run
`node scripts/ace.mjs validate style <artifact>`.

An alternate greeting is justified when it changes the point in time,
relationship, location, role, or conflict. Check every greeting independently
for user agency and consistency with the shared `scenario`.

For every greeting in scope, record its field path or array index. Confirm that
it establishes a place or immediate situation, demonstrates character action
or speech, supplies a playable prompt, and leaves the user's response open.
These are semantic checks: obvious user-control wording may be found
statically, but absence of a phrase is not sufficient evidence of PASS.

## Example dialogue: demonstrate distinct voice modes

Examples should demonstrate what labels cannot express reliably:

- ordinary conversation;
- stress or conflict;
- intimacy, humor, or a professional mode only when the card needs it;
- characteristic sentence length, vocabulary, and speech/action balance.

Do not require exactly three `<START>` markers or any other universal count. Add
as many examples as needed to cover distinct modes, then stop. Every example
must agree with the motivation and must not control `{{user}}`. Format it for
the target field; do not insert Markdown instructions into the character's
speech.

Record which field passage demonstrates each claimed voice or behavior mode.
Treat a fixed example count, a trailing blank `<START>`, gender-neutral pronoun
defaults, and any particular interview/template format as authorial advice,
not automatic validity rules.

## Testing and runtime evidence

Structural validation, token counting, and manual review are complementary.
Before release, validate the final artifact and manually test representative
turns for motivation, stable behavior, voice, user agency, and greeting handoff.
StatuoTW's suggested 10–25 chat messages is an authorial testing heuristic, not
an objective threshold. Record the runtime, model/preset context, tested
greeting, observed turns, and any repair/retest. If no compatible runtime is
available, the runtime result is `BLOCKED`; static or manual evidence must not
be relabeled as a runtime PASS.

## Repairing an existing card

1. Preserve the original meaning in diff/evidence without creating a second
   checkout.
2. Identify the version and container form before changing fields.
3. Separate structural errors from creative observations.
4. Preserve existing `{{char}}` and `{{user}}` macros unless the requested repair
   intentionally changes who a passage addresses; accidental literal-name
   substitution is a regression.
5. Do not "normalize" the author's voice into the StatuoTW template.
6. Repair only proven structural defects and agreed semantic problems.
7. Reopen the final artifact, then check JSON, tokens, and manual gates again.

When `description`, greeting, and examples conflict, do not silently choose one
version as canon. Apply the user's stated priority or record the conflict as
`BLOCKED`.

## Manual gates and evidence

### Characterization

PASS when the final fields show motivation through behavior and do not reduce
the character to contradictory labels. Evidence must identify specific fields
and briefly summarize observable passages; a self-assessment such as "the
character is good" is not evidence. Review motivation, outward behavior, and
their consistency across description, personality, scenario, greetings, and
examples wherever those fields are present.

### Greeting

PASS when there is a playable entry point and no imposed choice, thought, or
emotion for `{{user}}`. Review the final greeting text, not its plan.
Identify every reviewed greeting by field path or array index.

### Voice

PASS when the examples genuinely differ across the required modes while
remaining the voice of one character. An exact count is not a criterion.
Evidence maps each claimed mode to a final field excerpt.

## What to adopt and what not to turn into a rule

Adopt these strong StatuoTW practices:

- behavior-first characterization;
- abstract motivations instead of an intrusive list of goals;
- an open entry point that preserves user agency;
- greetings and examples as real samples of the intended output;
- removal of repetition and mandatory testing in chat.

Keep these only as defaults or `JUDGMENT`:

- the 400–700 permanent-token range;
- a particular bracket/list template;
- fixed numbers of traits, quirks, or examples;
- the claim that a well-known character always needs less data;
- advice tied to jailbreaks, particular models, or platform ratings.

Do not use StatuoTW's lorebook section as a technical source. For World Info,
ACE uses its bundled lorebook rule export and pinned SillyTavern source.
