import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';
import { validateGuideCoverage } from './guide-coverage.mjs';
import { classifyLorebookWorkflow } from './lorebook-evidence.mjs';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REQUIRED_STATES = ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE', 'VERIFY', 'REPORT'];

export function readJson(relativeOrAbsolute, root = SKILL_ROOT) {
  const file = path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(root, relativeOrAbsolute);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function result(id) {
  return { id, errors: [], blocked: [], warnings: [], evidence: [] };
}

function addSchemaErrors(out, label, validate) {
  if (!validate.errors) return;
  for (const error of validate.errors) out.errors.push(`${label}${error.instancePath || '/'} ${error.message}`);
}

function compileSchema(schemaPath, root, out) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  try {
    return ajv.compile(readJson(schemaPath, root));
  } catch (error) {
    out.errors.push(`Could not compile ${schemaPath}: ${error.message}`);
    return null;
  }
}

export function validateRuleSystem(root = SKILL_ROOT) {
  const out = result('VAL-RULES');
  let registry;
  let workflows;
  let gates;
  let sources;
  let catalog;
  let languageExceptions;
  try {
    registry = readJson('rules/registry.json', root);
    workflows = readJson('rules/workflows.json', root);
    gates = readJson('rules/manual-gates.json', root);
    sources = readJson('rules/sources.json', root);
    catalog = readJson('tests/catalog.json', root);
    languageExceptions = readJson('rules/language-exceptions.json', root);
  } catch (error) {
    out.errors.push(error.message);
    return out;
  }

  for (const [schema, value, label] of [
    ['schemas/rule-registry.schema.json', registry, 'registry'],
    ['schemas/workflows.schema.json', workflows, 'workflows'],
    ['schemas/manual-gates.schema.json', gates, 'manual-gates'],
    ['schemas/sources.schema.json', sources, 'sources'],
    ['schemas/language-exceptions.schema.json', languageExceptions, 'language-exceptions'],
  ]) {
    const validate = compileSchema(schema, root, out);
    if (validate && !validate(value)) addSchemaErrors(out, label, validate);
  }

  const unique = (items, label) => {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id)) out.errors.push(`Duplicate ${label} id: ${item.id}`);
      seen.add(item.id);
    }
    return seen;
  };
  const ruleIds = unique(registry.rules, 'rule');
  const validatorIds = unique(registry.validators, 'validator');
  const gateIds = unique(gates.gates, 'manual gate');
  const sourceIds = unique(sources.sources, 'source');
  const sourceMap = new Map(sources.sources.map((item) => [item.id, item]));
  const testIds = new Set(catalog.tests);
  const workflowIds = unique(workflows.workflows, 'workflow');

  for (const validator of registry.validators) {
    if (!fs.existsSync(path.join(root, validator.path))) out.errors.push(`${validator.id} points to missing validator: ${validator.path}`);
  }
  for (const rule of registry.rules) {
    if (!rule.tests?.length) out.errors.push(`${rule.id} has no tests`);
    for (const testId of rule.tests ?? []) if (!testIds.has(testId)) out.errors.push(`${rule.id} references unknown test: ${testId}`);
    for (const sourceId of rule.sources ?? []) {
      if (!sourceIds.has(sourceId)) out.errors.push(`${rule.id} references unknown source: ${sourceId}`);
      else if (!(sourceMap.get(sourceId).ruleIds ?? []).includes(rule.id)) out.errors.push(`${sourceId} does not trace back to ${rule.id}`);
    }
    if (rule.gate?.kind === 'automatic' && !validatorIds.has(rule.gate.id)) out.errors.push(`${rule.id} references unknown validator: ${rule.gate.id}`);
    if (rule.gate?.kind === 'manual' && !gateIds.has(rule.gate.id)) out.errors.push(`${rule.id} references unknown manual gate: ${rule.gate.id}`);
    if (rule.level === 'MUST' && (!rule.gate || !rule.tests?.length)) out.errors.push(`Orphan MUST: ${rule.id}`);
    if (rule.classification === 'ADVISORY' && rule.level === 'MUST') out.errors.push(`${rule.id} advisory rule cannot be MUST`);
    if (rule.naAllowed && !rule.naWhen) out.errors.push(`${rule.id} permits N/A without naWhen`);
  }
  for (const source of sources.sources) {
    for (const ruleId of source.ruleIds ?? []) {
      if (!ruleIds.has(ruleId)) out.errors.push(`${source.id} references unknown rule: ${ruleId}`);
      else if (!(registry.rules.find((item) => item.id === ruleId)?.sources ?? []).includes(source.id)) out.errors.push(`${source.id} claims ${ruleId}, but the rule does not cite the source`);
    }
  }

  const expectedWorkflows = new Set(['character-create', 'character-repair', 'lorebook-create', 'lorebook-audit', 'key-regex-test', 'secondary-logic-test', 'token-budget', 'combined-repair', 'skill-maintenance']);
  for (const id of expectedWorkflows) if (!workflowIds.has(id)) out.errors.push(`Missing required workflow: ${id}`);
  const expectedStateOrder = ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE', 'REPAIR', 'VERIFY', 'REPORT'];
  if (JSON.stringify(workflows.states) !== JSON.stringify(expectedStateOrder)) out.errors.push('Workflow states do not match the required state machine');
  for (const workflow of workflows.workflows) {
    for (const ref of workflow.requiredReferences ?? []) if (!fs.existsSync(path.join(root, ref))) out.errors.push(`${workflow.id} requires missing reference: ${ref}`);
    for (const ref of workflow.forbiddenReferences ?? []) if (!fs.existsSync(path.join(root, ref))) out.errors.push(`${workflow.id} forbids unknown reference: ${ref}`);
    for (const [caseId, policy] of Object.entries(workflow.referenceCases ?? {})) {
      for (const ref of policy.requiredReferences ?? []) if (!fs.existsSync(path.join(root, ref))) out.errors.push(`${workflow.id}/${caseId} requires missing reference: ${ref}`);
      for (const ref of policy.forbiddenReferences ?? []) if (!fs.existsSync(path.join(root, ref))) out.errors.push(`${workflow.id}/${caseId} forbids unknown reference: ${ref}`);
    }
    for (const id of workflow.rules ?? []) if (!ruleIds.has(id)) out.errors.push(`${workflow.id} references unknown rule: ${id}`);
    for (const id of workflow.validators ?? []) if (!validatorIds.has(id)) out.errors.push(`${workflow.id} references unknown validator: ${id}`);
    for (const id of workflow.manualGates ?? []) if (!gateIds.has(id)) out.errors.push(`${workflow.id} references unknown manual gate: ${id}`);
    const configuredValidators = new Set(workflow.validators ?? []);
    const configuredManualGates = new Set(workflow.manualGates ?? []);
    for (const id of workflow.rules ?? []) {
      const rule = registry.rules.find((candidate) => candidate.id === id);
      if (!rule?.gate) continue;
      if (rule.gate.kind === 'automatic' && !configuredValidators.has(rule.gate.id)) {
        out.errors.push(`${workflow.id} omits ${rule.gate.id} required by ${id}`);
      }
      if (rule.gate.kind === 'manual' && !configuredManualGates.has(rule.gate.id)) {
        out.errors.push(`${workflow.id} omits ${rule.gate.id} required by ${id}`);
      }
    }
  }
  for (const conflict of sources.conflicts) {
    if (!conflict.resolved) out.errors.push(`Unresolved source conflict: ${conflict.id}`);
    for (const id of conflict.ruleIds ?? []) if (!ruleIds.has(id)) out.errors.push(`${conflict.id} references unknown rule: ${id}`);
  }
  for (const gate of gates.gates) {
    if (!gate.requiredEvidence?.length) out.errors.push(`${gate.id} has no evidence requirements`);
    if (gate.naAllowed && !gate.naWhen) out.errors.push(`${gate.id} permits N/A without naWhen`);
  }
  const guideCoverage = validateGuideCoverage(root);
  out.errors.push(...guideCoverage.errors);
  out.warnings.push(...guideCoverage.warnings);
  out.blocked.push(...guideCoverage.blocked);
  out.evidence.push(...guideCoverage.evidence);
  out.evidence.push(`${registry.rules.length} rules, ${registry.validators.length} validators, ${workflows.workflows.length} workflows, ${gates.gates.length} manual gates`);
  return out;
}

function markdownFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.ace-reports') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.md')) files.push(file);
    }
  };
  walk(root);
  return files;
}

export function validateDocs(root = SKILL_ROOT) {
  const out = result('VAL-DOCS');
  let pkg;
  let exclusions = { files: [] };
  try {
    pkg = readJson('package.json', root);
    exclusions = readJson('rules/maintenance-exclusions.json', root);
  } catch (error) {
    out.errors.push(error.message);
    return out;
  }
  const migration = path.join(root, 'references/migration-notes.md');
  const excluded = new Map(exclusions.files.map((item) => [path.join(root, item.path), item]));
  const stale = ['gpt/', 'SKILL_GPT.md', 'README_GPT.md', 'README_GPT_EN.md', 'GPT mode'];
  for (const file of markdownFiles(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const exclusion = excluded.get(file);
    if (exclusion) {
      out.warnings.push(`${path.relative(root, file)} excluded by owner: ${exclusion.reason}`);
      continue;
    }
    if (file !== migration) {
      for (const pattern of stale) if (text.includes(pattern)) out.errors.push(`${path.relative(root, file)} contains stale route token: ${pattern}`);
    }
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, '');
      if (!target || /^(https?:|mailto:|#|local:)/.test(target)) continue;
      target = target.split('#')[0];
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), target);
      if (!fs.existsSync(resolved)) out.errors.push(`${path.relative(root, file)} has broken link: ${match[1]}`);
    }
    for (const match of text.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
      if (!pkg.scripts?.[match[1]]) out.errors.push(`${path.relative(root, file)} documents missing npm script: ${match[1]}`);
    }
  }
  const skillFile = path.join(root, 'SKILL.md');
  if (fs.existsSync(skillFile)) {
    const skillText = fs.readFileSync(skillFile, 'utf8');
    for (const required of [
      '## Context budget and progressive disclosure',
      'node scripts/ace.mjs workflow <workflow-id> --json',
      'Do not recursively read a repository',
      'For files larger than 20 KiB',
      'Do not create a new scenario, rule export, or report',
    ]) if (!skillText.includes(required)) out.errors.push(`SKILL.md misses context-budget requirement: ${required}`);
    const invariantText = skillText.match(/## Hard invariants\n([\s\S]*?)\n## /u)?.[1] ?? '';
    const invariantNumbers = [...invariantText.matchAll(/^(\d+)\. /gmu)].map((match) => Number(match[1]));
    if (new Set(invariantNumbers).size !== invariantNumbers.length) out.errors.push('SKILL.md hard invariants contain duplicate numbers');
  }
  for (const forbiddenDir of ['gpt', 'legacy/python']) if (fs.existsSync(path.join(root, forbiddenDir))) out.errors.push(`Forbidden legacy directory exists: ${forbiddenDir}`);
  if (fs.existsSync(path.join(root, 'LICENSE')) === false && JSON.stringify(pkg).includes('"license"')) out.errors.push('package.json claims a license but no LICENSE file exists');
  out.evidence.push(`${markdownFiles(root).length} Markdown files checked; ${Object.keys(pkg.scripts ?? {}).length} npm scripts available`);
  return out;
}

function localCalendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateSources(root = SKILL_ROOT, today = localCalendarDate()) {
  const out = result('VAL-SOURCES');
  let data;
  try {
    data = readJson('rules/sources.json', root);
  } catch (error) {
    out.errors.push(error.message);
    return out;
  }
  const seen = new Set();
  for (const source of data.sources ?? []) {
    if (seen.has(source.id)) out.errors.push(`Duplicate source: ${source.id}`);
    seen.add(source.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(source.reviewDue)) out.errors.push(`${source.id} has invalid review dates`);
    else {
      if (source.checkedAt > today) out.errors.push(`${source.id} claims a future check date ${source.checkedAt}`);
      if (source.reviewDue < source.checkedAt) out.errors.push(`${source.id} reviewDue precedes checkedAt`);
      if (source.reviewDue < today) out.errors.push(`${source.id} is stale since ${source.reviewDue}`);
    }
    if (!source.revision || !source.claims?.length) out.errors.push(`${source.id} lacks revision or claims`);
    if (source.url?.startsWith('http')) {
      try {
        const parsed = new URL(source.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) out.errors.push(`${source.id} has unsupported URL protocol`);
      } catch {
        out.errors.push(`${source.id} has invalid URL: ${source.url}`);
      }
      if (/^[a-f0-9]{40}$/.test(source.revision) && !source.url.includes(source.revision)) out.errors.push(`${source.id} URL is not pinned to revision ${source.revision}`);
    }
    if (source.type === 'local-archive') out.errors.push(`ACE-REPO-005 forbids local-archive sources: ${source.id}`);
    if (/^(?:file:|\/|[A-Za-z]:[\\/])/u.test(source.url ?? '')) {
      out.errors.push(`ACE-REPO-005 forbids absolute local source locators: ${source.id} (${source.url})`);
    }
    if (source.url?.startsWith('local:') && source.type !== 'task-contract') {
      const relative = source.url.slice('local:'.length);
      const resolved = path.resolve(root, relative);
      const relation = path.relative(root, resolved);
      const insideRoot = relative && !path.isAbsolute(relative) && relation !== '..' && !relation.startsWith(`..${path.sep}`);
      if (!insideRoot) out.errors.push(`ACE-REPO-005 local source escapes the skill root: ${source.id} (${relative || source.url})`);
    }
    if (source.type === 'task-contract' && source.url !== 'local:task-specification') {
      out.errors.push(`ACE-REPO-005 permits only the non-file task-contract locator local:task-specification: ${source.id}`);
    }
    if (source.type === 'bundled-rule-export') {
      const relative = source.url?.startsWith('local:') ? source.url.slice('local:'.length) : '';
      const file = path.resolve(root, relative);
      const relation = path.relative(root, file);
      const insideRoot = relative && !path.isAbsolute(relative) && relation !== '..' && !relation.startsWith(`..${path.sep}`);
      if (!insideRoot || !fs.existsSync(file)) out.errors.push(`${source.id} bundled export is unavailable: ${relative || source.url}`);
      else if (!source.sha256 || sha256File(file) !== source.sha256) out.errors.push(`${source.id} bundled export SHA-256 mismatch`);
      if (source.sha256 && source.revision !== `sha256:${source.sha256}`) out.errors.push(`${source.id} bundled export revision does not match its SHA-256`);
    }
  }

  const sourceIds = new Set(data.sources?.map((source) => source.id) ?? []);
  const sourceDocs = [path.join(root, 'SKILL.md')];
  const referencesDirectory = path.join(root, 'references');
  if (fs.existsSync(referencesDirectory)) {
    for (const entry of fs.readdirSync(referencesDirectory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'migration-notes.md') sourceDocs.push(path.join(referencesDirectory, entry.name));
    }
  }
  const unknownTokens = new Set();
  for (const file of sourceDocs.filter((candidate) => fs.existsSync(candidate))) {
    const relative = path.relative(root, file);
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bSRC-[A-Z0-9-]+\b/gu)) {
      if (!sourceIds.has(match[0])) unknownTokens.add(`${relative}: ${match[0]}`);
    }
  }
  for (const token of unknownTokens) out.errors.push(`ACE-REPO-005 active source document references unknown source ID: ${token}`);

  const selfContainedFiles = [];
  const collect = (directory, extensions, exclude = () => false) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file, extensions, exclude);
      else if (extensions.has(path.extname(entry.name)) && !exclude(file)) selfContainedFiles.push(file);
    }
  };
  if (fs.existsSync(path.join(root, 'SKILL.md'))) selfContainedFiles.push(path.join(root, 'SKILL.md'));
  collect(path.join(root, 'references'), new Set(['.md']), (file) => path.basename(file) === 'migration-notes.md');
  collect(path.join(root, 'rules'), new Set(['.json']));
  collect(path.join(root, 'schemas'), new Set(['.json']));
  collect(path.join(root, 'scripts'), new Set(['.mjs', '.js']));
  collect(path.join(root, 'evals'), new Set(['.json']));
  collect(path.join(root, 'assets'), new Set(['.json']));
  collect(path.join(root, 'tests/fixtures'), new Set(['.json']), (file) => path.relative(root, file).startsWith(`tests${path.sep}fixtures${path.sep}evidence${path.sep}`));
  const archiveFieldPattern = new RegExp(`\\b(?:${['source', 'Archive'].join('')}|${['source', 'Archive', 'Sha256'].join('')}|${['source', 'Markdown', 'Member'].join('')})\\b`, 'u');
  const zipPattern = new RegExp(`\\.${['z', 'ip'].join('')}\\b`, 'iu');
  const dependencyMarkers = [
    { pattern: archiveFieldPattern, label: 'external-archive metadata' },
    { pattern: /(?:^|["'`\s(])\/(?:home|Users)\/[^\s"'`)\]]+/mu, label: 'absolute home path' },
    { pattern: /\bfile:\/\//iu, label: 'file URL' },
    { pattern: zipPattern, label: 'ZIP dependency' },
  ];
  for (const file of [...new Set(selfContainedFiles)]) {
    const text = fs.readFileSync(file, 'utf8');
    for (const marker of dependencyMarkers) {
      if (marker.pattern.test(text)) out.errors.push(`ACE-REPO-005 ${path.relative(root, file)} contains forbidden ${marker.label}`);
    }
  }
  for (const conflict of data.conflicts ?? []) if (!conflict.resolved || !conflict.verification) out.errors.push(`Unresolved or unverifiable conflict: ${conflict.id}`);
  out.evidence.push(`${data.sources.length} sources, ${data.conflicts.length} conflicts, ${sourceDocs.length} source documents, and ${new Set(selfContainedFiles).size} self-contained files checked at ${today}`);
  return out;
}

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LANGUAGE_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.js', '.txt', '.yaml', '.yml']);
const LANGUAGE_SKIP_DIRECTORIES = new Set(['.git', '.ace-reports', 'node_modules', 'coverage']);
const LANGUAGE_EXCLUDED_FILES = new Set(['README.md', 'README_EN.md']);
const LANGUAGE_EXCEPTION_CATEGORIES = new Set(['regex-literal', 'key-literal', 'test-string', 'source-path', 'ui-literal']);
const LANGUAGE_CATEGORY_PATHS = Object.freeze({
  'regex-literal': [
    '^references/keys-and-regex\\.md$',
    '^scripts/(?:services/style|token_model_map)\\.mjs$',
    '^tests/(?:fixtures/regex|key-fixtures|unit)/.+\\.(?:json|mjs)$',
  ],
  'key-literal': [
    '^assets/lorebook_template\\.json$',
    '^references/(?:keys-and-regex|lorebooks)\\.md$',
    '^tests/(?:fixtures/lorebooks|key-fixtures|unit)/.+\\.(?:json|mjs)$',
  ],
  'test-string': [
    '^evals/.+\\.json$',
    '^references/keys-and-regex\\.md$',
    '^scripts/services/repo-check\\.mjs$',
    '^tests/.+\\.(?:json|mjs|txt)$',
  ],
  'source-path': ['^references/migration-notes\\.md$'],
  'ui-literal': [
    '^references/lorebooks\\.md$',
    '^scripts/lib/st-matching\\.mjs$',
    '^tests/(?:fixtures/regex|unit)/.+\\.(?:json|mjs)$',
  ],
});

function languageFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && LANGUAGE_SKIP_DIRECTORIES.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const relative = path.relative(root, file);
        if (!LANGUAGE_EXCLUDED_FILES.has(relative) && LANGUAGE_EXTENSIONS.has(path.extname(entry.name))) files.push(file);
      }
    }
  };
  walk(root);
  return files.sort();
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function collectCyrillicLines(root = SKILL_ROOT) {
  const rows = [];
  for (const file of languageFiles(root)) {
    const relative = path.relative(root, file);
    fs.readFileSync(file, 'utf8').split(/\r?\n/u).forEach((line, index) => {
      if (CYRILLIC.test(line)) rows.push({ path: relative, line: index + 1, sha256: sha256Text(line), text: line });
    });
  }
  return rows;
}

