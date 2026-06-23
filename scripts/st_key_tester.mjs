#!/usr/bin/env node
import { matchSingleKey, validateRegexKey } from './lib/st-matching.mjs';

function usage() {
  console.error(`Usage:
  node scripts/st_key_tester.mjs <key> --text <text> [--case-sensitive] [--no-whole-words]
  node scripts/st_key_tester.mjs <key> <candidate1> <candidate2> ...

Examples:
  node scripts/st_key_tester.mjs '/(?:Годжо|Gojo)/u' --text 'Годжо вошёл в комнату'
  node scripts/st_key_tester.mjs 'king' 'long live the king' 'liking this' --no-whole-words`);
}

function parseArgs(argv) {
  if (argv.length < 1 || argv.includes('--help') || argv.includes('-h')) return null;
  const key = argv[0];
  let text = null;
  const candidates = [];
  const opts = { caseSensitive: false, wholeWords: true, macros: {} };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--text') {
      text = argv[++i] ?? '';
    } else if (arg === '--case-sensitive') {
      opts.caseSensitive = true;
    } else if (arg === '--no-whole-words') {
      opts.wholeWords = false;
    } else if (arg === '--char') {
      opts.macros.char = argv[++i] ?? '{{char}}';
    } else if (arg === '--user') {
      opts.macros.user = argv[++i] ?? '{{user}}';
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      candidates.push(arg);
    }
  }

  if (text !== null) candidates.unshift(text);
  return { key, candidates, opts };
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    usage();
    process.exit(2);
  }
  const { key, candidates, opts } = parsed;
  const validation = validateRegexKey(key, opts.macros);
  console.log(`INFO: key = ${key}`);
  console.log(`INFO: type = ${validation.isRegex ? 'javascript-regex' : 'plaintext'}`);
  console.log(`INFO: matcher = ${validation.message}`);
  if (!validation.ok) {
    console.error(`ERROR: ${validation.message}`);
    process.exit(1);
  }
  if (candidates.length === 0) {
    console.log('OK: key syntax is valid. No candidates were provided.');
    process.exit(0);
  }
  let hits = 0;
  for (const text of candidates) {
    const ok = matchSingleKey(key, text, opts);
    if (ok) hits += 1;
    console.log(`${ok ? 'OK' : 'NO'}: ${JSON.stringify(text)}`);
  }
  process.exit(hits > 0 ? 0 : 1);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(2);
}
