import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = JSON.parse(fs.readFileSync(path.join(root, 'release-files.json'), 'utf8')).slice().sort();
const releaseDir = path.join(root, 'release');
if (!packageJson.version || !(packageJson.version === manifest.version || packageJson.version.startsWith(manifest.version + "-"))) {
  throw new Error("package.json and manifest.json versions are incompatible");
}
const output = path.join(releaseDir, "capacity-monitor-for-codex-" + packageJson.version + ".zip");
const fixedTime = dosDateTime(new Date('2026-01-01T00:00:00Z'));

const entries = files.map(name => {
  const normalized = name.replaceAll('\\', '/');
  const absolute = path.resolve(root, name);
  if (!absolute.startsWith(root + path.sep) || !fs.statSync(absolute).isFile()) throw new Error(`Invalid release file: ${name}`);
  const data = fs.readFileSync(absolute);
  return { name: normalized, nameBytes: Buffer.from(normalized), data, crc: crc32(data) };
});

let offset = 0;
const localParts = [];
const centralParts = [];
for (const entry of entries) {
  const local = Buffer.alloc(30 + entry.nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8); local.writeUInt16LE(fixedTime.time, 10); local.writeUInt16LE(fixedTime.date, 12);
  local.writeUInt32LE(entry.crc, 14); local.writeUInt32LE(entry.data.length, 18); local.writeUInt32LE(entry.data.length, 22);
  local.writeUInt16LE(entry.nameBytes.length, 26); local.writeUInt16LE(0, 28); entry.nameBytes.copy(local, 30);
  localParts.push(local, entry.data);

  const central = Buffer.alloc(46 + entry.nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(fixedTime.time, 12); central.writeUInt16LE(fixedTime.date, 14);
  central.writeUInt32LE(entry.crc, 16); central.writeUInt32LE(entry.data.length, 20); central.writeUInt32LE(entry.data.length, 24);
  central.writeUInt16LE(entry.nameBytes.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
  entry.nameBytes.copy(central, 46); centralParts.push(central);
  offset += local.length + entry.data.length;
}

const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);

fs.mkdirSync(releaseDir, { recursive: true });
const archive = Buffer.concat([...localParts, ...centralParts, end]);
fs.writeFileSync(output, archive);
const hash = crypto.createHash('sha256').update(archive).digest('hex');
fs.writeFileSync(`${output}.sha256`, `${hash}  ${path.basename(output)}\n`);

const packaged = listCentralEntries(archive).sort();
if (JSON.stringify(packaged) !== JSON.stringify(files)) throw new Error('ZIP entry verification failed');
console.log(`Packaged ${entries.length} files: ${path.relative(root, output)}`);
console.log(`SHA-256 ${hash}`);

function dosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return { date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(), time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2) };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function listCentralEntries(buffer) {
  const names = [];
  for (let index = 0; index <= buffer.length - 46; index++) {
    if (buffer.readUInt32LE(index) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(index + 28), extraLength = buffer.readUInt16LE(index + 30), commentLength = buffer.readUInt16LE(index + 32);
    names.push(buffer.subarray(index + 46, index + 46 + nameLength).toString());
    index += 45 + nameLength + extraLength + commentLength;
  }
  return names;
}
