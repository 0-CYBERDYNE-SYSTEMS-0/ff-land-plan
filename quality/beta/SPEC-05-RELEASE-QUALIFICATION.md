# BETA-05 — Qualify one immutable beta artifact

Status: development-ready; implementation pending. Priority: P1 launch gate. Owner: release engineer + independent QA; PM signs supported scope.
Estimate: 1.5–2.5 focused qualification days, excluding simulator fixes, independent scientific evidence review and participant scheduling.
Dependencies: CI/manifest work can start now; final approval requires BETA-01, BETA-02, BETA-02A–02E, and BETA-03–04 acceptance.

## Problem

At audit time PR #79 was draft, reported `mergeStateStatus: DIRTY`, and its exact head exposed only GitGuardian success. “Checks passing” did not establish the repository's test/typecheck/build/secret/private gates. Local tests and both builds passed, but most interactive journeys ran on development servers. A beta must identify and test the actual production artifact participants receive.

GitHub status is time-dependent: re-query before planning integration; do not encode the audit's old conflict status as a permanent fact. Do not merge, deploy or publish as part of implementing this spec.

## Ownership and bounds

Own `.github/workflows/ci.yml` extensions as needed, production build identity/manifest generation, reproducible acceptance commands/fixtures, and the release evidence checklist. Coordinate profile scripts with BETA-02 rather than implementing another flag source. Preserve `guard-main.yml` and existing secret scans. No unrelated dependency upgrades, CI redesign or automatic deployment pipeline.

Conflict resolution is performed on the assigned release/candidate branch, preserving others' changes and following AGENTS. It is not authorization for a direct push to main, force push, merge or deployment.

## Candidate identity

Generate a small production manifest containing app version, exact source SHA, build UTC time, product profile, effective simulator/scenario/observation/Blueprint/interactive-3D flags, backup/store schema versions, simulator contract/model version identifiers and evidence dataset references with evidence class, local/remote API mode (no secret/base URL disclosure), and the implementation/version of the required interactive Blueprint-integrated 3D playback/comparison role. Interactive 3D is a required product role, not a user-chosen optional 3D mode. Show the safe version/profile/SHA in Help/diagnostics. Do not allow a marketing version alone to identify distinct builds. The manifest must not treat synthetic fixtures or site observations as independent scientific evidence.

A qualified candidate must come from a clean tracked checkout. Record untracked files and ensure they cannot enter the artifact; the audit's pre-existing `marketing/farmfriend-demo/` is not release input. Build output must not contain plans, locations, keys, recordings or diagnostic fixtures with real data.

Compute a SHA-256 digest for the packaged artifact. Browser evidence records both source SHA and artifact digest. Version changes or rebuilding with different flags invalidate prior artifact acceptance. A promotion that preserves identical bytes needs no rebuild; approval remains a separate authorized action.

## Required automated gates

On the candidate PR/head, require actual named results, with links and matching SHA:

- unit/integration suite (`npm test`);
- TypeScript check;
- normal build regression and approved `build:beta` production artifact;
- demo build compatibility (existing advanced work must still compile; no claim its workflows are launch-approved);
- existing full-history secret scan and private-file guard;
- focused BETA-01 retention/failure, BETA-02 route/profile, BETA-03 restore/migration, and simulator deterministic-run, scenario, resource-coupling, multiseason/perennial and evidence-provenance tests.

