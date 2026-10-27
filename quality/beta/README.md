# FarmFriend full simulator beta — development package

Status: implementation is authorized and in progress; release qualification remains incomplete.
Decision authority: the user answers in this session (1–8 and 10 = C) establish the binding product direction, and the active task explicitly authorizes implementation, review, verification, documentation, stage commits, and draft-PR CI. No merge, deployment, publication or invitations are authorized.
Baseline: the current integration checkpoint is recorded below. Reinspect the worktree and GitHub before relying on any branch, commit, PR or CI fact.

## Binding product direction

The product is a causal simulator and evolving digital twin: configure a real growing world → place crops/equipment → simulate → change crop/layout/equipment/management before or during a grow → compare consequences in 3D → incorporate observations. Blueprint handles precise setup; World is the primary playback, comparison and explanation surface. Retain both and use one simulation authority.

User decisions:

| Question | Recorded decision |
|---|---|
| 1 | Support crop/date selection, equipment/management decisions, harvest and resource consequences together. |
| 2 | Representative, rigorous acceptance cases across all nine environments before beta. |
| 3 | Species defaults, with named cultivars where reliable data exists. |
| 4 | Researched estimates throughout the catalog; measured confidence for independently validated crop/environment combinations. |
| 5 | Independent world runs and coordinated site runs with constrained shared resources. |
| 6 | Crop, layout, equipment and management changes before and during a grow, with a dated change record. |
| 7 | Blueprint for precise setup; 3D for playback, comparisons and understanding causes. |
| 8 | Crop cycles, seasons/rotations, perennial establishment and multi-year production. |
| 9 | Initially uncertain; subsequent user direction accepts generated synthetic CSV to populate/test observation workflows first. Manual/CSV ingestion is the initial implementation path. Specific live-device integrations and automated control are uncommitted future work. |
| 10 | Begin with published datasets and reproducible benchmarks; collect real participant observations later. |

All nine worlds remain: open field, garden beds, glass greenhouse, hoophouse, cold frame, grow tent, grow room, vertical-farm warehouse, container farm. The earlier outdoor-only, 10×10 m, eight-person, two-week proposal and static/omitted World option are superseded. No cohort size, launch date, or universal validated accuracy is promised. Existing tested engineering bounds remain until measured and documented; do not impose a new 10 m product cap.

Synthetic CSV is software/test evidence. It cannot establish real crop accuracy, observed conditions, or an empirically validated confidence interval. Published reference-model outputs demonstrate agreement with that model; independent measured trials are separately identified. No fabricated expert, participant or reviewer sign-off.

## Current state and work packages

Initial package snapshot before the 2026-10-27 integration reconciliation: BETA-01 implementation is committed as `8962bef`; its original local evidence reported 35 test files / 156 tests, typecheck, build, private-file guard and targeted production-browser checks. PR #81 and foundation PR #79 were listed then; those statuses are historical, not the current integration PR. Preserve unrelated work, including the existing notes, `marketing/farmfriend-demo/`, and the beta specification package.

### Verified integration checkpoint — 2026-10-27

