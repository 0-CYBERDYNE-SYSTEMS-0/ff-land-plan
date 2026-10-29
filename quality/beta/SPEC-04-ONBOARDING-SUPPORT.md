# BETA-04 — Onboard real participants and make problems diagnosable

Status: development-ready; implementation pending. Priority: P1. Accountable owner: PM + frontend engineer; independent QA runs observed sessions.
Estimate: provisional 2–3 engineering/content days plus five 30–45 minute usability sessions and follow-up triage; re-estimate after BETA-02 scope and UI contracts settle.
Depends on BETA-02 approved scope and BETA-03 working backup/restore entry points. Copy drafts and a11y fixes can start earlier.

## Problem and outcome

The current sample-first dashboard, Digital Twin/Live branding and sensor invitations do not explain the approved full-simulator beta. Users need to choose among the nine represented worlds, understand crop/species defaults and supported selected cultivars, set up a scenario, compare independent and site-context runs, explore changes through Blueprint and 3D, and save/back up their work without developer guidance. They must also understand model confidence and distinguish reference-model agreement, independently measured-trial evidence, synthetic fixtures and their own site observations.

Audit evidence also shows unnamed actionable controls and a 390 px header where Plot Designer is obscured by view controls. These are targeted repairs, not a redesign request.

## Scope and ownership

Own a compact first-run/help surface, feedback diagnostic preview/export and essential accessibility/mobile fixes. Likely touch points: AppShell/Sidebar/mobile navigation after BETA-02 gates, Dashboard, FarmForm, planner header, relevant icon buttons and a small help component/page. BETA-03 owns backup mechanics; BETA-05 owns build-identity generation. Reuse their interfaces.

No account system, analytics platform, embedded chat, automatic uploads, email sending, ticket creation or broad design-system changes. Do not invent an operational support address or publish a nonworking link. PM supplies and verifies the destination before launch; a missing destination is a release blocker, not placeholder success.

## First useful task

Show a dismissible first-run beta card on the dashboard, with a persistent Help & beta feedback entry afterward. First-run dismissal is a nonessential preference; failure to save it must not block editing. The first useful task should take a new user from a selected world and baseline scenario through at least one crop or management change and a comparison in Blueprint/3D, then explain the evidence/confidence cue and how to retain the work.

Required copy, adapted to approved profile:

- FarmFriend simulates crop and management choices across nine represented growing worlds. It includes species defaults and selected cultivars, site and independent scenarios, shared water/power assumptions, and multiseason/perennial runs. Users can set up a scenario in Blueprint, play it back and compare results in 3D, and change crops, layout or equipment before or during a run.
- Workspace data stays in this browser on this device in this beta. There is no account or automatic cross-device/cloud backup. Browser clearing, profile/origin changes or storage failure can lose local work; download a workspace backup. External weather/location requests may send the stated inputs to their named providers, as explained in Help.
- Start with one of the nine worlds or a site context and make a baseline run; then change a crop or management choice and compare the result. Do not require users to discover a sample ID or use developer query strings.
- Results are estimates with evidence-based confidence cues, not guarantees. Explain which crop/species/cultivar defaults and model versions apply, where results agree with reference models, what independently measured trial outcomes support accuracy claims, and where uncertainty remains. Reference-model agreement is not measured-trial accuracy. Synthetic fixtures test software behavior and are never scientific accuracy evidence. Site observations may support held-out accuracy for that site only and do not establish general accuracy for other sites.
- The initial observation path is manual entry or CSV import. No particular live hardware or vendor connection has been selected or promised; any future connection needs its own implemented and qualified adapter before the app makes connectivity claims. Weather or other external inputs must be named with their source and role; they must not be presented as measured site observations.
- Three actions: choose a world and set up a baseline → change a crop/layout/equipment choice and compare in Blueprint/3D → reopen and download a workspace backup. Link Help to actual controls rather than creating a second editing flow.

Farm creation/setup must label usable dimensions in metres and location/frost assumptions. If hectares remain as site metadata, explain their distinction from the editable garden footprint. Do not silently claim frost dates are measured. Keep existing form/mutation logic unless a specific acceptance failure requires a small change.

## Help content

Available without a plan and from storage/recovery/unsupported-scope screens:

1. Supported browser, size and workflows; short placement/selection/undo/export instructions.
2. What Saved, Saving and Save failed mean; Retry and backup steps.
3. PNG = image; shopping-list CSV export = shopping items; observation CSV import = site measurements; JSON = editable-work backup. These CSV flows have different purposes and fields. Explain restore replacement and confirmation.
4. Storage locality, lack of sync, sample vs personal data, deliberate delete/reset behavior and recovery limits. Never recommend clearing browser data as the first troubleshooting step.
5. External weather/location lookup providers and what input is sent when a request is made. Do not claim “no data leaves your computer” while sending coordinates/search text to providers. State no automatic plan/observation upload in this profile. Verify wording against actual network behavior; link maintained provider attribution.
6. Independent scenario vs site-context runs; crop/species defaults and supported selected cultivars; shared water/power assumptions; and multiseason/perennial behavior. Distinguish agreement with a reference model from accuracy against measured trials. Independent published measured-trial outcomes support general accuracy claims; site observations can support held-out accuracy for that site only; synthetic fixtures are test-only. Describe manual/CSV observation entry and state that no particular live vendor or hardware connection has been selected or promised; any future connection needs its own implemented and qualified adapter.
7. Named contact route, response target, known-issues location and how to include diagnostic information safely.

