#!/usr/bin/env node
/**
 * Generates the FarmFriend launch-kit quote/social cards as standalone HTML
 * files. Render each with tools/appshot.mjs at the matching WxH.
 *   node build-cards.mjs <outDir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'cards-out');
mkdirSync(outDir, { recursive: true });

const CSS = `
  :root {
    --night: #0B120C; --field: #16241A; --green: #46C46B; --green-deep: #2E8F4C;
    --amber: #E8A04C; --paper: #F2EDDE; --ink: #20261F; --ink-soft: #5A6153;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    display: flex; flex-direction: column;
    font-family: -apple-system, "Helvetica Neue", sans-serif;
  }
  .dark { background: radial-gradient(120% 90% at 50% 0%, #17251A 0%, var(--night) 62%); color: var(--paper); }
  .paper { background: var(--paper); color: var(--ink); }
  /* faint voxel checker so flat fields still carry texture */
  .voxel-bg { position: relative; }
  .voxel-bg::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 64px 64px;
  }
  .paper.voxel-bg::before {
    background-image:
      linear-gradient(rgba(32,38,31,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(32,38,31,0.05) 1px, transparent 1px);
    background-size: 64px 64px;
  }
  .pad { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; }
  .display { font-family: "Futura", "Futura PT", "Avenir Next", "Trebuchet MS", sans-serif; font-weight: 800; line-height: 0.98; letter-spacing: -0.015em; }
  .mono { font-family: "Menlo", "SF Mono", ui-monospace, monospace; letter-spacing: 0.22em; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .sprout { width: 30px; height: 30px; image-rendering: pixelated; }
  .rule { height: 3px; background: currentColor; opacity: .9; }

  /* voxel speech bubbles: hard corners, stepped pixel tail, hard offset shadow */
  .bubble {
    position: relative; padding: 44px 52px; max-width: 86%;
    font-size: 44px; line-height: 1.3; font-weight: 600;
    box-shadow: 12px 12px 0 rgba(32,38,31,0.22);
  }
  .bubble .who { display:block; font-family:"Menlo",monospace; font-size: 19px; letter-spacing:.28em; margin-bottom: 14px; opacity:.75; }
  .b-green { background: var(--green); color: #08130A; }
  .b-amber { background: var(--amber); color: #241503; }
  .b-paper { background: #FFFFFF; color: var(--ink); box-shadow: 12px 12px 0 rgba(32,38,31,0.12); }
  .tail-l::after, .tail-r::after {
    content: ""; position: absolute; bottom: -36px; width: 36px; height: 36px;
    background: inherit;
  }
  .tail-l::after { left: 54px; clip-path: polygon(0 0, 100% 0, 0 100%); }
  .tail-r::after { right: 54px; clip-path: polygon(0 0, 100% 0, 100% 100%); }
`;

function sprout(color) {
  // 8x8 pixel sprout as inline SVG
  const px = [
    [3,0],[4,0],[2,1],[5,1],[2,2],[5,2],[3,3],[4,3],[3,4],[4,4],[3,5],[4,5],[3,6],[4,6],[3,7],[4,7],
  ];
  const rects = px.map(([x,y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`).join('');
  return `<svg class="sprout" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

const footer = (cls, left, right) => `
  <div class="pad" style="flex-direction:row; align-items:center; justify-content:space-between; padding: 0 64px 44px;">
    <div class="mono" style="font-size:17px; opacity:.7;">${left}</div>
    <div class="mono" style="font-size:17px; opacity:.7;">${right}</div>
  </div>`;

const brandRow = (color, label) => `
  <div class="pad" style="flex-direction:row; align-items:center; gap:16px; padding: 52px 64px 0;">
    ${sprout(color)}
    <span class="mono" style="font-size:19px; letter-spacing:.3em;">${label}</span>
  </div>`;

const cards = {
  // 1 — hero statement, square, dark
  'card-hero-square': { size: [1080, 1080], html: (c) => `
<body class="dark voxel-bg">
  <div class="pad">
    ${brandRow('#46C46B', 'FARMFRIEND · VOXEL DIGITAL TWIN')}
    <div class="pad" style="justify-content:center; padding: 0 72px;">
      <h1 class="display" style="font-size:128px; color:var(--paper);">Plan the bed.<br><span style="color:var(--green);">Walk the farm.</span></h1>
      <p style="font-size:34px; line-height:1.45; margin-top:40px; color:#C9D2C4; max-width:820px;">
        Draw your garden on a 25&nbsp;cm blueprint. Watch it stand up as a living voxel
        world — weather, growth, and animals included.
      </p>
    </div>
    ${footer(c, 'LOCAL-FIRST', 'WORKS OFFLINE · YOUR DATA STAYS YOURS')}
  </div>
</body>` },

  // 2 — stats, square, paper
  'card-stats-square': { size: [1080, 1080], html: (c) => `
<body class="paper voxel-bg">
  <div class="pad">
    ${brandRow('#2E8F4C', 'THE FIELD KIT')}
    <div class="pad" style="justify-content:center; padding: 0 72px;">
      <h1 class="display" style="font-size:74px;">One grid. <span style="color:var(--green-deep);">Every decision.</span></h1>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:26px; margin-top:56px;">
        ${[['50','crops in the library'],['6','growth stages, animated'],['25 cm','grid cells, scale-true'],['157','hand-built voxel assets']]
          .map(([n,l]) => `<div style="background:#fff; border:3px solid var(--ink); box-shadow:10px 10px 0 rgba(32,38,31,.18); padding:34px 36px;">
            <div class="display" style="font-size:96px; color:var(--green-deep);">${n}</div>
            <div class="mono" style="font-size:18px; margin-top:10px; letter-spacing:.14em;">${l.toUpperCase()}</div>
          </div>`).join('')}
      </div>
    </div>
    ${footer(c, 'FARMFRIEND', 'BLUEPRINT → 3D → SIMULATE')}
  </div>
</body>` },

  // 3 — simulation bubbles, square, paper
  'card-bubbles-square': { size: [1080, 1080], html: (c) => `
<body class="paper voxel-bg">
  <div class="pad">
    ${brandRow('#2E8F4C', 'WHAT-IF SIMULATIONS')}
    <div class="pad" style="justify-content:center; gap:70px; padding: 0 72px;">
      <div class="bubble b-amber tail-r" style="margin-left:auto;"><span class="who">YOU, IN FEBRUARY</span>So I can test a drought year… before it happens?</div>
      <div class="bubble b-green tail-l"><span class="who">FARMFRIEND</span>Run the scenario. See yield, water use, and profit — bed by bed, before a single seed goes in.</div>
    </div>
    ${footer(c, 'DROUGHT · HEAT · FERTILIZER · CLIMATE +2°C', 'RUN IT TWICE')}
  </div>
</body>` },

  // 4 — drought line, square, dark
  'card-drought-square': { size: [1080, 1080], html: (c) => `
<body class="dark voxel-bg">
  <div class="pad">
    ${brandRow('#46C46B', 'FARMFRIEND · WHAT-IF SIMULATIONS')}
    <div class="pad" style="justify-content:center; padding: 0 72px;">
      <h1 class="display" style="font-size:112px; color:var(--paper);">Run the <span style="color:var(--amber);">drought</span><br>before it runs you.</h1>
      <p style="font-size:33px; line-height:1.5; margin-top:44px; color:#C9D2C4; max-width:830px;">
        Heat stress, half the rain, double the fertilizer — set the dials, run the season,
        compare the yield. All local, all yours, in seconds.
      </p>
    </div>
    ${footer(c, 'YIELD · WATER · CARBON · PROFIT', 'PER HECTARE, PER SCENARIO')}
  </div>
</body>` },

  // 5 — hero story, dark
  'card-hero-story': { size: [1080, 1920], html: (c) => `
<body class="dark voxel-bg">
  <div class="pad">
    ${brandRow('#46C46B', 'FARMFRIEND')}
    <div class="pad" style="justify-content:center; padding: 0 78px;">
      <div class="mono" style="font-size:22px; letter-spacing:.3em; color:var(--amber); margin-bottom:36px;">VOXEL DIGITAL TWIN</div>
      <h1 class="display" style="font-size:150px; color:var(--paper);">Your farm,<br>as a <span style="color:var(--green);">living</span><br>digital twin.</h1>
      <p style="font-size:38px; line-height:1.5; margin-top:48px; color:#C9D2C4;">
        Blueprint it. Walk it in 3D.<br>Simulate the season.<br>Then plant the real thing.
      </p>
    </div>
    ${footer(c, 'LOCAL-FIRST · OFFLINE', 'FREE & OPEN SOURCE')}
  </div>
</body>` },

  // 6 — bubble conversation, story, paper
  'card-bubbles-story': { size: [1080, 1920], html: (c) => `
<body class="paper voxel-bg">
  <div class="pad">
    ${brandRow('#2E8F4C', 'FARMFRIEND · BLUEPRINT → WORLD')}
    <div class="pad" style="justify-content:center; gap:56px; padding: 0 76px;">
      <div class="bubble b-paper tail-r" style="margin-left:auto; font-size:46px;"><span class="who">A NEIGHBOR</span>You drew that whole garden plan in 2D?</div>
      <div class="bubble b-green tail-l" style="font-size:46px;"><span class="who">YOU</span>Yup. Then it stands up into a 3D world you can walk through.</div>
      <div class="bubble b-paper tail-r" style="margin-left:auto; font-size:46px;"><span class="who">A NEIGHBOR</span>…with chickens?</div>
      <div class="bubble b-amber tail-l" style="font-size:46px;"><span class="who">YOU</span>Paint a barn. You'll get chickens.</div>
    </div>
    ${footer(c, 'REAL COMPANION-PLANTING DATA', 'SPACING CHECKS INCLUDED')}
  </div>
</body>` },
};

for (const [name, card] of Object.entries(cards)) {
  const [w, h] = card.size;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>${card.html({})}` +
    `</html>`;
  const file = join(outDir, `${name}-${w}x${h}.html`);
  writeFileSync(file, html);
  console.log(`${file}`);
}
