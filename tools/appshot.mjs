#!/usr/bin/env node
/**
 * Headless-Chrome screenshot + console-error gate for ANY local page (app or showcase).
 *
 * Usage:
 *   node tools/appshot.mjs <url> <outPath> [WxH] [--gate]
 *
 * Examples:
 *   node tools/appshot.mjs "http://localhost:5177/#/farms/3/map?ffview=world&fftime=0.05" quality/shots/beta/lighting/night.png 1440x900 --gate
 *   node tools/appshot.mjs "http://localhost:5177/#/crops" quality/shots/beta/routes/crops.png 1440x900
 *
 * With --gate, the serialized DOM is inspected for the boot probe (#ff-probe,
 * installed by src/dev/bootProbe.ts in dev builds). Any window.onerror, unhandled
 * rejection, or console.error recorded there fails the run with a non-zero exit.
 *
 * Requires the dev server (default :5177) started by the orchestrator.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const argv = process.argv.slice(2);
const gate = argv.includes('--gate');
const expectIdx = argv.indexOf('--expect');
const expectText = expectIdx !== -1 ? argv[expectIdx + 1] : null;
// Drop --gate, and (only when --expect is actually present) the flag + its value.
const skip = new Set([argv.indexOf('--gate')]);
if (expectIdx !== -1) { skip.add(expectIdx); skip.add(expectIdx + 1); }
const rest = argv.filter((a, i) => !skip.has(i));
const [url = '', out = '', geom = ''] = rest;
if (!url || !out) {
  console.error('usage: node tools/appshot.mjs <url> <outPath> [WxH] [--gate] [--expect <text>]');
  process.exit(2);
}
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('no Chrome/Chromium binary found');
  process.exit(2);
}
const [w = '1440', h = '900'] = geom.split('x');
const absOut = resolve(out);

// Each Chrome invocation gets its OWN profile dir — reusing one trips the
// singleton lock and silently kills the second spawn.
function chromeRun(extraFlags, opts = {}) {
  const profileDir = mkdtempSync(join(tmpdir(), 'appshot-profile-'));
  try {
    return spawnSync(
      chrome,
      [
        '--headless',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        // Restricted-environment flags: Chrome's own sandbox/crashpad can't
        // initialize here; they are unnecessary for one-shot headless shots.
        '--no-sandbox',
        '--disable-crashpad',
        '--disable-breakpad',
        `--crash-dumps-dir=${tmpdir()}`,
        '--disable-dev-shm-usage',
        `--user-data-dir=${profileDir}`,
        `--window-size=${w},${h}`,
        // Budget: enough virtual time for the lazy three.js chunk + WebGL
        // warm-up. NOTE: with a dev-server HMR socket open, Chrome performs
        // its actions quickly but never exits gracefully — the spawn timeout
        // below is the expected terminator; we validate outputs afterwards.
        '--virtual-time-budget=6000',
        // Hard bound on Chrome's own wait-for-load: pages that stay busy
        // (e.g. an active sim run) never let virtual time expire, so without
        // this Chrome idles past the spawn kill and the shot is lost. 25 s is
        // well above the normal <10 s action time, so quiet pages are immune.
        '--timeout=25000',
        ...extraFlags,
      ],
      { timeout: 40_000, stdio: ['ignore', 'pipe', 'pipe'], ...opts },
    );
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
  }
}

// ONE combined run: --dump-dom prints serialized DOM to stdout, --screenshot
// writes the PNG; Chrome performs both actions then exits.
const actions = [`--screenshot=${absOut}`, url];
if (gate || expectText) actions.unshift('--dump-dom');
const res = chromeRun(actions, gate || expectText ? { maxBuffer: 64 * 1024 * 1024 } : {});
const dom = res.stdout?.toString() ?? '';

if (gate) {
  const m = /<div id="ff-probe"[^>]*data-error-count="(\d+)"/.exec(dom);
  if (!m) {
    console.error('GATE INCONCLUSIVE: #ff-probe not found in DOM (is this a dev build with the boot probe?)');
  } else if (m[1] !== '0') {
    const detail = /data-errors="([^"]*)"/.exec(dom)?.[1] ?? '';
    console.error(`GATE FAIL: ${m[1]} runtime error(s):\n  ${detail.replace(/ ⏐ /g, '\n  ')}`);
    process.exit(1);
  } else {
    console.log('GATE PASS: zero runtime errors');
  }
}

if (expectText && !dom.includes(expectText)) {
  console.error(`EXPECT FAIL: DOM does not contain ${JSON.stringify(expectText)} — wrong page rendered?`);
  process.exit(1);
} else if (expectText) {
  console.log(`EXPECT PASS: found ${JSON.stringify(expectText)}`);
}

if (!existsSync(absOut) || statSync(absOut).size < 1000) {
  console.error(`screenshot FAILED → ${absOut}`);
  if (res.stderr) console.error(res.stderr.toString().slice(0, 800));
  process.exit(1);
}
console.log(`ok ${absOut} (${statSync(absOut).size} bytes)`);
