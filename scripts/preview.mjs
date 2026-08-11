import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.CODEX_CAPACITY_PREVIEW_PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.json':'application/json; charset=utf-8' };

http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  const pathname = requestUrl.pathname;
  const requested = pathname === '/' ? '/dashboard.html' : pathname;
  const absolute = path.resolve(root, `.${requested}`);
  if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not found'); return;
  }
  let body = fs.readFileSync(absolute);
  if (absolute.endsWith('.html') && ['popup.html','dashboard.html','onboarding.html','privacy.html'].includes(path.basename(absolute))) {
    const theme = requestUrl.searchParams.get('theme');
    const override = theme === 'light' ? '<style>:root{color-scheme:light;--bg:#fff;--text:#171717;--muted:#6b6b6b;--surface:#fff;--surface-soft:#f5f5f5;--soft:#f5f5f5;--border:#d8d8d8;--border-soft:#e8e8e8;--control-bg:#fff;--control-text:#171717;--primary-bg:#1177ff;--primary-bg-2:#0d63d8;--primary-text:#fff;--hover:#f1f1f1;--focus:#1769e0}</style>' : '';
    body = Buffer.from(body.toString().replace('</head>', `<script src="/scripts/mock-chrome.js"></script>${override}</head>`));
  }
  response.writeHead(200, { 'content-type': mime[path.extname(absolute)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(body);
}).listen(port, host, () => console.log(`Preview ready at http://${host}:${port}`));
