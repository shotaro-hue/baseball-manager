# Offseason Turns Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User/AGENTS authorizes implementation and a fresh context independent review.

**Goal:** 契約画面で1ターン進め、既存回答を時計と一緒に保存する。
**Architecture:** economyDecisions wrapper + existing scheduler and save barrier. No new persistent source.
**Tech Stack:** JS/React/Vitest/Playwright/IndexedDB.
**Spec:** ../specs/2026-11-20-offseason-turns-design.md

## Global Constraints
schema1/DB5/公開OFF。main push/merge禁止。既存テスト削除/skip/期待値/timeout/retry緩和禁止。

## Review Focus
- 旧成長前pending・dueDate持越は新規提示ガードに巻き込まない。
- 現在既にdueの回答を進める前に確定し最終期限を飛び越えない。
- 更改・獲得混在を一revision/一保存に収める。
- 読了等のdirty base、旧session、保存失敗と公開後採用失敗。
- 旧native/legacyと既存FA補償/加入待ちを保つ。

### Task 1: reducer
- [x] RED: src/engine/__tests__/offseasonTurns.test.js (1刻み/同時回答/持越/旧pending/30,31,37/不正入力)
- [x] Implement offseasonTurnRequest(world), advanceOffseasonTurn(world,request) in economyDecisions.js. Returns standard {ok,world,replayed,error}; uses existing scheduler twice, exact revision.
- [x] GREEN: focused renewal/acquisition/growth-order and new tests.

### Task 2: save and existing UI
- [x] RED: src/hooks/useOffseason.turns.test.js real barrier and actual 12 clubs; browser cases in e2e/offseason-turns.cases.js imported by management-decisions.spec.js.
- [x] useGameState commitOffseasonTurnRequest; useOffseason handleAdvanceOffseasonTurn captures session and request; AnnualContractTab shows turn/pending schedule and uses existing run/error/recovery.
- [x] GREEN: hook, UI, Chromium/WebKit360/390/1440 screenshots.

### Task 3: review and delivery
- [x] Independent reviewer with diff, spec and real producers; validate and fix findings.
- [x] Update CHANGELOG/SPEC/ROADMAP and validation record, preserve explicit deferred CPU/FA scope.
- [ ] Commit branch, push and create PR; all mandatory CI on final SHA; stop for user merge.


### PR #564 review fix (2026-11-21)
- [x] Confirm main/PR 0ac5626, inspect existing #747, code/design and saved producers.
- [x] RED: actual native open→empty turn31→growth→offer rejected; empty open/retirement state, terminal old answers, hook reload and UI gate.
- [x] Share offseasonTurnGrowthIssue in engine/UI; preserve pending resolution, legacy/posting compatibility, deadlines and save barrier.
- [x] GREEN: focused Vitest 91 cases, new browser 12 cases, real 12-club refusal + reply preservation, independent review with no confirmed P1/P2.
- [ ] Add commit to existing PR #564 and verify all mandatory CI on its final HEAD; no new PR or merge.
