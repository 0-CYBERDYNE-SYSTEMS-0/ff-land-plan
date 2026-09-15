#!/usr/bin/env node
/**
 * Gate the demo-video script/storyboard before any frame build.
 *
 *   node tools/video/validate-script.mjs videos/farmfriend-demo/SCRIPT.md \
 *        --storyboard videos/farmfriend-demo/STORYBOARD.md \
 *        --root videos/farmfriend-demo [--target 60] [--tolerance 0.5]
 *        [--require-tags pipelines,workflows,capabilities] [--json]
 *
 * Exit 0 = no errors (warnings allowed), exit 1 = errors found or files
 * unreadable, exit 2 = usage error.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseScript,
  parseStoryboard,
  validateDoc,
  TARGET_DEFAULT,
  TOLERANCE_DEFAULT,
  REQUIRED_TAGS_DEFAULT,
} from './lib/script-doc.mjs';

function usage() {
  console.error('usage: validate-script.mjs <SCRIPT.md> --storyboard <STORYBOARD.md> [--root DIR] [--target 60] [--tolerance 0.5] [--require-tags a,b,c] [--json]');
  return 2;
}

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const scriptPath = argv.find((a) => !a.startsWith('--'));
const storyboardPath = flag('--storyboard');
const asJson = argv.includes('--json');
if (!scriptPath || !storyboardPath) process.exit(usage());

const root = resolve(flag('--root') || process.cwd());
const target = parseFloat(flag('--target', String(TARGET_DEFAULT)));
const tolerance = parseFloat(flag('--tolerance', String(TOLERANCE_DEFAULT)));
const requireTags = flag('--require-tags') ? flag('--require-tags').split(',').map((s) => s.trim()).filter(Boolean) : REQUIRED_TAGS_DEFAULT;

const read = (p) => {
  const abs = resolve(p);
  if (!existsSync(abs)) {
    console.error(`error: file not found: ${abs}`);
    process.exit(1);
  }
  return readFileSync(abs, 'utf8');
};

let script;
let storyboard;
try {
  script = parseScript(read(scriptPath));
  storyboard = parseStoryboard(read(storyboardPath));
} catch (e) {
  console.error(`error: parse failed — ${e.message}`);
  process.exit(1);
}

const findings = validateDoc({
  storyboard,
  script,
  target,
  tolerance,
  requireTags,
  expectedFormat: '1920x1080',
  fileExists: (p) => existsSync(resolve(root, p)),
});

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors: errors.length, warnings: warnings.length, findings }, null, 2));
} else {
  const fmt = (f) => `${f.severity === 'error' ? 'ERROR' : 'WARN '} ${f.code}${f.frame ? ` [frame ${f.frame}]` : ''} — ${f.message}`;
  if (!findings.length) console.log('validator: clean — no findings');
  findings.forEach((f) => console.log(fmt(f)));
  console.log(`\nvalidator: ${errors.length} error(s), ${warnings.length} warning(s) — ${errors.length ? 'GATE FAILED' : 'gate passed'}`);
}
process.exit(errors.length ? 1 : 0);