- The integration branch is `integration/beta-readiness-main-20261027`. Draft PR [#82](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/pull/82) is open, based on `main` at `59a93ee6ee26e98b728f84420bba7750f04ab5fe` at this checkpoint. Recheck branch, base, head and checks before relying on these values.
- Commit `f7396b2f5ca18fa3a4d7dea02054d8af019d4532` adds the opt-in, frozen `environment-v2` enclosure water/transpiration coupling and focused persistence regressions. PR CI run [40539695978](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/actions/runs/40539695978) passed all four named checks on that exact SHA. This is a reviewed 02A checkpoint, not 02A completion or release approval.
- Follow-up handoff commit `dd0019e1a388c9ddbb539ef730ae549254c08b45` updates the live-state instructions and evidence. PR CI run [40540748769](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/actions/runs/40540748769) passed `test + typecheck + build`, `Playwright production Pages-path smoke`, `secret + private-file scan`, and `GitGuardian Security Checks` on that exact SHA.
- The current local gates at `f7396b2` were 45 test files / 233 tests, typecheck, standard/demo/Pages builds, private-file guard, BETA-01 durability regressions and whitespace checks. The environment fixture is synthetic software evidence only; no candidate, measured-output, or live-server comparison was run.
- The 02A A-07 harvest-area regression has passed local verification at 45 test files / 235 tests, typecheck, standard/demo/Pages builds, private-file guard, and whitespace checks. It is a partial A-07 increment; the full v2/v3/v4 parity matrix and overall 02A acceptance remain incomplete.
- 02A remains active. A-05 overall is UNVERIFIED; A-03, A-04, A-06 and A-07 remain UNVERIFIED, and A-08 end-to-end retention for an unsupported environment-v2 browser load has not been tested. Continue 02A before 02B.
- The root `feat/beta-readiness` worktree remains at `8202811`; its only dirty item is the preserved untracked `marketing/farmfriend-demo/`. Do not stage it or include marketing captures in release inputs.

| Contract | Accountable role | Work and dependencies |
|---|---|---|
| [BETA-01](SPEC-01-PERSISTENCE.md) | Storage/editor | Retain implementation; repeat affected regressions after integration/schema changes. |
| [BETA-02](SPEC-02-RELEASE-SCOPE.md) | Simulator lead/integrator | Approved full-simulator scope, product build, shared contracts and integration gates; complete 02A–02E below. |
| [02A](SPEC-02A-CROP-MODEL-EVIDENCE.md) | Crop-model engineer | Model/parameter versioning, development/biomass/root-zone repair and independent evidence. First model stage. |
| [02B](SPEC-02B-ENVIRONMENTS-RESOURCES.md) | Environment/physics engineer | Nine worlds, equipment/resource coupling and capacity consequences; builds on 02A contracts. |
| [02C](SPEC-02C-EXPERIMENTS-SITE-3D.md) | Simulation/3D engineer | Dated experiments, frozen replay context, comparisons, coordinated site runs; uses 02A/B. |
| [02D](SPEC-02D-SEASONS-PERENNIALS.md) | Lifecycle/model engineer | Multi-season soil/crop memory, repeated harvest and perennial state; uses 02A–C. |
| [02E](SPEC-02E-OBSERVATIONS-SYNTHETIC-CSV.md) | Twin/data engineer | Synthetic generator/CSV fixtures, provenance, observed comparisons and reviewed corrections; early fixture work can parallel 02A, integration follows model contracts. |
| [BETA-03](SPEC-03-BACKUP-RESTORE.md) | Storage engineer | Complete workspace backup/restore and interruption recovery for all new records. |
| [BETA-04](SPEC-04-ONBOARDING-SUPPORT.md) | Frontend/support + QA | Teach the simulator loop, provenance/confidence, recovery, accessible essentials and support. |
| [BETA-05](SPEC-05-RELEASE-QUALIFICATION.md) | Release + independent QA | Immutable artifact, actual CI, full simulator evidence, human operational acceptance. |

The original short planner-beta estimate is withdrawn. Each 02 substage must report its implementation estimate after inspecting its assigned code/reference data. Scope changes require explicit documentation and user agreement; uncertainty about numerical methods is engineering work to resolve through evidence, not a reason to remove core simulator features.

## Sequencing, ownership and gates

1. Reconcile current Git/base conflicts in an isolated integration branch/worktree, preserve both lines of work and unrelated local files, and run actual PR CI. No direct main push, force push, merge or release without authorization. Branch mechanics do not require another product-scope questionnaire. Report any genuinely destructive/conflicting product decision.
2. Read BETA-02 and 02A fully; land shared run/model/schema contracts and crop repair before dependent work. 02B, 02C, 02D and 02E then each receive their own worker/validator cycle and commit. Do not implement all physics and UI in one unreviewable change.
3. Finish BETA-02 integration and acceptance, then BETA-03, 04, 05 in order. Fixture/design preparation may parallel; do not declare downstream acceptance before dependencies exist. BETA-01 durability remains invariant throughout.
4. Assign explicit file ownership. Workers are not alone: preserve others' edits and coordinate shared `types.ts`, `engine.ts`, `localApi.ts`, editor and shell files. All editor mutations use the existing snapshot seam; all views project the same engine state.
5. Follow [NEXT-TEAM-PROMPT.md](NEXT-TEAM-PROMPT.md). The user requested GPT-6 Luna at max reasoning for implementation and independent validation. Use Herdr only inside `HERDR_ENV=1`; otherwise use available collaboration tools and report the fallback. Do not substitute the orchestrator for the independent review.

## Definition of done and evidence

- Focused changes, meaningful regression/property/independent-fixture tests; no generic framework rewrite or adjacent cleanup.
- `npm test`, `npm run typecheck`, normal/demo/beta production builds as relevant, `npm run check:private`, whitespace checks and independent review. Inspect current scripts first; never claim an absent beta command passed.
- Reviewed equation/parameter changes and deliberate golden diffs; goldens establish reproducibility, not biological accuracy. Model dispatch must preserve historical runs.
- Isolated production-browser journeys with exact source SHA, profile, browser, fixture digest and result. Screenshots alone do not prove replay, persistence or resource accounting.
- Synthetic and real/published data have durable, visible provenance. No real coordinates, private observations or credentials in fixtures/diagnostics.
- Save/restore, legacy data, stable IDs, targets, model versions and pending edits remain intact. Add a concise implementation note for each completed stage.
- Each required acceptance row is PASS / FAIL / UNVERIFIED with linked evidence, owner and retest. Missing external data or human review limits release claims; it does not stop engineering fixture preparation and correctness work.
- No beta package can authorize release by itself. BETA-05 qualifies the exact artifact; the user separately authorizes publication/invitations.

## Specification precedence

The approved direction above and these revised beta contracts extend `SPEC-CORE-LOOP.md` and the earlier simulation/environment specs. They supersede the old planner-only proposal and the core-loop deferral of coordinated site runs. BETA-01's reference to blocking unsupported edits now means unsafe or ambiguous target/model contexts; it does not exclude indoor or multiworld work from the beta. Its original persistence contract is otherwise retained without rewriting its completed implementation. Existing no-silent-deletion, deterministic replay, world isolation and single-editor/single-engine rules remain binding. Old ROADMAP statements that twin is wholly unbuilt are historical; use actual code and record current limits. This document does not claim pending capabilities are implemented.
