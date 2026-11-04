# A1-2c-4b Posting Departure Implementation Plan

> Execute inline with superpowers:executing-plans and test-driven-development; independent final review.

**Goal:** ポスティング退団と実日付の解除合意を共通取引・保存へ接続する。
**Architecture:** annualPostingDeparturesを共通dispatch・退団投影・world projectionへ追加。契約台帳の日付検証を通知/効力の分離に対応させ、計算式・給与正本・既存保存barrierを再利用する。
**Tech Stack:** JavaScript/Vitest/Vite、既存世代保存。新依存なし。
**Spec:** [設計](../specs/2026-11-04-gm01-a1-posting-departure-design.md)、親A1設計 §5.1/5.2。

## Global Constraints

main 3b6192e基準。公開OFF/schemaVersion1/DB5/旧スカウト終了を維持。新規PRで提出し、マージ/自動マージ/main pushをしない。
合意・保証・実日付を推定せず、過年度給与を維持。収入・UI・CPU・Worker・年次自動接続は後続。

## Review Focus

- 通知日と終了効力日の混同、過去/未来の解除合意、他契約の合意ID流用。
- 保証不明の旧契約と移籍/昇給後の負担、過年度行・最低維持費。
- 未回答/受諾済み約束、引退予約、同一元契約の二重退団。
- 記録/receipt/action/球団履歴の孤立・同時改変、再雇用後の過去記録。
- 保存公開失敗時のworld/名簿/台帳/root保全と大量履歴時の重複検証。

## Task 1: 合意日と共通退団

**Files:** Create annualPostingDepartures.js, engine tests/fixtures; modify contractLedger.js, annualTransactions.js, contractEconomy.js, annualFaDeclarations.js, economyPersistence.js.
**Interfaces:** end-contract(reason:posting, settlement, terminationAgreementId?); optional postingDepartures/receipt.postingDeparture; inspectAnnualPostingDepartures returns proven roster departures.

- [x] 通知日と翌春効力の合意、正常/拒否/財務/改変のREDを確認。
- [x] 最小実装しGREEN。既存の台帳計算式を維持し、退団と未更改計画の投影へ接続。
- [x] 実migration由来の旧保証不明と、実生成名簿の正常/拒否を検証。

## Task 2: 保存と提出

**Files:** Create posting-departure-commit tests/validation README; update Task7 progress.
**Interfaces:** Existing quote/reduce/commitEconomyCandidate/validateEconomySave/loadGame.

- [x] inline/外部rootの成功・失敗非採用・retry/cold load・replayを確認。
- [x] 台帳/移行/FA/冬期中退団/引退/保存回帰とbuildを成功させる。
- [ ] 独立レビュー、指摘の再現修正、最新HEADの必須CI成功を確認し、新規PRを未マージ提出する。
