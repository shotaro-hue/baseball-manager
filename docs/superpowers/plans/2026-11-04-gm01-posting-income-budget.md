# Posting income and next-season budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically complete posting departure, fee income and next-season spending permission.

**Architecture:** Reuse #543 departure commands and the existing world/annual transaction/save barrier. Keep ordinary budget policy immutable and derive effective permission from verified income allocations. Pure monetary rules introduce no random producer.

**Tech Stack:** JavaScript, Vitest, existing save generations and fake-indexeddb.

**Spec:** [design](../specs/2026-11-04-gm01-posting-income-budget-design.md)

## Global Constraints

- Base #543 `ebee5f8d79b72902c3f51f4605fd11bab38ca56d`; main `3b6192e32568ee14710f9842bc402afba166e698`; dependent draft only.
- Public gate OFF; schemaVersion1/DB5; legacy unchanged; no merge/main push.
- Separate explicit completion from future approval/market/UI/CPU/Worker producers.
- 100% allocation to Y+1 only, JPY150/USD, whole-man-yen floor; no future-year subsidy.
- Preserve existing tests, debt and ordinary authorization-change prohibition.

## Review Focus

1. Forged or deleted paired receipts must not create permission or roll back income.
2. Fee-funded vacancy costs may pass only in the funded year; future deficits remain failures.
3. Ordinary budget quoting must preserve supplements but chain only ordinary baselines.
4. Cold-load/failed-publication/recovery must retain one departure and one allocation.
5. Real roster request false/true must distinguish source evidence without altering other players.

## Task 1: Monetary rules and atomic completion

**Files:** Create `src/engine/postingIncome.js`, `src/engine/__tests__/postingIncome.test.js`, `src/engine/__tests__/fixtures/postingIncome.js`, `src/engine/__tests__/annualPostingIncome.test.js`; modify `annualTransactions.js`, `contractEconomy.js`, `annualBudgetPolicy.js`.

**Interfaces:** `quotePostingIncome(overseasContract)` returns fee cents, converted amount and policy; `normalizePostingCompletion(command)`; `createPostingCompletion(state,command,signature)` returns state; `inspectPostingIncome(state)` returns validated allocations; `postingBudgetSupplement(allocations,teamId,season)` returns whole man-yen.

- [x] Write and run RED: USD100m major => fee USD16.875m => 253125 man-yen; USD6.5m minor => USD1.625m => 24375 man-yen; reject malformed/unknown terms.
- [x] Write and run RED: `complete-posting` records departure/income/Y+1 permission, keeps base/Y+2 unchanged; same-ID replay/no second source; quote is immutable.
- [x] Implement pure rules, command normalization, receipt reconstruction and budget validation/projection.
- [x] Verify successful spending uses the supplement; future-year deficit, missing request and source/receipt tampering reject. Pending-renewal guard shares the existing world path.
- [x] Verify budget quote retains exact-year supplements with no baseline cascade, spring retention, Y+2 non-carry and genuine generated-roster positive/negative pair.
- [x] Run relevant engine regression and commit.

## Task 2: Save integrity and handoff

**Files:** Modify `src/engine/economyPersistence.js`; create `tests/posting-income-commit.test.js`, `docs/validation/gm-01-posting-income-budget/README.md`; update existing integration plan/spec handoff and SPEC.md/ROADMAP.md.

**Interfaces:** Existing `commitEconomyCandidate`, save/load/recovery and immutable history prefixes; no new storage engine.

- [x] Write RED for income-history rewrite and later income backfill; test inline/external publish failure, retry/rebuild, cold load and published-before-adoption recovery.
- [x] Protect income history through existing prefix checks; preserve all prior receipts on ordinary writes and migrations.
- [x] Run targeted save/engine regressions and build. Independent branch review; reproduce and fix material findings with RED/GREEN tests.
- [ ] Commit, publish only the feature branch, create dependent draft PR against main, check exact-HEAD CI and report remaining scope.

## Execution record

Implementation is inline under AGENTS.md; no repeated plan approval requested.
Baseline: three existing files, 76 tests passed before changes.
Ruling: market generation/eligibility/randomness are later producers, not invented
in this receipt boundary. This keeps the first PR independently testable.
