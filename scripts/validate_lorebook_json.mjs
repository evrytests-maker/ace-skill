#!/usr/bin/env node
import { readJsonFile, isPlainObject } from './lib/files.mjs';
import { Report } from './lib/report.mjs';
import { validateRegexKey } from './lib/st-matching.mjs';

const VALID_POSITIONS = new Set([
  'before_char',
  'after_char',
  'before_example',
  'after_example',
  'author_note',
  'at_depth',
  'top_an',
  'bottom_an',
]);
const MIN_ORDER = 0;
const MAX_ORDER = 100000;
const MIN_DEPTH = 0;
const MAX_DEPTH = 10;

function usage() {
  console.error('Usage: node scripts/validate_lorebook_json.mjs <path_to_lorebook.json>');
}

function getEntryId(entry, index) {
  return entry.id ?? entry.uid ?? index;
}

function getKeys(entry) {
  if (Array.isArray(entry.keys)) return entry.keys;
  if (Array.isArray(entry.key)) return entry.key;
  return null;
}

function getSecondaryKeys(entry) {
  if (Array.isArray(entry.secondary_keys)) return entry.secondary_keys;
  if (Array.isArray(entry.keysecondary)) return entry.keysecondary;
  return [];
}

function getOrder(entry) {
  return entry.insertion_order ?? entry.order;
}

function getDepth(entry) {
  return entry.extensions?.depth ?? entry.depth;
}

function validateEntry(entry, index, report) {
  const entryId = getEntryId(entry, index);
  if (!isPlainObject(entry)) {
    report.error(`Entry at index ${index} must be an object, got ${typeof entry}`);
    return null;
  }

  if (!Number.isInteger(entry.id) && !Number.isInteger(entry.uid)) {
    report.error('Missing integer id/uid', { entryId, field: 'id' });
  }

  const keys = getKeys(entry);
  if (keys === null) {
    report.error("Missing 'keys' or 'key' array", { entryId, field: 'keys' });
  } else {
    if (!keys.length && entry.constant !== true) report.warn('Normal entry has no keys and will not trigger', { entryId, field: 'keys' });
    keys.forEach((key, keyIndex) => {
      if (typeof key !== 'string') {
        report.error(`Key at index ${keyIndex} must be a string`, { entryId, field: 'keys' });
        return;
      }
      const check = validateRegexKey(key);
      if (!check.ok) report.error(`Invalid JavaScript regex key at index ${keyIndex}: ${check.message}`, { entryId, field: 'keys' });
    });
  }

  getSecondaryKeys(entry).forEach((key, keyIndex) => {
    if (typeof key !== 'string') {
      report.error(`Secondary key at index ${keyIndex} must be a string`, { entryId, field: 'secondary_keys' });
      return;
    }
    const check = validateRegexKey(key);
    if (!check.ok) report.error(`Invalid JavaScript regex secondary key at index ${keyIndex}: ${check.message}`, { entryId, field: 'secondary_keys' });
  });

  if (entry.selective === true && getSecondaryKeys(entry).length === 0) {
    report.warn('selective=true but secondary_keys/keysecondary is empty', { entryId, field: 'secondary_keys' });
  }

  if (typeof entry.content !== 'string') {
    report.error("Missing or invalid string 'content'", { entryId, field: 'content' });
  } else if (!entry.content.trim()) {
    report.error('content is empty', { entryId, field: 'content' });
  } else if (entry.content.trim().length < 20) {
    report.warn('content is very short; lore entries should be standalone enough to be useful', { entryId, field: 'content' });
  }

  if (typeof entry.comment !== 'string') {
    report.warn("Missing string 'comment'", { entryId, field: 'comment' });
  } else if (!entry.comment.trim()) {
    report.warn('comment is empty', { entryId, field: 'comment' });
  }

  const position = entry.position;
  if (position !== undefined && typeof position !== 'string') {
    report.error('position must be a string', { entryId, field: 'position' });
  } else if (position && !VALID_POSITIONS.has(position)) {
    report.warn(`Unknown position '${position}'. Check current SillyTavern schema if intentional.`, { entryId, field: 'position' });
  }

  const order = getOrder(entry);
  if (order !== undefined) {
    if (!Number.isInteger(order)) report.error('insertion_order/order must be an integer', { entryId, field: 'insertion_order' });
    else if (order < MIN_ORDER || order > MAX_ORDER) report.error(`order must be between ${MIN_ORDER} and ${MAX_ORDER}`, { entryId, field: 'insertion_order' });
  }

  const depth = getDepth(entry);
  if (depth !== undefined) {
    if (!Number.isInteger(depth)) report.error('depth/extensions.depth must be an integer', { entryId, field: 'depth' });
    else if (depth < MIN_DEPTH || depth > MAX_DEPTH) report.warn(`depth ${depth} is unusual; typical World Info scan depths are 1-5`, { entryId, field: 'depth' });
  }

  for (const boolField of ['constant', 'enabled', 'use_regex', 'selective']) {
    if (entry[boolField] !== undefined && typeof entry[boolField] !== 'boolean') {
      report.error(`${boolField} must be boolean`, { entryId, field: boolField });
    }
  }

  if (entry.constant === true && keys && keys.length > 0) {
    report.warn('constant=true entries do not need trigger keys', { entryId, field: 'keys' });
  }
  if (entry.enabled === false) {
    report.warn('entry is disabled', { entryId, field: 'enabled' });
  }
  return Number.isInteger(entry.id) ? entry.id : Number.isInteger(entry.uid) ? entry.uid : null;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath || process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return 2;
  }
  const report = new Report('Lorebook Validation Report');
  try {
    const { data, resolved, size } = readJsonFile(filePath);
    report.addInfo(`File: ${resolved}`);
    report.addInfo(`Size: ${size} bytes`);
    if (!isPlainObject(data)) {
      report.error('Root JSON must be an object');
      report.print();
      return 1;
    }
    if (typeof data.name === 'string') report.addInfo(`Lorebook name: ${data.name}`);
    else report.warn("Missing string top-level 'name'");

    if (!Array.isArray(data.entries)) {
      report.error("Missing required top-level 'entries' array");
    } else {
      report.addInfo(`Entries found: ${data.entries.length}`);
      const ids = [];
      data.entries.forEach((entry, index) => {
        const id = validateEntry(entry, index, report);
        if (id !== null) ids.push(id);
      });
      const seen = new Set();
      for (const id of ids) {
        if (seen.has(id)) report.error(`Duplicate entry id/uid: ${id}`);
        seen.add(id);
      }
      if (data.entries.length === 0) report.warn('entries array is empty');
    }
  } catch (error) {
    report.error(error.message);
  }
  report.print();
  return report.valid() ? 0 : 1;
}

process.exit(main());
