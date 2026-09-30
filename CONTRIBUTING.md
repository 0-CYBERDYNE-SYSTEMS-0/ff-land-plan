# Contributing to FarmFriend

Thank you for your interest in contributing! FarmFriend is a collaborative project, and we welcome contributions of all kinds — bug reports, feature requests, documentation, and code.

## Prerequisites

- **Node.js** >= 20.0.0 (see `package.json`)
- **npm** 10+

## Getting started

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Verification

Before submitting a pull request, ensure:

```bash
npm test             # Vitest unit tests — must pass
npm run typecheck   # TypeScript strict mode — must pass
npm run build       # Production build — must pass
npm run check:private  # Checks for accidental secrets/exports
```

**Note:** There is no linter configured yet. Verification includes the Vitest unit tests, typecheck, and build. For a UI smoke check, use the headless screenshot harness:

```bash
node tools/appshot.mjs "http://localhost:5173/#/farms/1/map" out.png 1440x900 --gate --expect "Plot Designer"
```

See [CLAUDE.md](./CLAUDE.md) for full `appshot` usage.

## Code contributions

All changes land via pull requests to `main`. CI runs:
- Vitest unit tests, TypeScript typecheck, and build
- Gitleaks (secrets scan)
- Private-file guard (`npm run check:private`)

### Architecture seams

Two "seams" (pluggable interfaces) serve every page:

**Data seam** — `src/lib/api.ts` exports `apiFetch: Api`. Default is local-first with real Open-Meteo weather. Set `VITE_API_BASE_URL` to swap in a backend without page changes. Keep `Api` interface, `localApi.ts`, `restApi.ts`, and the README endpoint list in sync.

**Mutation seam** — `usePlanEditor.ts` owns ALL plan editing (undo, autosave, tools). Never fork it or write `planRef.current` outside its snapshot paths. All plan mutations go through this hook.

### Determinism rules

- **No `Math.random` in `src/lib/sim/` or `src/creative/`.** Simulations must be deterministic; use the seeded PRNG (`rng.ts`) for any randomness.
- Query parameters must go **before** the `#` hash in URLs (query-first); parameters inside the hash break the Wouter router.

### React version

React 18 only (not 19). This is a hard requirement for compatibility.

## Documentation

- `README.md` — overview, stack, endpoints, backend swap guide
- `CLAUDE.md` / `AGENTS.md` — detailed architecture, traps, and verification notes
- `quality/` — mission contracts and specification documents

For deep architectural notes, see `CLAUDE.md`.

## Reporting issues

See our [issue templates](.github/ISSUE_TEMPLATE/). If you find a security vulnerability, report it privately via GitHub's [Security tab](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/security) — do not open a public issue.

## Code of Conduct

This project is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold its standards.
