# Plan: Pro Upgrade — Fun UX & Game Layer

**Branch:** `pro-upgrade` | **Date:** 2026-08-01
**Theme:** Turn the "boring" 3D digital twin into a delightful, gamified farm experience — flyable planes, weather, animals, tours, game loops.

---

## Current State

3D Phases 0-5 are complete. The World3D view shows:
- Procedural plants (6 archetypes, 47 crops), structures (19 assets), baked ground texture
- Date-scrub growth animation, edit-in-3D via raycasting, undo/redo ghost ghosts
- Camera orbit via `camera-controls`

The 2D Blueprint editor is feature-complete (brush/rect/asset/erase tools, 50-level undo, autosave, exports, calendar, weather).

**What's missing:** The 3D world feels static. No life, no movement, no weather, no flight, no fun. It's a digital twin that's technically correct but emotionally flat.

---

## Architecture Decision

All new 3D systems are **vanilla THREE.js modules** under `src/three/`, following the existing pattern (no react-three-fiber — React 18 constraint). Each system owns its lifecycle (init → update(dt) → dispose) and is wired into `World3D.tsx`. The `PlanState` + `usePlanEditor` seam is never forked.

**Tiny World Builder (TWB) is our reference library.** TWB has solved every problem we face: flight physics, cloud particles, animal animation, atmosphere, time-of-day, and audio. We port ideas and patterns, not copy-paste (TWB is AGPL-3.0, we are MIT; architecture-only reference is fine). Code is written fresh in TypeScript for our codebase.

---

## Phases

### Phase 1 — Environment & Atmosphere (the "wow" layer)

**Goal:** The 3D world feels alive the moment you toggle it.

#### 1a. Dynamic Sky + Time-of-Day
- `src/three/sky.ts` — gradient sky dome (SphereGeometry, ShaderMaterial with sun position)
- Time slider or auto-cycle (1 real second = 10 game minutes)
- Sun position affects shadow direction, ambient light color shifts (golden hour, blue night)
- Passes sun direction to other systems

#### 1b. Procedural Clouds
- `src/three/clouds.ts` — layered cloud planes or particle-based clouds
- Wind-driven drift, varying opacity/coverage
- Tied to weather data: cloud cover from Open-Meteo maps to cloud density
- At least 2 layers (cirrus high, cumulus low) for parallax

#### 1c. Weather Particles
- `src/three/weather-fx.ts` — rain, snow, mist particles
- Rain: falling streak sprites with splash on ground (small rings)
- Snow: slow-falling flakes with wind drift
- Fog: distance-based exponential fog tied to humidity
- All gated by live Open-Meteo weather data (precipMm, cloud cover, temp)

#### 1d. Ground Enhancements
- Pond/water-tap assets get reflective water plane (semi-transparent blue with subtle wave vertex animation)
- Path assets get subtle terrain texture variation
- Fence/gate/trelle get post shadow casting

### Phase 2 — Tour Mode (fly the farm)

**Goal:** Tap a button, enter a flyable camera that sweeps over the farm.

#### 2a. Flight Camera + Physics
- `src/three/flight.ts` — free-flight camera with arcade physics
- WASD/arrow keys: pitch/yaw/roll + throttle
- Mouse for free-look, Q/E for rudder
- Altitude limits (2m min above ground, 100m max)
- Reference: TWB `34-flight-sim.js` flight physics (sim-space to scene-space transform pattern)

#### 2b. Tour Waypoints
- `src/three/tour.ts` — guided tour mode
- Pre-generated camera path: overview orbit → sweep over crops → hover at greenhouse → fly through paths → return to overview
- "Start Tour" button in World3D footer, progress bar, skip/next controls
- Smooth CatmullRomCurve3 interpolation between waypoints, auto-lookAt next point

#### 2c. In-Flight HUD
- Mini speed gauge, altitude readout
- Current weather overlay (temp, wind, precip)
- Crop labels float as billboards when camera passes over planting areas

### Phase 3 — Farm Life (animals & activity)

**Goal:** The farm has movement — bees, chickens, swaying crops.

#### 3a. Procedural Animals
- `src/three/animals.ts`
- **Bees**: small yellow/black sphere swarms around beehive assets, figure-8 or boid flocking paths, produces particle trail
- **Chickens**: tiny box-geometry birds around chicken-coop, pecking animation, wander within radius
- **Butterflies**: colorful sprite particles near flower crops

#### 3b. Plant Animation Enhancements
- Gentle wind sway on tall crops (corn, sunflower): vertex displacement on cylinder geometries
- Crop rotation: subtle spin on sphere parts
- Flower head bob: sinusoidal Y oscillation

#### 3c. Water Animation
- Pond: transparent plane with vertex wave animation (sin(time + x + z))
- Irrigation lines: thin blue tubes from water-tap to nearest beds (during "watering" visual phase)

### Phase 4 — Game Loops & Goals

**Goal:** Add light gamification — goals, achievements, visual feedback loops.

