# Year-end growth Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User/AGENTS authorizes native implementation and an independent context review.

**Goal:** 引退確定後の成長・要求額を一度保存し、理由と結果を再開後も確認する。
**Architecture:** native transaction + existing teams/ledger + existing save barrier; no second live player state.
**Tech Stack:** JS/React/Vitest/Playwright/IndexedDB.
**Spec:** ../specs/2026-11-16-year-end-growth-design.md

## Global Constraints
公開OFF、schema1/DB5、main push/merge禁止。テストskip/期待緩和/timeout緩和禁止。

## Review Focus
旧postingの途中保存、直接request-postingの抜け道、旧コーチ観測不足、後年履歴保持、初回保存前の証跡改変。

### Task 1: deterministic growth + transaction
- [ ] RED: real open/retirement producer→survivor coverage, deterministic RNG, old salary/stats/career/future terms, coach year, measured zero/missing and recorded awards.
- [ ] Minimal optional RNG in player.js; annualYearEndGrowth.js report/create/inspect; wire annualTransactions/contractEconomy; opening coach observation and new posting guards.
- [ ] GREEN: focused core and compatibility tests.

### Task 2: save and UI
- [ ] RED: hook save failure/retry/cold/backup/recovery/stale session and posting rejection.
- [ ] Existing commitEconomyOperation hookup; retire-phase save/result display; inbox directs to pending growth.
- [ ] GREEN: hook and browser 360/390/1440 with screenshots, error/reload/recovery.

### Task 3: independent review and delivery
- [ ] Independent reviewer receives final diff, requirements and real producers; reproduce/fix findings with regressions.
- [ ] Document validation/limits and remaining annual work; update ROADMAP.
- [ ] Branch commit/push and PR; require all mandatory CI on the same final HEAD. Stop for developer merge decision.
