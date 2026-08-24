#!/usr/bin/env node
/**
 * Headless-Chrome screenshot of the asset showcase (or any local page).
 *
 * Usage:
 *   node tools/shot.mjs <outPath> [hash] [WxH]
 *
 * Examples:
 *   node tools/shot.mjs quality/shots/b-sheet-r1.png "lane=b&mode=sheet" 1600x2200
 *   node tools/shot.mjs quality/shots/tomato-r1.png "lane=b&only=tomato-s5&mode=big" 1440x548
 *
 * Requires the dev server on :5177 (started by the orchestrator).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const [, , out = '', hash = '', geom = ''] = process.argv;
if (!out) {
  console.error('usage: node tools/shot.mjs <outPath> [hash] [WxH]');
  process.exit(2);
}
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('no Chrome/Chromium binary found');
  process.exit(2);
}
const [w = '1600', h = '1200'] = geom.split('x');
const url = `http://localhost:5177/showcase.html${hash ? `#${hash}` : ''}`;
const absOut = resolve(out);
const profileDir = mkdtempSync(join(tmpdir(), 'shot-profile-'));

const res = spawnSync(
  chrome,
  [
    '--headless',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profileDir}`,
    `--window-size=${w},${h}`,
    '--virtual-time-budget=20000',
    `--screenshot=${absOut}`,
    url,
  ],
  { timeout: 90_000, stdio: ['ignore', 'pipe', 'pipe'] },
);

if (!existsSync(absOut) || statSync(absOut).size < 1000) {
  console.error(`screenshot FAILED (${res.status ?? 'spawn error'}) → ${absOut}`);
  if (res.stderr) console.error(res.stderr.toString().slice(0, 800));
  process.exit(1);
}
console.log(`ok ${absOut} (${statSync(absOut).size} bytes)`);
