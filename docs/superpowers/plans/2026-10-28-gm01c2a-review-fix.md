# GM-01C-2A Review Fix Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reject rookie holds for the wrong acquiring club and explicit player contracts below their registration minimum, without partial state changes.

**Architecture:** Keep the existing capacity evaluator as the source of accepted draft records. Preserve both accepted player metadata and the acquiring team's ID in annual transaction inspection, and reject conflicting accepted assignments before floors are derived. Validate minimum annual salary with the explicit contract class in the existing season contract validator; untyped legacy ledger records retain zero-money compatibility.

**Tech Stack:** JavaScript, Vitest, Vite, GitHub Actions.

**Spec:** User's PR #508 GM-01C-2A-FIX instructions (2026-10-27); `SPEC.md` section 4.5; `AGENTS.md`.

## Global Constraints

- Existing PR branch `feat/gm01c2-contract-transactions`, initial head `c6a081245d9433b43d40dd0329cd3026ce61857a`; main `818ae5025dd749b9bb254bbfcdcd7ba4ceb5cbc9`.
- Explicit controlled annual salary >= MIN_SALARY_SHIHAKA (420); development >= MIN_SALARY_IKUSEI (240), amounts in 万円.
- Preserve untyped C-1 input, generic zero-money ledger, monthly payroll, conversion history, term/guarantee, farm placement, 70 places, pure quotes and atomic failure.
- No live integration, CPU/Worker/UI/save migration, new draft rules, balance changes, merge or auto-merge.

## Review Focus

- Wrong club with a matching class, including untyped C-1 holds, must fail before funding changes.
- Duplicate candidates accepted by different teams must fail in either pool order, even without holds.
- An obsolete rejected pool copy must not override the valid accepted player or their class.
- Forged JSON contracts below minimum must be rejected both as reservations and existing active ledger entries.
- At 69 controlled players plus an accepted rookie, an invalid hold must not enable a 71st conversion.

### Task 1: Accepted rookie ownership

**Files:** `src/engine/annualTransactions.js`, `src/engine/__tests__/annualDevelopmentTransactions.test.js`.

**Interfaces:** Keep `quoteAnnualTransaction(state,command)` and `applyAnnualTransaction(state,command)` unchanged; inspection's internal rookie map stores `{player,teamId}` from capacity-validated results.

- [x] Add tests for wrong/correct club in both classes; untyped wrong club; duplicated conflicting assignments in both orders; stale rejected pool copy in both orders; JSON roundtrip; quote and apply failure identity/full snapshot preservation; 70-place boundary.
- [x] Run the focused test and record actual RED failures.
- [x] Keep acquiring club with accepted metadata, reject cross-club duplicates and wrong-club rookie holds, then compare class on the accepted player.
- [x] Run focused tests and record GREEN.

### Task 2: Explicit contract salary minimums

**Files:** `src/engine/seasonContract.js`; seasonContract, annualSpending and annualDevelopmentTransactions tests.

**Interfaces:** `createSeasonContract` and `validateSeasonContract` reject explicit classes below the existing minimum constants; untyped contracts retain existing behavior. Ledger/reservation normalization reuses validation.

- [x] Add 419/420 controlled and 239/240 development boundary cases, constructor and JSON validator paths, untyped 0/239/419 compatibility.
- [x] Add forged reservation rejection through quote/reserve/commit; forged active ledger rejection; invalid rookie floor and 70-place boundary; full input preservation.
- [x] Run these cases first and record RED before source edits.
- [x] Import existing salary constants and extend the existing contract validator without duplicating downstream rules.
- [x] Run focused tests and record GREEN; keep all existing zero-ledger tests.

### Task 3: Regression and publication

**Files:** This plan, `docs/validation/gm-01c-2a-fix/README.md`, scoped source/test files; PR #508 description.

- [x] Run relevant contract, ledger, spending, transactions, capacity, payroll/calendar, FA/trade/renewal/hooks and save JSON tests; build and diff check.
- [x] Run a fresh-context whole-change review, resolve material findings via RED/GREEN.
- [ ] Commit to existing PR branch with its original head as parent; verify published tree matches local tested tree.
- [ ] Verify all latest-head GitHub Actions jobs, preserving existing skip/advisory reporting; update PR description with evidence, risks and merge YES/NO.

## Execution ledger

- Pre-flight: Tasks 1 and 2 share the transaction fixture and validator, but keep their independent RED evidence before source modifications. Validation boundaries propagate through existing ledger/reservation APIs.
- Native execution is explicitly authorized by the user; AGENTS.md says not to repeat approval for agreed requirements. Existing PR checkout is dedicated to this task.
- Baseline: 4 files / 153 passed. Tasks 1–2: 24 added cases; initial RED 19 failures / 128 passes, then GREEN 147/147. Relevant regression: 19 files / 417 passed; build exit 0 (existing chunk warning); diff check passed.
- Final review: fresh reviewer found no source blocker and one fixture gap: passing undefined retained the helper's default controlled class. Treating this as required-coverage work, omitted the class explicitly and asserted a valid legacy quote before changing the club. Final tests against initial-head separate checkout: RED 19/147; current source: GREEN 147/147. No assertion weakening or additional product changes.
- Deferred live integration, save migration, annual rollover and actual iPhone performance remain outside this patch, as expressly required by the user. Latest-head CI and publication remain gated in the PR body.
