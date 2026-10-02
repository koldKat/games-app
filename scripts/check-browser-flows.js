#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { renderKatalog, renderSignal } = require('../server/katalog-pages');
const { renderIndex } = require('../server/forum-pages');

const root = path.resolve(__dirname, '..');
const executable = process.env.BROWSER_PATH;
if (!executable) throw new Error('Set BROWSER_PATH to a Chromium executable to run isolated browser-flow checks.');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const fixture = fs.readFileSync(path.join(root, 'test/client/app-flow.fixture'));
const fixtures = {
  '/fixtures/katalog.html': renderKatalog({ result: { entries: [], total: 0, page: 1, pages: 1 }, platforms: [] }),
  '/fixtures/signal.html': renderSignal(),
  '/fixtures/forum.html': renderIndex({ categories: [], recent: [] }),
};
let resolveReport;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/report') {
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => { res.end('ok'); resolveReport(JSON.parse(body)); }); return;
  }
  if (url.pathname === '/' || url.pathname === '/signal') {
    res.setHeader('Content-Type', 'text/html'); res.end(html.replace('</body>', '<script type="module" src="/flow.js"></script></body>')); return;
  }
  if (url.pathname === '/flow.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(fixture); return; }
  if (fixtures[url.pathname]) { res.setHeader('Content-Type', 'text/html'); res.end(fixtures[url.pathname]); return; }
  const filename = path.resolve(root, 'public', '.' + url.pathname);
  if (!filename.startsWith(path.join(root, 'public') + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filename, (error, contents) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'image/svg+xml'); res.end(contents);
  });
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    for (const [mode, pathname, size] of [['guest', '/', '1440,1000'], ['restored', '/signal', '1440,1000'], ['mobile', '/', '390,844']]) {
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamekat-browser-'));
      const report = new Promise(resolve => { resolveReport = resolve; });
      const browser = spawn(executable, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--user-data-dir=${profile}`, `--window-size=${size}`, `http://127.0.0.1:${port}${pathname}?mode=${mode}`], { stdio: 'ignore', detached: process.platform !== 'win32' });
      const exited = new Promise(resolve => browser.once('close', resolve));
      const failed = new Promise((_, reject) => browser.once('error', reject));
      let timer;
      try {
        const result = await Promise.race([report, failed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${mode}: browser check timed out`)), 30_000); })]);
        if (!result.ok) throw new Error(JSON.stringify(result, null, 2));
        console.log(`Browser flow passed: ${mode}`);
      } finally {
        clearTimeout(timer);
        // Stop this test's process group before deleting its Chrome profile.
        const terminate = signal => {
          try {
            if (process.platform !== 'win32' && browser.pid) process.kill(-browser.pid, signal);
            else browser.kill(signal);
          } catch (error) { if (error.code !== 'ESRCH') throw error; }
        };
        terminate('SIGTERM');
        const force = setTimeout(() => terminate('SIGKILL'), 6000);
        await exited; clearTimeout(force);
        terminate('SIGKILL');
        await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
