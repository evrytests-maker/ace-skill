#!/usr/bin/env node
import { readJsonFile, getByPath, isPlainObject } from './lib/files.mjs';
import { Report } from './lib/report.mjs';
import { estimateTokensForModel } from './token_model_map.mjs';

const REQUIRED_SECTIONS = ['Character', 'Appearance', 'Mind', 'Personality'];
const MIN_DESCRIPTION_TOKENS = 700;
const MAX_DESCRIPTION_TOKENS = 1500;
const MIN_GREETING_WORDS = 250;
const REQUIRED_EXAMPLE_COUNT = 3;

function usage() {
  console.error(`Usage: node scripts/validate_bot_description.mjs <character_card.json> [--model gpt-4o|gpt-5|claude|gemini]`);
}

function parseArgs(argv) {
  if (argv.length < 1 || argv.includes('--help') || argv.includes('-h')) return null;
  const opts = { file: argv[0], model: 'gpt-4o' };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--model') opts.model = argv[++i] ?? opts.model;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return opts;
}

function pickFirstString(data, paths) {
  for (const path of paths) {
    const value = getByPath(data, path);
    if (typeof value === 'string') return value;
  }
  return '';
}

function pickFirstArray(data, paths) {
  for (const path of paths) {
    const value = getByPath(data, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function wordCount(text) {
  return (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

function extractSections(description) {
  const sections = new Set();
  for (const match of description.matchAll(/\[?([A-Z][A-Za-z0-9_ ]{2,40})\s*\(/g)) sections.add(match[1].trim());
  for (const match of description.matchAll(/^#{1,4}\s*([A-Z][A-Za-z0-9_ ]{2,40})/gm)) sections.add(match[1].trim());
  for (const match of description.matchAll(/^\[([A-Z][A-Za-z0-9_ ]{2,40})\]/gm)) sections.add(match[1].trim());
  return [...sections];
}

function sectionBody(description, sectionName) {
  const patterns = [
    new RegExp(`\\[?${sectionName}\\s*\\(\\s*([\\s\\S]*?)\\s*\\)`, 'i'),
    new RegExp(`^#+\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=^#+\\s|\\z)`, 'im'),
  ];
  for (const re of patterns) {
    const match = description.match(re);
    if (match) return match[1].toLocaleLowerCase('ru-RU');
  }
  return '';
}

function jaccard(a, b) {
  const tokensA = new Set((a.match(/[\p{L}\p{N}]{4,}/gu) ?? []));
  const tokensB = new Set((b.match(/[\p{L}\p{N}]{4,}/gu) ?? []));
  if (!tokensA.size || !tokensB.size) return 0;
  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

function validateGreeting(text, label, report) {
  if (typeof text !== 'string' || !text.trim()) {
    report.error(`${label} is missing or empty`, { field: label });
    return;
  }
  const words = wordCount(text);
  if (words < MIN_GREETING_WORDS) {
    report.error(`${label} has ${words} words; minimum is ${MIN_GREETING_WORDS} words`, { field: label });
  }
  if (!/[.!?…]["”')\]]?\s*$/u.test(text.trim())) {
    report.warn(`${label} does not end like a complete narrative beat`, { field: label });
  }
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
  if (!opts) {
    usage();
    return 2;
  }

  const report = new Report('Character Card Validation Report');
  try {
    const { data, resolved, size } = readJsonFile(opts.file);
    report.addInfo(`File: ${resolved}`);
    report.addInfo(`Size: ${size} bytes`);
    if (!isPlainObject(data)) {
      report.error('Root JSON must be an object');
      report.print();
      return 1;
    }

    const description = pickFirstString(data, ['description', 'data.description']);
    const firstMes = pickFirstString(data, ['first_mes', 'data.first_mes', 'firstMessage', 'data.firstMessage']);
    const mesExample = pickFirstString(data, ['mes_example', 'data.mes_example', 'example_dialogue', 'data.example_dialogue']);
    const alternateGreetings = pickFirstArray(data, ['alternate_greetings', 'data.alternate_greetings']);

    if (!description.trim()) {
      report.error('description/data.description is missing or empty', { field: 'description' });
    } else {
      const sections = extractSections(description);
      report.addInfo(`Sections detected: ${sections.length ? sections.join(', ') : 'none'}`);
      for (const required of REQUIRED_SECTIONS) {
        if (!sections.some((s) => s.toLocaleLowerCase('en-US') === required.toLocaleLowerCase('en-US'))) {
          report.error(`Missing required section: ${required}`, { field: 'description' });
        }
      }
      const estimate = estimateTokensForModel(description, opts.model);
      report.addInfo(`Description tokens (${opts.model}): ${estimate.tokens} (${estimate.method})`);
      if (estimate.tokens < MIN_DESCRIPTION_TOKENS) report.warn(`description below target: ${estimate.tokens} < ${MIN_DESCRIPTION_TOKENS} tokens`, { field: 'description' });
      if (estimate.tokens > MAX_DESCRIPTION_TOKENS) report.warn(`description above target: ${estimate.tokens} > ${MAX_DESCRIPTION_TOKENS} tokens`, { field: 'description' });

      const mind = sectionBody(description, 'Mind');
      const personality = sectionBody(description, 'Personality');
      const overlap = jaccard(mind, personality);
      if (overlap > 0.3) report.warn(`Mind and Personality overlap is high (${Math.round(overlap * 100)}%)`, { field: 'description' });
      if (/\b(I am|I'm|my name is|я\s|меня\s|мой\s)/iu.test(description)) report.warn('description may be written in first person; prefer third person card definitions', { field: 'description' });
    }

    validateGreeting(firstMes, 'first_mes', report);
    if (!alternateGreetings.length) {
      report.warn('alternate_greetings is missing or empty; add at least one alternate greeting', { field: 'alternate_greetings' });
    } else {
      alternateGreetings.forEach((greeting, index) => validateGreeting(greeting, `alternate_greetings[${index}]`, report));
    }

    const startCount = (mesExample.match(/<START>/g) ?? []).length;
    if (!mesExample.trim()) report.error('mes_example is missing or empty', { field: 'mes_example' });
    else if (startCount !== REQUIRED_EXAMPLE_COUNT) report.error(`mes_example should contain exactly ${REQUIRED_EXAMPLE_COUNT} <START> blocks, got ${startCount}`, { field: 'mes_example' });
  } catch (error) {
    report.error(error.message);
  }
  report.print();
  return report.valid() ? 0 : 1;
}

process.exit(main());
