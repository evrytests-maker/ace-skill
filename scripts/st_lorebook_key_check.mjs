#!/usr/bin/env node
import fs from 'node:fs';
import { readJsonFile } from './lib/files.mjs';
import { Report } from './lib/report.mjs';
import { matchSingleKey, validateRegexKey, normalizeChatScan } from './lib/st-matching.mjs';

function usage() {
  console.error(`Usage:
  node scripts/st_lorebook_key_check.mjs <lorebook.json> --text <scan text>
  node scripts/st_lorebook_key_check.mjs <lorebook.json> --chat <chat.json|txt>

Options:
  --case-sensitive     Treat plaintext keys as case-sensitive.
  --no-whole-words     Disable whole-word matching for plaintext single-word keys.
  --char <name>        Replace {{char}} in regex/plaintext keys.
  --user <name>        Replace {{user}} in regex/plaintext keys.`);
}

function getEntryId(entry, index) {
  return entry.id ?? entry.uid ?? index;
}

function getKeys(entry) {
  if (Array.isArray(entry.keys)) return entry.keys;
  if (Array.isArray(entry.key)) return entry.key;
  return [];
}

function getSecondaryKeys(entry) {
  if (Array.isArray(entry.secondary_keys)) return entry.secondary_keys;
  if (Array.isArray(entry.keysecondary)) return entry.keysecondary;
  return [];
}

function parseArgs(argv) {
  if (argv.length < 1 || argv.includes('--help') || argv.includes('-h')) return null;
  const opts = { caseSensitive: false, wholeWords: true, macros: {}, text: null };
  const lorebookPath = argv[0];
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--text') {
      opts.text = argv[++i] ?? '';
    } else if (arg === '--chat') {
      const chatPath = argv[++i];
      const raw = fs.readFileSync(chatPath, 'utf8');
      try {
        opts.text = normalizeChatScan(JSON.parse(raw));
      } catch {
        opts.text = raw;
      }
    } else if (arg === '--case-sensitive') {
      opts.caseSensitive = true;
    } else if (arg === '--no-whole-words') {
      opts.wholeWords = false;
    } else if (arg === '--char') {
      opts.macros.char = argv[++i] ?? '{{char}}';
    } else if (arg === '--user') {
      opts.macros.user = argv[++i] ?? '{{user}}';
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { lorebookPath, opts };
}

function evaluateSecondary(entry, text, opts, report, entryId) {
  const secondary = getSecondaryKeys(entry);
  if (!secondary.length) return true;
  const logic = entry.extensions?.selectiveLogic ?? entry.selectiveLogic ?? 0;
  const matches = secondary.map((key) => matchSingleKey(key, text, opts));
  if (logic === 0) return matches.some(Boolean); // AND ANY
  if (logic === 1) return matches.every(Boolean); // AND ALL
  if (logic === 2) return !matches.some(Boolean); // NOT ANY
  if (logic === 3) return !matches.every(Boolean); // NOT ALL
  report.warn(`Unknown selective logic '${logic}', treated as AND ANY`, { entryId, field: 'secondary_keys' });
  return matches.some(Boolean);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    usage();
    process.exit(2);
  }
  const { data, resolved, size } = readJsonFile(args.lorebookPath);
  const report = new Report('SillyTavern Lorebook Key Check');
  report.addInfo(`File: ${resolved}`);
  report.addInfo(`Size: ${size} bytes`);

  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (!Array.isArray(data.entries)) report.error("Missing or invalid top-level 'entries' array");
  const scanText = args.opts.text ?? '';
  if (!scanText) report.warn('No --text or --chat provided. Regex syntax will be checked, but activation cannot be tested.');

  let activated = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const entryId = getEntryId(entry, index);
    const keys = getKeys(entry);
    const constant = entry.constant === true;

    for (const [ki, key] of keys.entries()) {
      const check = validateRegexKey(key, args.opts.macros);
      if (!check.ok) report.error(`Invalid JS regex key at index ${ki}: ${check.message}`, { entryId, field: 'keys' });
    }
    for (const [ki, key] of getSecondaryKeys(entry).entries()) {
      const check = validateRegexKey(key, args.opts.macros);
      if (!check.ok) report.error(`Invalid JS regex secondary key at index ${ki}: ${check.message}`, { entryId, field: 'secondary_keys' });
    }

    let primaryHit = constant;
    if (!constant && keys.length && scanText) {
      primaryHit = keys.some((key) => matchSingleKey(key, scanText, args.opts));
    }
    const secondaryOk = primaryHit && entry.selective === true ? evaluateSecondary(entry, scanText, args.opts, report, entryId) : true;
    const active = primaryHit && secondaryOk;
    if (active) activated += 1;
    report.addInfo(`Entry ${entryId}: ${active ? 'ACTIVE' : 'inactive'}${constant ? ' (constant)' : ''}`);
  }

  report.addInfo(`Activated entries: ${activated}/${entries.length}`);
  report.print();
  process.exit(report.valid() ? 0 : 1);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(2);
}
