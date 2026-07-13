import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateLanguage } from '../../scripts/lib/enforcement.mjs';
import { makeRepoFixture, readJson, removeFixture, ROOT, writeJson } from '../helpers/repo-fixture.mjs';

test('active skill text satisfies the English-only policy', () => {
  const result = validateLanguage(ROOT);
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.match(result.evidence.join('\n'), /approved technical literals/);
});

test('unapproved Cyrillic prose fails closed', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  fs.writeFileSync(path.join(root, 'references/unapproved.md'), '# Заголовок не на английском\n');
  const errors = validateLanguage(root).errors.join('\n');
  assert.match(errors, /Unapproved Cyrillic text at references\/unapproved\.md:1/);
});

test('stale or altered language exceptions are rejected', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const policy = readJson('rules/language-exceptions.json', root);
  policy.exceptions.push({
    path: 'SKILL.md',
    line: 1,
    sha256: '0'.repeat(64),
    category: 'test-string',
  });
  writeJson('rules/language-exceptions.json', policy, root);
  assert.match(validateLanguage(root).errors.join('\n'), /Stale language exception|hash mismatch/);
});

test('Cyrillic prose in SKILL cannot be disguised as a test-string exception', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const skillPath = path.join(root, 'SKILL.md');
  const lines = fs.readFileSync(skillPath, 'utf8').split(/\r?\n/u);
  const forged = '# \u042d\u0442\u043e \u0440\u0443\u0441\u0441\u043a\u0430\u044f \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f';
  lines.push(forged);
  fs.writeFileSync(skillPath, lines.join('\n'));
  const policy = readJson('rules/language-exceptions.json', root);
  policy.exceptions.push({
    path: 'SKILL.md',
    line: lines.length,
    sha256: crypto.createHash('sha256').update(forged, 'utf8').digest('hex'),
    category: 'test-string',
  });
  writeJson('rules/language-exceptions.json', policy, root);
  assert.match(validateLanguage(root).errors.join('\n'), /category test-string is not allowed at SKILL\.md/);
});

test('language category path allowlists cannot be broadened in policy data', (t) => {
  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const policy = readJson('rules/language-exceptions.json', root);
  policy.categoryPaths['test-string'].push('^SKILL\\.md$');
  writeJson('rules/language-exceptions.json', policy, root);
  assert.match(validateLanguage(root).errors.join('\n'), /test-string has a broadened or stale path allowlist/);
});
