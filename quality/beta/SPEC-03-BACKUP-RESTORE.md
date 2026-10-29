# BETA-03 — Recoverable workspace backup and restore

Status: development-ready; implementation pending. Priority: P1 before retaining real-user work. Owner: storage engineer.
Estimate: provisional 3–5 focused days including crash/failure tests; re-estimate after BETA-02A–02E authoritative-store and snapshot contracts settle. Depends on BETA-01 durable save and pending-work snapshot contract.

## Problem and user outcome

PNG and shopping CSV exports work but cannot reopen an editable workspace. Browser-local loss, profile/origin changes or an upgrade can strand work. A user must be able to download one complete local workspace file, restore it into a fresh profile and find the same plans, model inputs, run identities and evidence provenance. Backup remains available when ordinary persistence fails. The beta covers the full simulator across all nine represented worlds, crop/species defaults and selected cultivars, site and independent scenarios, shared resources, and multiseason/perennial state.

A beta build can encounter advanced records created by the demo. Hidden data must be preserved, not omitted because its UI is off. Simulator runs must retain their inputs and model/evidence versions so a restored result is still interpretable. Synthetic fixtures are software test data, never evidence of model accuracy. Agreement with another reference model is model-to-model comparison, not measured-trial accuracy. Accuracy claims require comparisons with independently measured trial outcomes; site observations can support held-out accuracy for that site only and do not justify generalization to other sites.

## Scope, ownership and exclusions

Own a small backup/restore module, its validation and UI, and necessary `store.ts`/`db.ts` transaction extensions after BETA-01 lands. Coordinate Help placement with BETA-04 and the model contracts in BETA-02A–02E (biology/evidence/versioning, climate/resources, scenarios/site/views, multiseason/perennials, and observation CSV/twin). The initial observation path is manual entry or CSV import. No particular hardware or vendor connection is committed; any future live connection requires its own implemented and qualified adapter before the app makes a connectivity claim. Server backup, cloud sync, sharing, scheduled backups, selective farm merge and cross-device account service remain out of scope.

V1 restore replaces the complete local workspace after preview and confirmation. Do not add merge/conflict/ID-remapping behavior. PNG/CSV controls keep their existing purpose and labels; Backup is a separate action.

## File contract

Use JSON with a fixed format identifier (for example `farmfriend-workspace`), explicit backup format version, export UTC time, app commit/profile when known, store schema version, and these payload sections:

- Complete canonical application state: all nine represented worlds and their personal/sample plans, sites, environments and targets; crop/species selections, supported cultivar IDs and defaults; equipment/layout; custom crops and stable IDs; shared water/power constraints; scenario and selected-world preferences; sensors/readings; legacy records; alert reads and counters. Include any initialization/deletion metadata introduced by BETA-01.
- Every authoritative persistent record and keyspace, including `runs`, `seasons`, `ensembles`, `observations`, `calibrations` and any model, site, lifecycle, dataset, event or checkpoint journal store introduced by BETA-02A–02E. Preserve each store's schema/version, object-store keys and values, and authority metadata; do not assume an IndexedDB key always equals a value's id. The export manifest must enumerate the authoritative stores and keyspaces included. Transient restore-transaction staging is governed by the restore journal protocol below, not copied as user workspace data.
- Retain run mode (independent scenario or site context), frozen inputs, crop/cultivar and management interventions, shared-resource assumptions, multiseason/perennial state, model-contract/version identifiers, and evidence references. Preserve observation provenance and labels, including manual/CSV source, site association, timestamps/units where supplied, and whether a record is synthetic test data or a real site observation. Preserve published evidence identity, citation, version and evidence class (reference-model comparison or measured-trial result) separately from synthetic fixtures and site observations; do not relabel or infer provenance during restore.
- An explicit `containsUnsavedChanges` indication when the captured in-memory revision differs from durable state.

