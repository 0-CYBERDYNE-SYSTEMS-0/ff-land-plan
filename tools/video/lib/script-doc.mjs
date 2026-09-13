#!/usr/bin/env node
/**
 * Isomorphic SCRIPT.md / STORYBOARD.md parser + serializer + validator for the
 * FarmFriend demo-video pipeline. Consumed three ways:
 *
 *   node tools/video/lib/script-doc.mjs selftest           — fixture gate
 *   node tools/video/lib/script-doc.mjs scaffold --out DIR — seed project files
 *   inlined (node-cli block stripped, exports stripped) by
 *   tools/video/build-studio.mjs into tools/video/script-studio.html
 *
 * Keep this file dependency-free and browser-safe outside the marked
 * node-cli block (no static `import`, no `import.meta`, no top-level await).
 */

export const TARGET_DEFAULT = 60;
export const TOLERANCE_DEFAULT = 0.5;
export const REQUIRED_TAGS_DEFAULT = ['pipelines', 'workflows', 'capabilities'];
export const WORD_RATE_WARN = [2.2, 3.0];
export const WORD_RATE_ERROR = [1.6, 3.8];
export const TIME_MATCH_TOLERANCE = 0.25;

// ---------- small utils ----------

export function stripQuotes(s) {
  const t = String(s).trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return t;
}

