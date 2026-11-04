# Retirement-game Income Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development; one independent whole-branch review before PR presentation.

**Goal:** Record retirement-game income once through the common annual boundary.
**Architecture:** A small annual income dispatcher preserves posting validation
and validates retirement events. Existing envelope incomeReceipts and save commit
barrier own persistence; no new budget allocation or finance aggregate.
**Tech Stack:** JavaScript, Vitest, existing IndexedDB/localStorage save service.
**Spec:** [design](../specs/2026-11-04-gm01-retirement-income-design.md).

## Global constraints

- Public gate OFF, schemaVersion1/DB5, legacy unchanged.
- No current spending allowance, payroll or guarantee changes.
- Clock/schedule are world-owned; no duplicated engine state.
- Explicit nonnegative safe-integer man-yen; zero is not missing.
- Same-source once; append-only save evidence; failed save never adopts.

## Review focus

- A finalized retirement must not acquire retrospective event income.
- Coordinated round/receipt edits must fail against actual schedules.
- A retirement event must not dilute posting proof/extra-budget validation.
- Multiple kinds/IDs must not introduce duplicate sources or parent receipts.
- Later-year preservation must not depend on current player health/placement.

## Task 1: Event command, evidence and calendar

Files: create `src/engine/annualIncome.js`,
`src/engine/__tests__/annualRetirementIncome.test.js`,
`src/engine/__tests__/fixtures/retirementIncome.js`; modify
`annualTransactions.js`, `contractEconomy.js`, `annualBudgetPolicy.js`.
Interfaces: `isExtraordinaryIncomeCommand`, `normalizeExtraordinaryIncome`,
`createExtraordinaryIncome(state,c,signature)`, `inspectAnnualIncome(state)`
(posting allocations only), `inspectAnnualIncomeCalendar(world)`.

- [x] Write behavioral tests for acceptance and invariant preservation.
- [x] Run new tests; observe rejection of the missing command (RED).
- [x] Add smallest dispatch/creation/load/calendar implementation.
- [x] Run new and related retirement/posting/budget tests (GREEN).

## Task 2: Save extension and publication

Files: `src/engine/economyPersistence.js`,
`tests/retirement-income-commit.test.js`.
Consumes the event's reservation ID and transaction/income link from Task1.

- [x] Write real save/commit/reload/failure/recovery/history tests.
- [x] Reproduce the backfill/save-history refusal gap before fixing (RED).
- [x] Require new event transaction in the same extension, and reject a source
  already finalized in the previous published envelope.
- [x] Run affected save and history regressions (GREEN).

## Task 3: Review and submission

- [ ] Record real-data positive/refusal pair and executed evidence in validation.
- [ ] Independent review of whole diff; reproduce/fix material findings by TDD.
- [ ] Build, relevant regressions, diff check; commit feature branch, push and PR.
- [ ] Verify exact submitted HEAD's full CI including E2E; report limitations.

## Execution ledger

- Baseline: 3 files / 73 passed; main tree matches merged #544.
- Task1 RED: 16 failed / 14 passed; missing command rejected. GREEN new core
  31 passed; mixed posting creation now validates its own kind while the common
  dispatcher still rejects unknown kinds and cross-kind collisions.
- Task2 RED: backfill history guard returned null instead of conflict; 6 other
  save tests passed. Added published-finalization/new-transaction checks.
- Task1/2 complete: related 15 files / 529 passed, including 38 new tests.
- Implementation choices follow the existing approved income policy; no new
  price or immediate allocation is introduced. Native inline execution.
