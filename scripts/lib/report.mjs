export class Issue {
  constructor(severity, message, {
    code = null,
    ruleId = null,
    field = null,
    entryId = null,
    path = null,
    details = null,
  } = {}) {
    this.severity = severity;
    this.message = message;
    this.code = code;
    this.ruleId = ruleId;
    this.field = field;
    this.entryId = entryId;
    this.path = path;
    this.details = details;
  }

  format() {
    const loc = this.entryId === null || this.entryId === undefined ? '[root]' : `[entry id=${this.entryId}]`;
    const fld = this.field ? ` .${this.field}` : '';
    const code = this.code ? ` ${this.code}` : '';
    return `  [${this.severity}${code}] ${loc}${fld}: ${this.message}`;
  }

  toJSON() {
    return Object.fromEntries(Object.entries({
      severity: this.severity,
      code: this.code,
      ruleId: this.ruleId,
      message: this.message,
      field: this.field,
      entryId: this.entryId,
      path: this.path,
      details: this.details,
    }).filter(([, value]) => value !== null && value !== undefined));
  }
}

export class Report {
  constructor(title = 'Validation Report', { service = 'ace', operation = 'validate' } = {}) {
    this.title = title;
    this.service = service;
    this.operation = operation;
    this.errors = [];
    this.warnings = [];
    this.blockers = [];
    this.info = [];
    this.evidence = [];
    this.data = {};
  }

  error(message, opts = {}) {
    this.errors.push(new Issue('ERROR', message, opts));
  }

  warn(message, opts = {}) {
    this.warnings.push(new Issue('WARN', message, opts));
  }

  block(message, opts = {}) {
    this.blockers.push(new Issue('BLOCKED', message, opts));
  }

  addInfo(message) {
    this.info.push(message);
  }

  addEvidence(evidence) {
    if (evidence !== null && evidence !== undefined) this.evidence.push(evidence);
  }

  setData(data) {
    this.data = data ?? {};
    return this;
  }

  valid() {
    return this.errors.length === 0 && this.blockers.length === 0;
  }

  status() {
    if (this.blockers.length) return 'BLOCKED';
    if (this.errors.length) return 'FAIL';
    return 'PASS';
  }

  exitCode() {
    if (this.blockers.length) return 3;
    if (this.errors.length) return 1;
    return 0;
  }

  toJSON({ data = this.data, evidence = this.evidence, meta = {} } = {}) {
    return {
      service: this.service,
      operation: this.operation,
      title: this.title,
      status: this.status(),
      ok: this.valid(),
      exitCode: this.exitCode(),
      errors: this.errors.map((issue) => issue.toJSON()),
      warnings: this.warnings.map((issue) => issue.toJSON()),
      blockers: this.blockers.map((issue) => issue.toJSON()),
      info: [...this.info],
      evidence: [...evidence],
      data,
      meta,
    };
  }

  print() {
    console.log('');
    console.log('='.repeat(68));
    console.log(`  ${this.title}`);
    console.log('='.repeat(68));
    for (const item of this.info) console.log(`  [INFO] ${item}`);
    if (this.info.length) console.log('');
    for (const issue of this.errors) console.log(issue.format());
    if (this.errors.length) console.log('');
    for (const issue of this.blockers) console.log(issue.format());
    if (this.blockers.length) console.log('');
    for (const issue of this.warnings) console.log(issue.format());
    if (this.warnings.length) console.log('');
    console.log('-'.repeat(68));
    console.log(`  Errors:   ${this.errors.length}`);
    console.log(`  Blocked:  ${this.blockers.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    console.log(`  Info:     ${this.info.length}`);
    console.log(`  Result:   ${this.status()}`);
    console.log('='.repeat(68));
    console.log('');
  }
}

export function resultFromReport(report, options = {}) {
  if (!(report instanceof Report)) throw new TypeError('resultFromReport expects a Report instance');
  return report.toJSON(options);
}
