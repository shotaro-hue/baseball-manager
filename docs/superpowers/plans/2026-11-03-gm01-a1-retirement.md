# GM-01 A1-2c-2c retirement reservation implementation plan

> Execute inline using superpowers:executing-plans; final review in a fresh context.

**Goal:** Save an in-season retirement intention without changing eligibility, then explicitly finalize at December 1.
**Architecture:** Optional `engine.retirementReservations` extends existing v2 saves without a schema change. Immutable reservation evidence plus an appended finalization, two command receipts and team alumni are checked bidirectionally. Ledger remains contract authority; world owns clocks/rosters and existing commit barrier owns publication.
**Tech Stack:** JavaScript / Vitest / existing annual economy adapter and save barrier.
**Spec:** [approved A1 design](../specs/2026-10-30-gm01-a1-integration-design.md), user A1-2c-2c instructions.

## Constraints and decisions
- Gate OFF; no legacy/UI/CPU/Worker/annual progression connection; no schema/DB version change; no merge/main push.
- `reserve-retirement {id,teamId,playerId,contractId}` only v2/season, verified current employment and current world date/round.
- `finalize-retirement {id,reservationId}` only same-season offseason December 1; no automatic invocation. Pending reservations block year advancement.
- Pending formal renewal/human decision or accepted future employment: reject, preserve evidence. Later release/trade/conversion/renewal targeting a reservation: reject.
- Natural expiry has no end; continuing contract ends December 1 with retirement/retain. No termination agreement is inferred, including legacy unknown guarantees.
- Keep renewal estimates unchanged as evidence; exclude only finalized retirements from active estimates. Vacancies create normal minimum-roster reserves. Finalization may expose a deficit, reported by quote rows: retirement creates no new spending and must not force withdrawal.
- Career uses existing compact entry/summary helper at finalization, never at reservation. Re-finalization is a replay; archived source snapshot and exact history validate it.

## Review focus
- Coordinated receipt/history tampering and missing end provenance, including natural expiry.
- Reservation survives current ability/stat changes but cannot conceal changed contract ownership/terms.
- Current/past salary and unknown legacy guarantees; deficit without forgiveness.
- Save publication failure, retry, cold reload, inline and external roots.
- Backwards compatibility with v1 and old v2 without reservations; no duplicate world clock under engine.

## Task 1: Reserve and finalize common commands
Files: new `src/engine/annualRetirements.js`; integrate `annualTransactions.js`, `contractEconomy.js`.
- [x] Write RED tests for active/farm/ID 0, eligibility/unchanged finances, conflict refusals, clocks, finalization and replay, provenance tampering, real bootstrap cases.
- [x] Run `npx vitest run src/engine/__tests__/annualRetirements.test.js` and confirm missing commands fail.
- [x] Implement normalization, evidence inspection, candidate creation, conflict guards and canonical projection.
- [x] Run target and departure/contract/planning regression tests GREEN.

## Task 2: Save barrier and quality gate
Files: `tests/economy-retirement.test.js`, this plan, `docs/validation/gm-01-a1-retirement/README.md`.
- [x] Add actual save/commit/load tests for both commands, failed publication and retry, cold restart/replay and tamper refusal; use compressed inline and padded external root.
- [x] Run targeted save/commit and annual budget/renewal regressions.
- [x] Dispatch independent reviewer with base/head, requirements and bootstrap entry; reproduce and fix P1/P2 with RED/GREEN.
- [x] Commit/push feature branch; create new PR. Record exact HEAD CI results, reuse CI full suite, leave PR unmerged.

## Execution record
- Latest main equals specified a6a61e6; #539 merged. Read AGENTS/CONTRIBUTING, approved design/Task 7/10 and all nine required source files.
- Existing legacy skip-retire marks players unavailable immediately; annual implementation will not invoke it. Winter release uses February 1 for continuing contracts, unlike this December 1 retirement boundary.

- Target 44/44 and scoped regressions 498/498 GREEN; see validation record. Independent review dispatched at bd9f70c9.

- Final review P2 career generation omission reproduced (4 RED), fixed in saver common path; 80/80 correction and close regressions GREEN. No other confirmed P1/P2, no deferred minors. Decision: save-derived new career patches rather than caller-only staging, to preserve all common entry points and atomicity.

- Corrected tree final scoped verification: 15 files / 578 tests passed. PR #540 open, unmerged; exact final HEAD CI pending at commit time and recorded in PR conversation. No automatic rollover connection.
