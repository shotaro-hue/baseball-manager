# A1-2c-4a Overseas FA Departure Implementation Plan

> Execute inline with superpowers:executing-plans and test-driven-development; independent final review.

**Goal:** 海外FA宣言済み市場選手の海外退出を共通取引・保存へ接続する。
**Architecture:** 新しい純粋なannualOverseasDepartures moduleを既存FA宣言検証、annualTransactions dispatch、world projectionへ接続する。日付・資格・契約・保存の正本は既存処理に置く。
**Tech Stack:** JavaScript/Vitest、既存IndexedDB世代保存。新依存なし。
**Spec:** [設計](../specs/2026-11-04-gm01-a1-overseas-fa-departure-design.md)、親A1設計 §5.1/5.2。

## Global Constraints

基準main b14aaf9。公開ゲートOFF、schemaVersion1/DB5、旧スカウト終了を維持。新規PRで提出しマージしない。
給与・保証・旧budgetとFA資格政策は変更しない。自然満了へのend/waive追加なし。日付の外部指定なし。

## Review Focus

- 海外FAと国内FA/自由契約を混同して補償を免除しない。
- 履歴とreceiptの対削除、退出後の同一市場再掲載を受理しない。
- 現在の健康・再雇用・時計進行で正当な過去の記録を拒否しない。
- 未回答/受諾済みNPB契約を黙って消さない。
- 保存公開失敗時に元の市場・元world・rootを保全する。

## Task 1: Command and provenance

**Files:** Create annualOverseasDepartures.js and its engine tests; modify annualFaDeclarations.js, annualTransactions.js, contractEconomy.js.
**Interface:** depart-overseas {id,teamId,playerId,declarationId,marketEntryId}; optional overseasDepartures records and receipt.overseasDeparture.

- [x] 正常・不正・競合・replay・改変のテストを追加してREDを確認。
- [x] 最小実装と保存projectionを追加してGREEN。台帳/給与/保証・宣言履歴の不変を確認。
- [x] 実名簿/資格不足、資格到達、JSON/過年度履歴を確認。

## Task 2: Publication and submission

**Files:** Create tests/overseas-departure-commit.test.js and validation README; update Task7 progress.
**Interface:** Existing commitEconomyCandidate/validateEconomySave/loadGame.

- [x] inline/外部rootの成功・失敗非採用・retry/cold loadを確認。
- [x] FA/冬期中退団/引退/台帳/更改/保存回帰とbuildを成功させる。
- [ ] 独立レビュー、再現可能な指摘の修正、新規PR提出、提出HEADの必須CI成功を確認。
