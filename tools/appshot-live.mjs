#!/usr/bin/env node
/**
 * Live-time screenshot variant of appshot.mjs for pages with JS-driven chart
 * animations (recharts): virtual-time budgets freeze them at their initial
 * frame, so this drives Chrome over CDP and waits REAL wall-clock time before
 * Page.captureScreenshot.
 *
 * Usage:
 *   node tools/appshot-live.mjs <url> <outPath> [WxH] [--wait <ms>] [--full] [--scroll <px>]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const argv = process.argv.slice(2);
const waitIdx = argv.indexOf('--wait');
const waitMs = waitIdx !== -1 ? Number(argv[waitIdx + 1]) : 9000;
const full = argv.includes('--full');
const scrollIdx = argv.indexOf('--scroll');
const scrollY = scrollIdx !== -1 ? Number(argv[scrollIdx + 1]) : null;
// Only skip flag indices that were actually found — a -1 index must never
// bleed into the set (it would drop a positional arg, e.g. the URL).
const skip = new Set(
  [
    ...(waitIdx !== -1 ? [waitIdx, waitIdx + 1] : []),
    ...(scrollIdx !== -1 ? [scrollIdx, scrollIdx + 1] : []),
  ],
);
const rest = argv.filter((a, i) => !skip.has(i));
const [url = '', out = '', geom = ''] = rest;
if (!url || !out) {
  console.error('usage: node tools/appshot-live.mjs <url> <outPath> [WxH] [--wait <ms>] [--full]');
  process.exit(2);
}
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('no Chrome/Chromium binary found'); process.exit(2); }
const [w = '1440', h = '900'] = geom.split('x');
const absOut = resolve(out);
const profileDir = mkdtempSync(join(tmpdir(), 'appshot-live-profile-'));

const child = spawn(
  chrome,
  [
    '--headless',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-sandbox',
    '--disable-crashpad',
    '--disable-breakpad',
    `--crash-dumps-dir=${tmpdir()}`,
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
    `--window-size=${w},${h}`,
    '--remote-debugging-port=0',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  const timer = setTimeout(() => rej(new Error('DevTools endpoint timeout')), 20000);
  child.stderr.on('data', (d) => {
    buf += d.toString();
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
    if (m) { clearTimeout(timer); res(m[1]); }
  });
  child.on('exit', () => { clearTimeout(timer); rej(new Error('Chrome exited early')); });
});

function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: r } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) r({}); else r(msg.result ?? {});
      }
    };
    ws.onopen = () => res({
      ws,
      send(method, params = {}) {
        const id = ++msgId;
        return new Promise((r2) => {
          pending.set(id, { resolve: r2 });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
    });
    ws.onerror = () => rej(new Error('WS error'));
  });
}

// Target infos from the browser socket omit webSocketDebuggerUrl; ask the
// HTTP discovery endpoint (same port) for the page target's debugger URL.
const port = new URL(wsUrl).port;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!pageTarget) { console.error('no page target'); process.exit(1); }
const { ws, send } = await connect(pageTarget.webSocketDebuggerUrl);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false,
});
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, waitMs));

// Scroll to the URL's #anchor (instant) — headless loads land at the top and
// CSS scroll-behavior:smooth never finishes under a screenshot.
const hash = new URL(url, 'http://placeholder').hash;
if (hash.length > 1) {
  await send('Runtime.enable');
  await send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(hash)}); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: 'instant' }); })()`,
  });
  await new Promise((r) => setTimeout(r, 700));
}

if (scrollY !== null) {
  await send('Runtime.enable');
  await send('Runtime.evaluate', {
    expression: `window.scrollTo({ top: ${scrollY}, behavior: 'instant' })`,
  });
  await new Promise((r) => setTimeout(r, 700));
}

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: full,
});
if (!shot.data) { console.error('captureScreenshot returned no data'); process.exit(1); }
writeFileSync(absOut, Buffer.from(shot.data, 'base64'));

ws.close();
child.kill('SIGKILL');
rmSync(profileDir, { recursive: true, force: true });

if (!existsSync(absOut) || statSync(absOut).size < 1000) {
  console.error(`screenshot FAILED → ${absOut}`);
  process.exit(1);
}
console.log(`ok ${absOut} (${statSync(absOut).size} bytes, waited ${waitMs}ms)`);
process.exit(0);
