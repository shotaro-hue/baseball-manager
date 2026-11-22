# Annual CPU Contracts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; independent whole-branch review at finish.

**Goal:** CPU更改・満了・市場供給を一括保存で確定する。
**Architecture:** annualTransactionsの集約generatorと既存正式子取引を利用。useGameStateの既存commitEconomyOperation barrierへ接続。
**Tech Stack:** JS/React/Vitest/Playwright/IndexedDB
**Spec:** docs/superpowers/specs/2026-11-21-annual-cpu-contracts-design.md

## Global Constraints
schemaVersion1・DB5・公開OFF。既存テスト削除/skip/timeout/retry緩和禁止。main push/merge禁止。

## Review Focus
- 既存将来契約/CPU留保と重複しないこと。
- 人間球団を別IDでCPU化できないこと。
- 子履歴/対象行の欠落を保存読込時に拒否すること。
- 将来年度予算不成立時の単年fallbackと満了。
- 実12球団の時間費用と保存barrier中の非同期処理。

### Task 1: 正式CPU集約取引
Files: annualCpuContracts.js（新規）、annualTransactions.js、contractEconomy.js、annualCpuContracts.test.js（新規）
Interfaces: cpuContractsId(season), normalizeCpuContracts(command), createCpuContractsSteps(state,command,signature,applySteps), inspectCpuContracts(state), cpuContractsRequest(world).
- [x] 正常更改・将来契約/自球団維持・予算失敗・FA・破損receiptのテストを追加、RED確認。
- [x] 有限交渉と正式子取引、receiptとcoverage検証を実装。
- [x] 関連engineテストGREEN、実12球団を計測。

### Task 2: 保存と画面
Files: useGameState.js、useOffseason.js、AnnualContractTab.jsx、専用hookテストと画面テスト。
Interfaces: commitCpuContractsRequest(request,session), handleCpuContracts()。
- [x] 保存失敗/retry/reload/replay/二重入力/旧sessionのテストを追加、RED確認。
- [x] #564 barrierと既存run UIに接続し結果と理由を表示。
- [x] 実12球団保存再開、360/390/1440px操作確認。

### Task 3: 提出
- [x] 別コンテキストへ差分/要件/実データ入口を渡し独立レビュー。
- [x] 指摘を再現・修正。関連テストとbuild確認。
- [ ] SPEC/ROADMAP/検証記録を更新。専用branchにcommit/push、PR作成。
- [ ] 最新HEADの必須CIを確認し、開発者のマージ判断を待つ。
