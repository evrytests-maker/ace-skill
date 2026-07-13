#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const SELF_ROOT = path.dirname(SELF);
const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', '.ace-reports']);
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeArchivePath(raw) {
  if (raw.includes('\0')) throw new Error('ZIP contains a NUL byte in a path');
  const replaced = raw.replaceAll('\\', '/');
  if (!replaced || replaced.startsWith('/') || /^[a-zA-Z]:\//u.test(replaced)) {
    throw new Error(`ZIP contains an absolute or empty path: ${JSON.stringify(raw)}`);
  }
  const parts = replaced.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error(`ZIP path traversal detected: ${raw}`);
  return parts.join('/');
}

function decodeZipName(buffer, flags) {
  if ((flags & 0x800) !== 0) return buffer.toString('utf8');
  // ACE packages use UTF-8 names. Node has no built-in CP437 decoder, so keep a
  // deterministic UTF-8 fallback and reject replacement characters.
  const value = buffer.toString('utf8');
  if (value.includes('\ufffd')) throw new Error('ZIP contains a non-UTF-8 filename');
  return value;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
    if (buffer.readUInt32LE(offset) === ZIP64_END_OF_CENTRAL_DIRECTORY) {
      throw new Error('ZIP64 archives are not supported by the dependency-free web precheck');
    }
  }
  throw new Error('ZIP end-of-central-directory record was not found');
}

