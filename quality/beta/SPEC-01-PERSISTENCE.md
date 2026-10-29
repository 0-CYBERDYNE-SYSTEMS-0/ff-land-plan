# BETA-01 — Preserve user work and acknowledge durable saves

Status: proposed. Priority: P0 retention / P1 save-status and recovery. Owner: storage/editor engineer.
Estimate: 2–3 focused days. Depends on: none. Enables: BETA-03 and final qualification.

## Problem and verified reproduction

In the standard flag-off build, open North Meadow, apply Salsa Bed, confirm replacement, wait for save and reload. The original multi-bed demonstration layout returns. `src/lib/store.ts` reseeds demo farm records/plans during load. A stored blob can still contain the user's template while the rendered in-memory state has reverted; inspecting the blob alone is not acceptance evidence.

Separately, inject a `QuotaExceededError` for `Storage.prototype.setItem` only when the key is `ff-pro:v1`, then edit a personal plan and wait. The shell warns persistent storage failed, but the editor also says Saved. The local API accepts an in-memory mutation before the debounced store flush finishes.

## User outcome

A valid saved personal or sample plan is the plan reopened. Saved means that the corresponding edit reached the selected durable store. Failure is persistent, understandable and recoverable without discarding the pending edit.

## Scope and ownership

Primary files: `src/lib/store.ts`, `src/lib/localApi.ts`, `src/lib/db.ts`, `src/components/designer/usePlanEditor.ts`, save indicator in `src/pages/PlotDesigner.tsx`, and storage alert in `src/components/layout/AppShell.tsx`. Inspect migration and existing store/editor tests before editing. Match the REST seam's asynchronous success/error contract; do not invent backend support.

No simulator equations, new autosave interval, editor-history rewrite, reset UI or generic synchronization framework. BETA-03 owns backup/restore UI and transaction orchestration. BETA-04 owns unrelated accessible-name/mobile repairs.

## Required behavior

### 1. Saved content wins over sample content

- Preserve valid stored farm metadata, plans, v2 sites/worlds, selected-world preferences, custom crops, crop dates and dimensions, including seeded farm IDs.
- Fresh profiles still receive samples. Existing samples are initialized only when genuinely absent, never re-created because a user intentionally emptied them. Do not use crop count as an absence signal.
- Preserve intentional farm/world deletion across reload. Add the smallest explicit initialization/deletion marker needed to distinguish a newly introduced sample from a deleted record; do not infer deletion from every missing legacy record. Specify and test the legacy migration behavior in the PR.
- On legacy data with no deletion marker, seed missing samples once according to the existing migration policy, then persist that initialization state. Thereafter deletion must be durable. Existing saved entries always win.
- Respect canonical v2 sites when present. Flag-off viewing must not overwrite preserved v2/multi-world content with a legacy adapter. Unsupported edits are blocked by BETA-02, not silently retargeted.
- No automatic “repair to showcase” or new Reset samples control. A later explicit reset requires its own confirmation contract.

### 2. Durability acknowledgement

- Keep the current debounce unless correctness requires a narrowly explained adjustment.
- Define a monotonic save revision/token for the actual edited target. Acknowledgement of revision N cannot mark N+1 Saved.
- For localStorage, resolve successful persistence only after the atomic snapshot write succeeds. For IndexedDB writes, use transaction completion, not request success. Coalesced writes may acknowledge all revisions included in the committed snapshot.
- Editor states distinguish pending/saving, durably saved and failed. A local API in-memory update is not durable success. No Saved timestamp on a failed revision.
- Lifecycle flushing remains synchronous where required by localStorage; do not assume awaiting a promise during unload protects data. Normal navigation flushes/captures the correct target and does not retarget delayed saves.
- Add Retry for a failed pending write. It retries the current pending revision without a new content edit, duplicate undo entry or duplicate record.
- A failure alert persists while uncommitted data remains. Users may collapse details but cannot dismiss the only unsaved-state indicator. Clear the failure only after verified successful persistence, not merely when Retry is clicked.
- If a successful older write is followed by a failure, retain both the last durable revision and pending in-memory revision accurately. BETA-03 must be able to back up the pending workspace, explicitly identified as unsaved.

### 3. Load/corruption handling

- Parse/migration failure does not overwrite the original raw store or silently open an editable fresh seed as if nothing happened.
- Show a recovery state with a plain explanation, a raw-data download and access to BETA-03 restore when available. Raw download needs no successful storage write.
- Quarantine is best-effort only; inability to quarantine is disclosed and never permits destruction of the original.
- An explicit start-fresh action, if retained, requires confirmation and must not masquerade as recovered work. Do not add an automatic reset.
- Detect an external-tab app-store change while pending edits exist; block further ambiguous writes and explain how to preserve/reopen each tab. Multi-tab merge is out of scope. Do not claim cross-tab conflict-free editing.

## Acceptance cases

| ID | Test | Required result |
|---|---|---|
| P-01 | Fresh standard profile → edit North Meadow/template → save → reload and close/reopen | Rendered content, metadata, dimensions and saved timestamps retain the edit. |
| P-02 | Empty a sample; delete another sample; reload twice | Empty remains empty; deleted stays deleted; unaffected samples unchanged. |
| P-03 | Personal plan brush + undo + redo → save → reload | Exact final crop/ground/date maps retained; undo/redo still target correctly. |
| P-04 | Two edits around a delayed save acknowledgement | Older acknowledgement never marks newer pending edit Saved. |
| P-05 | App-blob write fails; edit again; Retry fails; restore writes; Retry succeeds | Pending latest content survives in memory, no false Saved, final reload matches latest revision. |
| P-06 | IndexedDB request succeeds but transaction aborts | No durable success notification; meaningful recoverable error. |
| P-07 | Navigate/world-switch during pending save; pagehide flush | Correct farm/world saved; no cross-target overwrite or duplicate history. |
| P-08 | Legacy v1, v2 multi-world and flag-on→flag-off→flag-on fixtures | No hidden record lost or canonical world replaced; migration idempotent. |
| P-09 | Malformed JSON/migration failure; quarantine also denied | Original remains available; recovery UI renders; no silent seed write. |
| P-10 | Other tab changes durable data while this tab has pending edits | Conflict warning blocks silent last-writer overwrite; no automatic merge. |

Use fake timers/fault injection for ordering and persistence tests, then real isolated production-browser checks for P-01, P-03, P-05 and P-09. Verify DOM/canvas state and persisted payload after reopening; a toast alone does not pass.

## Delivery evidence and handoff

Provide focused regression tests, before/after sample reload evidence, a fault-injection capture showing failure→retry→durable success, and fixture comparisons for both schema paths. Document the acknowledgement and pending-work snapshot interface for BETA-03. All normal/demo gates pass; no golden simulation changes expected.
