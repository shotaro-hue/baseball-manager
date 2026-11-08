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

- [x] 既存予約fixtureから一軍/二軍/CPUと成績/保証/順序/再実行のREDを確認する。
- [x] 同じcandidateStepsで子を審査し、親の検証・保存境界を実装する。
- [x] 関連engine回帰をGREENにする。

### Task 2: hook・画面・保存

Files: `humanPosting.js`, `useGameState.js`, `useOffseason.js`, `OffseasonReviewScreens.jsx`, `AppScreenRouter.jsx`と対応hook/E2E。
Interfaces: `commitOffseasonPostingRequest`、`handlePrepareAnnualPosting`、annual用の予約確認表示。

- [x] 実保存失敗・career原子性/再試行・barrier/session・UI状態のREDを確認する。
- [x] 共通commitに接続し、年度全体の進行ガードは維持する。
- [x] Chromium/WebKit、360/390/1440px、実12球団を検証する。
- [x] 最終導線確認で受信箱先行による順序不整合を再現（共通取引/hook/3幅RED）。新規phaseの予約確定先行と受信箱からの戻り導線を追加する。過去phaseは凍結fixtureで維持する。
- [x] 独立レビューのP2をRED→GREEN：clockを持たない明示legacy envelopeのhydrateと、公開後応答中断から同画面での復旧。共通barrierは維持し、復旧再失敗と再試行/追加公開なしを確認する。関連72件・ブラウザ6ケース・build成功。

### Task 3: 提出

- [x] 根拠/限界/次工程を検証記録とROADMAPへ記録する。
- [x] 修正SHAの独立レビューを受け、指摘を検証・修正する（`edd6310d`、P1/P2指摘なし）。
- [x] [PR #557](https://github.com/shotaro-hue/baseball-manager/pull/557)を作成する。
- [ ] 最新HEADの必須CI全件を確認して停止する。最終結果はPR本文を正本とし、文書更新だけの再帰的commitは作らない。
- 続行導線修正の独立再レビューと新しい最終HEADのCIをPR本文へ記録する。`7548de37`のCI #715はunit4,633件/保存整合性205件を含む12ジョブ成功。QA-D1の既存Enter/自動保存の競合1件はtraceを独立確認し、main/当該HEADの比較各3回は再現なし。再検証中に導線修正が入ったため、最終CIの代わりにはしない。
- [x] CI #717で判明した実12球団保存テストの呼出先を予約確定込みの入口へ更新する。元の期待・60秒制限を維持し、予約確定/留保不変/引退履歴を追加。18件成功。最終レビューの本番コード`168ab798`は変更しない。