export function parseZipArchive(buffer, source = '<buffer>') {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parseZipArchive expects a Buffer');
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error('Multi-disk ZIP archives are not supported');
  if (entryCount > MAX_FILES) throw new Error(`ZIP has ${entryCount} entries; limit is ${MAX_FILES}`);
  if (centralOffset + centralSize > buffer.length) throw new Error('ZIP central directory is truncated');

  const files = new Map();
  const directories = new Set();
  let cursor = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_HEADER) throw new Error(`ZIP central-directory entry ${index} is invalid`);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16) >>> 0;
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > buffer.length) throw new Error('ZIP central-directory filename is truncated');
    const rawName = decodeZipName(buffer.subarray(nameStart, nameEnd), flags);
    const normalized = normalizeArchivePath(rawName);
    cursor = nameEnd + extraLength + commentLength;
    if (!normalized) continue;

    const directoryEntry = rawName.endsWith('/') || ((externalAttributes >>> 16) & 0o170000) === 0o040000;
    if (directoryEntry) {
      directories.add(normalized.replace(/\/$/u, ''));
      continue;
    }
    if ((flags & 0x1) !== 0) throw new Error(`Encrypted ZIP entry is not supported: ${normalized}`);
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    if ((unixMode & 0o170000) === 0o120000) throw new Error(`ZIP symlink is not permitted: ${normalized}`);
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method ${method} for ${normalized}`);
    if (uncompressedSize > MAX_FILE_BYTES) throw new Error(`${normalized} exceeds the ${MAX_FILE_BYTES}-byte per-file limit`);
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`ZIP exceeds the ${MAX_TOTAL_BYTES}-byte uncompressed limit`);
    if (files.has(normalized)) throw new Error(`ZIP contains a duplicate path: ${normalized}`);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error(`ZIP local header is invalid for ${normalized}`);
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error(`ZIP data is truncated for ${normalized}`);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const content = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_FILE_BYTES });
    if (content.length !== uncompressedSize) throw new Error(`ZIP size mismatch for ${normalized}`);
    if (crc32(content) !== expectedCrc) throw new Error(`ZIP CRC mismatch for ${normalized}`);
    files.set(normalized, { content, size: content.length, source: `${source}:${normalized}` });
    const parentParts = normalized.split('/');
    parentParts.pop();
    while (parentParts.length) {
      directories.add(parentParts.join('/'));
      parentParts.pop();
    }
  }
  if (cursor !== centralOffset + centralSize) throw new Error('ZIP central-directory size does not match parsed entries');
  return { kind: 'zip', source, files, directories, skipped: [] };
}

function scanDirectory(root) {
  const files = new Map();
  const directories = new Set();
  const skipped = [];
  let totalBytes = 0;

  const walk = (absolute, relative = '') => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not permitted in a portable skill: ${childRelative}`);
      if (entry.isDirectory()) {
        directories.add(childRelative);
        if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
          skipped.push(childRelative);
          continue;
        }
        walk(childAbsolute, childRelative);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${childRelative}`);
      const stat = fs.statSync(childAbsolute);
      if (stat.size > MAX_FILE_BYTES) throw new Error(`${childRelative} exceeds the ${MAX_FILE_BYTES}-byte per-file limit`);
      totalBytes += stat.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`Directory exceeds the ${MAX_TOTAL_BYTES}-byte precheck limit`);
      if (files.size >= MAX_FILES) throw new Error(`Directory exceeds the ${MAX_FILES}-file precheck limit`);
      files.set(childRelative, { content: fs.readFileSync(childAbsolute), size: stat.size, source: childAbsolute });
    }
  };
  walk(root);
  return { kind: 'directory', source: root, files, directories, skipped };
}

function nearestSkillRoot(input) {
  let current = fs.statSync(input).isDirectory() ? input : path.dirname(input);
  while (true) {
    if (fs.existsSync(path.join(current, 'SKILL.md'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadInputBundles(inputs) {
  const bundles = [];
  const scannedRoots = new Set();
  for (const rawInput of inputs) {
    const absolute = path.resolve(rawInput);
    if (!fs.existsSync(absolute)) throw new Error(`Input does not exist: ${rawInput}`);
    const stat = fs.statSync(absolute);
    if (stat.isFile() && absolute.toLowerCase().endsWith('.zip')) {
      bundles.push(parseZipArchive(fs.readFileSync(absolute), absolute));
      continue;
    }
    const root = nearestSkillRoot(absolute) ?? (stat.isDirectory() ? absolute : path.dirname(absolute));
    if (scannedRoots.has(root)) continue;
    scannedRoots.add(root);
    bundles.push(scanDirectory(root));
  }
  return bundles;
}

function skillRoots(bundle) {
  return [...bundle.files.keys()]
    .filter((name) => name === 'SKILL.md' || name.endsWith('/SKILL.md'))
    .map((name) => path.posix.dirname(name))
    .sort();
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const property = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (property) values[property[1]] = property[2].trim().replace(/^['"]|['"]$/gu, '');
  }
  return values;
}

function localMarkdownTargets(text) {
  const targets = [];
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    let target = match[1].trim().replace(/^<|>$/gu, '');
    if (!target || /^(https?:|mailto:|#|local:)/iu.test(target)) continue;
    target = target.split('#')[0].split('?')[0];
    if (target) targets.push(target);
  }
  return targets;
}

function checkResult(id, status, message, details = undefined) {
  return { id, status, message, ...(details === undefined ? {} : { details }) };
}

function textFile(view, relative) {
  const item = view.get(relative);
  return item ? item.content.toString('utf8') : null;
}

function parseJson(view, relative) {
  const text = textFile(view, relative);
  if (text === null) throw new Error(`${relative} is missing`);
  return JSON.parse(text);
}

function verifySkill(bundle, root) {
  const prefix = root === '.' ? '' : `${root}/`;
  const entries = [...bundle.files.entries()].filter(([name]) => name.startsWith(prefix));
  const files = new Map(entries.map(([name, item]) => [name.slice(prefix.length), item]));
  const directories = new Set([...bundle.directories].filter((name) => name === root || name.startsWith(prefix)).map((name) => name.slice(prefix.length)));
  const view = { get: (relative) => files.get(relative), has: (relative) => files.has(relative) };
  const checks = [];
  const warnings = [];

  let manifest;
  try {
    manifest = parseJson(view, 'verification-manifest.json');
    checks.push(checkResult('WEB-MANIFEST', 'PASS', 'verification-manifest.json parsed'));
  } catch (error) {
    checks.push(checkResult('WEB-MANIFEST', 'FAIL', error.message));
    manifest = null;
  }

  const requiredFiles = manifest?.requiredFiles ?? ['SKILL.md', 'package.json', 'verify.mjs'];
  const missing = requiredFiles.filter((name) => !view.has(name));
  checks.push(checkResult('WEB-STRUCTURE', missing.length ? 'FAIL' : 'PASS', missing.length ? `Missing required files: ${missing.join(', ')}` : `${files.size} files; required structure present`));

  const forbidden = manifest?.forbiddenTopLevel ?? ['.git', 'node_modules', '.ace-reports'];
  const presentForbidden = forbidden.filter((name) => directories.has(name) || [...files.keys()].some((file) => file.startsWith(`${name}/`)));
  const packagedBaggage = bundle.kind === 'zip' && presentForbidden.length > 0;
  checks.push(checkResult(
    'WEB-PORTABILITY',
    packagedBaggage ? 'FAIL' : 'PASS',
    packagedBaggage
      ? `Packaged skill contains forbidden top-level content: ${presentForbidden.join(', ')}`
      : presentForbidden.length
        ? `Local working directories were ignored: ${presentForbidden.join(', ')}`
        : 'No .git, node_modules, or generated report directory',
  ));
  if (bundle.kind === 'directory' && presentForbidden.length) warnings.push(`Do not include local working directories in an uploaded ZIP: ${presentForbidden.join(', ')}`);

  const caseMap = new Map();
  const caseCollisions = [];
  for (const name of files.keys()) {
    const lowered = name.toLocaleLowerCase('en-US');
    const prior = caseMap.get(lowered);
    if (prior && prior !== name) caseCollisions.push(`${prior} <> ${name}`);
    else caseMap.set(lowered, name);
  }
  checks.push(checkResult('WEB-PATH-CASE', caseCollisions.length ? 'FAIL' : 'PASS', caseCollisions.length ? `${caseCollisions.length} case-colliding path(s)` : 'Paths are portable across case-sensitive and case-insensitive filesystems', caseCollisions));

  const skillText = textFile(view, 'SKILL.md');
  const frontmatter = skillText === null ? null : parseFrontmatter(skillText);
  const expectedName = manifest?.skillName;
  const frontmatterOkay = Boolean(frontmatter?.name && frontmatter?.description && (!expectedName || frontmatter.name === expectedName));
  checks.push(checkResult('WEB-SKILL-METADATA', frontmatterOkay ? 'PASS' : 'FAIL', frontmatterOkay ? `Skill metadata identifies ${frontmatter.name}` : 'SKILL.md frontmatter is missing name/description or has the wrong skill name'));

  const immutableFailures = [];
  for (const [relative, expectedHash] of Object.entries(manifest?.immutableFiles ?? {})) {
    const item = view.get(relative);
    const actual = item ? sha256(item.content) : null;
    if (actual !== expectedHash) immutableFailures.push(`${relative}: expected ${expectedHash}, got ${actual ?? 'MISSING'}`);
  }
  checks.push(checkResult('WEB-IMMUTABLE', immutableFailures.length ? 'FAIL' : 'PASS', immutableFailures.length ? 'Immutable file hashes changed' : `${Object.keys(manifest?.immutableFiles ?? {}).length} immutable hashes match`, immutableFailures));

  const releaseHashFailures = [];
  const expectedHashes = manifest?.fileHashes;
  if (!expectedHashes || typeof expectedHashes !== 'object' || Array.isArray(expectedHashes)) {
    releaseHashFailures.push('verification-manifest.json has no fileHashes object');
  } else {
    for (const [relative, expectedHash] of Object.entries(expectedHashes)) {
      const item = view.get(relative);
      if (!item) releaseHashFailures.push(`${relative}: missing`);
      else {
        const actual = sha256(item.content);
        if (actual !== expectedHash) releaseHashFailures.push(`${relative}: expected ${expectedHash}, got ${actual}`);
      }
    }
  }
  const expectedHashPaths = new Set(Object.keys(expectedHashes ?? {}));
  const extraReleaseFiles = [...files.keys()].filter((relative) => relative !== 'verification-manifest.json' && !expectedHashPaths.has(relative)).sort();
  if (bundle.kind === 'zip' && extraReleaseFiles.length) releaseHashFailures.push(`unexpected packaged files: ${extraReleaseFiles.join(', ')}`);
  if (bundle.kind === 'directory' && extraReleaseFiles.length) warnings.push(`Untracked local files are outside the signed release manifest: ${extraReleaseFiles.slice(0, 10).join(', ')}${extraReleaseFiles.length > 10 ? ', ...' : ''}`);
  checks.push(checkResult(
    'WEB-RELEASE-HASHES',
    releaseHashFailures.length ? 'FAIL' : 'PASS',
    releaseHashFailures.length ? `${releaseHashFailures.length} signed-release integrity problem(s)` : `${expectedHashPaths.size} release file hashes match`,
    releaseHashFailures,
  ));

  const jsonErrors = [];
  for (const [relative, item] of files) {
    if (!relative.endsWith('.json')) continue;
    try { JSON.parse(item.content.toString('utf8')); }
    catch (error) { jsonErrors.push(`${relative}: ${error.message}`); }
  }
  checks.push(checkResult('WEB-JSON', jsonErrors.length ? 'FAIL' : 'PASS', jsonErrors.length ? `${jsonErrors.length} JSON file(s) are invalid` : `${[...files.keys()].filter((name) => name.endsWith('.json')).length} JSON files parsed`, jsonErrors));

  const brokenLinks = [];
  let linkExclusions = new Set();
  try {
    const exclusions = parseJson(view, 'rules/maintenance-exclusions.json');
    linkExclusions = new Set((exclusions.files ?? [])
      .filter((item) => (item.checks ?? []).includes('links'))
      .map((item) => item.path));
  } catch {
    // WEB-JSON reports malformed exclusion data; link validation remains strict.
  }
  for (const [relative, item] of files) {
    if (!relative.endsWith('.md') || linkExclusions.has(relative)) continue;
    for (const target of localMarkdownTargets(item.content.toString('utf8'))) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target));
      if (resolved.startsWith('../') || resolved === '..') brokenLinks.push(`${relative}: link escapes skill root: ${target}`);
      else if (!files.has(resolved)) brokenLinks.push(`${relative}: missing target ${target}`);
    }
  }
  checks.push(checkResult('WEB-MARKDOWN-LINKS', brokenLinks.length ? 'FAIL' : 'PASS', brokenLinks.length ? `${brokenLinks.length} local Markdown link(s) are broken` : 'Local Markdown links resolve', brokenLinks));

  let packageJson = null;
  const packageErrors = [];
  try {
    packageJson = parseJson(view, 'package.json');
    const requiredScripts = manifest?.requiredScripts ?? {};
    for (const [name, command] of Object.entries(requiredScripts)) {
      if (packageJson.scripts?.[name] !== command) packageErrors.push(`package script ${name} must be ${JSON.stringify(command)}`);
    }
    const runtimeDeps = Object.keys(packageJson.dependencies ?? {});
    if (runtimeDeps.length) packageErrors.push(`validation-only packages must be devDependencies, found runtime dependencies: ${runtimeDeps.join(', ')}`);
    for (const dependency of manifest?.expectedDevDependencies ?? []) {
      if (!packageJson.devDependencies?.[dependency]) packageErrors.push(`missing devDependency: ${dependency}`);
    }
  } catch (error) { packageErrors.push(error.message); }
  checks.push(checkResult('WEB-PACKAGE', packageErrors.length ? 'FAIL' : 'PASS', packageErrors.length ? `${packageErrors.length} package contract problem(s)` : 'Package scripts and dependency roles are correct', packageErrors));

  const verifier = textFile(view, 'verify.mjs') ?? '';
  const verifierErrors = [];
  const verifierImports = [...verifier.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
  for (const specifier of verifierImports) {
    if (!specifier.startsWith('node:')) verifierErrors.push(`verify.mjs imports a non-built-in module: ${specifier}`);
    if (specifier === 'node:child_process') verifierErrors.push('verify.mjs must not import child-process APIs');
    if (specifier === 'node:http' || specifier === 'node:https' || specifier === 'node:net' || specifier === 'node:tls') {
      verifierErrors.push(`verify.mjs must not import network API ${specifier}`);
    }
  }
  checks.push(checkResult('WEB-SINGLE-PROCESS', verifierErrors.length ? 'FAIL' : 'PASS', verifierErrors.length ? 'Web verifier is not self-contained' : 'One Node process; built-ins only; no network', verifierErrors));

  const simulator = textFile(view, 'scripts/lib/world-info-simulator.mjs') ?? '';
  const outletTests = textFile(view, 'tests/unit/world-info-official-semantics.test.mjs') ?? '';
  const outletRequirements = [
    [/replace\(\/\{\{outlet::\(\[\^\}\]\+\)\}\}\/gi/u, 'macro identifier uses a case-insensitive regex'],
    [/outletEntries\[name\]\?\.join\(['"]\\n['"]\)\s*\?\?\s*['"]['"]/u, 'Outlet name lookup preserves case and joins with newline'],
    [/OUTLET_NAME_MISSING/u, 'entries without an Outlet name are skipped'],
  ];
  const outletErrors = outletRequirements.filter(([pattern]) => !pattern.test(simulator)).map(([, label]) => label);
  for (const literal of ['{{outlet::Memory}}', '{{Outlet::Memory}}', '{{OUTLET::Memory}}', '{{outlet::memory}}']) {
    if (!outletTests.includes(literal)) outletErrors.push(`official semantic test is missing ${literal}`);
  }
  for (const evidence of [
    "order: 100, content: 'low'",
    "order: 200, content: 'high {{outlet::Other}}'",
    "Memory: ['high {{outlet::Other}}', 'low']",
    'lowerName=|missing=',
  ]) if (!outletTests.includes(evidence)) outletErrors.push(`official Outlet evidence is missing ${evidence}`);
  if (!/simulatedRawPrompt\.some[\s\S]*['"]1['"][\s\S]*['"]2['"]/u.test(outletTests)) outletErrors.push('official semantic test does not assert that Outlet entries are not automatically inserted');
  checks.push(checkResult('WEB-OUTLET-CONTRACT', outletErrors.length ? 'FAIL' : 'PASS', outletErrors.length ? `${outletErrors.length} Outlet contract requirement(s) are missing` : 'Outlet casing, ordering evidence, empty replacement, missing-name skip, and consumer-only tests are present', outletErrors));

  const repoCheck = textFile(view, 'scripts/services/repo-check.mjs') ?? '';
  const gateErrors = [];
  if (repoCheck.includes('ACE_REPO_CHECK_DEPTH')) gateErrors.push('public ACE_REPO_CHECK_DEPTH profile switch reappeared');
  for (const gate of ['VAL-UNIT', 'VAL-SABOTAGE', 'VAL-E2E', 'VAL-EVAL-DATA']) {
    const count = repoCheck.split(gate).length - 1;
    if (count !== 1) gateErrors.push(`${gate} must appear exactly once in repositoryCheckSpecs; found ${count}`);
  }
  if (!/DEFAULT_REPOSITORY_GATE_TIMEOUT_MS\s*=\s*180_000/u.test(repoCheck)) gateErrors.push('validated repository gate timeout policy is missing');
  if (!repoCheck.includes('runProcess')) gateErrors.push('repository checks no longer use the process runner cleanup abstraction');
  checks.push(checkResult('WEB-RELEASE-GATE', gateErrors.length ? 'FAIL' : 'PASS', gateErrors.length ? `${gateErrors.length} release-gate structural problem(s)` : 'Mandatory local gates cannot be suppressed; timeout/runner structure is present', gateErrors));

  const lorebookReference = textFile(view, 'references/lorebooks.md') ?? '';
  const conflictReference = textFile(view, 'references/sources-and-conflicts.md') ?? '';
  const conflictOkay = lorebookReference.includes('Sorted Evenly') && lorebookReference.includes('character_first')
    && conflictReference.includes('Sorted Evenly') && conflictReference.includes('character_first');
  checks.push(checkResult('WEB-SOURCE-CONFLICT', conflictOkay ? 'PASS' : 'FAIL', conflictOkay ? 'Sorted Evenly documentation conflict and pinned character_first code are documented' : 'Sorted Evenly / character_first conflict documentation is incomplete'));

  const minimumFiles = Number(manifest?.minimumFiles ?? 0);
  if (minimumFiles && files.size < minimumFiles) checks.push(checkResult('WEB-FILE-COUNT', 'FAIL', `Only ${files.size} files found; manifest minimum is ${minimumFiles}`));
  else checks.push(checkResult('WEB-FILE-COUNT', 'PASS', `${files.size} files meet the manifest floor${minimumFiles ? ` (${minimumFiles})` : ''}`));

  const contextHotspots = [...files.entries()]
    .filter(([, item]) => item.size > 20 * 1024)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([name, item]) => ({ path: name, bytes: item.size }));
  if (contextHotspots.length) warnings.push(`Read large files selectively: ${contextHotspots.map((item) => `${item.path} (${item.bytes} B)`).join(', ')}`);

  const failed = checks.filter((check) => check.status === 'FAIL');
  return {
    root,
    name: frontmatter?.name ?? expectedName ?? '(unknown)',
    status: failed.length ? 'FAIL' : 'PASS',
    files: files.size,
    bytes: [...files.values()].reduce((sum, item) => sum + item.size, 0),
    checks,
    warnings,
    contextHotspots,
  };
}

function verifyBundle(bundle) {
  const roots = skillRoots(bundle);
  if (!roots.length) {
    return {
      source: bundle.source,
      kind: bundle.kind,
      status: 'FAIL',
      skills: [],
      errors: ['No SKILL.md was found. Pass a skill root, a parent directory containing skills, or a ZIP containing a skill.'],
    };
  }
  const skills = roots.map((root) => verifySkill(bundle, root));
  return {
    source: bundle.source,
    kind: bundle.kind,
    status: skills.every((skill) => skill.status === 'PASS') ? 'PASS' : 'FAIL',
    skills,
    errors: [],
  };
}

export function verifyInputs(inputs = [SELF_ROOT]) {
  const startedAt = new Date().toISOString();
  let bundles;
  try { bundles = loadInputBundles(inputs); }
  catch (error) {
    return { kind: 'ACE_WEB_PRECHECK', status: 'FAIL', startedAt, finishedAt: new Date().toISOString(), bundles: [], errors: [error.message] };
  }
  const results = [];
  for (const bundle of bundles) {
    try { results.push(verifyBundle(bundle)); }
    catch (error) { results.push({ source: bundle.source, kind: bundle.kind, status: 'FAIL', skills: [], errors: [error.message] }); }
  }
  const status = results.length > 0 && results.every((bundle) => bundle.status === 'PASS') ? 'PASS' : 'FAIL';
  return { kind: 'ACE_WEB_PRECHECK', status, startedAt, finishedAt: new Date().toISOString(), bundles: results, errors: [] };
}

function humanLines(report, verbose = false) {
  const lines = [`ACE WEB PRECHECK: ${report.status}`];
  for (const error of report.errors ?? []) lines.push(`FAIL input: ${error}`);
  for (const bundle of report.bundles ?? []) {
    lines.push(`Input: ${bundle.source} [${bundle.kind}] — ${bundle.status}`);
    for (const error of bundle.errors ?? []) lines.push(`  FAIL: ${error}`);
    for (const skill of bundle.skills ?? []) {
      lines.push(`  Skill ${skill.name} (${skill.root}): ${skill.status}; ${skill.files} files; ${skill.bytes} bytes`);
      for (const check of skill.checks) {
        if (verbose || check.status !== 'PASS') lines.push(`    ${check.status} ${check.id}: ${check.message}`);
        if (check.status !== 'PASS' && Array.isArray(check.details)) for (const detail of check.details.slice(0, 10)) lines.push(`      - ${detail}`);
      }
      for (const warning of skill.warnings) lines.push(`    WARN: ${warning}`);
    }
  }
  lines.push(report.status === 'PASS'
    ? 'This is a dependency-free structural PRECHECK, not a full release PASS. Run npm ci && npm run check:all for the release gate.'
    : 'PRECHECK failed. Fix the reported local integrity problems before running the full release gate.');
  return lines;
}

function parseCli(argv) {
  const options = { json: false, verbose: false, report: null, inputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--report') {
      index += 1;
      if (!argv[index]) throw new Error('--report requires a file path');
      options.report = argv[index];
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else options.inputs.push(arg);
  }
  return options;
}

function helpText() {
  return `ACE dependency-free web precheck\n\nUsage:\n  node verify.mjs [--json] [--verbose] [--report FILE] [PATH ...]\n\nAccepted inputs:\n  - an extracted skill directory;\n  - a parent directory containing one or more skills;\n  - one or more files/folders from the same skill tree;\n  - one or more ZIP archives containing skills.\n\nWith no PATH, the skill containing verify.mjs is checked. The command never\ninstalls packages, accesses the network, or starts child processes.\n`;
}

export function runCli(argv = process.argv.slice(2)) {
  let options;
  try { options = parseCli(argv); }
  catch (error) {
    console.error(error.message);
    console.error(helpText());
    return 2;
  }
  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }
  const report = verifyInputs(options.inputs.length ? options.inputs : [SELF_ROOT]);
  const output = options.json ? `${JSON.stringify(report, null, 2)}\n` : `${humanLines(report, options.verbose).join('\n')}\n`;
  process.stdout.write(output);
  if (options.report) {
    const target = path.resolve(options.report);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report.status === 'PASS' ? 0 : 1;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirect) process.exitCode = runCli();
