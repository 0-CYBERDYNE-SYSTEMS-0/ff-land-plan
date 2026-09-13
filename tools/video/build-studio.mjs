#!/usr/bin/env node
/**
 * Build tools/video/script-studio.html — a fully self-contained writer/editor
 * (plain scripts, works from file://) by inlining:
 *   1. lib/script-doc.mjs  — node-cli block stripped, `export` keywords
 *      stripped, syntax-checked, then bound as window.ScriptDoc
 *   2. lib/sample-doc.mjs  — the canonical demo document as JSON
 *
 * Run after any change to the lib, sample, or template:
 *   node tools/video/build-studio.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(dir, p), 'utf8');

const template = read('studio-template.html');
let lib = read('lib/script-doc.mjs');

// 1. strip the node-only CLI block
const markers = lib.match(/\/\/ @begin node-cli[\s\S]*\/\/ @end node-cli[^\n]*/);
if (!markers) throw new Error('node-cli block not found in script-doc.mjs');
lib = lib.replace(markers[0], '');
lib = lib.replace(/^#![^\n]*\n/, ''); // shebang is invalid in a browser script

// 2. strip ESM exports
lib = lib.replace(/^export\s+/gm, '');

// 3. nothing that a classic browser <script> cannot digest may remain
const codeOnly = lib.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
if (/^\s*import[\s"']/m.test(codeOnly) || codeOnly.includes('import.meta')) {
  throw new Error('lib/script-doc.mjs still contains ESM constructs outside the node-cli block');
}
if (lib.includes('</' + 'script')) throw new Error('lib contains a script-closing sequence');

// 4. syntax check before shipping
const bind = '\nwindow.ScriptDoc = { stripQuotes, quoteYaml, countWords, parseSeconds, fmtSeconds, fmtTime, splitList, parseFrontmatter, parseStoryboard, serializeStoryboard, parseTimeRange, parseScript, serializeScript, computeTimeline, validateDoc, TARGET_DEFAULT, TOLERANCE_DEFAULT, REQUIRED_TAGS_DEFAULT, WORD_RATE_WARN, WORD_RATE_ERROR };\n';
try {
  new Function(lib + bind);
} catch (e) {
  throw new Error('inlined lib failed syntax check: ' + e.message);
}

const { sampleDoc } = await import(pathToFileURL(resolve(dir, 'lib/sample-doc.mjs')).href);
const sampleJson = JSON.stringify(sampleDoc());
if (sampleJson.includes('</' + 'script')) throw new Error('sample JSON contains a script-closing sequence');

const out = template
  .replace('/*__SCRIPT_DOC_JS__*/', () => lib + bind)
  .replace('/*__SAMPLE_DOC_JSON__*/', () => sampleJson);

if (out.includes('/*__SCRIPT_DOC_JS__*/') || out.includes('/*__SAMPLE_DOC_JSON__*/')) {
  throw new Error('placeholder replacement failed');
}
const outPath = resolve(dir, 'script-studio.html');
writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${out.length} bytes)`);
