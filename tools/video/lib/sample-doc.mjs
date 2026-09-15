/**
 * The canonical FarmFriend 60-second demo document — single source of truth
 * shared by `script-doc.mjs scaffold`, the Script Studio demo button, and the
 * self-test. `sampleDoc()` returns a fresh deep copy each call.
 */

const RAW = {
  storyboard: {
    frontmatter: {
      format: '1920x1080',
      duration: '60s',
      message:
        'Plan it before you plant it — FarmFriend turns a blank plot into a simulated, living farm',
      arc: 'Hook → Draw → Stand up → Grow → Test → Act',
      audience: 'Gardeners, small farmers, and makers evaluating planning tools',
      mode: 'autonomous',
      extra: {},
    },
    frames: [
      {
        number: 1,
        title: 'Hook',
        status: 'outline',
        src: 'compositions/frames/01-hook.html',
        duration: 5,
        transitionIn: 'cut',
        poster: 2,
        scene: 'Voxel island at noon — a farm as a living digital twin',
        voiceover: 'Meet FarmFriend — your farm as a living digital twin you can actually simulate.',
        delivery: 'Warm, confident. Land the promise on the beat.',
        tags: ['capabilities'],
        assetCandidates: ['capture/assets/world-noon.png'],
        narrative:
          'Open on the full island in afternoon light with a slow push in. Title type punches in on the beat.',
      },
      {
        number: 2,
        title: 'Blueprint workflow',
        status: 'outline',
        src: 'compositions/frames/02-blueprint.html',
        duration: 8,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'Blueprint painting with live spacing + companion overlays',
        voiceover:
          'Start on the blueprint. Paint beds, place assets, and live agronomy checks flag spacing problems and companion matches as you draw.',
        delivery: 'Brisk, practical.',
        tags: ['workflows'],
        assetCandidates: ['capture/assets/blueprint-overlays.png'],
        narrative:
          'A cursor paints beds across the grid; a spacing violation tints red, a companion halo glows green. Keep the real toolbar visible.',
      },
      {
        number: 3,
        title: 'Starter templates',
        status: 'outline',
        src: 'compositions/frames/03-templates.html',
        duration: 6,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'One-click starter templates',
        voiceover:
          'Short on time? Drop in a starter template — salad garden, salsa bed, four-bed rotation — then undo anything.',
        delivery: 'Light, helpful.',
        tags: ['workflows'],
        assetCandidates: ['capture/assets/blueprint-templates.png'],
        narrative:
          'The templates card fans out; one template applies across the canvas with a wipe; the undo arrow spins it back for a beat.',
      },
      {
        number: 4,
        title: 'Blueprint to World',
        status: 'outline',
        src: 'compositions/frames/04-world-flip.html',
        duration: 8,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'Blueprint → World: the plan stands up in 3D',
        voiceover:
          'Then flip to the world, and your plan stands up in 3D — every bed, barn, and hive placed exactly where you drew it.',
        delivery: 'The wow moment — let it breathe.',
        tags: ['pipelines'],
        assetCandidates: ['capture/assets/blueprint-overlays.png', 'capture/assets/world-noon.png'],
        narrative:
          'The blueprint plane tilts back and extrudes into the 3D island; camera sweeps past barn and hives; animals idle nearby.',
      },
      {
        number: 5,
        title: 'Growth time-lapse',
        status: 'outline',
        src: 'compositions/frames/05-growth.html',
        duration: 8,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'Six growth stages on the sim clock',
        voiceover:
          'Scrub time forward and crops grow through six real stages, driven by a deterministic simulation engine — same inputs, same result, every replay.',
        delivery: 'Matter-of-fact authority on "deterministic".',
        tags: ['capabilities', 'pipelines'],
        assetCandidates: ['capture/assets/showcase-crops.png', 'capture/assets/world-dawn.png'],
        narrative:
          'Time-lapse one bed from sprout to harvest through the six stage builds; a small "replay: byte-identical" chip resolves on screen.',
      },
      {
        number: 6,
        title: 'Sky and weather',
        status: 'outline',
        src: 'compositions/frames/06-weather.html',
        duration: 6,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'Day–night cycle with live weather',
        voiceover: 'Real weather moves through the world too — day, night, and even rain, all included.',
        delivery: 'Relaxed.',
        tags: ['capabilities'],
        assetCandidates: ['capture/assets/world-dusk.png', 'capture/assets/world-night.png'],
        narrative: 'Sun arcs to dusk, then moonlit night; the cloud deck drifts; rain streaks the scene if captured.',
      },
      {
        number: 7,
        title: 'A/B simulation',
        status: 'outline',
        src: 'compositions/frames/07-sim-ab.html',
        duration: 8,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'A/B sim compare with ghost overlay',
        voiceover:
          'Test decisions before you plant: run two simulations side by side, overlay the ghost, and compare yield, water, and ecosystem impact.',
        delivery: 'Sharp; this is the differentiator.',
        tags: ['workflows', 'pipelines'],
        assetCandidates: ['capture/assets/sims-ab.png', 'capture/assets/world-noon.png'],
        narrative:
          'The simulations list splits into A and B; the world shows the baseline solid against a translucent ghost; a compare chip counts up deltas.',
      },
      {
        number: 8,
        title: 'Ops views',
        status: 'outline',
        src: 'compositions/frames/08-ops.html',
        duration: 6,
        transitionIn: 'crossfade',
        poster: 2,
        scene: 'Calendar + weather ops views',
        voiceover:
          'Your plan becomes a workload: sow, transplant, and harvest dates land on a calendar tied to live forecasts.',
        delivery: 'Grounded, practical close-out.',
        tags: ['workflows'],
        assetCandidates: ['capture/assets/calendar.png', 'capture/assets/weather.png'],
        narrative:
          'Calendar bars sweep in week by week; the weather panel with its soil card slides in from the right.',
      },
      {
        number: 9,
        title: 'CTA',
        status: 'outline',
        src: 'compositions/frames/09-cta.html',
        duration: 5,
        transitionIn: 'cut',
        poster: 2,
        scene: '157-asset voxel library + CTA',
        voiceover: 'Under it all: 157 hand-built voxel assets. FarmFriend — plan it before you plant it.',
        delivery: 'Stamp the tagline; hold a beat.',
        tags: ['pipelines'],
        assetCandidates: ['capture/assets/showcase-sheet.png', 'capture/assets/dashboard.png'],
        narrative:
          'The asset-library contact sheet scales into a grid wall; logo and tagline land center; hold.',
      },
    ],
  },
  script: {
    title: 'farmfriend-demo',
    voice: 'Local Kokoro — am_michael (offline)',
    voiceSettings: 'speed 1.0',
    voiceDirection: 'Confident, warm product-demo narrator. Clear enunciation, no hype.',
    lines: [
      { n: 1, label: 'Hook', frame: 1, start: 0, end: 5, delivery: 'Warm, confident. Land the promise on the beat.', text: 'Meet FarmFriend — your farm as a living digital twin you can actually simulate.' },
      { n: 2, label: 'Blueprint workflow', frame: 2, start: 5, end: 13, delivery: 'Brisk, practical.', text: 'Start on the blueprint. Paint beds, place assets, and live agronomy checks flag spacing problems and companion matches as you draw.' },
      { n: 3, label: 'Starter templates', frame: 3, start: 13, end: 19, delivery: 'Light, helpful.', text: 'Short on time? Drop in a starter template — salad garden, salsa bed, four-bed rotation — then undo anything.' },
      { n: 4, label: 'Blueprint to World', frame: 4, start: 19, end: 27, delivery: 'The wow moment — let it breathe.', text: 'Then flip to the world, and your plan stands up in 3D — every bed, barn, and hive placed exactly where you drew it.' },
      { n: 5, label: 'Growth time-lapse', frame: 5, start: 27, end: 35, delivery: 'Matter-of-fact authority on "deterministic".', text: 'Scrub time forward and crops grow through six real stages, driven by a deterministic simulation engine — same inputs, same result, every replay.' },
      { n: 6, label: 'Sky and weather', frame: 6, start: 35, end: 41, delivery: 'Relaxed.', text: 'Real weather moves through the world too — day, night, and even rain, all included.' },
      { n: 7, label: 'A/B simulation', frame: 7, start: 41, end: 49, delivery: 'Sharp; this is the differentiator.', text: 'Test decisions before you plant: run two simulations side by side, overlay the ghost, and compare yield, water, and ecosystem impact.' },
      { n: 8, label: 'Ops views', frame: 8, start: 49, end: 55, delivery: 'Grounded, practical close-out.', text: 'Your plan becomes a workload: sow, transplant, and harvest dates land on a calendar tied to live forecasts.' },
      { n: 9, label: 'CTA', frame: 9, start: 55, end: 60, delivery: 'Stamp the tagline; hold a beat.', text: 'Under it all: 157 hand-built voxel assets. FarmFriend — plan it before you plant it.' },
    ],
  },
};

export function sampleDoc() {
  return JSON.parse(JSON.stringify(RAW));
}
