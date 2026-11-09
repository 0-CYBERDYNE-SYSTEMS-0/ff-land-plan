# BETA-02E — Observation loop and explicitly synthetic CSV fixtures

Status: development-ready; implementation pending. Owner: twin/data engineer with independent validator. Fixture preparation can begin alongside 02A; integration uses model/version and world/site contracts from 02A–D.

## Recorded initial approach

The user agreed to start with generated synthetic CSV to populate and test the observation workflow. Manual entry and generic CSV are the initial integration path; no vendor/device protocol or automatic actuator control has been selected. Preserve an adapter boundary for later real measurements, without inventing hardware requirements or building speculative vendor connectors.

Existing code already parses quoted wide CSV, maps metrics/units/targets, stores observations, creates observation-frozen run copies, assimilates soil moisture/stage and fits limited enclosure calibration. Extend these seams rather than build a second importer or claim every observation already corrects the model.

## Generator and fixture contract

Deliver a versioned deterministic generator (for example `tools/generate-observation-fixtures.mjs`, final name documented), command/seed, schema manifest and small redistributable CSV fixtures under `quality/beta/fixtures/observations/`. No app runtime generation is necessary unless a documented user journey requires it. Generate reproducible files byte-identically for fixed version/seed/options.

Each fixture/manifest specifies synthetic identity, generator version, seed, date range/timezone, site/world/space/level mapping, metric/units, source mechanism, latent truth/measurement construction, noise/bias/missingness/outliers and expected import/score behavior. Use generated anonymous coordinates/labels or no location, never real private records. Include an example for each world and floor/tier targets, season/year boundary and enough paired daily data to exercise supported calibration (baseline requires at least 14 paired days).

Known-truth cases use independent explicit analytic/fixture functions, not an invocation of the simulator under test disguised as measured truth. A simulator-generated dataset can be useful for replay regression but is classified as model-derived synthetic and cannot validate that model. Separate calibration/train and held-out periods. Include duplicates/conflicting IDs, missing values, quoted cells, malformed dates, unit conversions, impossible/non-finite values, suspect rows, unknown targets, out-of-order samples and zero versus unknown light. Invalid sets have expected rejection/preview behavior; do not mix intentional invalid files into a successful demo import without labels.

## Durable provenance and import

- Extend Observation types/validation/storage/API/backup as needed to distinguish acquisition (`manual`, `csv`, later sensor) from evidence origin (`synthetic`, `measured`, `reference-model`, unknown legacy provenance). `source: csv` alone does not mean synthetic or measured. Keep dataset ID/manifest digest and sufficient generating/source metadata with the imported records and frozen runs. Do not decide provenance from a filename or trust arbitrary CSV claims as independently verified.
- Legacy records without origin remain unknown/declared provenance unless evidence exists. Migration cannot relabel them as measured. Synthetic fixtures are explicitly selected/imported into an isolated example workspace, not silently inserted into personal grows or automatic site sensor feeds.
- Preview date/time interpretation, units/conversions, targets, counts, rejected/conflicting rows, provenance and intended replace/append/dedup policy before applying. Stable import identity and deterministic duplicate rules make reimport idempotent. Cancel/error does not partially import. Cross-world/site observations must resolve to explicit identities.
- Preserve current date/unit safety; document local-date versus timestamp/day aggregation and timezone. Reject ambiguous dates rather than guess. Sample frequency, daily aggregation and missing/suspect handling are explicit; no invented observations fill missing days unnoticed.
- Display synthetic status persistently beside observations, charts, diagnostics, scores, calibrated runs and relevant exports; include it in full backups and restores. Sample synthetic series must never appear as live sensor telemetry.

## Compare, correct and calibrate

Keep original predictions and observations separately. Show metric, units, target/time scope, pair count, bias/error and evidence origin. Score only matched, qualified pairs; do not substitute missing values with zero or mix tiers. Extend assimilation/calibration only where there is an explicit parameter/state rule and identifiability test. State which metrics currently score only, which correct state, and which support fitted parameters.

Synthetic inputs can demonstrate recovery of a planted bias and deterministic replay/correction. They cannot increase measured validation status or generate a real-world accuracy badge. Each calibration proposal includes fitted fields, prior/new values, evidence, pair/holdout counts, applicability and limitations; user reviews application, versions remain reproducible, and changing calibration does not mutate old runs. Stage observations require a documented mapping to lifecycle state under the new biology; they cannot magically create harvestable mass without an explicit observed-state accounting rule.

## Acceptance

| ID | Fixture/action | Required result |
|---|---|---|
| T-01 | Regenerate all valid/invalid fixture files with same inputs | Identical bytes/digests and documented analytic expected values; no network or private data. |
| T-02 | Import valid world/tier files → preview → apply → reimport/cancel | Correct identities/date/units/provenance; idempotence and no partial cancellation effects. |
| T-03 | Invalid dates/units/targets/IDs/NaN/quoted data | Useful row-level errors and documented atomic/partial policy; rejected records never silently enter state. |
| T-04 | Known bias + holdout + insufficient/unidentifiable observations | Fit behaves as declared; no fit without evidence; held-out metrics and synthetic origin remain explicit. |
| T-05 | Observation-corrected run versus original, seek/reload/fork | Immutable original and frozen observation version; deterministic supported correction/scoring. |
| T-06 | Backup/restore/export/copy diagnostic across profiles | Synthetic and unknown provenance retained; private series excluded from default diagnostics. |
| T-07 | All nine worlds and site/tier scopes | No cross-target contamination or bogus observed sensor claims; missing data remains missing. |
| T-08 | Published measured trial imported through separate path | Evidence classification preserved; only independent held-out measured evidence may support measured confidence. |

Deliver generator, CSV examples/manifest/expected results, importer template/help copy, provenance schema/migrations, supported metric/correction matrix, holdout scoring report and production-browser import→run→backup→restore evidence. Human-grower data and live integrations can follow without changing the initial synthetic provenance or pretending existing fixtures were real.
