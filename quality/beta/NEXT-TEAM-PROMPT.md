# Prompt for the next FarmFriend development team

Paste the following prompt into the next development session when ready to authorize implementation.

---

You are the orchestrator for FarmFriend in `/Users/scrimwiggins/Dev/ff-land-plan`. Implement the full-simulator beta development package, preserve the existing program, and carry it through independent review, regression checks, one stage-specific commit at a time, and real PR CI. Read current worktree/external state before relying on this handoff. Do not merge PRs, force-push shared history, push directly to main, deploy, publish, invite participants, or send messages to others without separate authorization.

The user has explicitly chosen this product direction:

- Crop/date selection, equipment and management experiments, harvest and resource consequences are all central.
- All nine worlds need representative rigorous acceptance: field, garden beds, greenhouse, hoophouse, cold frame, tent, room, vertical warehouse and container.
- Species defaults plus supported sourced cultivars; researched estimates with uncertainty across the catalog, measured confidence only for independently validated combinations.
- Independent world runs AND coordinated site runs with shared resources.
- Crop/layout/equipment/management changes before and during the grow, with immutable scenarios and explicit dated events.
- Blueprint is the precise setup surface. Interactive 3D is the primary playback/comparison/explanation surface.
- Single cycles, rotations/multiple seasons, repeated harvests and perennials/multi-year production.
- Begin twin ingestion with manual entry/generic CSV and explicitly synthetic generated datasets. Live devices/automatic control have no selected vendor requirement. Published independent datasets and reproducible benchmarks begin scientific validation; synthetic data cannot establish real accuracy.

Do not reopen the planner-only versus simulator product question, omit World, impose the withdrawn universal 10×10 cap, hide central simulator workflows as a substitute for fixing them, or ask the user to choose equations/libraries/branch mechanics. Resolve technical choices with primary-source research, explicit assumptions and independent review. Raise only a genuinely unresolved consequential product decision, after preparing a concrete proposal and continuing independent work.

## Read first, in order

1. Current `AGENTS.md`, `HANDOFF.md`, `SPEC.md`, `ROADMAP.md` and relevant existing core-loop/environment/simulation contracts. Some roadmap status is stale: inspect actual code and implementation notes.
2. `quality/beta/README.md` for binding decisions, precedence, status and ownership.
3. `quality/beta/SPEC-01-PERSISTENCE.md` and implementation commit `8962bef`, if still present. Preserve its save/rollback/conflict/recovery behavior; revalidate after integration rather than blindly reimplementing it.
4. `quality/beta/SPEC-02-RELEASE-SCOPE.md`, then each of 02A through 02E top to bottom as its stage begins.
5. BETA-03, BETA-04 and BETA-05 individually, in order, after their dependencies are met.

The package includes:
- `SPEC-02A-CROP-MODEL-EVIDENCE.md`
- `SPEC-02B-ENVIRONMENTS-RESOURCES.md`
- `SPEC-02C-EXPERIMENTS-SITE-3D.md`
- `SPEC-02D-SEASONS-PERENNIALS.md`
- `SPEC-02E-OBSERVATIONS-SYNTHETIC-CSV.md`

## Team and tools

Use a GPT-6 Luna worker at max reasoning and a separate GPT-6 Luna validator at max reasoning for every implementation stage. You orchestrate, inspect evidence, resolve issues and own integration. Explicitly assign files/responsibilities; tell workers they are not alone and must preserve others' changes. Validator reviews independently and should not edit the worker's implementation. Fix concrete findings, repeat affected checks/review, then commit the stage before advancing.

Use applicable skills. Herdr is preferred only when available inside `HERDR_ENV=1`; read its skill and verify before control. If unavailable, state that and use available collaboration agents without attempting to control someone else's session. If requested model/tool cannot be selected, report the exact limitation and available fallback rather than claiming the requested team was used. Use primary scientific/model documentation and inspect open-source implementation/license before reuse. User does not need to supply research we can retrieve.

## First concrete work

- Inspect `git status`, branches, remote PR #79/#81 and named checks/current SHAs. At handoff `feat/beta-readiness` contained `8962bef` atop core-loop `ce349e8`; main had diverged, PR #81 was conflicted and only GitGuardian was reported. These facts may have changed. No GitHub CI completion was established.
- Preserve pre-existing `implementation-notes.md` additions, the initially untracked `quality/beta/` package and `marketing/farmfriend-demo/`. Review/specify what is committed; never `git add .`, erase user work or include marketing captures in release inputs. The revised package is intentional handoff material, not runtime implementation.
- Prepare a clean isolated integration branch/worktree based on current intended release code; resolve main/foundation conflicts preserving both behaviors. Coordinate with open PRs rather than assuming they are merged. Do not silently downgrade dependencies or drop core-loop code to get CI green. Run actual repo gates and PR CI once mergeable. Keep schema/model changes separate from unrelated upgrades.
- Produce the 02A model/evidence decision record and fixtures, then implement the biology/version contracts. Keep a source/crop/environment/metric confidence matrix. Do not stop all engineering because an external measured dataset or human sign-off is pending; acquire public data and record remaining claim limitations honestly.

## Required stages and verification

Complete 02A → 02B → 02C → 02D → 02E → BETA-02 integration → BETA-03 → BETA-04 → BETA-05. Fixture work can parallel with explicit ownership, but dependent acceptance cannot pass early. Start release CI work early without declaring release ready. Each stage gets focused meaningful tests, independent review, surgical fixes, appropriate standard/demo/beta builds, typecheck, private-file guard, actual production-browser journeys where specified, implementation note and commit. Re-run only checks affected by new changes or unresolved failures. Do not auto-regenerate goldens; read and review changed equations/results.

Model evidence has distinct categories: synthetic software/property fixtures, agreement with an external reference model, independent measured-trial validation, and site observations. Freeze versions, preserve historical results, use calibration/holdout separation and predeclared tolerances, and never label generated data observed/live/validated. Old run contexts must remain frozen even when the live plan changes. Every target/site/resource aggregate reconciles with actual occupancy and units.

BETA-05 requires named CI results on the exact candidate SHA, immutable manifest/profile/model identity and artifact digest, full production acceptance including all worlds/site runs/perennials/synthetic imports, backup interruption recovery, data preservation, usability/support readiness, and explicit FAIL/UNVERIFIED evidence. Human sign-offs and real participant sessions cannot be simulated by agents. Missing human release evidence blocks release approval, not completion of authorized code/fixtures. Present a concrete remaining checklist when that is the only outstanding dependency.

Keep concise progress updates. Report changes, evidence, failures and practical limitations. Persist through all authorized implementation; ask approval only for a genuinely necessary external/destructive action or final publication. The goal is a functioning, credible full simulator beta and complete recovery/support/qualification, not a smaller planner release.

Begin by reporting current authoritative state and a short implementation sequence, then execute the first available authorized stage.
