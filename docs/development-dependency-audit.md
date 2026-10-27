# Development dependency audit — 2026-10-17

Commands run against the release-readiness worktree:

- `npm audit`: 7 findings (5 high, 2 moderate).
- `npm audit --omit=dev`: 0 findings in production dependencies.

The remaining findings are all in the development dependency tree rooted at Tailwind CSS 3:

| Package | Severity | Relationship |
| --- | --- | --- |
| `tailwindcss` | High | Direct dev dependency (`^3.4.13`) |
| `braces` | High | Transitive through Tailwind's watcher/glob dependencies |
| `chokidar` | High | Transitive Tailwind dependency |
| `fast-glob` | High | Transitive Tailwind dependency |
| `micromatch` | High | Transitive Tailwind dependency |
| `postcss-nested` | Moderate | Transitive Tailwind dependency |
| `postcss-selector-parser` | Moderate | Transitive Tailwind dependency |

The available `npm audit fix` remediation upgrades Tailwind CSS to 4.3.3, a
semver-major change. It was not applied as a routine non-breaking fix; migrate
Tailwind separately with CSS/config compatibility tests. The safe non-major
lockfile update was retained. Rerun `npm audit` before release because advisories
and available fixes can change.
