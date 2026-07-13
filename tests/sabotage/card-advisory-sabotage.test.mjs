import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRuleSystem } from '../../scripts/lib/enforcement.mjs';
import { auditTokenBudget } from '../../scripts/services/tokens.mjs';
import {
  makeRepoFixture,
  readJson,
  removeFixture,
  writeJson,
} from '../helpers/repo-fixture.mjs';

test('ST-CC-TOTAL-NONBLOCKING-S: an out-of-range card stays PASS and an advisory cannot be promoted to MUST', async (t) => {
  const result = await auditTokenBudget({ description: 'card text' }, {
    encoder: () => Array.from({ length: 699 }),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.warnings[0]?.ruleId, 'ACE-CARD-005');

  const root = makeRepoFixture();
  t.after(() => removeFixture(root));
  const registry = readJson('rules/registry.json', root);
  registry.rules.find((rule) => rule.id === 'ACE-CARD-005').level = 'MUST';
  writeJson('rules/registry.json', registry, root);
  assert.match(validateRuleSystem(root).errors.join('\n'), /advisory rule cannot be MUST/u);
});