Help must remain readable when remote weather fails. It is bundled content; no remote documentation fetch is required to recover work.

## Feedback and diagnostics

- Persistent Report a problem action with a verified issue/form/email destination. Opening the destination is user initiated; do not automatically submit or send messages.
- Offer a concise description prompt: what were you trying to do, what happened, what did you expect, and steps to repeat. Include optional severity “work missing / cannot continue / confusing / suggestion.”
- Generate a **previewable**, copyable or downloadable diagnostic summary: immutable app SHA/build profile, app/backup schema versions, browser/version, viewport, coarse page name, UTC time, feature-flag values, and a bounded sanitized error category/message where available.
- Exclude coordinates, full URL/query/record IDs, plan contents, crop dates, raw localStorage/IndexedDB, CSV observations and credentials by default. Browser/provider error text must be sanitized; do not include raw request URLs. Use a fixed allowlist, not a blacklist that guesses all sensitive fields.
- Let users inspect the exact summary before copy/download/share. Separate consent for optional screenshot or backup attachment; explain what each can contain. Never auto-attach a complete workspace or capture a screenshot without user action.
- Clipboard denial has a selectable-text/download fallback. Feedback and export errors do not change the plan or consume undo entries.
- No persistent console interception/log-history service is required. Capture only the available bounded application failure context needed for this beta.

## Essential accessibility and responsive repair

- Give new-farm, theme, back, mobile-menu and feedback icon controls clear accessible names. Avoid interactive link/button nesting where it creates duplicate or confusing actions.
- Visible keyboard focus; usable tab order, modal focus trapping and Escape/return focus. Skip link focuses the main content without changing hash routing.
- At 390 px and desktop 200% zoom, page title/context and view controls do not overlap. Wrap/stack the header and canvas help; no whole-page horizontal overflow needed to find save/help/export.
- BETA-01 failure status is programmatically announced and remains perceivable. Do not repeatedly announce every autosave keystroke.
- The pointer-based canvas's keyboard limitations must be stated honestly. Do not claim WCAG conformance from an automated scan. Core non-canvas actions (create/settings/save status/backup/restore/export/help) must work by keyboard. Full keyboard painting is not silently included as a redesign in this package; PM must not advertise it as supported before a separate tested implementation.

## Operational deliverables (PM/support owner)

Before invitations, name primary and backup triage owners, verify the contact route, publish acknowledgement target (proposed: one business day), and prepare a short known-issues/update template. Daily triage distinguishes data loss, core blocking failure, misleading result and usability suggestion. Any P0 pauses new invitations and requires recovery guidance plus verified fix before resuming.

Do not send invitations, support messages or publish content as part of this implementation task. Deliver drafts and a concrete operational checklist for the authorized launch owner.

## Acceptance

| ID | Check | Pass condition |
|---|---|---|
| O-01 | Fresh participant sees first-run card, dismisses, returns | Purpose/limits concise; Help remains discoverable; dismissal never edits data. |
| O-02 | Choose a world/site context→set up baseline→run→change crop/layout/equipment→compare in Blueprint/3D→leave/reopen/backup | Links lead to working controls; no developer guidance/query strings required; run and workspace remain understandable after return. |
| O-03 | Storage failure/offline weather/unsupported existing plan | Help and recovery explanation accessible; no false claim that every input stays local or syncs, observations are not presented as measured without provenance, confidence labels distinguish reference agreement from measured-trial accuracy, and no unsupported device-connection promise. |
| O-04 | Diagnostic preview/copy/download + clipboard denied | Exact allowlisted content visible; no location/plans/query IDs by default; fallback works. |
| O-05 | Keyboard + automated name scan + 390 px + 200% zoom | No unnamed actionable controls on supported journeys; focus/dialogs and context usable. |
| O-06 | Test feedback destination with synthetic submission by authorized QA | Contact receives usable version/steps; support owner can triage. No real user data required. |
| O-07 | Five observed first-time-user sessions | At least 4/5 independently complete the core simulator task (baseline, one crop or management change, Blueprint/3D comparison, and retain/reopen) within 15 minutes and correctly distinguish reference-model agreement, measured-trial accuracy, site-held-out observations, synthetic fixtures, storage and restore limits. |

O-07 protocol: recruit target users who did not implement the app; give the task, not click instructions. Record time to first useful comparison, failed/repeated actions, moderator interventions, successful reopen/backup and comprehension answers. Do not count a moderator-rescued task as independent success. Test restore with an expendable profile. Record participant consent and redact identifiers in shared evidence. The five-session usability check is separate from release scientific evidence: only independent published measured-trial outcomes support general scientific accuracy claims; site observations support held-out accuracy for their site only.

## Handoff evidence

Provide final copy/screenshots, data-flow/privacy review, O-04 diagnostic sample, accessibility results with manual limits, verified destination and owners, anonymized five-session results and remaining issues. BETA-05 cannot pass from UI screenshots alone if operational ownership or participant comprehension is missing.
