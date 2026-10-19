# Club Finance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 球団別の主催試合収入・年間契約・運営費と編成予算を整合する。

**Architecture:** 新しい純粋な収支モジュールに計上・予測・年度配分を集約する。旧モデルは旧セーブ当年度に限定し、新規/次年度を共通レジャーへ接続する。

**Tech Stack:** React 18 / Vite / Vitest / Playwright。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-10-18-club-finance-design.md`

## Global Constraints

- 金額は万円、価格は円。ゲーム用Math.randomの追加なし。
- `budget`は編成予算の残枠。新給与精算や現金残高を名乗らない。
- 旧セーブの当年度を保持。新しい破損レジャーを正常な0として扱わない。
- UIの全体刷新と契約評価式の変更を混ぜない。mainへのpush・マージをしない。

## Review Focus

- 年度/ラウンドの欠落・重複・順序違いで固定契約収入を重複配賦しない。
- 対戦の日程が欠落した画面で予測を確定額と表示しない。
- 旧セーブの高額累計や負予算を架空の新モデル内訳へ移行しない。
- 欠測年俸・重複所属・ID=0で年度配分を捏造しない。
- 価格変更と上限近くの動員で入場料の式と画面の単価を一致させる。

### Task 1: 収支ドメイン

**Files:** Create `src/data/clubFinanceProfiles.js`, `src/engine/clubFinance.js`, `src/engine/__tests__/clubFinance.test.js`.

**Interfaces:** `startClubFinance(team,year)` returns a new team; `calcClubGameFinance(team,isHomeTeam,index)` returns income/cost breakdown; `applyClubGameFinance(team,{year,gameDay,isHomeTeam})` returns a new team or unchanged duplicate. `forecastClubFinance(team,schedule)` and `nextClubBudget(team,nextRoster,myId)` produce derived reports.

- [x] Add tests for home/away receipts, exact annual contracts/costs, immutable inputs, repeated rounds, genuine zero vs bad data, price/attendance limits and forecast closure.
- [x] Run `npx vitest run src/engine/__tests__/clubFinance.test.js --maxWorkers=1 --minWorkers=1`; observe RED.
- [x] Implement pure calculations and profiles; run same command to GREEN; commit.

### Task 2: ライフサイクルと保存

**Files:** Modify `bootstrapTeams.js`, `regularGameUpdates.js`, `useOffseason.js`, `saveload.js`; add lifecycle/save regression tests.

**Interfaces:** Consume Task 1 helpers. New games and next years get a new ledger; no-ledger teams retain legacy accrual for their current season.

- [x] Add RED tests for real batch vs regular finance, annual reset, old save rollover, corrupt ledger and persistence equality.
- [x] Connect the common functions in actual production paths. Use deduplicated salary values and preserve incomplete data behavior.
- [x] Run direct lifecycle/save and existing offseason/worker regressions; commit.

### Task 3: 画面と実行の整合

**Files:** Modify `FinanceTab.jsx`, `HubContentRouter.jsx`, `useGameState.js`; add/extend finance rendering and browser specs.

**Interfaces:** Consume `forecastClubFinance` and shared version-dependent stadium prices.

- [x] Add RED checks for actual+remaining forecast, complete vs incomplete schedules, operating costs, budget meaning, legacy explanation and shared upgrade amounts.
- [x] Render model data without changing it; pass actual schedule; connect upgrade costs to the same constants.
- [x] Run targeted Vitest and finance Playwright at 360/390/1440px, save/reload included; commit.

### Task 4: 校正と提出

**Files:** Create focused calibration and real multi-season evidence under `docs/validation/club-finance/`; update implementation notes, SPEC and ROADMAP.

- [x] Run all-12-team deterministic annual scenarios, verify sums and full-season forecast closure, and record ranges without calling it actual gameplay.
- [x] Run relevant real application multi-season validation with save/reload; inspect budgets, roster caps, rookie opportunities and farm coverage.
- [x] Run build and project test suite; request one whole-branch independent review; fix important findings with RED→GREEN.
- [ ] Push the independent branch, open a PR, inspect CI for its exact head; report remaining limitations.
