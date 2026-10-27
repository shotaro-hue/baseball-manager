# GM-01C-1 Atomic transactions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Checkboxes record completion.

**Goal:** Connect the GM-01B spending ledger to real roster/market projections for FA offers and trades, without activating the unfinished model in the live game.
**Architecture:** One immutable transaction state contains the spending plan, real teams/market, draft context, annual roster requirements and durable command receipts. Quote and apply share candidate construction; apply always recomputes from current state. Extract roster-only trade projection from the existing transaction instead of copying placement and lineup cleanup.
**Tech Stack:** Existing JavaScript, Vitest, Vite.
**Spec:** `docs/superpowers/specs/2026-10-26-club-management-gameplay-design.md`; user-approved first slice: common transaction + representative FA/trade paths.

## Global Constraints
- Base main e591de1428020da0d42f9c3a88ab94146a03e8bc; dedicated feature branch. No merge.
- Annual salary remains whole 万円; actual cost uses existing 2–11月 monthly math.
- Reuse ledger/annual spending/roster capacity/placement. No live flag, save migration, annual distribution or coach-rate change in this slice.
- Transaction dates must equal the authoritative state's date; support preseason/regular-season FA and trades. Offseason/future-effective roster adoption is C-2/D.
- All seven liability years require authorizations and roster requirements. Requirements are trusted planning state, never command inputs. Use real owned/market/draft players and active contracts/holds to derive funded headcount and minimum floor; no assumed 67-player policy or fixed rookie count.
- Every owned player must have matching active employment in the new ledger; inconsistent mixed old/new state fails. Retained guarantees do not count as funded roster places.
- Standard-roster FA: current-market terms, 1–3 years and existing salary minimum. Development FA and other transaction types are deferred explicitly.
- Existing live handlers continue using the legacy model until C-2/D and calibration are complete.

## Review Focus
- Both sides of cash and every transferred contract share one receipt; no partial success or unrelated cash offset.
- Changed owner, full roster (including accepted draft picks), late date, missing future authorization and insufficient year 7 fail without mutation.
- Receipt identity survives JSON reload and rejects changed terms; quoted candidates are never blindly committed.
- Minimum floors exclude already funded players/holds and retain unfunded accepted rookies; roster requirement counts cannot come from commands.
- Competing FA bids release only matching holds; losing clubs in deficit do not prevent a solvent winner from signing.

## Task 1: Real roster projection and contract employment selector
**Files:** `tradeTransaction.js`, `contractLedger.js`, new `annualTransactions.js`, new `__tests__/annualTransactions.test.js`.
**Interfaces:** `projectTradeRosters(teams, request, draftContext)` returns immutable rosters without cash changes. `contractEmploymentAt(ledger,date)` returns active contract, owner and annual rate.
- [x] Add failing tests for salary-period split, atomic cash+ownership, full-roster rejection, stale owner and frozen inputs.
- [x] Extract existing roster projection; add employment selector; implement common validation and floors.
- [x] Run new tests plus existing ledger/spending/trade tests.

## Task 2: FA offers, quote/apply and durable replay
**Interfaces:** `quoteAnnualTransaction(state,command)` -> `{ok,rows,error?}`; `applyAnnualTransaction(state,command)` -> `{ok,state,rows?,error?,replayed?}`. State version 1, season/date/phase, teams, faPool, spending, rosterRequirements, draftContext, transactions. Commands: offer-fa (proposal), accept-fa/cancel-fa (proposalId), trade (fromId/toId/outgoingIds/incomingIds/cashManYen/mode); each has a unique caller-generated id.
- [x] RED: 7/1 3-year FA yields 5000/10000/10000; hold replaces commitment once; conflicting receipt fails after JSON reload.
- [x] RED: missing year, 7th-year deficit, duplicate IDs, stale quote, expired date, losing bids, accepted rookies, floor tampering.
- [x] Implement shared candidate construction and atomic receipt with current-state revalidation.
- [x] GREEN focused tests, build, one independent branch review; fix important findings with RED/GREEN.
- [x] Document scope and remaining C-2/D work, update roadmap, commit/push a PR and inspect CI for final head. Reuse CI for full suite per AGENTS.md.

## Decisions / execution ledger
- Native execution in a fresh dedicated clone/branch; user already authorized implementation. No additional approval pause.
- Roster requirement policy stays upstream; this adapter requires explicit per-team/year counts and derives cost from actual funded players. Policy integration is C-2/D.
- JSON roundtrip is adapter persistence validation, not a claim of integration with real saves.

- Task 1/2: complete. New API RED 10 failures; raised salary RED 1; independent review RED 2, all GREEN. Related 6 files 133 passed. CI pending, tracked in PR #507.
- Ruling: full regression uses exact-source CI per AGENTS.md; no duplicated local all-suite run.
- Ruling: reviewer scope deferrals accepted as C-2/D work described in validation note; risk is premature activation, so no live call path is introduced.
- Ruling: seven-year coverage means every actual liability year, not an unconditional seven-year forecast without liabilities.
- Final: fixed cheap prorated losing/cancelled hold — 2 RED→GREEN cases; no Critical/Minor outstanding.
