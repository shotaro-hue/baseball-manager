# GM-00 / GM-01A Contract Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** #504の最初の工程として現行取引を実証し、月割り費用と効力年度の共通関数を、ゲームへ未接続の状態で用意する。

**Architecture:** 固定年俸契約の年度情報と、暦日に対する累計給与を独立した純粋関数にする。在籍区間は半開区間とし、年度ごとの累計差分で球団負担を求める。既存取引の観測と静的係数比較は専用の検証スクリプトに置く。

**Tech Stack:** JavaScript ES modules / Vitest / existing Vite runtime.

**Spec:** `docs/superpowers/specs/2026-10-26-club-management-gameplay-design.md` (#504)

## Global Constraints

- 最新main `b8c5e053076fc46a34acecccf913008dd111fdec`から専用ブランチ。ゲームへの有効化、係数・収入・成長・保存形式の変更は含めない。
- 金額は万円。年俸を按分額に書き換えない。0と未記録を区別し、不正な日付・年度・金額・重複/欠落した在籍期間を拒否する。
- 給与対象は2月1日以上12月1日未満。月中は実暦日で分配し、累計差分の丸めで移籍前後の費用を保存する。
- シーズン中の新規契約は当年から、オフ契約とシーズン中の更改は翌年から。契約期間と支払い開始日は別。移籍で満了年度を変えない。
- 新基盤は新規ゲームにもまだ接続しない。GM-01の市場/CPU/年度切替/保存/UI/校正の接続後に有効化する。
- 既存年度の再計算・返金・過去の契約条件削除をしない。完全バックアップとPA/BF0個別診断は対象外。

## Review Focus

- 7月途中に複数移籍しても端数が生成/消失しない（Task 2の区間保存テスト）。
- 1月/12月・うるう年・不正日付を試合ラウンドやホストTZから推測しない（Task 2の暦日境界テスト）。
- 当年途中加入1年契約を翌年へ延長しない一方、来季契約を当年残数へ混ぜない（Task 1）。
- 0を持つID/年俸、未知version、将来4〜7年度を落とさない（Task 1/2）。
- 旧処理の不整合の観測が、将来の修正を妨げる恒久的な回帰期待値にならない（Task 3は観測を成果JSONへ出し、既存バグを固定するassertionを加えない）。

## Task 1: 契約効力年度

**Files:** Create `src/engine/seasonContract.js`, `src/engine/__tests__/seasonContract.test.js`.

**Interfaces:** `createSeasonContract({contractId, playerId, signedSeason, agreementPhase, purpose, termYears, annualSalaryManYen, guaranteed})` → version 1の固定年俸契約。phaseは`preseason/season/offseason`、purposeは`acquisition/renewal`。`contractSeasonsRemaining(contract, targetSeason)` → 当該年度に有効な場合だけ残年度数、開始前/満了後は0。`validateSeasonContract(contract)` → 不正値をthrow。

- [x] 当年1/3年、オフ1/3年、シーズン中更改、開幕前、7年目、ID0、未知phase/version・未記録金額のテストを書く。
- [x] `npx vitest run src/engine/__tests__/seasonContract.test.js`で未実装のREDを確認。
- [x] 合意年度と効力年度を分離して実装。翌年開始契約は残数0、元の`termYears`は保持する。
- [x] 同コマンドでGREENを確認しコミットする。

## Task 2: 月割り給与と球団別配分

**Files:** Create `src/engine/monthlyPayroll.js`, `src/engine/__tests__/monthlyPayroll.test.js`.

**Interfaces:** `accruedSalaryManYen(annualSalaryManYen, season, date)`、`salaryForPeriodManYen(annualSalaryManYen, season, startDate, endDate)`。日付は厳密な`YYYY-MM-DD`。`quoteContractPayroll(contract, effectiveDate, tenures)` → 額面総額、全負担、年度/球団別負担。tenuresは連続する`{teamId,startDate,endDate}`で、契約開始日から最終年度12/1までを重複/欠落なしに覆う。保証解雇時の支払側在籍記録は、所属名簿と分けて後続工程で保持する。

- [x] 1億円の2/1=10000、4/1=8000、6/1=6000、7/1=5000、7/16=4516、7/31=4032、11/30=33の残負担を固定値でテストする。
- [x] うるう年、0/未記録/不正値、同月3回移籍、小額年俸の端数、全日付分割、育成昇格前後の年俸、保証解雇/正式終了の期間、7年間・JSON往復・入力不変をテストする。
- [x] 対象テストでREDを確認後、累計差分を実装する。純粋関数は所属/予算/stateを変更しない。
- [x] Task 1/2のテストをまとめてGREEN確認しコミットする。

## Task 3: GM-00再現と次工程の接続条件

**Files:** Create `scripts/gm00-contract-audit.test.js`, `docs/validation/gm-00/README.md`、生成JSON。Modify `ROADMAP.md`。

**Interfaces:** `GM00_OUTPUT=/absolute/report.json npx vitest run scripts/gm00-contract-audit.test.js`で現行FA・更改・新人・移籍・条項・コーチ・臨時収入の観測、固定金額表、全12球団の現行実ロスター/収益予測と50/65/80%配分の必要支援額を出力する。観測は本番不具合の恒久期待値にせず、負担額/所有権/検証関数の正しさを確認する。

- [x] 実際の契約・更改・トレード・新人関数を実行して観測。コーチ採用と条項の履行は実hookの最小シナリオで確認し、実行できない枝は静的確認と区別する。
- [x] 共通関数の入力不変・再見積不変と、12球団の欠測を確認する。係数候補を静的比較し、最終選定は保留する。
- [ ] 対象テスト、ビルド、正確なheadのCIを確認する。既存CI合格と同じ全件の再実行は省く。
- [ ] 独立した全差分レビューを行い、重要指摘をRED→GREENで修正する。
- [ ] 検証済み/静的確認/未接続を資料とROADMAPに反映し、専用PRを作成する。マージはしない。
