# Implementation Notes — FarmFriend Pro upgrade

Running log of decisions made during implementation that weren't in the spec,
things changed along the way, and tradeoffs. Newest entries at the bottom of each
section. Spec: `SPEC.md`. Restore point: `main @ 770c186`, work on `pro-upgrade`.

## Workflow

- Orchestrator (Fable) wrote the spec and implements core; Opus reviewed the spec;
  Haiku handles git checkpoints; Sonnet runs verification passes.

## ⚠ Top traps (from Opus review — verified, not speculation)

1. Open-Meteo soil temp/moisture are **not available in `current=`** — hourly only.
   Read the hourly array at the index of `current.time`, with `timezone=auto`.
2. The global QueryClient has `staleTime: Infinity` and a default queryFn that
   fetches the query key as a URL. Weather queries must override both.
3. The designer grid must never be DOM nodes (3,840–57,600 cells). Canvas only,
   cell map in refs, React state for chrome only.

## Decisions not in the spec

- **Kept the `MockApi` interface name** even though weather is now real and data is
  persistent — renaming the seam would touch every page for zero user value. The
  type is re-exported as `Api` for new code. (Rationale: surgical changes.)

## Tradeoffs

- **localStorage over IndexedDB**: plans at max size (240×240 cells) serialize to
  well under 1 MB; localStorage is synchronous-simple and good to ~5 MB. IndexedDB
  would add async complexity for no practical gain at this data size.

## Data sourcing

- Crop spacing/companion/frost data: standard horticultural reference values
  (the kind printed on seed packets / extension-service tables). Where sources
  disagree (e.g., tomato spacing 45–60 cm), the mid-range value was chosen.
- Weather: Open-Meteo (open-meteo.com) — free, no API key, CC-BY 4.0 attribution
  added to the Weather page footer.

## Known gaps / future work

(running list)
