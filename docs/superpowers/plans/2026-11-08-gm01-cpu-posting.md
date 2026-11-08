# CPU Posting Annual Entry Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution; one independent reviewer at the end.

**Goal:** 全球団の希望とCPU判断・海外交渉を年度入口から一回の保存へ接続する。
**Architecture:** native親commandで既存の子処理を合成し、共通world/save/復旧を使う。自球団の判断は保留。
**Tech Stack:** JavaScript / React / Vitest / Playwright / existing IndexedDB generation saves.
**Spec:** `docs/superpowers/specs/2026-11-08-gm01-cpu-posting-design.md`

## Global Constraints

- ANNUAL_ECONOMY_RELEASE_ENABLED OFF、schemaVersion 1 / DB version 5。
- main push、merge、automerge、履歴書換なし。最新mainから専用PR。
- #554数値・#555希望生成、legacyと既存保存保護を維持。
- 年度全体/Worker/翌春を完成扱いしない。失敗は全体非変更。

## Review Focus

- 自球団が既に希望確認済みでもCPU工程を省略しない。
- 複数承認で最後の役割戦力を放出しない。未来の市場結果を判断へ使わない。
- 親の後付け・過年度判断の改変を拒否し、後日の戦力から再判断しない。
- 年度入口の古いcallback/sessionと未接続の旧年次処理へ流れない。
- 一括候補の支出審査がCPUだけ制約を飛ばさない。

### Task 1: Native phase and preserved decisions

Files: create `src/engine/annualPostingPhase.js`, `cpuPosting.js`, `__tests__/annualPostingPhase.test.js`; modify annualTransactions/contractEconomy/economyPersistence.
Interfaces: `postingPhaseId(season)`, native `advance-posting-phase {id,type,humanTeamId}`, `createAnnualPostingPhase(state,c,signature)`, inspector.
- [x] Write failing real-state tests for all-club wishes, CPU approve/reject/three outcomes, human pending, repeat/previous generation, depth and budget failure, historical/tampered evidence.
- [x] Run targeted tests RED.
- [x] Implement shared child calls and final common validation, single-revision world reduction and saved decision evidence.
- [x] Run native and related posting regressions GREEN.

### Task 2: Annual entry and real save/UI

Files: modify humanPosting/useGameState/useOffseason/AnnualPostingRequests; extend real commit, hook and browser tests.
Interfaces: existing `postingGenerationRequest`/`commitPostingGenerationRequest` now run the annual posting phase; existing human decide/market unchanged.
- [x] Write failing hook test invoking handleRetirePhaseNext and checking CPU saved, human pending, false + explicit annual block, old sessions rejected.
- [x] Write failing save tests for publish failure/retry, adoption recovery, stale identity and parent backfill.
- [x] Run RED, implement annual branch and UI summary/retry, then GREEN.
- [x] Run real browser entry/reload, existing human operations and legacy regression.

### Task 3: Evidence and independent review

Files: update this ledger, validation README, ROADMAP, related A1 plan.
- [x] Measure real 12-club phase/commit time and publication count; cover development, retirement reservation, hold and future employment.
- [x] Commit implementation, request fresh-context independent review with SHA/diff/spec/data/entry.
- [x] Reproduce findings before fixes; run targeted regressions.
- [x] Prepare dedicated branch and PR description; record the created PR and exact-HEAD required CI result in the PR body (post-commit verification); report limitations and stop for user merge decision.

## 実行記録

- native未実装RED9→GREEN11、実入口/保存RED2→GREEN。非同期境界の未実装REDも確認。
- 最終対象26ファイル426件成功。対象browser7×2で14件成功。詳細/測定値はvalidation README。
- 性能観測により同じgeneratorへyield境界を追加。候補準備から共通barrierを保持し、Workerは変更しない。
- 独立レビュー対象314d9b2、確定P0〜P3なし。23件の担当者検証。production sourceのレビュー後変更なし。
- 公開OFF/schema1/DB5、旧経路の保護を維持。main push/merge/automerge/history rewriteなし。
- PR作成後の最新HEADの全件/build/必須E2E確認は、コミットを再帰的に更新せずPR本文へ記録する。
