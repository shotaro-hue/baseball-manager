# PR-B 翌年度予算forecast Implementation Plan

> 実装は本セッションで行い、別コンテキストで全差分の独立レビューを行う。

**Goal:** 給与前収支と収入証跡から全12球団・翌年度以降の必要全年度を決定的に見積もる。
**Architecture:** 純粋producer→既存承認計算。world/時計/保存/公開ゲートを変更しない。
**Tech Stack:** JavaScript / Vitest / 既存native world、clubFinance、annualBudgetPolicy。
**Spec:** [設計](../specs/2026-11-09-next-budget-forecast-design.md)、ユーザーのPR-B指示。

## 制約・レビュー重点

- 旧セーブ/旧財布/旧契約/保存schemaを維持。PR-C/native open-offseason/一般公開は実装しない。
- テスト削除/skip/緩和、根拠なしtimeout/retry/期待値変更、main push/merge/auto-merge禁止。
- 実測0と欠測/推定、部分年度、過去/未来年度、負の運営差額を区別する。
- postingを原資/前年基準へ混ぜず、対象年度の既存追加枠を一度だけ使う。
- 過去収支/係数/支援の不足を旧budgetやテスト既定値で補わない。
- current worldを壊して翌年quoteを作らず、quoteと年度採用を分離する。

## 作業

- [x] #559マージ/main `0e0fef00`、open PR 0、作業変更なしを確認。既存4ファイル129件成功。
- [x] `src/engine/__tests__/annualBudgetForecast.test.js`に、bootstrap 12球団と実収支、0/部分/欠測/履歴/全年度/順序/無変異、既存policy再利用、posting/引退収入、拒否例を追加。機能未実装のREDを確認。
- [x] `annualBudgetPolicy.js`に`quoteNextAnnualBudgetPolicy(world, policy)`を追加。既存計算だけを共用し、現行APIと保存検証は維持する。
- [x] `annualBudgetForecast.js`に`forecastNextAnnualBudget(world, options)`を実装しGREEN。
- [x] `tests/annual-budget-forecast.integration.test.js`で実保存/冷読込から再生成一致・見積の保存復元・不正root保持を確認。年度境界の保存として扱わない。
- [x] 対象回帰、build、12球団静的年次表と限界を記録。UI変更なしのため専用画面確認はPR-Cへ。
- [x] 独立レビューの指摘を検証/必要修正。
- [ ] PR作成→最新HEADの必須CI全体を確認し提出。開発者のマージ判断で止める。

## 実行判断

ユーザーの既存確定スコープとマージ後実行指示、AGENTS.mdに従い再承認を求めない。係数に本番既定値が無い事実を維持し、記録済みpolicyまたは明示設定を入力とする。過年度財務の新規archive/stateは追加しない。CIの同一commitの全件結果を再利用し、同じ全セットをローカルで重複させない。

追加判断: locale照合で同順になる異なる収入receipt IDを実native commandで再現し、locale非依存の全順序へ限定修正した。旧API・保存形式・係数は変更しない。過年度archive/年度candidateは作らない。

独立レビュー判断: 固定12球団の範囲内に確定指摘なし。汎用の新quote APIにも決定性を保証する意図を優先し、文字列ID同順のソート1領域だけを回帰付きで補強。旧API出力/ルールの変更はないため互換性コストは追加しない。