Exclude weather/provider caches, theme, recent-palette preferences, browser credentials, telemetry and unrelated origin keys. Never use `localStorage.clear()`. Do not copy every key sharing a loose prefix. A newly introduced authoritative store is required data, not an optional cache: if its format or required contents are unknown or unsupported, fail export/import safely with a clear compatibility message and preserve the source data; never report a partial workspace backup or restore as complete.

If legacy and IndexedDB run copies disagree, do not silently select/drop one. Surface a recovery conflict and preserve both raw representations in a recovery export; block normal restore until a deterministic, documented migration resolves the conflict. Normal export must not trigger destructive migration just to collect records.

## Export behavior

1. Complete the current editor gesture through its normal seam and capture the latest pending workspace revision. Combine BETA-01's plan pending snapshot with the explicit BETA-02C pending-work snapshot for unsaved scenarios/forks, dated interventions, equipment/layout drafts and other simulator session state; do not assume the plan snapshot includes them. Capture stable configuration, inputs and valid checkpoints. Do not serialize a partial worker computation as a completed successful run; record it as incomplete/interrupted or resume only from a verified checkpoint.
2. Serialize a coherent snapshot: pause this tab's relevant mutations while reading all persistent stores and the in-memory snapshot. Detect another-tab changes and fail/retry rather than creating a mixed-time file. A general multi-tab editing solution is out of scope.
3. Collect the authoritative stores and validate the outgoing bundle. If required IndexedDB data cannot be read, report incomplete export; do not call a partial file a successful backup. Offer a distinctly labelled raw recovery export where possible.
4. Download with a recognisable timestamped `.json` filename. Explain that the file can contain exact location/observations and should be shared deliberately. No upload occurs.
5. Report success only after the browser download action starts successfully. Do not claim the user has verified a file merely because a toast appeared. Qualification must inspect and restore the actual download.

Storage write denial must not prevent downloading an in-memory backup. A failed durable save does not exclude the latest edit from backup.

## Import validation and preview

- Parse/validate the entire file before any mutation; use existing validation libraries, no new schema framework.
- Validate format/schema versions and the authoritative-store manifest, finite values, required structure, unique IDs/keys, references among species/cultivars, crops/plans/worlds/environments/targets/equipment/scenarios/resources/runs/observations and counters. Unknown or unsupported required stores/versions fail closed before mutation and preserve the selected file and current workspace. Enforce safe bounds to prevent unbounded allocation/replay. Document supported file-size/record limits based on tested fixtures; reject unsupported size before changing data, with a useful message.
- Accept current backup format and the expressly tested prior application schemas. Unknown future versions fail safely. Do not reinterpret arbitrary JSON as a workspace.
- Migrate in memory with existing migration logic; repeated migration is idempotent. No crop/cultivar/world ID renumbering, lost target IDs, changed model/evidence provenance or reseeding over the imported workspace. Optional cached ensembles may be invalidated only if explicitly version-incompatible and disclosed; never invalidate frozen run inputs.
- Preview counts (farms/worlds/planted targets/runs/seasons/observations), format/date, unsaved-data indication and warnings. Distinguish site observations, synthetic fixtures, reference-model comparisons and measured-trial evidence references. State: replaces local workspace in this browser; no account/sync.
- Require explicit confirmation. Offer Download current backup first. Cancel leaves both memory and storage unchanged. Incomplete/corrupt files do not partially import.

## Durable restore and interruption contract

localStorage and IndexedDB do not share an atomic transaction. Do not promise atomicity from a sequence of `clearRecords`/`putRecord` calls.

Implement a small, documented restore protocol with these invariants:

