import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const releaseFiles = JSON.parse(read('release-files.json'));
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(manifest.manifest_version === 3, 'manifest must use MV3');
ok(manifest.version === '0.6.0', 'manifest version must be 0.6.0');
ok(JSON.stringify([...manifest.permissions].sort()) === JSON.stringify(['alarms','notifications','scripting','storage']), 'required permissions drifted');
ok(JSON.stringify(manifest.host_permissions) === '["https://chatgpt.com/*"]', 'required host access must be ChatGPT only');
ok(JSON.stringify(manifest.optional_host_permissions) === '["https://*/*"]', 'optional HTTPS host permission declaration drifted');
ok(!manifest.optional_host_permissions.some(pattern => pattern.startsWith('http://')), 'HTTP optional host access must not ship');
ok(!manifest.web_accessible_resources, 'web-accessible extension resources are unnecessary');
ok(manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'none'; base-uri 'none'", 'extension CSP is missing or unsafe');
ok(!JSON.stringify(manifest).includes('<all_urls>'), 'broad all-URLs access must not ship');

const requiredDocs = ['README.md','LICENSE','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','TESTING.md','.gitignore'];
for (const file of [...releaseFiles, ...requiredDocs, 'package.json', 'worker-example.js']) ok(fs.existsSync(path.join(root, file)), `missing ${file}`);

const packageJson = JSON.parse(read('package.json'));
ok(packageJson.version === manifest.version || packageJson.version.startsWith(manifest.version + "-"), "package and manifest versions disagree");
ok(read("scripts/package.mjs").includes("packageJson.version"), "package filename must use the package version");
ok(Object.keys(packageJson).every(key => !['dependencies','devDependencies','optionalDependencies'].includes(key)), 'runtime/build dependencies are not expected');

for (const [file, size] of [['icons/icon16.png',16],['icons/icon32.png',32],['icons/icon48.png',48],['icons/icon128.png',128]]) {
  const png = fs.readFileSync(path.join(root, file));
  ok(png.subarray(1,4).toString() === 'PNG', `${file} is not PNG`);
  ok(png.readUInt32BE(16) === size && png.readUInt32BE(20) === size, `${file} dimensions are not ${size}x${size}`);
  ok([4,6].includes(png[25]), `${file} does not declare an alpha channel`);
}

for (const htmlFile of ['popup.html','dashboard.html','onboarding.html','privacy.html']) {
  const html = read(htmlFile);
  ok(!/<script[^>]+src=["']https?:/i.test(html), `${htmlFile} loads remote executable code`);
  ok(!/<script(?![^>]+src=)[^>]*>/i.test(html), `${htmlFile} contains inline script`);
  ok(!/\son\w+\s*=/i.test(html), `${htmlFile} contains inline event handlers`);
}

for (const jsFile of ['background.js','core.js','popup.js','dashboard.js','help.js','overlay.js','onboarding.js']) {
  const js = read(jsFile);
  ok(!/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|\beval\s*\(|new\s+Function\b/.test(js), `${jsFile} contains an unsafe HTML/code execution sink`);
}

for (const [htmlFile, jsFile] of [['popup.html','popup.js'],['dashboard.html','dashboard.js']]) {
  const ids = new Set([...read(htmlFile).matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  const refs = new Set([...read(jsFile).matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match => match[1]));
  for (const id of refs) ok(ids.has(id), `${jsFile} references missing #${id}`);
}

const textFiles = walk(root).filter(file => !file.includes(`${path.sep}release${path.sep}`) && !file.includes(`${path.sep}.git${path.sep}`) && !file.endsWith('.png') && !file.endsWith('.zip'));
const publicText = textFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
for (const [pattern, label] of [
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub PAT'],
  [/ghp_[A-Za-z0-9]{30,}/, 'legacy GitHub token'],
  [/xkeysib-[A-Za-z0-9_-]{10,}/, 'Brevo key'],
  [/sk-[A-Za-z0-9]{24,}/, 'API key'],
  [/https:\/\/(?:canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/, 'Discord webhook'],
  [/https:\/\/api\.telegram\.org\/bot\d+:[A-Za-z0-9_-]+/, 'Telegram bot URL'],
  [/alerts-api\.optiqo\.dev/i, 'private relay URL']
]) ok(!pattern.test(publicText), `possible ${label} leaked`);

ok(read('.gitignore').split(/\r?\n/).includes('.env'), '.env must be ignored');
ok(read('background.js').includes('emailRelayUrl: ""'), 'public build must not default to a relay');
ok(read('background.js').includes('privacyAcknowledged: false'), 'remote access must wait for first-run disclosure');
ok(read('background.js').includes('describeShape(raw)'), 'diagnostics should retain response shape, not raw response values');
ok(read('worker-example.js').includes('const EVENTS = new Set'), 'email Worker must restrict event types');
ok(!/body\.(?:to|recipient|email)/.test(read('worker-example.js')), 'email Worker must not accept arbitrary recipients');
ok(read('PRIVACY.md').includes('internal') || read('PRIVACY.md').includes('undocumented'), 'privacy policy must disclose endpoint instability');
ok(read('README.md').includes('not affiliated') || read('README.md').includes('not an official'), 'README must include non-affiliation language');

if (failures.length) {
  console.error(`QA failures:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Static public-release QA passed (${releaseFiles.length} packaged files checked)`);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules','release','.git'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else files.push(target);
  }
  return files;
}
