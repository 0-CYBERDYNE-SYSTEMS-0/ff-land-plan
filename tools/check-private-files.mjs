#!/usr/bin/env node
/**
 * Private-file guard: fails if any git-tracked path looks like data that must
 * never be committed (env files, key material, OS cruft, local-first data
 * dumps, agent/tool state). Complements gitleaks, which only knows secret
 * *patterns* — this guards by *filename*, catching e.g. a farm data export
 * before it lands on a public-looking history.
 *
 * CI runs this over the whole tree on every PR/push; run locally with
 * `npm run check:private`.
 */
import { execFileSync } from 'node:child_process';

// Paths allowed despite matching a rule below.
const ALLOWLIST = [/^\.env\.example$/];

const RULES = [
  [/(^|\/)\.env($|\.)/, 'env file — real env vars belong in the environment; commit .env.example only'],
  [/\.(pem|p12|pfx|jks|keystore)$/, 'key material'],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)/, 'SSH key'],
  [/(^|\/)\.DS_Store$/, 'macOS cruft'],
  [/(^|\/)(Thumbs\.db|desktop\.ini)$/, 'OS cruft'],
  [/\.(sqlite|sqlite3|kdbx)$/, 'database / credential store'],
  [/(^|\/)(farms?[-_.][^/]*|[^/]*[-_.]export)\.(json|csv|ndjson)$/i, 'looks like a data export — farm/plan data lives in localStorage, never in git'],
  [/(^|\/)\.(auto-claude|vix|commandcode|code-review-graph)\//, 'agent/tool state dir'],
];

const files = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 64 * 1024 * 1024 })
  .toString()
  .split('\0')
  .filter(Boolean);

const violations = [];
for (const f of files) {
  if (ALLOWLIST.some((re) => re.test(f))) continue;
  for (const [re, why] of RULES) {
    if (re.test(f)) violations.push(`  ${f}\n    → ${why}`);
  }
}

if (violations.length) {
  console.error(
    `PRIVATE-FILE GUARD FAIL: ${violations.length} tracked file(s) look private:\n${violations.join('\n')}`,
  );
  process.exit(1);
}
console.log(`PRIVATE-FILE GUARD PASS: ${files.length} tracked files, no private-data patterns`);
