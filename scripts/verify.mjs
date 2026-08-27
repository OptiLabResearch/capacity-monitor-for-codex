import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseVerification = process.argv.includes('--release');
const steps = [
  ['syntax', 'scripts/check.mjs'],
  ['deterministic tests', 'tests.mjs'],
  ['static QA', 'qa.mjs'],
  ['package', 'scripts/package.mjs']
];

for (const [label, script] of steps) runStep(label, script);

if (releaseVerification) {
  const firstHash = readPackageHash();
  runStep('deterministic package repeat', 'scripts/package.mjs');
  const secondHash = readPackageHash();
  if (firstHash !== secondHash) {
    console.error(`[verify] package hash changed: ${firstHash} -> ${secondHash}`);
    process.exit(1);
  }
  console.log(`[verify] deterministic package hash confirmed: ${secondHash}`);
}

console.log(`[verify] ${releaseVerification ? 'release' : 'default'} verification passed`);

function runStep(label, script) {
  console.log(`[verify] ${label}`);
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`[verify] ${label} failed`);
    process.exit(result.status || 1);
  }
}

function readPackageHash() {
  const artifact = path.join(
    root,
    'release',
    packageJson.version,
    `capacity-monitor-for-codex-${packageJson.version}.zip.sha256`
  );
  return fs.readFileSync(artifact, 'utf8').trim().split(/\s+/)[0];
}