export function validateLanguage(root = SKILL_ROOT) {
  const out = result('VAL-LANGUAGE');
  let policy;
  try {
    policy = readJson('rules/language-exceptions.json', root);
  } catch (error) {
    out.errors.push(error.message);
    return out;
  }
  const hasCategoryReasons = policy.categoryReasons !== null && typeof policy.categoryReasons === 'object' && !Array.isArray(policy.categoryReasons);
  const hasCategoryPaths = policy.categoryPaths !== null && typeof policy.categoryPaths === 'object' && !Array.isArray(policy.categoryPaths);
  if (policy.version !== '5.0.0' || !Array.isArray(policy.exceptions) || !hasCategoryReasons || !hasCategoryPaths) {
    out.errors.push('rules/language-exceptions.json must declare version 5.0.0, categoryReasons, categoryPaths, and an exceptions array');
    return out;
  }

  for (const category of LANGUAGE_EXCEPTION_CATEGORIES) {
    const reason = policy.categoryReasons[category];
    if (!reason || CYRILLIC.test(reason)) out.errors.push(`Language category ${category} must have an English reason`);
    if (JSON.stringify(policy.categoryPaths[category]) !== JSON.stringify(LANGUAGE_CATEGORY_PATHS[category])) {
      out.errors.push(`Language category ${category} has a broadened or stale path allowlist`);
    }
  }

  const approved = new Map();
  for (const exception of policy.exceptions) {
    const key = `${exception.path}:${exception.line}`;
    if (approved.has(key)) out.errors.push(`Duplicate language exception: ${key}`);
    approved.set(key, exception);
    if (!LANGUAGE_EXCEPTION_CATEGORIES.has(exception.category)) out.errors.push(`${key} has unknown category ${exception.category}`);
    if (!/^[a-f0-9]{64}$/u.test(exception.sha256 ?? '')) out.errors.push(`${key} has invalid line SHA-256`);
    const normalized = path.posix.normalize(String(exception.path ?? '').replaceAll('\\', '/'));
    if (!exception.path || path.isAbsolute(exception.path) || normalized === '..' || normalized.startsWith('../') || normalized !== exception.path) {
      out.errors.push(`${key} has unsafe or non-normalized exception path`);
    }
    const allowedPatterns = LANGUAGE_CATEGORY_PATHS[exception.category] ?? [];
    if (!allowedPatterns.some((pattern) => new RegExp(pattern, 'u').test(exception.path))) {
      out.errors.push(`Language exception category ${exception.category} is not allowed at ${key}`);
    }
  }

  const encountered = new Set();
  const checkedLines = languageFiles(root).reduce((sum, file) => sum + fs.readFileSync(file, 'utf8').split(/\r?\n/u).length, 0);
  for (const row of collectCyrillicLines(root)) {
      const key = `${row.path}:${row.line}`;
      const exception = approved.get(key);
      if (!exception) {
        out.errors.push(`Unapproved Cyrillic text at ${key}`);
        continue;
      }
      encountered.add(key);
      if (row.sha256 !== exception.sha256) out.errors.push(`Language exception hash mismatch at ${key}`);
  }
  for (const [key, exception] of approved) {
    if (encountered.has(key)) continue;
    const file = path.join(root, exception.path);
    if (!fs.existsSync(file)) out.errors.push(`Stale language exception points to missing file: ${key}`);
    else out.errors.push(`Stale language exception has no Cyrillic text at ${key}`);
  }
  out.evidence.push(`${languageFiles(root).length} files and ${checkedLines} lines checked; ${encountered.size} approved technical literals`);
  out.evidence.push('README.md and README_EN.md excluded by the repository owner; all other Cyrillic requires an exact line hash and category');
  return out;
}

