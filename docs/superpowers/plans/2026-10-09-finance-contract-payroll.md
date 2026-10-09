# 財務画面契約年俸 Implementation Plan

**Goal:** 所属選手全体の契約年俸を非破壊で確認する。
**Architecture:** 現在の players/farm から純粋関数でID重複を除外して算出。FinanceTabで同じ集計対象の内訳・合計・上位6名を表示する。
**Tech Stack:** React 18、Vitest、Playwright。
**Spec:** docs/finance-contract-payroll.md（ユーザー要件を実装と併せて記録）。

## Constraints
最新main c398825をbaseに#420–425を維持。金額は万円/既存fmtSal。保存形式、IndexedDB、予算控除、収入式、バランス、他画面の変更なし。
合意済み要件に沿って本セッションで実装・検証・独立PR作成まで進める。

## Review Focus
- ID 0、二軍との重複、ID欠落の別選手を失わない。
- 育成フラグが配列所属より優先される。
- 年俸0を未記録と扱わず、負数・文字列・非有限値は不正と表示。
- 空配列、旧saveのfarm未定義でも描画。
- 財務の再表示や選手詳細の開閉で編成・予算を変えない。

### Task 1: 集計・実コンポーネント
Files: src/engine/contractPayroll.js、src/engine/__tests__/contractPayroll.test.js、src/components/tabs/FinanceTab.jsx、FinanceTab.test.js、finance-payroll.css。
Interfaces: contractPayroll(team) → groups、total、entries、leaders。各groupはamount/count/missing/invalid。entryはplayer/category/salaryStatus。
- [x] 実FinanceTabのSSRテストで内訳・二軍上位・freeze・不完全額・空状態を追加、修正前の失敗確認。
- [x] contractPayroll単体回帰で固定650万円、昇降格、差額、重複、異常値、上位6、保存往復、非破壊を確認。
- [x] 純粋集計と必要な表示/CSSだけ実装して全追加テストを通す。

### Task 2: 実画面・保存E2E
Files: e2e/finance.spec.js、.github/workflows/ci.yml（追加回帰をCIに含める）、仕様・検証文書。
- [x] 同一固定fixtureで360/390/1280pxの修正前スクリーンショットとE2E失敗を記録。
- [ ] 3幅の内訳・上位・再表示・IndexedDB保存/再開で編成と予算の一致を確認。異常年俸を別ケースで表示確認。
- [ ] npm ci/test/build/validate:physics-hr/smoke/全E2Eを実行。E2Eは1worker/retry0。
- [ ] main/head/tree/差分確認、レビュー、独立PR、最新head CI結果を報告。

独立レビューで判明した選手詳細の未記録年俸クラッシュは、FinanceTab→PlayerModalの27件中5件の追加回帰で修正前4失敗/1成功を確認して修正。共有salaryStatusを用いた表示判定のみ変更。
