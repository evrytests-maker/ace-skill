import { isDeepStrictEqual } from 'node:util';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function locateContainer(document) {
  const candidates = [
    ['entries'],
    ['character_book', 'entries'],
    ['data', 'character_book', 'entries'],
  ];
  for (const path of candidates) {
    let value = document;
    for (const part of path) value = value?.[part];
    if (Array.isArray(value) || isObject(value)) return { path, value };
  }
  return null;
}

function setAtPath(document, path, value) {
  let cursor = document;
  for (const part of path.slice(0, -1)) {
    if (!isObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[path.at(-1)] = value;
}

function deleteAtPath(document, path) {
  let cursor = document;
  for (const part of path.slice(0, -1)) {
    if (!isObject(cursor?.[part])) return;
    cursor = cursor[part];
  }
  delete cursor[path.at(-1)];
}

function canonicalEntry(entry, sourceKey, index) {
  const raw = clone(entry);
  return {
    sourceKey,
    index,
    uid: entry?.uid ?? entry?.id ?? (/^\d+$/u.test(sourceKey) ? Number(sourceKey) : index),
    keys: clone(entry?.key ?? entry?.keys ?? []),
    secondaryKeys: clone(entry?.keysecondary ?? entry?.secondary_keys ?? []),
    content: entry?.content,
    advanced: {
      position: entry?.position ?? entry?.extensions?.position,
      depth: entry?.depth ?? entry?.extensions?.depth,
      role: entry?.role ?? entry?.extensions?.role,
      order: entry?.order ?? entry?.insertion_order,
      outlet: entry?.outlet ?? entry?.extensions?.outlet,
      automationId: entry?.automationId ?? entry?.automation_id ?? entry?.extensions?.automation_id,
      scope: entry?.scope ?? entry?.extensions?.scope,
    },
    raw,
  };
}

/** Parse supported standalone and embedded lorebook JSON without discarding unknown fields. */
export function parseLorebook(input) {
  const document = typeof input === 'string' ? JSON.parse(input) : clone(input);
  if (!isObject(document)) throw new TypeError('Lorebook root must be an object');
  const container = locateContainer(document);
  if (!container) throw new TypeError('No supported lorebook entries container');
  const shape = Array.isArray(container.value) ? 'array' : 'object';
  const records = shape === 'array'
    ? container.value.map((entry, index) => canonicalEntry(entry, String(index), index))
    : Object.entries(container.value).map(([key, entry], index) => canonicalEntry(entry, key, index));
  return {
    format: container.path.length === 1 ? 'standalone' : 'embedded',
    containerPath: container.path.join('.'),
    containerShape: shape,
    entries: records,
    original: document,
  };
}

/** Normalize aliases into a canonical view while retaining each original entry verbatim in `raw`. */
export function normalizeLorebook(input) {
  return input?.original && Array.isArray(input?.entries) ? clone(input) : parseLorebook(input);
}

function outputPath(canonical, format) {
  if (!format || format === 'original') return canonical.containerPath.split('.');
  if (format === 'standalone-array' || format === 'standalone-object') return ['entries'];
  if (format === 'embedded-array' || format === 'embedded-object') return ['data', 'character_book', 'entries'];
  throw new TypeError(`Unsupported lorebook output format: ${format}`);
}

/** Serialize from the lossless canonical representation. */
export function serializeLorebook(value, { format = 'original', space } = {}) {
  const canonical = normalizeLorebook(value);
  const document = clone(canonical.original);
  const path = outputPath(canonical, format);
  const shape = format.endsWith('-array') ? 'array'
    : format.endsWith('-object') ? 'object'
      : canonical.containerShape;
  if (format !== 'original') deleteAtPath(document, canonical.containerPath.split('.'));
  const entries = shape === 'array'
    ? canonical.entries.map((record) => clone(record.raw))
    : Object.fromEntries(canonical.entries.map((record) => [record.sourceKey, clone(record.raw)]));
  setAtPath(document, path, entries);
  return JSON.stringify(document, null, space);
}

/** Return stable JSON-path-level loss/change/add records for round-trip evidence. */
export function diffPaths(before, after) {
  const differences = [];
  const walk = (left, right, path = '$') => {
    if (isDeepStrictEqual(left, right)) return;
    if (left === undefined) return differences.push({ path, kind: 'added', after: clone(right) });
    if (right === undefined) return differences.push({ path, kind: 'lost', before: clone(left) });
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) walk(left[index], right[index], `${path}[${index}]`);
      return;
    }
    if (isObject(left) && isObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) walk(left[key], right[key], `${path}.${key}`);
      return;
    }
    differences.push({ path, kind: 'changed', before: clone(left), after: clone(right) });
  };
  walk(before, after);
  return differences;
}

export function verifyLorebookRoundTrip(input) {
  const before = typeof input === 'string' ? JSON.parse(input) : clone(input);
  const canonical = parseLorebook(before);
  const after = JSON.parse(serializeLorebook(canonical));
  const differences = diffPaths(before, after);
  return {
    status: differences.length ? 'FAIL' : 'PASS',
    differences,
    evidence: {
      kind: 'import-export-round-trip',
      containerPath: canonical.containerPath,
      containerShape: canonical.containerShape,
      entryCount: canonical.entries.length,
      checkedPaths: canonical.entries.map((entry) => `${canonical.containerPath}.${entry.sourceKey}`),
    },
  };
}
