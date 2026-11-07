# ポスティング希望生成 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation, followed by one independent whole-branch review.

**Goal:** 自球団の海外挑戦希望を年一度生成・保存し、受信箱の既存判断/交渉へ渡す。
**Architecture:** nativeの一取引が候補snapshotとrequest子取引を生成する。人用adapterはidentityを検査し既存保存barrierを使う。
**Tech Stack:** 既存React/Vite/Vitest/Playwright。依存追加なし。
**Spec:** `docs/superpowers/specs/2026-11-07-gm01-posting-request-generation-design.md`

## Global Constraints

- 公開OFF/schemaVersion1/DB5。main直接push/merge/automerge/履歴書換禁止。
- 既存の市場数値互換・契約/予算・共通保存を維持する。
- ローカルは対象テスト、全件/build/重要E2Eは最新HEADの必須CIを正本にする。

## Review Focus

- 希望ゼロや既申請でも再抽選できない。
- missingと実測0、推定志向と市場の志向が一致する。
- 保存済み希望を更新された能力・配置から再計算しない。
- 親receiptの後付け、子の付け替え、seed変更を拒否する。
- 実12球団規模の表示/保存検証を毎renderへ持ち込まない。

### Task 1: Native producer

Files: `generatedPostingRequests.js`, `postingPreference.js`, `annualTransactions.js`,
`annualPostingApplications.js`, `postingMarketModel.js`, `economyPersistence.js`;
test `src/engine/__tests__/generatedPostingRequests.test.js`。
Interface: `generate-posting-requests {id,type,teamId}`、年/球団の決定的ID。

- [x] 希望生成/ゼロ/除外/改変/順序/再実行の回帰を書き、REDを確認する。
- [x] 共通request子取引と年一度receipt、歴史入力検証を実装する。
- [x] 対象回帰と既存数値互換をGREENにする。

### Task 2: Human save and inbox

Files: `humanPosting.js`, `useGameState.js`, `AnnualPostingRequests.jsx`, `MailboxTab.jsx`;
test `useGameState.economyPosting.test.js`, `tests/generated-posting-requests-commit.test.js`。
Interface: `postingGenerationRequest(world)` / `reducePostingGenerationRequest(world,request)` /
`commitPostingGenerationRequest(request,sessionToken)`。

- [x] 実保存/失敗/二重操作/復旧/staleのREDを確認する。
- [x] 既存barrierと確認部品で受信箱を接続し、既存判断/交渉の回帰を確認する。
- [x] 両ブラウザの実操作と同状態画面比較を実施する。

### Task 3: Review and PR

- [x] 実装SHA、要件、実名簿入口を独立レビュアーへ渡し、具体的指摘を検証/修正する。
- [x] 計画/検証記録を更新し、専用branchのPR #555を作る。
- [x] 最新HEADのCI追跡先をPR本文へ設ける。必須CIが失敗/未完了なら提出完了扱いにしない。マージ判断はユーザーへ返す。

実行SHA・最新CI結果・提出状態は[PR #555](https://github.com/shotaro-hue/baseball-manager/pull/555)を正本にする。