function validTransitionSequence(transitions) {
  if (!Array.isArray(transitions)) return false;
  let i = 0;
  for (const state of ['DISCOVER', 'CLASSIFY', 'LOAD', 'PLAN', 'EXECUTE', 'VALIDATE']) if (transitions[i++] !== state) return false;
  let repairs = 0;
  while (transitions[i] === 'REPAIR') {
    repairs += 1;
    i += 1;
    if (transitions[i++] !== 'VALIDATE') return false;
  }
  if (repairs > 5) return false;
  return transitions[i++] === 'VERIFY' && transitions[i++] === 'REPORT' && i === transitions.length;
}

export function validateEvidence(ledger, root = SKILL_ROOT) {
  const out = result('VAL-EVIDENCE');
  const schema = compileSchema('schemas/evidence.schema.json', root, out);
  if (schema && !schema(ledger)) addSchemaErrors(out, 'evidence', schema);
  let registry;
  let workflows;
  let manual;
  try {
    registry = readJson('rules/registry.json', root);
    workflows = readJson('rules/workflows.json', root);
    manual = readJson('rules/manual-gates.json', root);
  } catch (error) {
    out.errors.push(error.message);
    return out;
  }
  const workflow = workflows.workflows.find((item) => item.id === ledger.workflowId);
  if (!workflow) out.errors.push(`Unknown workflowId: ${ledger.workflowId}`);
  if (ledger.overallStatus === 'PASS' || ledger.overallStatus === 'FAIL') {
    if (!/^[0-9a-f]{40}$/.test(ledger.repoHead ?? '')) out.errors.push(`overallStatus ${ledger.overallStatus} requires a 40-hex repoHead`);
  }
  if (ledger.repoHead === 'UNAVAILABLE' && ledger.overallStatus !== 'BLOCKED') {
    out.errors.push('repoHead UNAVAILABLE is allowed only when overallStatus is BLOCKED');
  }
  if (!Array.isArray(ledger.inputs) || ledger.inputs.length === 0 || ledger.inputs.some((input) => typeof input !== 'string' || !input.trim())) {
    out.errors.push('Evidence ledger requires at least one nonempty input');
  }
  if (!validTransitionSequence(ledger.transitions)) out.errors.push('Invalid or incomplete state transition sequence');
  const ruleMap = new Map(registry.rules.map((item) => [item.id, item]));
  const validatorIds = new Set(registry.validators.map((item) => item.id));
  const manualIds = new Set(manual.gates.map((item) => item.id));
  const artifactGateIds = new Set(['VAL-CARD', 'VAL-LORE', 'VAL-STYLE', 'VAL-TOKENS']);
  const loadedRefs = new Map();
  const seenReferencePaths = new Set();
  const seenReferenceFiles = new Map();
  const rootPath = path.resolve(root);
  const realRootPath = fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : rootPath;
  const isInside = (parent, candidate) => {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const references = Array.isArray(ledger.references) ? ledger.references : [];
  for (const [index, record] of references.entries()) {
    if (!record || typeof record !== 'object' || typeof record.path !== 'string' || !record.path.trim()) {
      out.errors.push(`Reference record ${index} has no nonempty path`);
      continue;
    }
    const ref = record.path;
    loadedRefs.set(ref, record);
    if (seenReferencePaths.has(ref)) out.errors.push(`Duplicate reference evidence: ${ref}`);
    else seenReferencePaths.add(ref);
    if (path.isAbsolute(ref)) {
      out.errors.push(`Reference path must be repo-relative: ${ref}`);
      continue;
    }
    const file = path.resolve(rootPath, ref);
    if (!isInside(rootPath, file)) {
      out.errors.push(`Reference path escapes repository root: ${ref}`);
      continue;
    }
    if (seenReferenceFiles.has(file) && seenReferenceFiles.get(file) !== ref) out.errors.push(`Duplicate reference evidence: ${ref} aliases ${seenReferenceFiles.get(file)}`);
    else seenReferenceFiles.set(file, ref);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      out.errors.push(`Referenced file is missing: ${ref}`);
      continue;
    }
    const realFile = fs.realpathSync(file);
    if (!isInside(realRootPath, realFile)) {
      out.errors.push(`Reference path resolves outside repository root: ${ref}`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/.test(record.sha256 ?? '')) out.errors.push(`Reference has invalid SHA-256: ${ref}`);
    else if (record.sha256 !== sha256File(file)) out.errors.push(`Reference hash mismatch: ${ref}`);
    if (typeof record.evidence !== 'string' || !record.evidence.trim()) out.errors.push(`Reference has no read evidence: ${ref}`);
  }
  const referenceCase = workflow?.referenceCases
    ? workflow.referenceCases[ledger.artifactType]
    : null;
  if (workflow?.referenceCases && !referenceCase) out.errors.push(`workflow ${workflow.id} requires artifactType matching one of: ${Object.keys(workflow.referenceCases).join(', ')}`);
  const requiredReferences = [...(workflow?.requiredReferences ?? []), ...(referenceCase?.requiredReferences ?? [])];
  const forbiddenReferences = [...(workflow?.forbiddenReferences ?? []), ...(referenceCase?.forbiddenReferences ?? [])];
  for (const ref of requiredReferences) {
    const record = loadedRefs.get(ref);
    if (!record) out.errors.push(`Missing required reference evidence: ${ref}`);
  }
  for (const ref of forbiddenReferences) if (loadedRefs.has(ref)) out.errors.push(`Forbidden reference was loaded: ${ref}`);
  const gateRecords = new Map();
  for (const gate of ledger.gates ?? []) {
    const key = `${gate.kind}:${gate.gateId}`;
    if (gateRecords.has(key)) out.errors.push(`Duplicate gate evidence: ${gate.gateId}`);
    else gateRecords.set(key, gate);
  }
  const advancedArtifacts = [];
  for (const gate of ledger.gates ?? []) {
    if (gate.kind !== 'automatic' || gate.gateId !== 'VAL-LORE') continue;
    for (const artifact of gate.artifacts ?? []) {
      const file = path.isAbsolute(artifact.path) ? artifact.path : path.join(root, artifact.path);
      if (!fs.existsSync(file) || path.extname(file).toLowerCase() !== '.json') continue;
      try {
        const classification = classifyLorebookWorkflow(JSON.parse(fs.readFileSync(file, 'utf8')));
        if (classification.workflow === 'advanced') advancedArtifacts.push({ path: artifact.path, evidence: classification.evidence });
      } catch {
        // Structural artifact validators own malformed JSON diagnostics.
      }
    }
  }
  if (advancedArtifacts.length && !gateRecords.has('automatic:VAL-SIMULATOR')) {
    out.errors.push(`Advanced lorebook fields require VAL-SIMULATOR evidence: ${advancedArtifacts.map((item) => item.path).join(', ')}`);
  }
  if (workflow) {
    const expectedAutomatic = workflow.validators.filter((id) => !(ledger.scope === 'fast' && (id === 'VAL-EVAL' || id === 'VAL-EVAL-DATA')));
    for (const gateId of expectedAutomatic) {
      const gate = gateRecords.get(`automatic:${gateId}`);
      if (!gate) out.errors.push(`Missing required automatic gate evidence: ${gateId}`);
    }
    for (const gateId of workflow.manualGates) {
      const gate = gateRecords.get(`manual:${gateId}`);
      if (!gate) out.errors.push(`Missing required manual gate evidence: ${gateId}`);
    }
    for (const ruleId of workflow.rules) {
      const rule = ruleMap.get(ruleId);
      if (!rule?.gate || (ledger.scope === 'fast' && (rule.gate.id === 'VAL-EVAL' || rule.gate.id === 'VAL-EVAL-DATA'))) continue;
      const gate = gateRecords.get(`${rule.gate.kind}:${rule.gate.id}`);
      if (gate && !(gate.ruleIds ?? []).includes(ruleId)) out.errors.push(`${gate.gateId} does not evidence applicable rule ${ruleId}`);
    }
  }
  for (const gate of ledger.gates ?? []) {
    if (gate.kind === 'automatic' && !validatorIds.has(gate.gateId)) out.errors.push(`Unknown automatic gate: ${gate.gateId}`);
    if (gate.kind === 'manual' && !manualIds.has(gate.gateId)) out.errors.push(`Unknown manual gate: ${gate.gateId}`);
    for (const id of gate.ruleIds ?? []) if (!ruleMap.has(id)) out.errors.push(`${gate.gateId} references unknown rule: ${id}`);
    for (const artifact of gate.artifacts ?? []) {
      const file = path.isAbsolute(artifact.path) ? artifact.path : path.join(root, artifact.path);
      if (!fs.existsSync(file)) out.errors.push(`${gate.gateId} checked missing artifact: ${artifact.path}`);
      else if (artifact.sha256 !== sha256File(file)) out.errors.push(`${gate.gateId} artifact hash mismatch: ${artifact.path}`);
    }
    if (!gate.evidence?.trim()) out.errors.push(`${gate.gateId} lacks evidence`);
    if (gate.status === 'PASS' && gate.kind === 'automatic') {
      if (!gate.command || !gate.cwd || gate.exitCode !== 0) out.errors.push(`${gate.gateId} has PASS without successful command evidence`);
      if (typeof gate.cwd !== 'string' || !path.isAbsolute(gate.cwd)) out.errors.push(`${gate.gateId} has automatic PASS without an absolute cwd`);
      const attempts = gate.attempts ?? [];
      if (!attempts.length) out.errors.push(`${gate.gateId} has automatic PASS without a recorded command attempt`);
      else if (!attempts.some((attempt) => attempt.exitCode === 0 && typeof attempt.stdout === 'string' && typeof attempt.stderr === 'string' && `${attempt.stdout}${attempt.stderr}`.trim())) {
        out.errors.push(`${gate.gateId} has automatic PASS without a successful transcript/log attempt`);
      }
      if (artifactGateIds.has(gate.gateId) && !(gate.artifacts?.length > 0)) out.errors.push(`${gate.gateId} has PASS without an artifact SHA-256 record`);
    }
    if (gate.status === 'PASS' && gate.kind === 'manual') {
      if (!gate.reviewerRunId || gate.reviewerRunId === ledger.runId) out.errors.push(`${gate.gateId} has manual PASS without independent reviewerRunId`);
      const policy = manual.gates.find((candidate) => candidate.id === gate.gateId);
      const records = gate.reviewEvidence ?? [];
      for (const criterion of policy?.requiredEvidence ?? []) {
        const record = records.find((candidate) => candidate.criterion === criterion);
        if (!record?.evidence?.trim()) out.errors.push(`${gate.gateId} lacks structured manual evidence for: ${criterion}`);
      }
    }
    if (gate.status === 'FAIL' && gate.kind === 'automatic' && (!Number.isInteger(gate.exitCode) || gate.exitCode === 0 || gate.exitCode === 3)) out.errors.push(`${gate.gateId} FAIL is inconsistent with exitCode ${gate.exitCode}`);
    if (gate.status === 'BLOCKED' && gate.kind === 'automatic' && gate.exitCode !== 3) out.errors.push(`${gate.gateId} BLOCKED is inconsistent with exitCode ${gate.exitCode}`);
    if (gate.status === 'N/A') {
      if (!gate.naReason?.trim()) out.errors.push(`${gate.gateId} has N/A without reason`);
      for (const id of gate.ruleIds ?? []) if (!ruleMap.get(id)?.naAllowed) out.errors.push(`${gate.gateId} marks non-optional ${id} N/A`);
      if (gate.kind === 'manual') {
        const policy = manual.gates.find((candidate) => candidate.id === gate.gateId);
        if (!policy?.naAllowed || !policy.naWhen) out.errors.push(`${gate.gateId} has no manual N/A policy`);
      }
    }
    if (gate.status === 'FAIL' && gate.correction && !(gate.attempts?.length > 1)) out.errors.push(`${gate.gateId} claims repair without a rerun attempt`);
  }
  const statuses = (ledger.gates ?? []).map((gate) => gate.status);
  const derivedStatus = statuses.includes('BLOCKED') ? 'BLOCKED' : statuses.includes('FAIL') ? 'FAIL' : 'PASS';
  if (ledger.overallStatus !== derivedStatus) {
    if (ledger.overallStatus === 'PASS' && derivedStatus !== 'PASS') out.errors.push('overallStatus PASS contains FAIL or BLOCKED gate');
    else out.errors.push(`overallStatus ${ledger.overallStatus} is inconsistent with gate-derived ${derivedStatus}`);
  }
  if (ledger.overallStatus === 'PASS' && out.errors.length) out.errors.push('overallStatus PASS is invalid because evidence validation failed');
  out.evidence.push(`${ledger.gates?.length ?? 0} gates and ${ledger.references?.length ?? 0} references checked`);
  if (advancedArtifacts.length) out.evidence.push(`${advancedArtifacts.length} advanced lorebook artifact(s) required simulator workflow`);
  return out;
}

export function validateSkillFrontmatter(root = SKILL_ROOT) {
  const out = result('VAL-FRONTMATTER');
  const file = path.join(root, 'SKILL.md');
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    out.errors.push('SKILL.md lacks YAML frontmatter');
    return out;
  }
  let meta;
  try { meta = YAML.parse(match[1]); } catch (error) { out.errors.push(`Invalid YAML: ${error.message}`); return out; }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.name ?? '') || meta.name.length > 64) out.errors.push('Invalid skill name');
  if (typeof meta.description !== 'string' || !meta.description.trim() || meta.description.length > 1024) out.errors.push('Invalid skill description');
  const lines = text.split('\n').length;
  const words = text.match(/\S+/g)?.length ?? 0;
  if (lines > 500) out.errors.push(`SKILL.md has ${lines} lines; maximum is 500`);
  if (words > 5000) out.errors.push(`SKILL.md has approximately ${words} tokens/words; maximum is 5000`);
  out.evidence.push(`name=${meta.name}; description=${meta.description.length} chars; ${lines} lines; ${words} words`);
  return out;
}

