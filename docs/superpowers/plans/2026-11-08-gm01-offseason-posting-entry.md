# Offseason Posting Entry Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** annualの引退整理画面から、保存済み予約確定と12/1 postingを一回で確定する。

**Architecture:** 共通native取引が既存引退/予算審査とposting generatorを合成する。
hookは既存保存barrierへ接続し、専用表示は保存正本から状態を読む。

**Tech Stack:** JavaScript / React / Vitest / Playwright / IndexedDB。

**Spec:** [設計](../specs/2026-11-08-gm01-offseason-posting-entry-design.md)

## Global Constraints

- 公開OFF/schema1/DB5、legacy互換、予算防御・保存後採用を維持。
- 時計生成/Worker/翌春/期末新規抽選は対象外。一revision/一確定保存。
- 既存receipt・契約保証を再評価/改変せず、テスト/timeout/retryを緩和しない。

## Review Focus

- 強制引退で生じた不足をpostingがさらに悪化させない。
- 古いposting phaseへ予約確定を後付けしない。
- 自球団判断、元本/career原子性とstale sessionを守る。
- 予約ゼロ/確定済み・旧receiptも再抽選しない。
- 実名簿の一軍/二軍・12球団負荷と保存後のUIを確認する。

### Task 1: Native合成と履歴検証

Files: `annualOffseasonPosting.js`, `annualTransactions.js`, `contractEconomy.js`, `economyPersistence.js`、対応engineテスト。
Interfaces: `prepare-offseason-posting {id,humanTeamId}`、親receipt `annualOffseasonPosting`。

- [ ] 既存予約fixtureから一軍/二軍/CPUと成績/保証/順序/再実行のREDを確認する。
- [ ] 同じcandidateStepsで子を審査し、親の検証・保存境界を実装する。
- [ ] 関連engine回帰をGREENにする。

### Task 2: hook・画面・保存

Files: `humanPosting.js`, `useGameState.js`, `useOffseason.js`, `OffseasonReviewScreens.jsx`, `AppScreenRouter.jsx`と対応hook/E2E。
Interfaces: `commitOffseasonPostingRequest`、`handlePrepareAnnualPosting`、annual用の予約確認表示。

- [ ] 実保存失敗・career原子性/再試行・barrier/session・UI状態のREDを確認する。
- [ ] 共通commitに接続し、年度全体の進行ガードは維持する。
- [ ] Chromium/WebKit、360/390/1440px、実12球団を検証する。

### Task 3: 提出

- [ ] 根拠/限界/次工程を検証記録とROADMAPへ記録する。
- [ ] 修正SHAの独立レビューを受け、指摘を検証・修正する。
- [ ] 新規PRを提示し、最新HEADの必須CI全件を確認して停止する。
