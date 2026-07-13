# ACE verification entry points

Use the smallest applicable check.

## Uploaded ZIP, extracted folder, or installed skill

Run the dependency-free precheck from the skill root:

```bash
node verify.mjs
```

You may also point it at a ZIP, an extracted parent directory containing one or
more skills, or any file/folder inside an installed skill:

```bash
node verify.mjs path/to/skill-or-parent
node verify.mjs path/to/skill.zip
node verify.mjs --json path/to/input
```

The precheck uses one Node process, built-in modules only, no network, no npm
installation, and no generated report directory unless `--report FILE` is
requested. It checks package integrity, immutable README hashes, JSON, local
Markdown links, critical Outlet evidence, and release-gate structure.

`ACE WEB PRECHECK: PASS` is a structural precheck. It is never a full release
PASS.

## Local and release checks

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check:local
npm run check:all
npm run check:runtime
```

- `check:local` runs the existing fast local gate and may create `.ace-reports/`.
- `check:all` is the complete local release gate.
- `check:runtime` requires the external model runner and may report BLOCKED.

Do not upload `node_modules/`, `.git/`, `.ace-reports/`, or historical evidence
with the operational skill.