export function checkSyntax(root = SKILL_ROOT) {
  const out = result('VAL-SYNTAX');
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.mjs')) files.push(file);
    }
  };
  walk(path.join(root, 'scripts'));
  walk(path.join(root, 'evals'));
  for (const file of files) {
    const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    if (run.error) out.blocked.push(`${path.relative(root, file)} could not be syntax-checked: ${run.error.message}`);
    else if (run.status !== 0) out.errors.push(`${path.relative(root, file)}: ${(run.stderr || run.stdout).trim()}`);
  }
  out.evidence.push(`${files.length} JavaScript modules syntax-checked`);
  return out;
}

export function printValidation(out, json = false) {
  const status = out.blocked?.length ? 'BLOCKED' : out.errors.length ? 'FAIL' : 'PASS';
  if (json) console.log(JSON.stringify({ ...out, status }, null, 2));
  else {
    console.log(`${status}: ${out.id}`);
    for (const item of out.evidence) console.log(`  EVIDENCE: ${item}`);
    for (const item of out.warnings) console.log(`  WARN: ${item}`);
    for (const item of out.errors) console.error(`  ERROR: ${item}`);
    for (const item of out.blocked ?? []) console.error(`  BLOCKED: ${item}`);
  }
  return out.blocked?.length ? 3 : out.errors.length ? 1 : 0;
}
