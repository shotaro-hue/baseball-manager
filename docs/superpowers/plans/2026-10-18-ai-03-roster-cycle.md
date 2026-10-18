# AI-03 CPU編成循環 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. User supplied the implementation brief and explicitly authorized implementation, long comparison, PR and CI without another approval round.

**Goal:** CPUが契約満了時に既存戦力と獲得可能な新人を比較し、必要戦力を守りながら世代交代する。
**Architecture:** 既存の編成評価を共通化し、純粋な更改前計画を追加。年内の実候補を一度生成して計画・市場・指名で再利用する。計画の必要部分だけ既存offseasonPlanに保存し、詳細理由は任意の外部診断sinkへ送る。
**Tech Stack:** JavaScript / React / Vitest / Playwright / existing long-run harness.
**Spec:** User's 2026-10-18 AI-03A–E implementation brief; current SPEC.md §4.5 and §4.7.

## Global Constraints

- 最新main `270edd8286762c1de5949953e1887bdb286e36ee`、#479 merged、独立ブランチ。mainへpush・merge・auto-merge禁止。
- 初期65、通常67、上限70、標準投32野33、捕手6を維持。既存10/20点の差、給与・成績・成長式を変更しない。
- 強制人数削減・無条件指名・セーブ初期化・プレイヤーの更改/指名操作変更なし。
- 比較は3 seeds ×10年、実143試合・二軍・更改・市場・指名・保存再開。失敗原本も保存する。

## Review Focus

- 満員の球団・弱い候補年は不要な放出を行わない。
- 最後の捕手・各位置・現主力・将来有望な若手・契約継続中の選手を守る。
- 新人予約を市場補強で減らす場合、失う候補と比較し、残予算へ実額を一度だけ反映する。
- 入団拒否・育成両フラグ・受諾未所属・旧計画なし・保存再開で人数を二重計上しない。
- 診断ログはstateへ蓄積しない。候補の隠し能力ではなく各球団の観測値を使う。

### Task 1: 例外指名の比較基準 (AI-03C)

Files: rosterPlanning.js, draftContinuation.js, regression tests.
Interface: roleComparison(layer, player) returns currentBaseline, futureBaseline, futureSource.
- [x] 若手比較対象なしの平凡な候補・絶対的有望株・既存若手・主力を再現テストでRED。
- [x] CPUの将来性比較を現戦力/絶対水準へfallback。手動の既存判断は維持。
- [x] 関連4ファイルのテストGREEN、独立commit。

### Task 2: 更改前計画と更改連動 (AI-03A/B)

Files: cpuRosterCycle.js, contract.js, useOffseason.js, tests.
Interface: planCpuRenewals(team, context) returns releaseIds, replacements and reasons; CPU market consumes year-scoped plan derived from real draftPool/evaluation.
- [x] 65/67/69/70、弱い候補、若手過多、高齢主力、高年俸、守備最低数、複数年契約のRED。
- [x] 重複戦力を実新人の更新差・獲得可能な代替数と比較し、逐次保護条件を再検査。年齢だけの放出はしない。
- [x] 満了時のみ戦力外、既存異動/球歴を保持。既存交渉/給与式は共通利用。
- [x] 実候補を一度作り、既存offseasonPlanへ保存/再開。旧セーブは従来どおり遅延生成。
- [x] 統合更改・保存再開GREEN、独立commit。

### Task 3: 市場の機会費用と診断 (AI-03D/E)

Files: rosterPlanning.js, contract.js, cpuDecisionTrace.js, hooks, tests, long harness.
Interface: assessCpuAddition returns reservation and displaced opportunity details; subscribeCpuDecisions(listener) supplies bounded records outside save state.
- [x] FA/外国人/戦力外、通常予約保護、強力FAによる変更、予算境界、拒否/育成昇格をRED。
- [x] 予約を消費する獲得は実候補と比較し、実枠/実額/留保の整合性を守る。
- [x] 更改/獲得/指名/終了/人数/予算を診断sinkへ記録し、保存stateへ詳細ログを追加しない。
- [x] 単体・統合・対象E2E GREEN、独立commit。

### Task 4: 長期比較と提出

Files: scripts/ai03 comparison tooling, docs/validation/ai-03, SPEC.md, ROADMAP.md, CHANGELOG.md.
- [x] 固定baselineの同環境3×10年と最終版3×10年を完走。全ソースhash・stdout・失敗を保存。
- [x] 分布・指名0継続・年齢・異動・出場・守備・予算・球歴を比較し、人数だけの合否判定を避ける。
- [x] 独立レビューと修正、対象unit/integration/E2E。提出headの必須CIはPR #480 checksで追跡し、最終報告で実結果を確定する。
- [x] 独立PR #480と固定検証資料を作成。マージせず、最新head CI完了後にURL・結果・制限・マージ可否を最終報告する。
