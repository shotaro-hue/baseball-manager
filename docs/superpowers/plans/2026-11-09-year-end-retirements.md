# native期末引退判断 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this authorized stage, test-driven-development, then independent whole-branch review.

**Goal:** native 12/1の人/CPU新規引退判断を保存し、履歴・保証を保持して既存postingへ渡す。

**Architecture:** 既存annual retirement子取引/一candidate/保存barrierを再利用。期中と区別した期末sourceと親receiptを既存配列へ記録する。

**Tech Stack:** JavaScript/React/Vitest/Playwright/既存IndexedDB。

**Spec:** [設計](../specs/2026-11-09-year-end-retirements-design.md)。

## Global Constraints

- 基準main 259c200b18518a228f69abd12274c304be57a027、公開OFF/schema1/DB5。
- legacy/旧冬/保証・過去成績・保存barrier維持。成長/翌春/Workerは含めない。
- 同一scopeの乱数固定。入力/失敗は非変更。マージ/main pushなし。

## Review Focus

1. 期中予約と12/1新規引退の元日付/雇用照合を混ぜない。
2. farm・低意欲・予約済み・将来契約を人/CPUとも正しく扱う。
3. 再試行/旧session/公開後中断で二重career/抽選/公開をしない。
4. posting済み旧冬のロード/再利用を妨げず、新規の後付け引退は拒否する。
5. 改ざんreceiptと合法な後続契約/成長を区別し、過去判断を再抽選しない。

## Task 1: 期末引退のnative合成取引

**Files:** annualYearEndRetirements.js（新規）、annualRetirements.js、annualTransactions.js、contractEconomy.js、economyPersistence.jsと対応unit。

**Interfaces:** yearEndRetirementsId(season)、yearEndRetirementCandidates(state,humanTeamId)、normalizeYearEndRetirements、createYearEndRetirementsSteps(state,c,signature,applySteps)、inspectYearEndRetirements(state)。新reserve-year-end-retirementは既存finalize-retirementと合成する。

- [ ] 成功・0件・人の意向/CPU/予約混在・保証・入力不変・JSON/順序・改ざん・競合/古い入力の回帰を追加しRED確認。
- [ ] 期末source/親receipt/審査と保存履歴保護を実装、unit/隣接群GREEN。
- [ ] 実bootstrap/PR-C入口と性能を確認しcommit。

## Task 2: 既存画面/保存操作への接続

**Files:** humanYearEndRetirements.js（新規）、useGameState.js、useOffseason.js、既存画面/route、対応hook/UI/E2Eと検証文書。

**Interfaces:** yearEndRetirementsRequest(world,decisions)、reduceYearEndRetirementsRequestAsync、commitYearEndRetirementsRequest(request,sessionToken)、handleYearEndRetirements(decisions)。UIは結果ではなくaccept/retain意向を渡す。

- [ ] 実保存の失敗/再試行・cold reload・career・旧session/revision・barrier・公開後復旧、UI選択/結果/旧冬互換をRED確認。
- [ ] 既存commit/復旧と画面に接続しGREEN。postingは別操作。
- [ ] 360/390/1440pxの前後/操作・Chromium/WebKitを検証、既存必須CIの対象へ追加。
- [ ] 独立レビュー→指摘実証/修正→exact HEAD必須CI→PR提示。

## 実行記録

- AGENTS.mdに従い新規cloneの専用ブランチで作業。新規worktreeの追加は不要。既存計画/コードの照合と独立scopeレビューから本工程を選定し、追加承認待ちは設けない。