#### 4a. Achievement System
- `src/three/achievements.ts` + `src/lib/achievements.ts`
- Unlockable toast notifications in 3D view
- Goals: "Plant 5 different families" → confetti particles, "Fill 50% of beds" → golden glow, "Harvest ready" indicator
- LocalStorage-persisted achievement state

#### 4b. Growth Celebrations
- When date is scrubbed and crops enter harvest window → particle burst (gold sparkles), crops glow briefly
- Companion synergy celebration: when two companion crops are adjacent → subtle green connection lines

#### 4c. Weather-Driven Events
- Rain → water level rises in rain-barrel asset (animated fill)
- Frost warning → frost particle overlay on tender crops
- Heat wave → heat shimmer shader on ground

#### 4d. Performance HUD
- `src/three/perf.ts` — optional FPS counter, draw-call count, triangle count
- Togglable debug overlay (hidden by default, shown via `?debug=1`)

### Phase 5 — Audio Atmosphere

**Goal:** Sound makes the 3D world immersive.

#### 5a. Ambient Sound System
- `src/three/audio.ts`
- Web Audio API-based procedural sounds (no asset files needed):
  - Wind: filtered noise, volume tied to wind speed from weather
  - Birds: random chirp oscillators near tree/bush areas
  - Water: gentle noise near pond assets
  - Rain: white noise with low-pass filter, volume tied to precipMm
- Spatial audio: volume falls off with camera distance from sources

#### 5b. Interaction Sounds
- Place/erase in 3D → satisfying pop/click
- Tour mode start → whoosh
- Achievement unlock → chime

### Phase 6 — Polish & Integration

**Goal:** Everything works together, nothing regresses.

#### 6a. World3D Orchestration
- `World3D.tsx` becomes a thin orchestrator: props in, calls init/dispose/update on each system
- Each system gets `{ enabled: boolean }` in its options for toggling
- Systems that depend on each other receive references via the orchestrator (e.g., sky passes sun direction to clouds, weather-fx reads from weather hook)

#### 6b. UI/UX for New Features
- Tour mode button + progress bar in World3D footer
- Time-of-day slider or auto-cycle toggle
- Weather FX toggle (on/off/auto)
- Achievement toast component
- Debug overlay toggle

#### 6c. Type System
- `src/types/index.ts` additions: `TourWaypoint`, `Achievement`, `SkyState`, `AtmosphereSettings`
- All new types are additive, optional

#### 6d. Verification
- Typecheck clean, build clean after every phase
- No regression: 2D Blueprint editor untouched
- Three.js chunk stays lazy-loaded
- Dashboard pages do NOT load any new 3D deps

---

## Build Order

| Phase | Files | Depends On | Approx Lines |
|---|---|---|---|
| 1a Sky + Time | `src/three/sky.ts` | engine.ts | ~200 |
| 1b Clouds | `src/three/clouds.ts` | sky.ts (sun dir) | ~180 |
| 1c Weather FX | `src/three/weather-fx.ts` | weather data | ~250 |
| 1d Ground FX | `src/three/water.ts` + edits to structures.ts | — | ~150 |
| 2a Flight | `src/three/flight.ts` | engine.ts | ~350 |
| 2b Tour | `src/three/tour.ts` | flight.ts | ~250 |
| 2c HUD | edits to World3D.tsx | — | ~100 |
| 3a Animals | `src/three/animals.ts` | — | ~300 |
| 3b Plant anim | edits to plants.ts | — | ~100 |
| 3c Water anim | edits to water.ts | — | ~80 |
| 4a Achievements | `src/three/achievements.ts` + `src/lib/achievements.ts` | — | ~200 |
| 4b Growth FX | `src/three/growth-fx.ts` | plants.ts | ~120 |
| 4c Weather events | edits to weather-fx.ts | — | ~100 |
| 4d Perf HUD | `src/three/perf.ts` | — | ~80 |
| 5a Ambient audio | `src/three/audio.ts` | — | ~250 |
| 5b Interaction audio | edits to audio.ts | — | ~60 |
| 6a+b+c Integration | edits to World3D.tsx + types + UI | all above | ~400 |

**Total new code:** ~2,700 lines across ~14 new files, ~8 file edits.

---

## What We Keep

- All existing 2D Blueprint functionality — zero changes
- All existing 3D systems (engine, plants, structures, groundTexture, historyViz, use3DEditor)
- PlanState as single source of truth
- React Query for weather data
- Lazy-loaded three.js chunk
- TypeScript strict mode

## What Changes

- `World3D.tsx` — orchestrates new systems, new footer controls
- `src/types/index.ts` — additive type additions
- `src/three/plants.ts` — gentle wind sway addition
- `src/three/structures.ts` — water asset enhancements

## Risk Mitigation

- Each system is independently toggleable
- All new code is behind the existing lazy-loaded World3D chunk
- Dashboard pages never load 3D deps
- Typecheck + build after every phase
- Use existing THREE.js version (from package.json), no new deps except possibly `camera-controls` (already installed)
