#!/usr/bin/env node
/**
 * Builds the FarmFriend launch kit:
 *   index.html      — self-contained showcase page (images inlined as base64)
 *   deck.html       — 1280x720 slide deck (for PDF printing)
 *   slide-NN.html   — individual slides (QA renders)
 *   thumb/          — small JPEG thumbnails for galleries
 *   FarmFriend-Launch.pdf — printed from deck.html via headless Chrome
 * Run: node build.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const SOCIAL = join(ROOT, 'social');
const THUMBS = join(ROOT, 'thumb');
mkdirSync(THUMBS, { recursive: true });

const img = (name) => join(SOCIAL, name);
const b64 = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;
const uri = (name) => b64(img(name));

function thumb(name, width = 520) {
  const src = img(name);
  const out = join(THUMBS, name.replace(/\.png$/, '.jpg'));
  if (!existsSync(out)) {
    execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '62', '-Z', String(width), src, '--out', out], { stdio: 'pipe' });
  }
  return `data:image/jpeg;base64,${readFileSync(out).toString('base64')}`;
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ---------------------------------------------------------------- design */
const CSS = `
  :root {
    --paper:#F2EDDE; --ink:#20261F; --ink-soft:#5B6355; --green:#2E8F4C; --green-bright:#46C46B;
    --amber:#E8A04C; --night:#0B120C;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { background:var(--paper); color:var(--ink);
         font-family:-apple-system,"Helvetica Neue",sans-serif; font-size:17px; line-height:1.6; }
  .display { font-family:"Futura","Futura PT","Avenir Next","Trebuchet MS",sans-serif; font-weight:800;
             line-height:1.02; letter-spacing:-0.015em; }
  .mono { font-family:"Menlo","SF Mono",ui-monospace,monospace; letter-spacing:.22em; }
  .wrap { max-width:1160px; margin:0 auto; padding:0 40px; }

  header.top { border-bottom:3px solid var(--ink); }
  .brandbar { display:flex; align-items:center; justify-content:space-between; padding:26px 0; }
  .brand { display:flex; align-items:center; gap:14px; }
  .brand .mono { font-size:15px; }

  .hero { padding:84px 0 64px; display:grid; grid-template-columns:1.05fr 1fr; gap:56px; align-items:center; }
  .hero h1 { font-size:76px; }
  .hero h1 em { font-style:normal; color:var(--green); }
  .hero p.lead { font-size:21px; color:var(--ink-soft); margin-top:26px; max-width:52ch; }
  .metastrip { display:flex; gap:26px; margin-top:34px; flex-wrap:wrap; }
  .metastrip span { border:2px solid var(--ink); padding:7px 14px; font-size:12.5px;
                    box-shadow:5px 5px 0 rgba(32,38,31,.16); background:#fff; }

  .plate { border-top:3px solid var(--ink); padding:56px 0 72px; }
  .plate-head { display:flex; align-items:baseline; justify-content:space-between; gap:24px; margin-bottom:40px; }
  .plate-head h2 { font-size:40px; }
  .plate-head .mono { font-size:13px; color:var(--ink-soft); white-space:nowrap; }
  .plate .kicker { color:var(--amber); }

  figure.shot { background:var(--night); border:3px solid var(--ink); box-shadow:12px 12px 0 rgba(32,38,31,.2); }
  figure.shot img { display:block; width:100%; height:auto; }
  figcaption { padding:12px 16px; font-size:12px; color:#B9C4B2; border-top:1px solid #263326; }
  figure.on-paper { background:#fff; }
  figure.on-paper figcaption { color:var(--ink-soft); border-top:1px solid #E4DECC; }

  .duo { display:grid; grid-template-columns:1fr 1fr; gap:44px; align-items:center; margin-bottom:64px; }
  .duo:last-child { margin-bottom:0; }
  .duo h3 { font-size:27px; margin-bottom:14px; }
  .duo p { color:var(--ink-soft); }
  .duo .facts { margin-top:20px; display:flex; flex-direction:column; gap:8px; }
  .duo .facts span { font-size:13.5px; }
  .duo .facts b { color:var(--green); }

  .trio { display:grid; grid-template-columns:repeat(3,1fr); gap:30px; }
  .trio figure { margin-bottom:0; }
  .env-note { display:flex; gap:30px; margin-top:22px; }
  .env-note p { flex:1; font-size:13.5px; color:var(--ink-soft); }

  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:24px; }
  .stat { background:#fff; border:3px solid var(--ink); box-shadow:10px 10px 0 rgba(32,38,31,.16); padding:30px 28px; }
  .stat .n { font-size:64px; color:var(--green); }
  .stat .l { font-size:12.5px; margin-top:8px; color:var(--ink-soft); }

  .gallery { display:grid; grid-template-columns:repeat(4,1fr); gap:22px; }
  .tile { border:3px solid var(--ink); background:#fff; box-shadow:8px 8px 0 rgba(32,38,31,.14); }
  .tile img { display:block; width:100%; height:auto; }
  .tile .cap { padding:9px 12px; font-size:11.5px; color:var(--ink-soft); border-top:1px solid #E4DECC; }

  .bubbles { display:flex; flex-direction:column; gap:34px; padding:8px 0 10px; }
  .bubble { position:relative; padding:26px 34px; max-width:72%; font-size:20px; line-height:1.4; font-weight:600;
            box-shadow:8px 8px 0 rgba(32,38,31,.2); }
  .bubble .who { display:block; font-family:"Menlo",monospace; font-size:11.5px; letter-spacing:.28em; margin-bottom:8px; opacity:.75; }
  .b-green { background:var(--green-bright); color:#08130A; }
  .b-amber { background:var(--amber); color:#241503; }
  .b-paper { background:#fff; color:var(--ink); box-shadow:8px 8px 0 rgba(32,38,31,.12); }
  .tail-l::after, .tail-r::after { content:""; position:absolute; bottom:-20px; width:20px; height:20px; background:inherit; }
  .tail-l::after { left:34px; clip-path:polygon(0 0, 100% 0, 0 100%); }
  .tail-r::after { right:34px; clip-path:polygon(0 0, 100% 0, 100% 100%); }

  .bullets { columns:2; column-gap:56px; }
  .bullets li { break-inside:avoid; margin:0 0 18px; padding-left:34px; position:relative; list-style:none; color:var(--ink-soft); font-size:16.5px; }
  .bullets li b { color:var(--ink); }
  .bullets li::before { content:""; position:absolute; left:0; top:7px; width:16px; height:16px; background:var(--green-bright);
                        box-shadow:4px 4px 0 rgba(32,38,31,.25); }

  .posts { display:grid; grid-template-columns:1fr 1fr; gap:26px; }
  .post { background:#fff; border:3px solid var(--ink); box-shadow:10px 10px 0 rgba(32,38,31,.16); }
  .post .ph { padding:12px 18px; border-bottom:2px solid var(--ink); font-size:12.5px; background:var(--night); color:var(--paper); }
  .post .pb { padding:20px 22px; font-size:15.5px; color:var(--ink); white-space:pre-wrap; }

  footer.end { border-top:3px solid var(--ink); margin-top:8px; }
  .footrow { display:flex; justify-content:space-between; gap:30px; padding:34px 0 60px; font-size:13px; color:var(--ink-soft); }
  .honest { background:#fff; border:3px solid var(--ink); box-shadow:10px 10px 0 rgba(232,160,76,.35); padding:26px 30px; margin:54px 0 0; }
  .honest h4 { font-size:14px; margin-bottom:10px; }
  .honest p { font-size:14px; color:var(--ink-soft); }

  a { color:var(--green); text-decoration-thickness:2px; text-underline-offset:3px; }
  @media (max-width:980px) {
    .hero, .duo, .posts { grid-template-columns:1fr; }
    .trio, .stats { grid-template-columns:1fr 1fr; }
    .gallery { grid-template-columns:1fr 1fr; }
    .bullets { columns:1; }
    .hero h1 { font-size:54px; }
  }
`;

