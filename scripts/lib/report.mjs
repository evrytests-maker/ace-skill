export class Issue {
  constructor(severity, message, { field = null, entryId = null } = {}) {
    this.severity = severity;
    this.message = message;
    this.field = field;
    this.entryId = entryId;
  }

  format() {
    const loc = this.entryId === null || this.entryId === undefined ? '[root]' : `[entry id=${this.entryId}]`;
    const fld = this.field ? ` .${this.field}` : '';
    return `  [${this.severity}] ${loc}${fld}: ${this.message}`;
  }
}

export class Report {
  constructor(title = 'Validation Report') {
    this.title = title;
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  error(message, opts = {}) {
    this.errors.push(new Issue('ERROR', message, opts));
  }

  warn(message, opts = {}) {
    this.warnings.push(new Issue('WARN', message, opts));
  }

  addInfo(message) {
    this.info.push(message);
  }

  valid() {
    return this.errors.length === 0;
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
    for (const issue of this.warnings) console.log(issue.format());
    if (this.warnings.length) console.log('');
    console.log('-'.repeat(68));
    console.log(`  Errors:   ${this.errors.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    console.log(`  Info:     ${this.info.length}`);
    console.log(`  Result:   ${this.valid() ? 'VALID' : 'INVALID'}`);
    console.log('='.repeat(68));
    console.log('');
  }
}