export function quoteYaml(s) {
  const t = String(s);
  if (/["'\n]|[:#]\s|\s:#|^\s|[:#]$/.test(t) || t === '') return JSON.stringify(t);
  return t;
}

export function countWords(s) {
  return String(s)
    .trim()
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function parseSeconds(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^([\d.]+)\s*s?$/i);
  return m ? parseFloat(m[1]) : null;
}

export function fmtSeconds(n) {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function fmtTime(t) {
  return (Math.round(t * 10) / 10).toFixed(1);
}

export function splitList(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------- frontmatter (YAML-lite: scalar `key: value` lines) ----------

export function parseFrontmatter(text, warnings = []) {
  if (!/^---\r?\n/.test(text)) {
    warnings.push({ code: 'frontmatter_missing', message: 'No YAML frontmatter found at top of file.' });
    return { data: {}, body: text };
  }
  const end = text.indexOf('\n---', 3);
  if (end < 0) {
    warnings.push({ code: 'frontmatter_unclosed', message: 'Frontmatter is never closed (missing `---`).' });
    return { data: {}, body: text };
  }
  const head = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^(\r?\n)/, '');
  const data = {};
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 0) {
      warnings.push({ code: 'frontmatter_line', message: `Unparsable frontmatter line: "${line.trim()}"` });
      continue;
    }
    data[line.slice(0, i).trim()] = stripQuotes(line.slice(i + 1).trim());
  }
  return { data, body };
}

// ---------- STORYBOARD.md ----------

const SCENE_KEYS = ['scene', 'description', 'summary', 'caption'];
const VO_KEYS = ['voiceover', 'vo', 'voice_over', 'narration'];

export function parseStoryboard(text) {
  const warnings = [];
  const { data: fm, body } = parseFrontmatter(text, warnings);
  const known = new Set(['format', 'duration', 'message', 'arc', 'audience', 'mode']);
  const frontmatter = {
    format: fm.format || null,
    duration: fm.duration || null,
    message: fm.message || '',
    arc: fm.arc || '',
    audience: fm.audience || '',
    mode: fm.mode || '',
    extra: {},
  };
  for (const [k, v] of Object.entries(fm)) if (!known.has(k)) frontmatter.extra[k] = v;

  const raw = [];
  let cur = null;
  let inMeta = true;
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+(?:Frame|Beat|Scene)\s*(\d+)?\s*(?:[—–-]\s*(.*))?$/i);
    if (h) {
      if (cur) raw.push(cur);
      cur = {
        number: h[1] ? parseInt(h[1], 10) : raw.length + 1,
        title: (h[2] || '').trim(),
        meta: {},
        narrative: [],
      };
      inMeta = true;
      continue;
    }
    if (!cur) continue; // preamble before the first frame heading
    if (inMeta) {
      const m = line.match(/^-\s+([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (m) {
        cur.meta[m[1].toLowerCase()] = stripQuotes(m[2].trim());
        continue;
      }
      if (line.trim() === '') continue;
      inMeta = false;
    }
    cur.narrative.push(line);
  }
  if (cur) raw.push(cur);

  const frames = raw.map((f, i) => ({
    number: f.number || i + 1,
    title: f.title,
    status: f.meta.status || 'outline',
    src: f.meta.src || null,
    duration: f.meta.duration != null ? parseSeconds(f.meta.duration) : null,
    durationRaw: f.meta.duration || null,
    transitionIn: f.meta.transition_in || f.meta.transition || null,
    scene: SCENE_KEYS.map((k) => f.meta[k]).find(Boolean) || '',
    voiceover: VO_KEYS.map((k) => f.meta[k]).find(Boolean) || '',
    poster: f.meta.poster != null ? parseSeconds(f.meta.poster) : null,
    tags: splitList(f.meta.tags || ''),
    assetCandidates: splitList(f.meta.asset_candidates || f.meta.assets || ''),
    narrative: f.narrative.join('\n').trim(),
  }));

  return { frontmatter, frames, warnings };
}

export function serializeStoryboard(doc) {
  const fm = doc.frontmatter || {};
  const out = ['---'];
  out.push(`format: ${fm.format || '1920x1080'}`);
  if (fm.duration != null && fm.duration !== '') out.push(`duration: ${fm.duration}`);
  if (fm.message) out.push(`message: ${quoteYaml(fm.message)}`);
  if (fm.arc) out.push(`arc: ${quoteYaml(fm.arc)}`);
  if (fm.audience) out.push(`audience: ${quoteYaml(fm.audience)}`);
  if (fm.mode) out.push(`mode: ${fm.mode}`);
  for (const [k, v] of Object.entries(fm.extra || {})) out.push(`${k}: ${quoteYaml(v)}`);
  out.push('---', '');
  (doc.frames || []).forEach((f, i) => {
    const num = f.number != null ? f.number : i + 1;
    out.push(`## Frame ${num} — ${f.title || ''}`);
    out.push('');
    if (f.scene) out.push(`- scene: ${f.scene}`);
    if (f.duration != null) out.push(`- duration: ${fmtSeconds(f.duration)}s`);
    if (f.poster != null) out.push(`- poster: ${fmtSeconds(f.poster)}s`);
    if (f.transitionIn) out.push(`- transition_in: ${f.transitionIn}`);
    out.push(`- status: ${f.status || 'outline'}`);
    if (f.voiceover) out.push(`- voiceover: ${quoteYaml(f.voiceover)}`);
    if (f.src) out.push(`- src: ${f.src}`);
    if (f.tags && f.tags.length) out.push(`- tags: ${f.tags.join(', ')}`);
    if (f.assetCandidates && f.assetCandidates.length) {
      out.push(`- asset_candidates: ${f.assetCandidates.join(', ')}`);
    }
    out.push('');
    if (f.narrative) out.push(f.narrative, '');
  });
  return out.join('\n');
}

// ---------- SCRIPT.md ----------

export function parseTimeRange(s) {
  const m = String(s).match(/([\d.]+)\s*[—–-]\s*([\d.]+)\s*s?/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null];
}

export function parseScript(text) {
  const doc = { title: '', voice: '', voiceSettings: '', voiceDirection: '', lines: [] };
  let cur = null;
  let spoken = [];
  const push = () => {
    if (cur) {
      cur.text = spoken.join(' ').trim();
      doc.lines.push(cur);
    }
    cur = null;
    spoken = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^#\s+SCRIPT\s*[—–-]?\s*(.*)$/i);
    if (h) {
      doc.title = h[1].trim();
      continue;
    }
    const l = line.match(/^##\s+Line\s+(\d+)\s*[—–-]\s*(.+?)\s*(?:\((?:Frame|frame)\s+(\d+)\))?\s*$/);
    if (l) {
      push();
      cur = { n: parseInt(l[1], 10), label: l[2].trim(), frame: l[3] ? parseInt(l[3], 10) : null, start: null, end: null, delivery: '', text: '' };
      continue;
    }
    if (!cur) {
      let m;
      if ((m = line.match(/^\*\*Voice:\*\*\s*(.*)$/i))) doc.voice = m[1].trim();
      else if ((m = line.match(/^\*\*Voice settings:\*\*\s*(.*)$/i))) doc.voiceSettings = m[1].trim();
      else if ((m = line.match(/^\*\*Voice direction:\*\*\s*(.*)$/i))) doc.voiceDirection = m[1].trim();
      continue;
    }
    let m;
    if ((m = line.match(/^\*\*Time:\*\*\s*(.*)$/i))) {
      [cur.start, cur.end] = parseTimeRange(m[1].trim());
    } else if ((m = line.match(/^\*\*Delivery:\*\*\s*(.*)$/i))) {
      cur.delivery = m[1].trim();
    } else if (/^\s{2,}\S/.test(line)) {
      spoken.push(line.replace(/^\s+/, ''));
    }
  }
  push();
  return doc;
}

export function serializeScript(doc) {
  const out = [`# SCRIPT — ${doc.title || 'project'}`, ''];
  if (doc.voice) out.push(`**Voice:** ${doc.voice}`);
  if (doc.voiceSettings) out.push(`**Voice settings:** ${doc.voiceSettings}`);
  if (doc.voiceDirection) out.push(`**Voice direction:** ${doc.voiceDirection}`);
  out.push('', '---');
  for (const ln of doc.lines || []) {
    out.push('', `## Line ${ln.n} — ${ln.label}${ln.frame ? ` (Frame ${ln.frame})` : ''}`, '');
    if (ln.start != null && ln.end != null) out.push(`**Time:** ${fmtTime(ln.start)} – ${fmtTime(ln.end)}s`);
    if (ln.delivery) out.push(`**Delivery:** ${ln.delivery}`);
    out.push('', `    ${ln.text}`);
  }
  out.push('');
  return out.join('\n');
}

// ---------- validation ----------

export function computeTimeline(storyboard) {
  let t = 0;
  return (storyboard.frames || []).map((f, i) => {
    const d = f.duration != null ? f.duration : 0;
    const seg = { index: i, number: f.number != null ? f.number : i + 1, start: t, end: t + d, duration: d };
    t += d;
    return seg;
  });
}

/**
 * validateDoc({ storyboard, script, target, tolerance, requireTags,
 *               fileExists, expectedFormat }) -> findings[]
 * finding: { severity: 'error'|'warning', code, message, frame? }
 * `fileExists(path)` is injected by the host (node: fs.existsSync-based;
 * browser: omit to skip disk checks).
 */
export function validateDoc(opts) {
  const {
    storyboard,
    script = null,
    target = TARGET_DEFAULT,
    tolerance = TOLERANCE_DEFAULT,
    requireTags = REQUIRED_TAGS_DEFAULT,
    fileExists = null,
    expectedFormat = '1920x1080',
  } = opts;
  const F = [];
  const err = (code, message, frame) => F.push({ severity: 'error', code, message, frame });
  const warn = (code, message, frame) => F.push({ severity: 'warning', code, message, frame });
  const frames = (storyboard && storyboard.frames) || [];
  if (!frames.length) err('storyboard_empty', 'Storyboard has no frames.');

  // frontmatter
  const fm = (storyboard && storyboard.frontmatter) || {};
  if (fm.format && fm.format !== expectedFormat) {
    err('frontmatter_format', `Frontmatter format ${fm.format} != expected ${expectedFormat}.`);
  }
  const fmDur = parseSeconds(fm.duration);
  if (fmDur == null) warn('frontmatter_duration_missing', 'Frontmatter `duration` missing (e.g. `60s`).');
  else if (Math.abs(fmDur - target) > tolerance) {
    err('frontmatter_duration', `Frontmatter duration ${fmtSeconds(fmDur)}s misses the ${fmtSeconds(target)}s target by more than ${tolerance}s.`);
  }

  // per-frame
  for (const f of frames) {
    const n = f.number != null ? f.number : '?';
    if (!f.title) err('frame_missing_field', `Frame ${n}: missing title.`, n);
    if (f.duration == null) err('frame_missing_field', `Frame ${n}: missing \`duration\`.`, n);
    if (!f.scene) warn('frame_missing_field', `Frame ${n}: missing \`scene\` caption.`, n);
    if (!f.voiceover) err('frame_missing_field', `Frame ${n}: missing \`voiceover\`.`, n);
    if (!f.src && (f.status === 'built' || f.status === 'animated')) {
      warn('frame_src_missing', `Frame ${n}: status \`${f.status}\` but no \`src\` composition path.`, n);
    }
    if (f.src && fileExists && !fileExists(f.src)) {
      warn('src_file_missing', `Frame ${n}: src not on disk yet: ${f.src}`, n);
    }
    if (f.poster == null) warn('frame_poster_missing', `Frame ${n}: missing \`poster\` seek (add e.g. \`- poster: 2s\`).`, n);
    const words = countWords(f.voiceover || '');
    if (f.duration != null && f.duration > 0 && words > 0) {
      const rate = words / f.duration;
      if (rate < WORD_RATE_ERROR[0] || rate > WORD_RATE_ERROR[1]) {
        err('word_rate', `Frame ${n}: narration ${fmtSeconds(rate)} words/s (${words} words / ${fmtSeconds(f.duration)}s) outside feasible band ${WORD_RATE_ERROR[0]}–${WORD_RATE_ERROR[1]}.`, n);
      } else if (rate < WORD_RATE_WARN[0] || rate > WORD_RATE_WARN[1]) {
        warn('word_rate', `Frame ${n}: narration ${fmtSeconds(rate)} words/s (${words} words / ${fmtSeconds(f.duration)}s) outside comfort band ${WORD_RATE_WARN[0]}–${WORD_RATE_WARN[1]}.`, n);
      }
    }
    for (const a of f.assetCandidates || []) {
      if (fileExists && !fileExists(a)) {
        err('asset_missing', `Frame ${n}: asset candidate not on disk: ${a}`, n);
      }
    }
  }

  // total duration
  const timeline = computeTimeline(storyboard);
  const total = timeline.length ? timeline[timeline.length - 1].end : 0;
  if (frames.length) {
    if (Math.abs(total - target) > tolerance) {
      err('duration_total', `Frames total ${fmtSeconds(total)}s, target ${fmtSeconds(target)}s (tolerance ±${tolerance}s).`);
    } else if (Math.abs(total - target) > 0.25) {
      warn('duration_total', `Frames total ${fmtSeconds(total)}s (target ${fmtSeconds(target)}s).`);
    }
  }

  // tag coverage
  const covered = new Set();
  for (const f of frames) for (const t of f.tags || []) covered.add(t);
  for (const tag of requireTags) {
    if (!covered.has(tag)) err('tag_coverage', `No frame carries required tag \`${tag}\`.`);
  }

  // script ↔ storyboard
  if (script) {
    if (script.lines.length !== frames.length) {
      err('script_lines_mismatch', `SCRIPT.md has ${script.lines.length} lines for ${frames.length} storyboard frames.`);
    }
    const byIndex = timeline;
    script.lines.forEach((ln, i) => {
      if (ln.frame != null && ln.frame !== i + 1) {
        err('line_frame_mismatch', `Line ${ln.n} references Frame ${ln.frame}; expected Frame ${i + 1}.`, ln.frame);
      }
      const seg = byIndex[i];
      if (seg && ln.start != null && ln.end != null) {
        if (Math.abs(ln.start - seg.start) > TIME_MATCH_TOLERANCE || Math.abs(ln.end - seg.end) > TIME_MATCH_TOLERANCE) {
          warn('line_time_mismatch', `Line ${ln.n} window ${fmtTime(ln.start)}–${fmtTime(ln.end)}s vs frame window ${fmtTime(seg.start)}–${fmtTime(seg.end)}s.`, seg.number);
        }
      }
      const words = countWords(ln.text || '');
      if (seg && seg.duration > 0 && words > 0) {
        const rate = words / seg.duration;
        if (rate < WORD_RATE_ERROR[0] || rate > WORD_RATE_ERROR[1]) {
          err('word_rate', `Line ${ln.n}: ${fmtSeconds(rate)} words/s outside feasible band ${WORD_RATE_ERROR[0]}–${WORD_RATE_ERROR[1]}.`, seg.number);
        }
      }
      if (!ln.text) err('line_empty', `Line ${ln.n}: no spoken text.`, ln.frame);
    });
    if (!script.voice) warn('script_voice_missing', 'SCRIPT.md header has no **Voice:** line.');
  }

  return F;
}

// @begin node-cli (stripped by build-studio.mjs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function cli(argv) {
  const verb = argv[0];
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  if (verb === 'scaffold') {
    const outDir = resolve(flag('--out') || '.');
    const { sampleDoc } = await import('./sample-doc.mjs');
    const { storyboard, script } = sampleDoc();
    mkdirSync(outDir, { recursive: true });
    const sbPath = resolve(outDir, 'STORYBOARD.md');
    const scPath = resolve(outDir, 'SCRIPT.md');
    writeFileSync(sbPath, serializeStoryboard(storyboard));
    writeFileSync(scPath, serializeScript(script));
    console.log(`wrote ${sbPath}`);
    console.log(`wrote ${scPath}`);
    return 0;
  }
  if (verb === 'selftest') {
    const { runSelfTest } = await import('./selftest.mjs');
    return runSelfTest({
      parseStoryboard,
      serializeStoryboard,
      parseScript,
      serializeScript,
      validateDoc,
      computeTimeline,
      countWords,
      parseSeconds,
      fmtSeconds,
    });
  }
  console.error('usage: node script-doc.mjs <selftest | scaffold --out DIR>');
  return 2;
}

{
  let isMain = false;
  try {
    isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
  } catch {
    isMain = false;
  }
  if (isMain) {
    cli(process.argv.slice(2)).then(
      (code) => process.exit(code || 0),
      (e) => {
        console.error(e);
        process.exit(1);
      },
    );
  }
}
// @end node-cli