const sprout = (color, size = 30) => {
  const px = [[3,0],[4,0],[2,1],[5,1],[2,2],[5,2],[3,3],[4,3],[3,4],[4,4],[3,5],[4,5],[3,6],[4,6],[3,7],[4,7]];
  const rects = px.map(([x,y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">${rects}</svg>`;
};

const shot = (name, caption, cls = '') =>
  `<figure class="shot ${cls}"><img src="${uri(name)}" alt="${caption}"><figcaption class="mono">${caption}</figcaption></figure>`;

const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${CSS}</style></head>`;

const brandbar = `
  <header class="top"><div class="wrap brandbar">
    <div class="brand">${sprout('#2E8F4C')}<span class="mono">FARMFRIEND</span></div>
    <div class="mono" style="font-size:13px;color:var(--ink-soft)">LAUNCH FIELD REPORT · 2026</div>
  </div></header>`;

/* ---------------------------------------------------------------- page */
const galleryTiles = [
  ['ff-world-story-1080x1920.png', 'STORY 9:16 — WORLD AT NOON'],
  ['ff-simulations-story-1080x1920.png', 'STORY 9:16 — SIMULATIONS'],
  ['ff-world-dawn-4x5-1080x1350.png', 'FEED 4:5 — DAWN OVER SOUTH FIELD'],
  ['ff-blueprint-4x5-1080x1350.png', 'FEED 4:5 — BLUEPRINT'],
  ['ff-world-square-1080x1080.png', 'SQUARE 1:1 — NORTH MEADOW'],
  ['ff-monitoring-square-1080x1080.png', 'SQUARE 1:1 — MONITORING'],
  ['ff-card-hero-1080x1080.png', 'CARD — “PLAN THE BED. WALK THE FARM.”'],
  ['ff-card-sims-bubbles-1080x1080.png', 'CARD — WHAT-IF BUBBLES'],
  ['ff-card-chickens-1080x1920.png', 'CARD — “PAINT A BARN.”'],
  ['ff-card-drought-1080x1080.png', 'CARD — “RUN THE DROUGHT.”'],
  ['ff-card-hero-1080x1920.png', 'CARD — LIVING DIGITAL TWIN'],
  ['ff-card-fieldkit-1080x1080.png', 'CARD — THE FIELD KIT'],
];

const page = head('FarmFriend — Launch Field Report') + `<body>
${brandbar}
<section class="hero wrap" id="hero">
  <div>
    <div class="mono kicker" style="font-size:13px;color:var(--amber);margin-bottom:26px">A VOXEL DIGITAL TWIN FOR REAL GARDENS AND SMALL FARMS</div>
    <h1 class="display">Plan the bed.<br><em>Walk the farm.</em></h1>
    <p class="lead">FarmFriend turns a scale-true garden blueprint into a living 3D voxel world —
       then lets you rehearse the season before you plant it: weather, drought, heat, fertilizer,
       yield, water, profit. All local, all yours.</p>
    <div class="metastrip mono">
      <span>BLUEPRINT 2D</span><span>WORLD 3D</span><span>WHAT-IF SIMS</span><span>LIVE WEATHER</span><span>LOCAL-FIRST</span>
    </div>
  </div>
  ${shot('ff-world-noon-1920x1080.png', 'FIG. 01 — SOUTH WHEAT FIELD, 40×24 M, NOON. EVERY PLANT PLACED BY THE PLAN.')}
</section>

<section class="plate" id="blueprint"><div class="wrap">
  <div class="plate-head"><h2 class="display">The blueprint is the truth.</h2><span class="mono">PLATE 01 · BLUEPRINT</span></div>
  <div class="duo">
    ${shot('ff-blueprint-1920x1080.png', 'FIG. 02 — NORTH MEADOW, 18×12 M. BEDS, PATHS, WATER, COMPANIONS.')}
    <div>
      <h3 class="display">25-centimeter honesty.</h3>
      <p>Every cell is 25 cm. Draw beds with brush, rectangle, line, or fill; drop assets from
         beehives to greenhouses; the plan counts plants, estimates yield, and totals water demand
         as you go.</p>
      <div class="facts mono">
        <span><b>▸</b> SPACING VIOLATIONS FLAGGED IN RED WHILE YOU DRAW</span>
        <span><b>▸</b> COMPANION / ANTAGONIST HALOS FROM REAL DATA</span>
        <span><b>▸</b> STARTER TEMPLATES: SALAD GARDEN, SALSA BED, FOUR-BED ROTATION…</span>
        <span><b>▸</b> EXPORTS PNG PLANS + SHOPPING-LIST CSV</span>
      </div>
    </div>
  </div>
  <div class="duo">
    <div>
      <h3 class="display">Then the plan stands up.</h3>
      <p>One toggle and the same grid becomes an orbitable, paintable voxel world. Greenhouses
         glaze over, ponds shimmer, barns come with cows, pigs and sheep, beehives hum, tool
         props dress themselves by the shed. Scrub the date and crops grow through six stages.</p>
      <div class="facts mono">
        <span><b>▸</b> TIME OF DAY: DAWN → NOON → NIGHT, WITH MOON</span>
        <span><b>▸</b> LIVE WEATHER REACHES THE SKY — RAIN WHEN IT RAINS</span>
        <span><b>▸</b> FLIGHT MODE + GUIDED TOUR</span>
      </div>
    </div>
    ${shot('ff-blueprint-south-1920x1080.png', 'FIG. 03 — SAME PLAN, STANDING UP.')}
  </div>
</div></section>

<section class="plate" id="environments"><div class="wrap">
  <div class="plate-head"><h2 class="display">Three farms, one sky.</h2><span class="mono">PLATE 02 · ENVIRONMENTS</span></div>
  <div class="trio">
    ${shot('ff-world-dawn-1920x1080.png', 'FIG. 04 — DAWN, 05:58. LONG WARM LIGHT.')}
    ${shot('ff-world-noon-1920x1080.png', 'FIG. 05 — NOON. FULL SUN, GROWTH PANEL LIVE.')}
    ${shot('ff-world-night-1920x1080.png', 'FIG. 06 — NIGHT. MOONLIGHT ON THE BEDS.')}
  </div>
  <div class="env-note mono">
    <p>THE WARPED CLOCK PUTS THE SUN WHERE A FARMER FEELS IT — LONG GOLDEN SHOULDERS, A TRUE DARK NIGHT.</p>
    <p>WEATHER IS REAL: THE SKY, CLOUDS AND RAIN FOLLOW THE LIVE FORECAST FOR THE FARM'S COORDINATES.</p>
    <p>SEVEN DEMO FARMS SHIP IN THE BOX — BACKYARD, FIELD, GREENHOUSE, EVEN A MUSHROOM WAREHOUSE.</p>
  </div>
</div></section>

<section class="plate" id="simulations"><div class="wrap">
  <div class="plate-head"><h2 class="display">Rehearse the season.</h2><span class="mono">PLATE 03 · WHAT-IF SIMULATIONS</span></div>
  <div class="duo">
    ${shot('ff-simulations-1920x1080.png', 'FIG. 07 — BASELINE VS DROUGHT VS OPTIMAL, SIDE BY SIDE.')}
    <div>
      <h3 class="display">Ask “what if” before the sky does.</h3>
      <p>Set the dials — temperature, rainfall, fertilizer, duration — or start from presets like
         Drought Stress and Climate +2 °C. Each run returns yield, water use, carbon, estimated
         profit and a stress score, with a plain-language summary and a comparison chart.</p>
      <div class="facts mono">
        <span><b>▸</b> 28.4 → 17.1 T/HA WHEN THE RAIN HALVES</span>
        <span><b>▸</b> OPTIMAL INPUTS: +30% YIELD, MINIMAL STRESS</span>
        <span><b>▸</b> TRANSPARENT LOCAL MODEL — FAST, OFFLINE, EXPLAINABLE</span>
      </div>
    </div>
  </div>
  <div class="bubbles">
    <div class="bubble b-amber tail-r" style="margin-left:auto"><span class="who">YOU, IN FEBRUARY</span>So I can test a drought year… before it happens?</div>
    <div class="bubble b-green tail-l"><span class="who">FARMFRIEND</span>Run the scenario. See yield, water use, and profit — bed by bed, before a single seed goes in.</div>
  </div>
</div></section>

<section class="plate" id="ops"><div class="wrap">
  <div class="plate-head"><h2 class="display">Ground truth, live.</h2><span class="mono">PLATE 04 · WEATHER · SOIL · MONITORING</span></div>
  <div class="trio">
    ${shot('ff-weather-1920x1080.png', 'FIG. 08 — LIVE WEATHER + AGRONOMIC INDICATORS.')}
    ${shot('ff-monitoring-1920x1080.png', 'FIG. 09 — SENSORS, ALERTS, NDVI FIELD HEALTH.')}
    ${shot('ff-calendar-1920x1080.png', 'FIG. 10 — SEASON CALENDAR FROM FROST DATES.')}
  </div>
  <div class="env-note mono">
    <p>OPEN-METEO CURRENTS + 7-DAY FORECAST, SOIL TEMP & MOISTURE, FROST / HEAT / RAIN ALERTS.</p>
    <p>USDA SSURGO SOIL LOOKUP: TEXTURE, PH, ORGANIC MATTER, WATER-HOLDING CAPACITY.</p>
    <p>PLANTING WINDOWS COMPUTED FROM YOUR FROST DATES — SOW, TRANSPLANT, HARVEST, WEEK BY WEEK.</p>
  </div>
</div></section>

<section class="plate" id="kit"><div class="wrap">
  <div class="plate-head"><h2 class="display">The field kit.</h2><span class="mono">PLATE 05 · BY THE NUMBERS</span></div>
  <div class="stats">
    <div class="stat"><div class="n display">50</div><div class="l mono">CROPS WITH GROWTH MODELS & WATER NEEDS</div></div>
    <div class="stat"><div class="n display">6</div><div class="l mono">GROWTH STAGES, ANIMATED ON THE DATE SCRUBBER</div></div>
    <div class="stat"><div class="n display">25cm</div><div class="l mono">GRID CELLS — SCALE-TRUE BEDS UP TO 60×60 M</div></div>
    <div class="stat"><div class="n display">157</div><div class="l mono">HAND-BUILT PROCEDURAL VOXEL ASSETS</div></div>
  </div>
  <div class="honest">
    <h4 class="mono">HONEST NOTES — READ BEFORE PLANTING</h4>
    <p>Simulations are transparent what-if illustrations, not an agronomic oracle. Frost dates are
       climate normals, always user-overridable. Soil profiles need a network connection the first
       time. The farm you walk in 3D is a twin, not a satellite photo — and that's the point.</p>
  </div>
</div></section>

<section class="plate" id="social"><div class="wrap">
  <div class="plate-head"><h2 class="display">Spread it.</h2><span class="mono">PLATE 06 · SOCIAL KIT — ${'SOCIAL/'}</span></div>
  <div class="gallery">
    ${galleryTiles.map(([f, c]) => `<div class="tile"><img src="${thumb(f)}" alt="${c}"><div class="cap mono">${c}</div></div>`).join('')}
  </div>
</div></section>

<section class="plate" id="copy"><div class="wrap">
  <div class="plate-head"><h2 class="display">Say it plain.</h2><span class="mono">PLATE 07 · READY-TO-POST</span></div>
  <ol class="bullets">
    <li><b>Scale-true blueprint.</b> Every cell is 25&nbsp;cm — spacing mistakes happen on screen, not in soil.</li>
    <li><b>One toggle to 3D.</b> The plan stands up as a walkable voxel world with weather, growth and animals.</li>
    <li><b>Rehearse seasons.</b> Drought, heat, fertilizer, climate +2&nbsp;°C — compare yield, water, carbon, profit.</li>
    <li><b>Real companion data.</b> Bad-neighbor crops get flagged before you plant them.</li>
    <li><b>Live weather.</b> Frost, heat and heavy-rain alerts; soil temperature and moisture included.</li>
    <li><b>USDA soil knowledge.</b> Texture, pH, organic matter and water-holding capacity for your plot.</li>
    <li><b>A calendar that knows your frost.</b> Sow indoors, transplant, harvest — computed week by week.</li>
    <li><b>50-crop library.</b> Growth models, water needs and yield estimates for everything you actually grow.</li>
    <li><b>Local-first.</b> Works offline; plans live in your browser; export PNG plans and a seed-shopping CSV.</li>
    <li><b>Free & open source (MIT).</b> Built by people who think farmers deserve beautiful tools.</li>
  </ol>
  <div class="posts" style="margin-top:44px">
    <div class="post"><div class="ph mono">X / TWITTER — LAUNCH POST</div><div class="pb">I can draw my garden bed in 2D, flip a switch, and walk through it in 3D — then simulate a drought year before planting a single seed.

It's called FarmFriend. It's free, open source, and runs entirely in your browser.

Plan the bed. Walk the farm. 🌱</div></div>
    <div class="post"><div class="ph mono">LINKEDIN — THE LONGER PITCH</div><div class="pb">Most garden planning is a spreadsheet with extra steps.

FarmFriend is a digital twin instead: a 25-cm-accurate blueprint of your beds that stands up into a 3D voxel farm — then lets you rehearse the season. Run the drought scenario. Check the frost calendar. Flag the companion-planting mistakes. See USDA soil data for your plot.

Local-first, offline-friendly, MIT-licensed. Agriculture deserves tools this good.</div></div>
    <div class="post"><div class="ph mono">INSTAGRAM / TIKTOK CAPTION</div><div class="pb">POV: you plan your whole farm in a video game that's secretly real 🌱

▸ draw your beds (true 25cm scale)
▸ watch it stand up in 3D
▸ run a drought year for fun
▸ print the shopping list, plant the real thing

Free + open source. Link in bio. #digitaltwin #gardening #farmtech</div></div>
    <div class="post"><div class="ph mono">HACKER NEWS / REDDIT — NO-HYPE VERSION</div><div class="pb">FarmFriend: a local-first garden planner. 2D blueprint at 25cm/cell, one-way-synced to a procedural voxel 3D view; what-if season simulations (yield/water/carbon/profit), Open-Meteo weather with frost alerts, USDA SSURGO soil profiles, companion-planting checks. React + three.js, MIT. Feedback welcome.</div></div>
  </div>
</div></section>

<footer class="end"><div class="wrap footrow">
  <div>Live demo: <a href="http://localhost:5173">http://localhost:5173</a> · repo: <b>ff-voxel-twin</b></div>
  <div class="mono">FULL-RES ASSETS IN /SOCIAL · 26 FILES · PNG</div>
  <div>FARMFRIEND — VOXEL DIGITAL TWIN · MIT</div>
</div></footer>
</body></html>`;

writeFileSync(join(ROOT, 'index.html'), page);
console.log('index.html written');

/* ---------------------------------------------------------------- deck (PDF) */
const slide = (title, kicker, body) => ({ title, kicker, body });
const slideShell = (s, i) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
  @page { size:1280px 720px; margin:0; }
  body { width:1280px; height:720px; overflow:hidden; }
  .slide { height:100%; display:flex; flex-direction:column; padding:44px 56px; }
  .s-head { display:flex; justify-content:space-between; align-items:baseline; border-bottom:3px solid var(--ink); padding-bottom:14px; margin-bottom:26px; }
  .s-head h2 { font-size:34px; }
  .cover { justify-content:center; }
  .cover h1 { font-size:88px; }
</style></head><body><div class="slide ${s.kicker === 'COVER' ? 'cover' : ''}">
  <div class="s-head"><h2 class="display">${s.title}</h2><span class="mono" style="font-size:12px;color:var(--ink-soft)">${s.kicker}</span></div>
  ${s.body}
</div></body></html>`;

const shots64 = (names) => names.map((n) => `<img src="${b64(img(n))}" style="width:${100 / names.length}%; display:inline-block;">`);

const deck = [
  slide('FarmFriend', 'COVER · VOXEL DIGITAL TWIN', `
    <div style="display:grid;grid-template-columns:1fr 1.1fr;gap:40px;align-items:center;flex:1;">
      <div>
        <h1 class="display" style="margin-bottom:8px">Plan the bed.<br><span style="color:var(--green)">Walk the farm.</span></h1>
        <p style="color:var(--ink-soft);font-size:19px;margin-top:22px">A voxel digital twin for real gardens and small farms.
        Blueprint at 25&nbsp;cm, walk it in 3D, rehearse the season, then plant the real thing.</p>
        <div class="metastrip mono" style="margin-top:28px"><span>BLUEPRINT 2D</span><span>WORLD 3D</span><span>SIMULATIONS</span><span>LOCAL-FIRST</span></div>
      </div>
      <figure class="shot">${`<img src="${b64(img('ff-world-noon-1920x1080.png'))}" style="width:100%">`}<figcaption class="mono">SOUTH WHEAT FIELD AT NOON — 40×24 M, EVERY PLANT FROM THE PLAN</figcaption></figure>
    </div>`),
  slide('The blueprint is the truth', 'PLATE 01 · BLUEPRINT 2D', `
    <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:36px;flex:1;align-items:center;">
      <figure class="shot">${`<img src="${b64(img('ff-blueprint-1920x1080.png'))}" style="width:100%">`}<figcaption class="mono">NORTH MEADOW — BEDS, PATHS, WATER, COMPANION HALOS</figcaption></figure>
      <div class="facts mono" style="display:flex;flex-direction:column;gap:14px;font-size:14px">
        <span><b>▸</b> 25 CM CELLS — SPACING IS REAL BEFORE YOU DIG</span>
        <span><b>▸</b> PLANT COUNTS, YIELD EST., WATER DEMAND LIVE</span>
        <span><b>▸</b> SPACING VIOLATIONS + COMPANION OVERLAYS</span>
        <span><b>▸</b> TEMPLATES: SALAD GARDEN · SALSA BED · FOUR-BED ROTATION</span>
        <span><b>▸</b> PNG EXPORT + SHOPPING-LIST CSV</span>
      </div>
    </div>`),
  slide('Then the plan stands up', 'PLATE 02 · WORLD 3D', `
    <div style="flex:1;display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;gap:16px;height:62%">
        ${['ff-world-dawn-1920x1080.png','ff-world-noon-1920x1080.png','ff-world-night-1920x1080.png'].map((n) =>
          `<figure class="shot" style="flex:1">${`<img src="${b64(img(n))}" style="width:100%;height:100%;object-fit:cover">`}</figure>`).join('')}
      </div>
      <div class="env-note mono" style="margin:0"><p>DAWN 05:58 — WARM AND LOW.</p><p>NOON — FULL SUN, LIVE GROWTH PANEL.</p><p>NIGHT — MOONLIGHT; THE DAY ACTUALLY ENDS.</p></div>
    </div>`),
  slide('Rehearse the season', 'PLATE 03 · WHAT-IF SIMULATIONS', `
    <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:36px;flex:1;align-items:center;">
      <figure class="shot">${`<img src="${b64(img('ff-simulations-1920x1080.png'))}" style="width:100%">`}<figcaption class="mono">BASELINE VS DROUGHT VS OPTIMAL — YIELD, WATER, CARBON, PROFIT</figcaption></figure>
      <div class="facts mono" style="display:flex;flex-direction:column;gap:14px;font-size:14px">
        <span><b>▸</b> PRESETS: DROUGHT · HEAT · OPTIMAL · CLIMATE +2°C</span>
        <span><b>▸</b> 28.4 → 17.1 T/HA WHEN THE RAIN HALVES</span>
        <span><b>▸</b> OPTIMAL INPUTS: +30% YIELD, LOW STRESS</span>
        <span><b>▸</b> TRANSPARENT LOCAL MODEL — OFFLINE & EXPLAINABLE</span>
      </div>
    </div>`),
  slide('Ground truth, live', 'PLATE 04 · WEATHER · SOIL · MONITORING', `
    <div style="flex:1;display:flex;gap:16px">
      ${['ff-weather-1920x1080.png','ff-monitoring-1920x1080.png','ff-calendar-1920x1080.png'].map((n) =>
        `<figure class="shot" style="flex:1">${`<img src="${b64(img(n))}" style="width:100%;height:100%;object-fit:cover">`}</figure>`).join('')}
    </div>`),
  slide('The field kit', 'PLATE 05 · BY THE NUMBERS', `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:34px">
      <div class="stats">
        <div class="stat"><div class="n display">50</div><div class="l mono">CROPS WITH GROWTH MODELS</div></div>
        <div class="stat"><div class="n display">6</div><div class="l mono">ANIMATED GROWTH STAGES</div></div>
        <div class="stat"><div class="n display">25cm</div><div class="l mono">SCALE-TRUE GRID CELLS</div></div>
        <div class="stat"><div class="n display">157</div><div class="l mono">PROCEDURAL VOXEL ASSETS</div></div>
      </div>
      <div class="honest" style="margin:0"><h4 class="mono">HONEST NOTES</h4>
        <p>Simulations are transparent what-if illustrations, not an agronomic oracle. Frost dates are climate
        normals, always overridable. The twin is a planning twin, not a satellite photo — and that's the point.</p></div>
    </div>`),
  slide('Spread it', 'PLATE 06 · SOCIAL KIT', `
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px">
      ${[
        [['ff-world-story-1080x1920.png','STORY 9:16'], ['ff-card-hero-1080x1920.png','STORY CARD'], ['ff-world-square-1080x1080.png','SQUARE 1:1']],
        [['ff-card-sims-bubbles-1080x1080.png','BUBBLE CARD'], ['ff-world-dawn-4x5-1080x1350.png','FEED 4:5'], ['ff-card-chickens-1080x1920.png','CONVO CARD']],
      ].map((row) => `<div style="display:flex;gap:14px;justify-content:center;align-items:flex-end">${row.map(([n, c]) => {
        const [w, h] = n.match(/(\d+)x(\d+)\.png$/).slice(1).map(Number);
        const dispH = 240, dispW = Math.round(w / h * dispH);
        return `<figure class="shot" style="margin:0"><img src="${b64(img(n))}" style="height:${dispH}px;width:${dispW}px;display:block;object-fit:fill"><figcaption class="mono" style="text-align:center;font-size:10px;padding:6px 8px">${c}</figcaption></figure>`;
      }).join('')}</div>`).join('')}
      <div class="mono" style="text-align:center;font-size:11px;color:var(--ink-soft);margin-top:6px">SHOWN AT NATIVE ASPECT — 26 FULL-RES FILES IN /SOCIAL</div>
    </div>`),
  slide('Say it plain', 'PLATE 07 · READY TO POST', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;flex:1">
      <div class="post"><div class="ph mono">X / TWITTER</div><div class="pb" style="font-size:14.5px">I can draw my garden bed in 2D, flip a switch, and walk through it in 3D — then simulate a drought year before planting a single seed.

FarmFriend. Free, open source, runs in your browser.

Plan the bed. Walk the farm. 🌱</div></div>
      <div class="post"><div class="ph mono">LINKEDIN</div><div class="pb" style="font-size:14.5px">Most garden planning is a spreadsheet with extra steps. FarmFriend is a digital twin instead: a 25-cm blueprint that stands up into a 3D voxel farm — then lets you rehearse the season before you commit a single seed.

Local-first. Offline-friendly. MIT.</div></div>
      <div class="post"><div class="ph mono">TIKTOK / REELS HOOK</div><div class="pb" style="font-size:14.5px">POV: you plan your whole farm in a video game that's secretly real 🌱 draw the beds → watch them stand up in 3D → run a drought year → print the shopping list → plant the real thing.</div></div>
      <div class="post"><div class="ph mono">THE LINE TO REMEMBER</div><div class="pb display" style="font-size:30px;line-height:1.15">“Plan the bed. Walk the farm.”</div></div>
    </div>`),
];

deck.forEach((s, i) => {
  const n = String(i + 1).padStart(2, '0');
  writeFileSync(join(ROOT, `slide-${n}.html`), slideShell(s, i));
});
/* One proper document: fixed 1280x720 sections, one per PDF page. */
const deckDoc = `<!doctype html><html><head><meta charset="utf-8"><style>
${CSS}
@page { size:1280px 720px; margin:0; }
html, body { margin:0; padding:0; background:#fff; }
.slide-page { width:1280px; height:720px; overflow:hidden; display:flex; flex-direction:column;
              padding:44px 56px; break-after:page; page-break-after:always; }
.slide-page:last-child { break-after:auto; page-break-after:auto; }
.s-head { display:flex; justify-content:space-between; align-items:baseline; border-bottom:3px solid var(--ink); padding-bottom:14px; margin-bottom:26px; }
.s-head h2 { font-size:34px; }
.cover { justify-content:center; }
.cover h1 { font-size:88px; }
</style></head><body>
${deck.map((s) => `<section class="slide-page ${s.kicker === 'COVER' ? 'cover' : ''}">
  <div class="s-head"><h2 class="display">${s.title}</h2><span class="mono" style="font-size:12px;color:var(--ink-soft)">${s.kicker}</span></div>
  ${s.body}
</section>`).join('\n')}
</body></html>`;
writeFileSync(join(ROOT, 'deck.html'), deckDoc);
console.log('deck.html + slides written');

/* ---------------------------------------------------------------- print PDF */
if (existsSync(CHROME)) {
  const pdfPath = join(ROOT, 'FarmFriend-Launch.pdf');
  const res = spawnSync(CHROME, [
    '--headless', '--no-first-run', '--no-sandbox', '--disable-crashpad', '--disable-breakpad',
    `--crash-dumps-dir=${tmpdir()}`, '--disable-dev-shm-usage',
    '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, join(ROOT, 'deck.html'),
  ], { timeout: 60000 });
  if (existsSync(pdfPath)) console.log(`PDF written: ${pdfPath} (${statSync(pdfPath).size} bytes)`);
  else { console.error('PDF failed', res.stderr?.toString().slice(0, 400)); process.exitCode = 1; }
} else {
  console.error('Chrome not found; PDF skipped');
}
