import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseZipArchive, verifyInputs } from '../../verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['.git', 'node_modules', '.ace-reports']);

const CRC_TABLE = (() => {
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
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zipStore(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, contentValue] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const content = Buffer.isBuffer(contentValue) ? contentValue : Buffer.from(contentValue);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function repositoryEntries(prefix = 'ace-skill') {
  const entries = [];
  const walk = (directory, relative = '') => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (SKIP.has(item.name)) continue;
      const absolute = path.join(directory, item.name);
      const child = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) walk(absolute, child);
      else if (item.isFile()) entries.push([`${prefix}/${child}`, fs.readFileSync(absolute)]);
    }
  };
  walk(ROOT);
  return entries;
}

test('dependency-free web precheck passes the installed skill and a nested supplied path', () => {
  const rootReport = verifyInputs([ROOT]);
  assert.equal(rootReport.status, 'PASS', JSON.stringify(rootReport, null, 2));
  const nestedReport = verifyInputs([path.join(ROOT, 'scripts')]);
  assert.equal(nestedReport.status, 'PASS', JSON.stringify(nestedReport, null, 2));
});

test('dependency-free web precheck validates a nested ZIP without extraction', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-web-zip-'));
  const zipPath = path.join(directory, 'uploaded skill.zip');
  fs.writeFileSync(zipPath, zipStore(repositoryEntries('uploads/ace-skill')));
  const report = verifyInputs([zipPath]);
  assert.equal(report.status, 'PASS', JSON.stringify(report, null, 2));
  assert.equal(report.bundles[0].kind, 'zip');
  assert.equal(report.bundles[0].skills[0].root, 'uploads/ace-skill');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('ZIP parser rejects path traversal before skill validation', () => {
  const archive = zipStore([['../outside.txt', 'unsafe']]);
  assert.throws(() => parseZipArchive(archive, 'unsafe.zip'), /path traversal/u);
});

test('web precheck fails closed when an integrity manifest requirement is absent', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-web-broken-'));
  fs.writeFileSync(path.join(directory, 'SKILL.md'), '---\nname: ace-skill\ndescription: broken fixture\n---\n');
  fs.writeFileSync(path.join(directory, 'verification-manifest.json'), JSON.stringify({
    skillName: 'ace-skill',
    requiredFiles: ['SKILL.md', 'missing.txt'],
  }));
  const report = verifyInputs([directory]);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.bundles[0].skills[0].checks.some((row) => row.id === 'WEB-STRUCTURE' && row.status === 'FAIL'));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('packaged working directories are rejected while local working directories are ignored', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-web-baggage-'));
  const zipPath = path.join(directory, 'baggage.zip');
  fs.writeFileSync(zipPath, zipStore([
    ...repositoryEntries('ace-skill'),
    ['ace-skill/node_modules/example/index.js', 'module.exports = true;'],
  ]));
  const report = verifyInputs([zipPath]);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.bundles[0].skills[0].checks.some((row) => row.id === 'WEB-PORTABILITY' && row.status === 'FAIL'));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('signed release hashes detect modified skill files inside a valid ZIP', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-web-hash-'));
  const zipPath = path.join(directory, 'modified.zip');
  const entries = repositoryEntries('ace-skill').map(([name, content]) => [
    name,
    name === 'ace-skill/SKILL.md' ? Buffer.from(`${content.toString('utf8')}\nmodified\n`) : content,
  ]);
  fs.writeFileSync(zipPath, zipStore(entries));
  const report = verifyInputs([zipPath]);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.bundles[0].skills[0].checks.some((row) => row.id === 'WEB-RELEASE-HASHES' && row.status === 'FAIL'));
  fs.rmSync(directory, { recursive: true, force: true });
});