- Before altering authoritative records, durably stage enough validated incoming/previous data and a recovery journal to resume or roll back. If staging fails/quota is insufficient, abort before modifying the workspace.
- Replace every supported authoritative IndexedDB store, including stores introduced by BETA-02A–02E, in one readwrite transaction; do not acknowledge individual requests as completion. Include the restore journal in the appropriate transaction or document the exact ordering that makes restart recovery deterministic. Unknown required stores or versions fail before destructive changes.
- Commit the local application blob and authority metadata in the documented order. During an incomplete restore, normal app boot/edit/autosave is blocked by a recovery screen so mixed old/new stores cannot be used or overwritten by seed initialization.
- At every interruption boundary, reopening either finishes the validated restore or restores the previous complete workspace. Choose and document one deterministic policy for each journal state. Never start fresh silently.
- Verify committed data before clearing recovery material. Failure keeps recoverable copies and instructions. Keep the original selected file untouched.
- Only after success replace in-memory state, invalidate TanStack Query caches and reset editor history via an explicit reinitialization path. Cancel or invalidate prior run workers and pending autosaves; no stale worker, autosave or prior session may write the pre-restore workspace afterward.
- Block restore while another app tab is actively editing or has an unresolved store version/conflict; instruct the user to back up and close other tabs. Do not bypass blocked IndexedDB upgrades.

The PR must include a short state/ordering table for the chosen protocol and the crash points tested. This is required recovery logic, not permission to redesign all persistence.

## Acceptance fixtures and tests

| ID | Fixture/action | Required result |
|---|---|---|
| B-01 | Personal garden + custom crop + edited sample → export → fresh profile import | Exact canonical plans/crop/cultivar IDs, equipment, model inputs and dates retained; visible Blueprint and restored run match; export again semantically equal ignoring export metadata/preferences. |
| B-02 | All nine represented worlds, multiple environments, tiered/mounted equipment, shared water/power state, multiseason/perennial runs + every authoritative store/keyspace in the backup manifest, including BETA-02A–02E additions → beta export/import → demo reopen | Every stable ID/key, frozen input, scenario mode, model/evidence class/version and hidden record retained. An unknown required store/version fails safely without destructive mutation. |
| B-03 | Failed persistence plus newest pending plan edit, scenario/fork intervention, or equipment/layout draft → export | File contains the pending stable inputs through both BETA-01 and BETA-02C snapshot interfaces, labelled unsaved; partial worker computation is never marked complete; restore recovers the draft without changing frozen run inputs or provenance. |
| B-04 | Invalid JSON, missing references, duplicate IDs, NaN-equivalent invalid fields, future version, over-limit file | Clear validation error; original memory/storage and unrelated origin keys unchanged. |
| B-05 | Cancel preview or replacement confirmation | No mutation or pending-save cancellation. |
| B-06 | Quota/write denial before staging, IDB transaction abort, local commit failure | No false success; previous workspace usable or deterministic recovery state shown. |
| B-07 | Close/reopen at every journal/transaction/commit boundary | Complete old or complete imported workspace; never mixed usable state or silent reseed. |
| B-08 | Legacy-local runs, authoritative-IDB runs, migration marker variants/conflicting copies | Correct authority preserved; conflicts reported without dropping records or changing independent/site/synthetic provenance. |
| B-09 | Other tab pending edit/version block during restore | Restore blocked safely; work can be backed up; no silent overwrite. |
| B-10 | Import followed immediately by navigation/reload, old autosave timer, or stale run worker completion | Imported workspace retained; no resurrection of old plan/history/run state and no stale result is acknowledged as current. |

Use synthetic fixtures for functional and fault testing only; label them as synthetic and never count them as evidence of scientific accuracy. Keep reference-model agreement distinct from measured-trial accuracy. Accuracy claims require independent published measured-trial outcomes and their citations, versions and comparison results; site observations may support held-out accuracy for that site only and are not generalized proof. Unit/integration fault injection covers crash ordering; production-browser download→fresh-profile upload→reopen is mandatory. Do not mark B-01/B-02 complete from a serializer equality test alone.

## Handoff

Deliver format/schema documentation, fixtures, restore ordering table, actual downloaded sample, fresh-profile comparison, failure/restart evidence, and UI entry points for BETA-04. State supported limits and unsupported versions. BETA-05 makes the round trip a release gate.