Run every required acceptance case in the model contracts, in addition to R-01–R-12: [BETA-02A A-01–A-08](SPEC-02A-CROP-MODEL-EVIDENCE.md#acceptance), [BETA-02B E-01–E-07](SPEC-02B-ENVIRONMENTS-RESOURCES.md#acceptance), [BETA-02C X-01–X-08](SPEC-02C-EXPERIMENTS-SITE-3D.md#acceptance), [BETA-02D L-01–L-07](SPEC-02D-SEASONS-PERENNIALS.md#acceptance), and [BETA-02E T-01–T-08](SPEC-02E-OBSERVATIONS-SYNTHETIC-CSV.md#acceptance). Record PASS/FAIL/UNVERIFIED for every case; omitted or unverified cases do not count as passed.

Existing jobs may continue combining checks; do not add redundant jobs merely to create more green labels. Upload the **tested beta artifact plus manifest** with the candidate's evidence. Confirm workflows run on PR updates and are not silently skipped. External security success alone is insufficient. No snapshot update flag in release CI; golden changes require prior reviewed diffs.

The old screenshot harness is a supplement: a clean boot probe/title cannot prove correct canvas, persistence or a completed journey. Use real isolated browser interactions against a served production build. Prefer installed browser tooling; no separate framework/dependency is required unless justified.

## Production acceptance matrix

Use fresh and prior-schema isolated profiles, synthetic data and the same candidate bytes. Capture browser/version, OS/device, viewport, origin, profile/flags, fixture, steps, result and evidence. Separate product defects from browser-tool failures and retry the latter through a documented supported method.

| ID | Journey | Evidence required |
|---|---|---|
| R-01 | Representative validation in all nine represented worlds | Run [BETA-02B E-01's nine paired fixtures](SPEC-02B-ENVIRONMENTS-RESOURCES.md#acceptance), plus each world's required representative crop/equipment/environment workflow in Blueprint and the integrated 3D view. Check predeclared quantitative expectations or invariants and record evidence class and confidence cue. A finite run is only a smoke check, not a pass. Missing per-world validation remains UNVERIFIED. |
| R-02 | Species defaults and selected cultivars; independent scenario baseline and crop/management variation | Inputs and model versions are inspectable; a controlled choice change produces the expected deterministic comparison; confidence/provenance labels match the evidence available and do not promise yield. Reference-model agreement is identified as model-to-model agreement, never measured-trial accuracy. |
| R-03 | Site-context run with manually entered or CSV observations and shared water/power constraints | Site and independent scenarios remain distinguishable; resource budgets are shared and enforced as specified; imported observations retain source, units and site provenance. |
| R-04 | Multiseason run including a perennial, with crop/layout/equipment changes before and during playback | Season boundaries, perennial state and interventions persist; before/after comparison uses the correct frozen inputs and does not rewrite prior results. |
| R-05 | Set up in Blueprint; play back and compare in 3D | 2D plan, 3D view, timeline and displayed result refer to the same selected scenario/revision; changing view does not silently change inputs. |
| R-06 | PNG, shopping CSV, complete JSON backup→fresh-profile restore | Actual downloaded files inspected; all nine worlds, site/scenario inputs, model/evidence references, seasons, observations and stable record identities are semantically retained. |
| R-07 | Pending-edit or run-save failure→Retry; reload-before-recovery; interrupted restore, quota, corrupt load and IndexedDB abort/block cases | No false Saved/success; preserved raw and pending data; BETA-01/BETA-03 recovery invariants hold at every documented boundary. |
| R-08 | Prior v1 and advanced v2/IDB fixture→beta visit/export→demo reopen; navigation and deep links | No hidden record loss or feature-off overwrite; approved routes work; unsupported operations are clearly unavailable and cause no hidden work. |
| R-09 | Evidence and external-input provenance: reference-model comparison, independently measured trial, site-held-out observation, synthetic fixture, slow/unavailable weather/provider | Keep model-to-model reference agreement separate from measured-trial accuracy. General accuracy claims require independent published measured-trial outcomes with source/version and holdout/error report; site observations held out from fitting/calibration may support measured accuracy for that site only and cannot be generalized. Synthetic fixtures verify software behavior only. Loading/error/cache states are explained; the initial observation route is manual/CSV, with no named hardware/vendor commitment. Any future live connection requires its own implemented and qualified adapter before connectivity claims. |
| R-10 | Desktop, 390 px, 200% zoom and keyboard essentials | No header/control overlap; visible focus/accessibility names; documented canvas limitations; core setup, save, evidence, backup and restore controls are keyboard usable. |
| R-11 | Supported maximum scenario complexity across representative worlds, shared resources and multiple seasons on representative laptop | Responsive setup, run, playback, autosave/export with measured timings; no unexplained long freeze. |
| R-12 | Onboarding, feedback and support | BETA-04 five-session threshold met; diagnostic privacy verified; destination and owners operational. |

For R-09, test an empty provider cache and a populated cache separately, plus a controlled delayed response. Test offline while already loaded and cold reload separately. Unless a production offline-start feature is verified, document “network required to open the app; editing may continue after provider failure,” rather than promising offline installation.

R-11 provisional budgets to agree and record before measurement: no >1 s unannounced blocking interval during supported editing; visible pending feedback promptly after actions; save confirmation only after durable commit; normal local save under 2 s on the reference device; main planning controls usable within 5 s on a documented modest-network profile. Measure cold and warm loads across the supported worlds and simulator workflows. These are product budgets, not assertions that the current app meets them. If a budget fails, measure and fix the bottleneck; the candidate remains unapproved until it meets the agreed budgets. Do not drop worlds, simulator behavior or required journeys, or relax an agreed budget, to pass performance qualification.

## Approval checklist and defect policy

QA supplies PASS/FAIL/UNVERIFIED for every R case and every BETA-02A–02E acceptance case, not “smoke passed.” No open P0 or in-scope P1. An unverified required case leaves this candidate unapproved; it is not an implicit pass and does not block unrelated implementation. All nine represented worlds and the full simulator workflows in this matrix are in scope. If independent published measured-trial evidence or review is missing, measured-accuracy claims and release approval remain unapproved; reference-model agreement, synthetic fixtures and site observations cannot substitute for independent measured trials. Site observations held out from fitting/calibration can support accuracy only for that site.

For each failure, include impact, deterministic reproduction or stated frequency, expected/actual result, fixture/SHA/artifact, screenshot/video/DOM or stored-state evidence, owner and retest result. Use content comparisons for retention; generic error-free screenshots are insufficient.

PM approves the audience/scope and truthful claims; QA approves production journey evidence; an independent reviewer assesses measured-trial evidence, reference-model comparisons and the specific claims each supports; storage owner signs restore/migration integrity; support owner signs operational readiness. Record actual reviewers and evidence; never prefill or imply a signoff that has not been given. Release owner records a dated recommendation READY / READY WITH CONDITIONS / NOT READY and any measurable conditions. Actual publication/invitations require the user's separate authorization.

## Upgrade and rollback

Before invitations, demonstrate upgrade from the prior supported fixture to the candidate and ability to restore its backup into a compatible build. Never assume rolling back static files safely rolls back storage schemas. State the minimum compatible reader and unsupported downgrade behavior. Do not delete new-format records to make an old build start.

Prepare a rollback decision checklist: pause invitations on P0, preserve participants' backups/data, identify compatible artifact, communicate limits through the named support owner, and retest before resuming. This is a draft runbook; do not message participants or execute a rollback in this task.

## Delivery packet

Commit the reproducible checklist/test instructions and clearly labelled synthetic software-test fixtures where appropriate; keep private site evidence outside the repo. Supply candidate PR and CI links, manifest, artifact digest/download reference, R-01–12 matrix and all 02A–02E case results, nine-world coverage, retention/restore comparisons, evidence-class matrix with measured-trial provenance and independent review, usability results, support sign-off, known issues and upgrade/rollback instructions. Clearly separate reference-model agreement, measured-trial accuracy, site-held-out evidence and synthetic test results. Artifact/evidence URLs must remain accessible for the cohort's duration; temporary `/tmp` paths from the original audit are not durable launch evidence.

Approval evidence is tied to one source SHA and one artifact digest. Later changes require rerunning affected gates and regenerating the identity; no team may approve a different build by pointing to a previous branch report.
