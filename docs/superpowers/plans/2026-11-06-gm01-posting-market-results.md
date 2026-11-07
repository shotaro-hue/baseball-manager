# Posting Market Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 承認済み申請の明示市場結果を一度だけ保存し、成立時だけ既存退団・譲渡金を原子的に確定する。
**Architecture:** optional postingMarketResultsとreceiptを相互照合し、signedでは既存complete-postingを内部利用する。申請selectorと歴史資格検証は解決済み結果を扱い、保存prefixを保護する。
**Tech Stack:** 既存JavaScript/ES modules、Vitest、fake-indexeddb。
**Spec:** [設計](../specs/2026-11-06-gm01-posting-market-results-design.md)。既存申請設計の後続確定境界を今回の単位とする。

## Global Constraints

- 公開ゲートOFF、schemaVersion1/DB5、legacy/旧annual明示完了を維持。
- 価格/受諾producer、pool容量、UI/CPU/年度Worker、自動乱数は対象外。
- 不成立で契約/所属/給与/保証/予算を変更しない。
- signedは既存譲渡金式・翌年度限定追加枠を使用し、直接完了バイパスを閉じる。

## Review Focus

- 親/子IDの型衝突・receipt付替え・孤立/後付け市場結果を拒否する。
- 成立後の旧資格・過年度結果を現在の所属や再雇用へ結合しない。
- 不成立後の通常更改/満了を許し、同年再申請・再解決を拒否する。
- 人の回答待ち、引退、留保、将来雇用との競合を黙って解消しない。
- 保存失敗/retry/復旧で退団・収入・翌年許可が部分反映/二重反映しない。

## Task 1: 市場結果と取引・保存投影

**Files:** Create `src/engine/annualPostingMarketResults.js`, `src/engine/__tests__/fixtures/postingMarketResults.js`, `src/engine/__tests__/annualPostingMarketResults.test.js`; modify `annualPostingApplications.js`, `annualPostingQualifications.js`, `annualTransactions.js`, `contractEconomy.js`, `economyPersistence.js` in `src/engine/`。
**Interfaces:** `normalizePostingMarketResult(c)`, `createPostingMarketResult(state,c,signature)`, `inspectAnnualPostingMarketResults(state)`。共通command名 `resolve-posting`。

- [x] 三結果・資格/ID/重複/競合/旧互換/歴史改変/通常進行のテストを先に作成。
- [x] `npx vitest run src/engine/__tests__/annualPostingMarketResults.test.js` で新規成功条件のREDを確認。
- [x] 最小実装で結果と子completionを一候補にまとめ、status/資格歴史検証と保存投影を接続。
- [x] 同じ試験と既存申請/資格/収入回帰をGREEN、差分をcommit。

## Task 2: 実保存・実名簿と提出

**Files:** Create `tests/posting-market-result-commit.test.js`, `docs/validation/gm-01-posting-market-results/README.md`; update `ROADMAP.md`。
**Interfaces:** 既存 `reduceEconomyCommand` / `commitEconomyCandidate` / `recoverEconomyCommit` / `loadGame` とTask1の結果配列を使用。

- [x] inline/外部root、公開失敗/retry・採用中断/復旧・改変/巻戻し・後付け・実名簿正常/拒否の実保存回帰を作成して実行。
- [x] 未保護の履歴が見つかった場合はREDを確認してprefix/原子性保護を修正。
- [x] 対象＋近接回帰とbuildを確認。別コンテキストへ要件・入口・差分を渡して独立レビューし、確定指摘をRED→GREENで修正。
- [ ] 検証・限界を文書化済み。専用ブランチからPR作成し、最新HEADのCI全成功を確認する（公開許可待ち）。マージしない。
