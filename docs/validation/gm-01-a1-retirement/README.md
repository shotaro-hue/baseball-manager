# GM-01 A1-2c-2c — retirement reservation / explicit year-end finalization

## Baseline and scope

Main `a6a61e6f21933e41f6dc1caa186043e6275f3136`, #539 merged; matches the requested baseline and latest main observed on 2026-11-03. AGENTS.md, CONTRIBUTING.md, SPEC/ROADMAP A1 references, approved A1 design and Tasks 7/10 reviewed. Required annualDepartures, annualTransactions, contractEconomy, contractLedger, annualSpending, renewalDecisions, useOffseason, player and economyPersistence source paths inspected.

`ANNUAL_ECONOMY_RELEASE_ENABLED=false`, schemaVersion/DB versions and legacy scout retirement policy remain unchanged. No UI, retirement game income, CPU choice, Worker or production rollover connection. Legacy `_retireNow`/`isRetired` immediate-unavailability paths are not invoked or replaced.

## Common API and state

Both commands use the existing `{saveId,epoch,baseRevision,transaction}` envelope, quote/reduce APIs and `commitEconomyCandidate` publication/adoption barrier.

| Command | Required transaction fields | Boundary |
| --- | --- | --- |
| `reserve-retirement` | `id, teamId, playerId, contractId` | v2/season, current verified world date/gameDay |
| `finalize-retirement` | `id, reservationId` | same year's offseason, December 1 |

The optional `engine.retirementReservations` array is absent in old v2 saves and preserved when present. No date/gameDay/schedule authority is duplicated under engine; reservation gameDay is immutable notice evidence, like existing season departures.

State transition: owned/active → reservation (still owned/active and eligible) → explicit finalization candidate → committed retired alumni. Reservation and finalization have separate immutable receipts; finalization is appended to its original reservation. Same command replay succeeds, changed ID conditions fail, different commands cannot reserve/finalize the same player twice.

Initial source contract record, notice calendar, December 1 effective date, final player snapshot, compact career entry/summary, alumni, ledger end and receipts are cross-checked on validation/load. Reverse checks reject orphan retirement actions and alumni. Existing save history extension protects earlier receipts on overwrites. This is consistency/provenance checking within saved evidence, not cryptographic authentication against rewriting every copy of a save.

Natural expiry adds no ledger end. Continuing contracts add `end/retirement/retain` on December 1; current/past payroll stays fixed and future liabilities become guarantees. Migrated `guaranteeStatus:unknown` remains unknown, with no fabricated signature or waiver agreement. No market listing is created. Existing roster pruning cleans lineup/fielding/rotation references.

## Conflict and budget policy

- Pending formal hold or human renewal decision, and accepted future employment: reject reservation/finalization; no history or promises removed.
- Subsequent release/trade/conversion/renewal of reserved players: reject. Ordinary match/stat changes remain possible.
- Pending reservation carried into a later year: fail closed, requiring Task 10 to finalize first. Completed history survives the following year and old commands replay.
- Unoffered renewal estimates remain stored and funded at reservation; only finalization excludes them from active planning, using the validated departure projection.
- Retirement finalization uses narrowly constrained spending assessment: only December 1 retirement/retain end actions; no new contracts, holds, expenses, compensation, closure or total liability changes. A vacancy raises the minimum roster reserve. This may expose a negative remaining budget; quote rows and the team budget preserve that deficit. No automatic extra authorization, debt forgiveness or forced withdrawal. Subsequent spending uses normal approval rules.
- Career entry uses the existing compaction/summary helper exactly once. Already archived same-year/team career entries are refused to prevent double counting. The saver also derives the newly finalized career patch from the validated receipt and stages it with the same committed career generation; no separate caller/hook staging is required. Full production annual ordering belongs to Task 10.

## Verification record

- Initial RED: 37 tests, 29 failed / 8 existing rejection cases passed; missing command normalization caused normal paths to fail.
- Target GREEN: `npx vitest run src/engine/__tests__/annualRetirements.test.js tests/economy-retirement.test.js` — **45 passed** (39 engine / 6 actual persistence), 0 failures.
- Regression GREEN: annualDepartures (42), annualInSeasonDepartures (33), annualTransactions (39), annualSpending (55), contractLedger (30), contractEconomy (79), renewalDecisions (28), economy-commit (18), economy-commit-recovery (18), economy-save-migration (151), inseason-release-commit (5) — **498 passed / 11 files**, 0 failures.
- Coverage includes active/farm batter/pitcher, player/command ID 0, last usable roles, unchanged eligibility/money, 7/31–8/1–11/30 notice dates, early/late finalization refusal, natural vs continuing liability, real migration unknown guarantee, pending/accepted renewals, subsequent operations, unresolved year rollover, completed year rollover/replay, career stats updated after notice, paired tampering and missing proof, current `createInitialTeams()` success and wrong-source rejection.
- Actual fake-indexeddb/localStorage save barrier exercises both compressed inline and padded uncompressed external root paths (readRootBody/rootBodyReference and payload threshold checked), root acknowledgement, separate reservation/finalization publication failure and retry, reducer adoption, load/replay and refusing corrupted final proof.
- Fixtures initially used one-year contracts for most players, leaving spare future headroom. Deficit scenario was corrected to continuing contracts across all owned players: 21,000 approval, unchanged 21,000 salary/guarantee liability plus 420 vacancy reserve = **-420**. This tests an actual new deficit.
- Existing spending guard rejected current-year Dec1 end when budgetSeason had become Y+1; explicit retirement assessment now allows only that boundary with total liabilities unchanged. BigInt totals compare directly, without JSON serialization.
- Save test advances revision when changing the fixture clock/budget year, matching the normal world mutation contract; a same-revision budget mutation is correctly refused by existing persistence.

## Independent review and correction

Fresh-context reviewer independently ran the original 44 tests and a Vite SSR/fake-IDB reproduction, and inspected real bootstrap veteran histories. One confirmed **P2**: finalization added inline recent career but not the existing committed career generation. A veteran with a 2025 detail entry still displayed detail only through 2025 after retirement, because CareerTable preferred that nonempty generation over inline 2026. No other confirmed P1/P2 findings.

Reproduced with **4 RED / 2 passing** actual-save tests: both root modes returned stale detail, successful retry still omitted the final season, and a forced career-chunk abort did not prevent publication because no chunk was written. Fixed by deriving new retirement career patches in `saveGameImpl` after full annual validation and before `prepareCareerData`. The previous root's independent `economySave.terms` is used because current-format cache metadata omits the full world. Existing staged patches and retirement patches publish with the same generation/root; failed root or IDB publication leaves previous career/world/roots visible.

Correction verification: **80 passed / 4 files**, including retirement engine39, actual persistence6, career-generations17 and real useGameState economy commit18. Existing 2025 HR17 and final 2026 HR30 are both visible through `loadPlayerCareerLogById` after cold load; ID0, failed publication, aborted career generation, retry and repeated save preserve each year exactly once. The independent reviewer did not run full suite/build/browser CI and did not independently certify the final patch; the implementer verified the fix through the reproduced tests.

Final corrected tree focused verification: **578 passed / 15 files**, 0 failed; includes all 45 new retirement tests and all 533 scoped existing contract/budget/renewal/save/career/hook regressions. `git diff --check` passed.

## CI

PR [#540](https://github.com/shotaro-hue/baseball-manager/pull/540) is open and unmerged. Final exact HEAD CI results are recorded in the PR conversation after completion (to avoid changing HEAD solely to record its own CI result). Full suite/build/browser E2E are delegated to the normal exact-commit CI; local focused runs are not represented as production UI/Worker integration tests.
