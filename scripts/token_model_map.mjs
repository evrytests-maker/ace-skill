export const TOKENIZER_MODEL_MAP = {
  'gpt-5': { family: 'openai', tokenizer: 'o200k_base', aliases: ['gpt-5', 'gpt-5.5', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-nano'] },
  'gpt-4o': { family: 'openai', tokenizer: 'o200k_base', aliases: ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'] },
  'gpt-3.5': { family: 'openai', tokenizer: 'cl100k_base', aliases: ['gpt-3.5', 'gpt-3.5-turbo', 'gpt-4'] },
  claude: { family: 'anthropic', tokenizer: 'claude-estimate', aliases: ['claude', 'claude-3', 'claude-3.5', 'claude-4'] },
  gemini: { family: 'google', tokenizer: 'gemini-estimate', aliases: ['gemini', 'gemini-pro', 'gemma'] },
  llama: { family: 'meta', tokenizer: 'llama-estimate', aliases: ['llama', 'llama3', 'llama-3', 'llama-4'] },
  mistral: { family: 'mistral', tokenizer: 'mistral-estimate', aliases: ['mistral', 'mixtral'] },
  generic: { family: 'generic', tokenizer: 'unicode-estimate', aliases: ['generic', 'auto'] },
};

export function resolveTokenizerProfile(model = 'generic') {
  const normalized = String(model || 'generic').toLocaleLowerCase('en-US');
  for (const [name, profile] of Object.entries(TOKENIZER_MODEL_MAP)) {
    if (profile.aliases.some((alias) => normalized.includes(alias))) return { name, ...profile };
  }
  return { name: 'generic', ...TOKENIZER_MODEL_MAP.generic };
}

export function countWords(text) {
  return (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export function estimateTokensForModel(text, model = 'generic') {
  const value = String(text ?? '');
  const profile = resolveTokenizerProfile(model);
  const cjk = (value.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/gu) ?? []).length;
  const cyrillic = (value.match(/[А-Яа-яЁё]/gu) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  const numbers = (value.match(/[0-9]/g) ?? []).length;
  const punctuation = (value.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  const whitespaceRuns = (value.match(/\s+/g) ?? []).length;

  let tokens;
  if (profile.family === 'openai') {
    tokens = Math.ceil(latin / 4.0 + cyrillic / 2.7 + cjk / 1.15 + numbers / 3.2 + punctuation / 2.2 + whitespaceRuns * 0.25);
  } else if (profile.family === 'anthropic') {
    tokens = Math.ceil(latin / 3.8 + cyrillic / 2.6 + cjk / 1.1 + numbers / 3.0 + punctuation / 2.0 + whitespaceRuns * 0.3);
  } else if (profile.family === 'google') {
    tokens = Math.ceil(latin / 4.1 + cyrillic / 2.9 + cjk / 1.2 + numbers / 3.4 + punctuation / 2.3 + whitespaceRuns * 0.25);
  } else {
    tokens = Math.ceil(latin / 4.0 + cyrillic / 2.7 + cjk / 1.15 + numbers / 3.2 + punctuation / 2.2 + whitespaceRuns * 0.25);
  }
  return { tokens: Math.max(0, tokens), words: countWords(value), chars: value.length, model: profile.name, tokenizer: profile.tokenizer, method: 'unicode-estimate' };
}
