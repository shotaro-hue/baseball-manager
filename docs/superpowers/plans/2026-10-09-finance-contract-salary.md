# 財務画面契約年俸 Implementation Plan

**Goal:** 全所属選手の契約年俸を副作用なく表示する。
**Architecture:** finance.jsの純粋関数でplayers/farmをIDで重複排除し、育成を優先分類する。FinanceTabの共通描画経路で使用し、保存形式を変更しない。
**Tech Stack:** React / Vitest / Playwright
**Spec:** docs/finance-contract-salary.md（依頼要件と実装上の判断を記録）

## Constraints
最新main c398825から独立ブランチ。PR420〜425を維持。予算控除・収入予測・契約評価・DB形式は変更しない。金額はfmtSal。無効値を0に変換しない。

## Tasks
- [x] FinanceTab実描画で二軍除外と元配列変更を再現する失敗テストを追加。
- [x] summarizeContractSalaries(team)を追加。分類・ID重複・0/欠損/不正値・凍結・昇降格・契約/獲得/放出を検証。
- [x] 年額内訳、既知分合計、未記録/不正件数、上位6名と所属を表示。未知年俸はランキング外と明示。
- [x] 固定保存データで360/390/1440pxの前後画像、再表示と実保存再開をE2Eで確認。
- [ ] npm ci / npm test / build / physics / smoke / 全E2E（worker1 retry0）。PRをmainベースで作成し最新head CIを確認。

## Review Focus
育成はfarm内であり専用配列を仮定しない。重複IDはplayers優先。同額は元の所属順を保つ。欠損は未記録、負数・非数値・非有限は不正。有効額の小計のみ表示し不完全と明記。
