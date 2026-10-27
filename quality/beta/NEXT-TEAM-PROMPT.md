# Prompt to resume the FarmFriend development team

Implementation through the ordered beta stages is already authorized by the active task. Use this prompt to resume from the verified checkpoint below, after checking that it is still current.

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

1. Current `AGENTS.md`.
2. `quality/beta/README.md`, then this prompt.
3. `HANDOFF.md`, `SPEC.md`, `ROADMAP.md`, and the relevant existing core-loop, simulator, and environment contracts. Some roadmap status is stale: inspect actual code and implementation notes.
4. `quality/beta/SPEC-01-PERSISTENCE.md` and implementation commit `8962bef`, if still present. Preserve its save/rollback/conflict/recovery behavior; revalidate after integration rather than blindly reimplementing it.
5. `quality/beta/SPEC-02-RELEASE-SCOPE.md`, followed by each substage contract in full immediately before that stage.
6. BETA-03, BETA-04 and BETA-05 individually, in order, after their dependencies are met.

The package includes:
- `SPEC-02A-CROP-MODEL-EVIDENCE.md`
- `SPEC-02B-ENVIRONMENTS-RESOURCES.md`
- `SPEC-02C-EXPERIMENTS-SITE-3D.md`
- `SPEC-02D-SEASONS-PERENNIALS.md`
- `SPEC-02E-OBSERVATIONS-SYNTHETIC-CSV.md`

## Team and tools

Use a GPT-6 Luna worker at max reasoning and a separate GPT-6 Luna validator at max reasoning for every implementation stage. You orchestrate, inspect evidence, resolve issues and own integration. Explicitly assign files/responsibilities; tell workers they are not alone and must preserve others' changes. Validator reviews independently and should not edit the worker's implementation. Fix concrete findings, repeat affected checks/review, then commit the stage before advancing.

Use applicable skills. Herdr is preferred only when available inside `HERDR_ENV=1`; read its skill and verify before control. If unavailable, state that and use available collaboration agents without attempting to control someone else's session. If requested model/tool cannot be selected, report the exact limitation and available fallback rather than claiming the requested team was used. Use primary scientific/model documentation and inspect open-source implementation/license before reuse. User does not need to supply research we can retrieve.

## Resume from the verified checkpoint

- Recheck all worktrees, branches, current SHAs, PR #82 and its named checks before acting. At the 2026-10-27 checkpoint, the integration worktree is `/Users/scrimwiggins/Dev/ff-land-plan-beta-integration` on `integration/beta-readiness-main-20261027`; draft PR [#82](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/pull/82) targets `main` at `59a93ee6ee26e98b728f84420bba7750f04ab5fe` and points to `f7396b2f5ca18fa3a4d7dea02054d8af019d4532`. Actual CI run [40539695978](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/actions/runs/40539695978) passed all four named checks on that exact SHA. These facts can change; requery them.
- The separate root worktree `/Users/scrimwiggins/Dev/ff-land-plan` is on `feat/beta-readiness` at `820281142fd8fa85cd157cdbd8167b39fab8dbdb`; its only dirty item is the pre-existing untracked `marketing/farmfriend-demo/`. Preserve it and never stage marketing captures as release inputs.
- `f7396b2` is a reviewed partial 02A checkpoint: it adds opt-in, frozen environment-v2 enclosure water/transpiration coupling and persistence regressions. Local gates at that commit included 45 test files / 233 tests, typecheck, standard/demo/Pages builds, private-file guard, whitespace checks, and BETA-01 durability retests (6 files / 40 tests). The full detail and limitations are in `quality/beta/02A-MODEL-DECISION.md`, `quality/beta/evidence/fao56-environment-v2-transpiration-coupling.json`, and `implementation-notes.md`.
- 02A is not complete; continue its remaining acceptance rows before 02B. A-05 remains UNVERIFIED overall, and the unsupported environment-v2 browser-load retention journey remains UNVERIFIED. The synthetic water fixture is software evidence only: no candidate comparison, measured-trial validation, biological accuracy, or live-server persistence was established. Keep the current ordinary-run model at v1 until 02A acceptance authorizes a change.
- Do not recreate the decision record or water-coupling fixture. Read the full 02A contract and current decision/evidence, choose the next bounded unmet 02A unit, report the worker estimate and assumptions, then implement and independently review it. Preserve the required preregistration and calibration/holdout rules before any candidate comparison or retuning.
- Continue in the existing integration branch/PR when its state allows; preserve both foundation and BETA-01 behavior. Do not stage broadly, discard user work, force-push, merge, push to main, deploy, publish, invite participants, or contact others.

## Required stages and verification

Complete 02A → 02B → 02C → 02D → 02E → BETA-02 integration → BETA-03 → BETA-04 → BETA-05. Fixture work can parallel with explicit ownership, but dependent acceptance cannot pass early. Start release CI work early without declaring release ready. Each stage gets focused meaningful tests, independent review, surgical fixes, appropriate standard/demo/beta builds, typecheck, private-file guard, actual production-browser journeys where specified, implementation note and commit. Re-run only checks affected by new changes or unresolved failures. Do not auto-regenerate goldens; read and review changed equations/results.

Model evidence has distinct categories: synthetic software/property fixtures, agreement with an external reference model, independent measured-trial validation, and site observations. Freeze versions, preserve historical results, use calibration/holdout separation and predeclared tolerances, and never label generated data observed/live/validated. Old run contexts must remain frozen even when the live plan changes. Every target/site/resource aggregate reconciles with actual occupancy and units.

BETA-05 requires named CI results on the exact candidate SHA, immutable manifest/profile/model identity and artifact digest, full production acceptance including all worlds/site runs/perennials/synthetic imports, backup interruption recovery, data preservation, usability/support readiness, and explicit FAIL/UNVERIFIED evidence. Human sign-offs and real participant sessions cannot be simulated by agents. Missing human release evidence blocks release approval, not completion of authorized code/fixtures. Present a concrete remaining checklist when that is the only outstanding dependency.

Keep concise progress updates. Report changes, evidence, failures and practical limitations. Persist through all authorized implementation; ask approval only for a genuinely necessary external/destructive action or final publication. The goal is a functioning, credible full simulator beta and complete recovery/support/qualification, not a smaller planner release.

Begin by reporting current authoritative state and a short implementation sequence, then execute the first available authorized stage.
