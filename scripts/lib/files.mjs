import fs from 'node:fs';
import path from 'node:path';

export function readTextFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
  return { resolved, text: fs.readFileSync(resolved, 'utf8'), size: stat.size };
}

export function readJsonFile(filePath) {
  const file = readTextFile(filePath);
  try {
    return { ...file, data: JSON.parse(file.text) };
  } catch (error) {
    error.message = `Invalid JSON in ${filePath}: ${error.message}`;
    throw error;
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getByPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}
