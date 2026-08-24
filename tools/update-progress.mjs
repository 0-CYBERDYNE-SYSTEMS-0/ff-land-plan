#!/usr/bin/env node
/**
 * Regenerates creative-progress.html from quality/state/lane-*.json and the
 * screenshots in quality/shots/. Run after every builder round.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const LANES = [
  { id: 'a', name: 'Terrain & Soil', dir: 'src/creative/terrain' },
  { id: 'b', name: 'Crops & Growth Stages', dir: 'src/creative/crops' },
  { id: 'c', name: 'Structures', dir: 'src/creative/structures' },
  { id: 'd', name: 'Creatures & Atmosphere', dir: 'src/creative/creatures' },
];

function readState(id) {
  try {
    return JSON.parse(readFileSync(`${ROOT}quality/state/lane-${id}.json`, 'utf8'));
  } catch {
    return { lane: id, iteration: 0, status: 'queued', gap: null, history: [] };
  }
}

function laneShots(id) {
  try {
    return readdirSync(`${ROOT}quality/shots`)
      .filter((f) => f.startsWith(`lane-${id}-`) && f.endsWith('.png'))
      .map((f) => ({ f, m: statSync(`${ROOT}quality/shots/${f}`).mtimeMs }))
      .sort((a, b) => b.m - a.m)
      .map((s) => s.f);
  } catch {
    return [];
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = (status) => {
  const color = { pass: '#3f9142', critiquing: '#b8860b', building: '#4a6fb3', revise: '#b34a4a', queued: '#888' }[status] ?? '#888';
  return `<span style="background:${color};color:#fff;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:700">${esc(status.toUpperCase())}</span>`;
};

let html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="15">
<title>Creative Asset Forge — Live Progress</title>
<style>
 body{font-family:-apple-system,Helvetica,sans-serif;margin:0;background:#191713;color:#e8e2d2}
 header{padding:18px 26px;background:#24211a;border-bottom:2px solid #3a352a}
 h1{margin:0;font-size:20px} .sub{color:#a89f8a;font-size:13px;margin-top:4px}
 section{padding:16px 26px;border-bottom:1px solid #2c2820}
 h2{font-size:16px;margin:0 0 6px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
 .gap{background:#2a2118;border-left:3px solid #b34a4a;padding:8px 12px;margin:8px 0;font-size:13px;color:#e0c9b0;max-width:110ch}
 .hist{font-size:12px;color:#93876f;margin:4px 0}
 .shots{display:flex;flex-wrap:wrap;gap:10px}
 figure{margin:0;width:300px} img{width:300px;height:auto;border-radius:6px;border:1px solid #3a352a;display:block}
 figcaption{font-size:11px;color:#93876f;padding-top:3px;font-family:ui-monospace,monospace}
</style></head><body>
<header><h1>🎨 Creative Asset Forge — live progress</h1>
<div class="sub">Voxel farm digital twin · builder↔critic loops · auto-refreshes every 15s · ${new Date().toLocaleString()}</div>
</header>`;

for (const lane of LANES) {
  const st = readState(lane.id);
  const shots = laneShots(lane.id);
  const shown = [];
  const seenRounds = new Set();
  for (const f of shots) {
    const r = /-r(\d+)\./.exec(f);
    const round = r ? r[1] : '?';
    if (seenRounds.has(round)) continue;
    seenRounds.add(round);
    shown.push(f);
    if (shown.length >= 8) break;
  }
  html += `<section><h2>Lane ${lane.id.toUpperCase()} — ${esc(lane.name)} ${badge(st.status)} <span style="font-weight:400;color:#a89f8a;font-size:13px">iteration ${st.iteration}</span></h2>`;
  if (st.gap) html += `<div class="gap"><b>Current critic gap:</b> ${esc(st.gap)}</div>`;
  for (const h of (st.history ?? []).slice(0, 4)) {
    html += `<div class="hist">r${h.round}: ${esc(h.verdict)} — ${esc(h.note)}</div>`;
  }
  if (shown.length) {
    html += `<div class="shots">${shown
      .map((f) => `<figure><img src="quality/shots/${f}" loading="lazy"><figcaption>${esc(f)}</figcaption></figure>`)
      .join('')}</div>`;
  } else {
    html += `<div class="hist">no screenshots yet</div>`;
  }
  html += `</section>`;
}

html += `</body></html>`;
writeFileSync(`${ROOT}creative-progress.html`, html);
console.log(`progress page written (${html.length} bytes)`);
