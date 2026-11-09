# PR-C native open-offseason Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox syntax; the agreed user instruction authorizes execution through PR and independent review without another approval round.

**Goal:** 検証済み閉幕と翌年度承認を一candidateで保存し、公開照合後にのみnativeオフを採用する。

**Architecture:** PR-Bの純粋forecastと既存保存barrierを専用境界reducerで接続する。既存clock/cycle/予算配列を使い、通常プレイ公開と春の処理は接続しない。

**Tech Stack:** JavaScript / React / Vitest / IndexedDB / Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-native-open-offseason-design.md`

## Global Constraints

- 公開ゲートOFF、schemaVersion 1、DB version 5を維持する。
- テスト削除/skip/緩和、根拠のないtimeout/retry/期待値変更は禁止。
- mainへのpush、マージ、自動マージは禁止。
- 旧セーブ/契約/予算の挙動を維持し、大規模リファクタリングをしない。

## Review Focus

- gameDay 144のAll-Star日付を閉幕と誤認しない。完了結果と完全一致する日付だけ受け付ける。
- 将来予算の下振れは既存保証を消さず、旧budgetやposting追加を前年基準へ混ぜない。
- receipt欠損/重複/履歴削除と、元sessionから遅れた操作を拒否する。
- 公開後にReact採用だけ失敗しても、再試行で年度処理や保存を重複実行しない。
- 旧セーブとbackupの欠測履歴を暗黙にannualへ移行・日付補完しない。

## Task 1: 検証付きnative年度境界

**Files:** Create `src/engine/annualOpenOffseason.js`, `src/engine/__tests__/annualOpenOffseason.test.js`, `src/engine/__tests__/fixtures/openOffseason.js`; modify `economyCalendar.js`, `contractEconomy.js`, `economyPersistence.js`.

**Interfaces:** `openOffseasonRequest(world)` returns identity/revision/season/closingDate/teamId only. `reduceOpenOffseasonRequest(world, request)` returns `{ok,world,replayed,error?}`. `inspectOpenOffseason(world)` validates optional existing-cycle receipts. `postseasonBoundaryDate(world)` validates the saved completed boundary for the clock and reducer.

- [x] Write focused tests for valid closing clock, one candidate/receipt/revision, all approvals, projection, replay, source/request/receipt corruption, JSON/order/input immutability, legacy compatibility and preserved receipt history.
- [x] Run `npx vitest run src/engine/__tests__/annualOpenOffseason.test.js` and record RED (missing boundary acceptance/API).
- [x] Implement the scoped producer and validation with current-year financial inputs only; keep official `economyClockFor` strict.
- [x] Run the new test and adjacent clock/budget/calendar/persistence tests; all must pass. Commit the tested boundary.

## Task 2: 保存barrierと既存handlerへの接続

**Files:** Modify `src/hooks/useGameState.js`, `src/hooks/useOffseason.js`; create `src/hooks/useGameState.openOffseason.test.js`; extend `e2e/save-generations.spec.js`.

**Interfaces:** `commitOpenOffseasonRequest(request, sessionToken)` uses Task 1 reducer under existing `commitEconomyOperation`. `handleOpenAnnualOffseason` calls it, retaining the existing handler's session fence; `handleRetirePhaseNext` routes closed postseason to this operation and always stops before legacy annual processing.

- [ ] Write hook tests that use real IndexedDB save/load and React adoption for success, failure/retry, duplicate, old session, barrier, ack recovery, backup, older native winter and legacy saves; confirm missing connection RED.
- [ ] Connect the dedicated commit and handler. Do not add UI/state managers or automatically execute posting/spring.
- [ ] Run new hook tests and existing posting/economy commit regressions; add real browser tests under the existing save-generations suite for publication/retry/reload and recovery. Run Chromium and mobile WebKit with `--workers=1 --retries=0`.
- [ ] Record sources, before/after Mermaid, compatibility, validation and remaining work under `docs/validation/pr-c-open-offseason/README.md`; update ROADMAP's current note. Commit.
- [ ] Obtain fresh-context independent review of full base..HEAD and real data entry. Verify any findings with repro/tests. Run build and exact final HEAD mandatory CI, create PR, and stop for developer merge judgment.

## Execution record

- Baseline relevant five files: 136 tests passed (clock, dated postseason persistence, forecast, commit/recovery). Full main suite result is PR-B exact HEAD CI #729; no duplicate full local run.
- Latest main and open PRs verified. Work proceeds on dedicated `feat/native-open-offseason-20261109` in the existing clean cloud checkout.
- Initial RED: new unit file 23 failed / 13 already-valid refusal cases passed. Valid clock/API acceptance was absent.
- Ruling: quote authorizations contain placeholder minimumRosterReserveManYen=0; existing `projectAnnualState.withRosterFloors` recalculates funded vacancies. Check approval amounts against quote and the independently derived final-year floor 65*420=27300, rather than requiring an invalid zero floor. No production spending rule changes.
- Ruling: generic `fromAnnualState` adds empty draft views to a postseason-only plan. Retain the original plan in this no-draft boundary rather than altering that shared behavior.
- Additional RED: real reserve-retirement/ceremony and in-season release each reject the completed gameDay144 snapshot in historical read validation. Permit reading their old facts through 144, preserving 1..143 creation/calendar checks and the world-level dated boundary requirement.
- Task 1 GREEN: related eight files 374 passed; final new file 40 passed including a zero-approval/deficit case that retains all guaranteed contracts.
- Task 2 initial RED: 13 failures (missing hook API/handler) and one pre-existing nonempty-decision refusal passed.
