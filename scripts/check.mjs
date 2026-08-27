import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syntaxFiles } from './file-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

for (const file of syntaxFiles) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    failures.push(`${file}: file does not exist`);
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', absolute], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: ${result.stderr || result.stdout || 'syntax check failed'}`.trim());
}

if (failures.length) {
  console.error(`Syntax check failures:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Syntax check passed (${syntaxFiles.length} JavaScript files)`);
