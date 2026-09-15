/**
 * Fixture gate for script-doc.mjs — round-trips, canonical stability, and
 * seeded violations that must each surface as validator findings.
 * Invoked via: node tools/video/lib/script-doc.mjs selftest
 */

export async function runSelfTest(A) {
  const { parseStoryboard, serializeStoryboard, parseScript, serializeScript, validateDoc, computeTimeline, countWords, parseSeconds } = A;
  let failures = 0;
  const check = (name, cond, extra = '') => {
    if (cond) console.log(`  ok  ${name}`);
    else {
      failures += 1;
      console.error(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
    }
  };
  const codes = (findings, severity) =>
    findings.filter((f) => !severity || f.severity === severity).map((f) => f.code);

  // -- 1. sample round-trips --------------------------------------------
  const { sampleDoc } = await import('./sample-doc.mjs');
  const { storyboard: sb, script: sc } = sampleDoc();

  const sbText = serializeStoryboard(sb);
  const sb2 = parseStoryboard(sbText);
  check('storyboard: 9 frames parsed', sb2.frames.length === 9, String(sb2.frames.length));
  check(
    'storyboard: durations [5,8,6,8,8,6,8,6,5]',
    JSON.stringify(sb2.frames.map((f) => f.duration)) === JSON.stringify([5, 8, 6, 8, 8, 6, 8, 6, 5]),
    JSON.stringify(sb2.frames.map((f) => f.duration)),
  );
  const tl = computeTimeline(sb2);
  check('storyboard: timeline ends at 60.0', Math.abs(tl[tl.length - 1].end - 60) < 1e-9, String(tl[tl.length - 1].end));
  check('storyboard: serialize is stable', serializeStoryboard(sb2) === sbText);
  check(
    'storyboard: voiceovers survive round-trip',
    sb2.frames.every((f, i) => f.voiceover === sb.frames[i].voiceover && f.tags.join(',') === sb.frames[i].tags.join(',')),
  );
  check('storyboard: frontmatter survives', sb2.frontmatter.format === '1920x1080' && parseSeconds(sb2.frontmatter.duration) === 60);

  const scText = serializeScript(sc);
  const sc2 = parseScript(scText);
  check('script: header fields survive', sc2.voice === sc.voice && sc2.voiceDirection === sc.voiceDirection);
  check(
    'script: all 9 lines round-trip verbatim',
    JSON.stringify(sc2.lines) === JSON.stringify(sc.lines),
  );
  check('script: serialize is stable', serializeScript(sc2) === scText);

  // -- 2. reference-example fixture --------------------------------------
  const example = [
    '# SCRIPT — acme-launch',
    '',
    '**Voice:** Rachel (ElevenLabs)',
    '**Voice settings:** stability 0.35 · similarity 0.75 · style 0.20',
    '**Voice direction:** Confident, warm, a little playful.',
    '',
    '---',
    '',
    '## Line 1 — Hook (Frame 1)',
    '',
    '**Time:** 0.0 – 3.0s',
    '**Delivery:** Land the promise on the beat.',
    '',
    '    Ship a launch video in an afternoon.',
    '',
    '## Line 2 — The problem (Frame 2)',
    '',
    '**Time:** 3.0 – 7.0s',
    '**Delivery:** Wry, a touch tired.',
    '',
    '    The old way? Prompt, wait twenty minutes, get something that misses.',
    '',
  ].join('\n');
  const ex = parseScript(example);
  check('script: reference example parses', ex.lines.length === 2 && ex.voice === 'Rachel (ElevenLabs)');
  check(
    'script: reference spoken lines verbatim',
    ex.lines[0].text === 'Ship a launch video in an afternoon.' &&
      ex.lines[1].start === 3.0 &&
      ex.lines[1].end === 7.0,
  );

  // -- 3. clean document validates with zero errors ----------------------
  const good = validateDoc({ storyboard: sb2, script: sc2, fileExists: () => true });
  check('validate: sample has zero errors', codes(good, 'error').length === 0, JSON.stringify(good.filter((f) => f.severity === 'error')));

  // -- 4. seeded violations each surface ---------------------------------
  const clone = () => sampleDoc();
  const v = (mut, opts = {}) => {
    const d = clone();
    mut(d.storyboard, d.script);
    return validateDoc({
      storyboard: parseStoryboard(serializeStoryboard(d.storyboard)),
      script: parseScript(serializeScript(d.script)),
      fileExists: opts.fileExists || (() => true),
      requireTags: opts.requireTags,
    });
  };

  check('seed: duration_total fires', v((s) => { s.frames[0].duration = 45; }).some((f) => f.code === 'duration_total' && f.severity === 'error'));
  check(
    'seed: script_lines_mismatch fires',
    v((s, c) => { c.lines.pop(); }).some((f) => f.code === 'script_lines_mismatch'),
  );
  check(
    'seed: line_time_mismatch fires',
    v((s, c) => { c.lines[0].start = 0; c.lines[0].end = 9; }).some((f) => f.code === 'line_time_mismatch'),
  );
  check(
    'seed: word_rate error fires on cram',
    v((s) => { s.frames[0].duration = 1; }).some((f) => f.code === 'word_rate' && f.severity === 'error'),
  );
  check(
    'seed: asset_missing fires',
    v((s) => {}, { fileExists: (p) => p !== 'capture/assets/world-noon.png' }).some((f) => f.code === 'asset_missing'),
  );
  check(
    'seed: tag_coverage fires',
    v((s) => {}, { requireTags: ['not-a-tag'] }).some((f) => f.code === 'tag_coverage'),
  );
  check(
    'seed: frame_missing_field fires on blank voiceover',
    v((s) => { s.frames[4].voiceover = ''; }).some((f) => f.code === 'frame_missing_field' && f.severity === 'error'),
  );
  check(
    'seed: frontmatter_format fires on wrong canvas',
    v((s) => { s.frontmatter.format = '1080x1920'; }).some((f) => f.code === 'frontmatter_format'),
  );
  check('seed: empty storyboard flags', validateDoc({ storyboard: { frames: [] } }).some((f) => f.code === 'storyboard_empty'));

  // -- 5. utils ----------------------------------------------------------
  check('util: countWords ignores dashes', countWords('grow — same inputs, same result') === 5);
  check('util: parseSeconds', parseSeconds('4.5s') === 4.5 && parseSeconds('60s') === 60 && parseSeconds(8) === 8);

  console.log(failures === 0 ? `\nselftest PASS` : `\nselftest FAILED (${failures})`);
  return failures === 0 ? 0 : 1;
}
