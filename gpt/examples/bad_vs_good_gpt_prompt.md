# Bad vs Good GPT Prompt

## Bad

```text
Make the bot better and more immersive. Do not mess it up. Use good writing.
```

Why it fails for GPT:
- “better” is undefined;
- no output format;
- no decision tree;
- no validation rule;
- no examples.

## Good

```text
# Task
Improve this SillyTavern character card for ChatGPT.

# Required edits
1. Convert description into sections: Character, Appearance, Mind, Personality, Likes, Dislikes, Relationships, Scenario.
2. Keep Mind internal and Personality behavioral.
3. Rewrite first_mes as a playable scene of at least 250 words.
4. Do not write {{user}}'s actions, dialogue, thoughts, or emotions.
5. Keep valid JSON.

# Output
Return only the updated JSON.

# Self-check
Before answering, verify JSON validity, greeting word count, and exactly 3 <START> blocks.
```
