#!/usr/bin/env node
import { readJsonFile, readTextFile, isPlainObject } from './lib/files.mjs';
import { estimateTokensForModel, resolveTokenizerProfile, countWords } from './token_model_map.mjs';

function usage() {
  console.error(`Usage:
  node scripts/token_check.mjs <file.json|file.txt> [--model gpt-5|gpt-4o|claude|gemini|llama|generic] [--json]

Notes:
  - Uses optional gpt-tokenizer when installed for supported OpenAI encodings.
  - Falls back to a Unicode-aware estimator for all model families.`);
}

function parseArgs(argv) {
  if (argv.length < 1 || argv.includes('--help') || argv.includes('-h')) return null;
  const opts = { file: argv[0], model: 'gpt-4o', json: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--model') opts.model = argv[++i] ?? opts.model;
    else if (arg === '--json') opts.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

async function tryExactOpenAITokens(text, model) {
  const profile = resolveTokenizerProfile(model);
  if (profile.family !== 'openai') return null;
  try {
    const mod = await import('gpt-tokenizer/model/gpt-4o');
    if (typeof mod.encode === 'function') {
      return { tokens: mod.encode(String(text ?? '')).length, method: 'gpt-tokenizer/gpt-4o' };
    }
  } catch {
    return null;
  }
  return null;
}

function collectJsonFields(data) {
  const rows = [];
  const push = (field, value) => {
    if (typeof value === 'string' && value.trim()) rows.push({ field, text: value });
  };

  if (!isPlainObject(data)) {
    push('$', JSON.stringify(data));
    return rows;
  }

  push('name', data.name ?? data.data?.name);
  push('description', data.description ?? data.data?.description);
  push('personality', data.personality ?? data.data?.personality);
  push('scenario', data.scenario ?? data.data?.scenario);
  push('first_mes', data.first_mes ?? data.data?.first_mes);
  push('mes_example', data.mes_example ?? data.data?.mes_example);

  const greetings = data.alternate_greetings ?? data.data?.alternate_greetings;
  if (Array.isArray(greetings)) greetings.forEach((value, index) => push(`alternate_greetings[${index}]`, value));

  if (Array.isArray(data.entries)) {
    data.entries.forEach((entry, index) => {
      push(`entries[${entry.id ?? entry.uid ?? index}].comment`, entry.comment);
      push(`entries[${entry.id ?? entry.uid ?? index}].content`, entry.content);
      const keys = Array.isArray(entry.keys) ? entry.keys : Array.isArray(entry.key) ? entry.key : [];
      if (keys.length) push(`entries[${entry.id ?? entry.uid ?? index}].keys`, keys.join(', '));
    });
  }

  return rows.length ? rows : [{ field: '$', text: JSON.stringify(data, null, 2) }];
}

async function countText(text, model) {
  const exact = await tryExactOpenAITokens(text, model);
  if (exact) return { tokens: exact.tokens, words: countWords(text), chars: String(text ?? '').length, method: exact.method };
  return estimateTokensForModel(text, model);
}

function printTable(rows) {
  const widths = {
    field: Math.max(5, ...rows.map((r) => r.field.length)),
    tokens: Math.max(6, ...rows.map((r) => String(r.tokens).length)),
    words: Math.max(5, ...rows.map((r) => String(r.words).length)),
    chars: Math.max(5, ...rows.map((r) => String(r.chars).length)),
  };
  const line = `${'Field'.padEnd(widths.field)}  ${'Tokens'.padStart(widths.tokens)}  ${'Words'.padStart(widths.words)}  ${'Chars'.padStart(widths.chars)}  Method`;
  console.log(line);
  console.log('-'.repeat(line.length));
  for (const row of rows) {
    console.log(`${row.field.padEnd(widths.field)}  ${String(row.tokens).padStart(widths.tokens)}  ${String(row.words).padStart(widths.words)}  ${String(row.chars).padStart(widths.chars)}  ${row.method}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    usage();
    return 2;
  }
  const profile = resolveTokenizerProfile(opts.model);
  let fields;
  try {
    if (opts.file.toLocaleLowerCase('en-US').endsWith('.json')) {
      fields = collectJsonFields(readJsonFile(opts.file).data);
    } else {
      fields = [{ field: '$', text: readTextFile(opts.file).text }];
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }

  const rows = [];
  for (const row of fields) rows.push({ field: row.field, ...(await countText(row.text, opts.model)) });
  const total = rows.reduce((acc, row) => acc + row.tokens, 0);
  if (opts.json) {
    console.log(JSON.stringify({ model: opts.model, profile, total_tokens: total, rows }, null, 2));
  } else {
    console.log(`Tokenizer profile: ${profile.name} (${profile.tokenizer})`);
    printTable(rows);
    console.log('-'.repeat(42));
    console.log(`Total tokens: ${total}`);
  }
  return 0;
}

process.exit(await main());
