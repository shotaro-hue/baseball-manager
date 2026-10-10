# Baseball Manager — テスト全件棚卸しと実行戦略

> 計測基準: 2026-10-10。最新main `1808bb0f484c4fa7613ee01a11ba00205776ad59`（#429・#430マージ済み）。件数・所要時間は #430 head の [GitHub CI run 38010758680](https://github.com/shotaro-hue/baseball-manager/actions/runs/38010758680) から集計。変更の基準点は最新mainで、既存の保存・進行修正を保持する。

## 結論・運用の原則

- **削除/skipによって速くしない**。開発中は関連テストまたは `npm run test:fast`、PR CIで全Vitest + 中核E2E、リリース/大規模変更前に手動フルE2Eへ段階分けする。
- `npm test` には100試合・10万打席・Monte Carlo HR 検証も元から含まれる。CIで `npm run validate:physics-hr` を重複実行しない。
- Workは同じコミットで成功したCIを証拠として再利用。変更なしで全テストの再実行を繰り返さない。失敗時には該当テストとトレースから原因を絞る。
- 通常時の打球別性能ログをオフにする。必要時だけ `VITE_PERF_LOG=true` で計測。単なる実行時間とWorkのトークン消費量は同一ではない。
- PR CIの長い `match-history` を別ジョブに分割し、全E2Eを手動実行できる別ワークフローで維持する。現時点ではフルE2Eの定期実行は有効化しない。

## 実測・問題点

| 項目 | 実測・状況 | 判定 |
|---|---|---|
| #429反映時点のテストファイル | 103単体系 + 14 E2E = 117本 | 基準 |
| 最新mainのテストファイル | 106単体系 + 15 E2E = 121本 | 監査対象全件 |
| PR #430の通常Vitest実行 | 105ファイル／710 pass／2 conditional skip／約49秒 | 件数は過多ではない |
| 定義はあるがVitest結果にない | `src/components/tacticalGame.test.jsx`（3ケース） | 調査・復旧が必要 |
| PR #430のGitHub CI E2E | 7 spec、47ケース | 重要操作の毎PR検証 |
| 通常CIに入っていないE2E | 8 spec、18ケース | フルE2Eで保護 |
| Vitestログの `[Perf]` | 約493,272行、CIジョブログ全体約33.2MB／495,266行 | **最優先改善** |
| 100試合Workerユニット | `seasonBatchPayload.test.js` 3ケース／約35.5秒 | fastから除外、fullには残す |
| 10万打席の統計試験 | `tests/game-stats.test.js` 3ケース／約9.7秒 | 同上 |
| HRサンプリング | `scripts/validate-physics-hr.test.js` 1ケース／約8.6秒 | 同上、品質検証の強化余地 |
| PR #430のCI最遅ジョブ | finance + match-history + posting 23ケース／約9分10秒（E2E本体約8分） | historyを分割 |

**確定した未収集原因**: `vitest.config.js` の `test.include` は `src/**/*.test.js` 等の `.js` のみを指定しており、`src/components/tacticalGame.test.jsx` を収集しない。このため3ケースは実行されていなかった。同ファイルは `@vitest-environment jsdom` を要求するが、`package.json` にjsdomが明示されていないため、収集パターンだけ直しても依存不足で失敗する可能性がある。別修正でDOM環境の依存を整えるかNode環境で動くテストへ書き換え、RED→GREENを確認してからCIに組み込む。

2件のskipは `scripts/fa-economy-benchmark.test.js`（`RUN_FA_ECONOMY_BENCHMARK`）と `scripts/salary-demand-benchmark.test.js`（`RUN_SALARY_BENCHMARK`）の意図的な条件付きベンチマーク。これらを通常CIの回帰パス件数に含めない。

HRサンプリングは実際に多数の打球を計算するが、現行テストの主要assertionは集計結果が3系列あること。打球分布の許容範囲や再現性を直接検証する強い回帰ゲートとは異なるため、将来独立してassertionの品質を改善する。

## 実行段階（WorkとGitHub共通）

| タイミング | 必須/選択するテスト | 完了の判断 |
|---|---|---|
| 実装途中 / バグ再現 | 変更に直結した `npx vitest run <path>`、必要な Playwright spec | RED→GREEN、該当バグの再現と修正 |
| Workの軽量チェック | `npm run test:fast`（負荷3ファイルのみ除外） | 応答の早いフィードバック。**全テスト合格の代替ではない** |
| PRの最新コミット | GitHub CIで `npm run build`、`npm test`、中核E2E | CIが全成功。Workから重複実行しない |
| リリース・全画面改修・大規模な保存互換変更 | `npm run test:e2e -- --workers=1 --retries=0` または手動 `Extended Browser E2E` | CI対象外も含む全ブラウザテスト |
| バランス調整時 | `npm run test:stress` と必要なら条件付き経済ベンチマーク | モデル・前提・許容範囲を記録 |

試験ファイルが増えたら対象・CI経路・必要なブラウザを明記する。テスト失敗を根拠なくskip/削除することは禁止。リトライなしで失敗したらログ/traceから要因を特定し、対象範囲だけ再実行する。

### 直近の注意点

- `test:e2e:smoke` は4 specに限定される。一方、`test:e2e` は全 specを実行する。**全E2Eを回すときに先にsmokeを回す必要はない**。
- 物理演算、保存世代、進行、戦術編成など横断影響が大きい修正では、CI以外に必要なシナリオを省略しない。テストがどの段階で走ったかをPRに明記する。
- Vitestのslow testは短縮候補だが、100試合のメモリ・保存信頼性は現在の品質上重要なため削除しない。
- CIログ全量をWorkの会話へ流し込まず、まず `fail`, `passed`, `skipped`, `Test Files`, `Duration` と対象スタック、trace添付から調べる。

## E2E 全15ファイル（最新main）

| ファイル | ケース数（ブラウザ展開後） | 通常CI | 使用場面 |
|---|---:|---|---|
| `e2e/batch-100.spec.js` | 1 | 手動フル | 100試合の実操作・再開 |
| `e2e/batch.spec.js` | 2 | 手動フル | 5試合まとめシム |
| `e2e/career-generations.spec.js` | 6 | 実行 | 通算保存世代・障害 |
| `e2e/club-comparison.spec.js` | 2 | 手動フル | 球団比較のモバイルUI |
| `e2e/contract-renewal.spec.js` | 2 | 手動フル | 契約更改モーダル |
| `e2e/finance.spec.js` | 10 | 実行 | 財務・表示状態 |
| `e2e/game.spec.js` | 2 | 手動フル | 試合結果・成績 |
| `e2e/hub.spec.js` | 3 | 手動フル | タブ・ロスター |
| `e2e/initialization.spec.js` | 2 | 実行 | 新規初期化・失敗復旧 |
| `e2e/match-history.spec.js` | 8 | 実行 | 編成・履歴・怪我・DH |
| `e2e/posting.spec.js` | 5 | 実行 | 移籍金・予算反映 |
| `e2e/progression.smoke.spec.js` | 6 | 実行 | 進行・セーブ・復元 |
| `e2e/save-generations.spec.js` | 10 | 実行 | 保存世代・別タブ衝突 |
| `e2e/tactical-actions.spec.js` | 2 | 手動フル | 戦術操作 |
| `e2e/title.spec.js` | 4 | 手動フル | タイトル・球団選択 |

通常CIのコア7ファイルで47ケース、手動フル8ファイルで18ケース。合計65ケースはPR #430で実行記録のある全E2Eと一致（2026-10-10時点）。CIで必要なファイルを減らすのではなく、実行範囲の階層化によって品質を維持する。

## 単体・統合・分析テスト全106ファイル（最新main）

表の実行件数と時間はCI run 38010758680から取得。時間は各ファイルの測定値で、並列実行時の全体所要時間と単純加算できない。`—` は通常Vitestジョブで実行が確認できない。

### アプリ起動・表示 / UI（31本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `src/App.initialization.test.js` | 3 | 0.06秒 | 通常 |
| `src/App.lazy-load.test.js` | 3 | 2.9秒 | 通常 |
| `src/components/BoxScoreModal.test.js` | 8 | 0.07秒 | 通常 |
| `src/components/PlayerModal.salary.test.js` | 5 | 0.10秒 | 通常 |
| `src/components/TitleScreen.initialization.test.js` | 7 | 0.07秒 | 通常 |
| `src/components/appScreenConfig.test.js` | 2 | 0.01秒 | 通常 |
| `src/components/awardRecordsFlow.test.js` | 3 | 0.03秒 | 通常 |
| `src/components/batchResult.test.js` | 2 | 0.01秒 | 通常 |
| `src/components/careerGenerationRead.test.js` | 2 | 0.11秒 | 通常 |
| `src/components/clubComparisonFlow.test.js` | 5 | 0.08秒 | 通常 |
| `src/components/contractRenewalUI.test.js` | 12 | 0.26秒 | 通常 |
| `src/components/dashboardCalm.test.js` | 13 | 0.06秒 | 通常 |
| `src/components/dashboardDate.test.js` | 4 | 0.03秒 | 通常 |
| `src/components/detailScreens.test.js` | 4 | 0.04秒 | 通常 |
| `src/components/draftResume.test.js` | 8 | 0.06秒 | 通常 |
| `src/components/farmRenewalFlow.test.js` | 11 | 0.20秒 | 通常 |
| `src/components/hub/HubFaTab.test.js` | 18 | 0.16秒 | 通常 |
| `src/components/hub/HubSimPanel.test.js` | 3 | 0.03秒 | 通常 |
| `src/components/mobileFlow.test.js` | 8 | 0.05秒 | 通常 |
| `src/components/offseasonFaFlow.test.js` | 6 | 0.14秒 | 通常 |
| `src/components/offseasonPlanning.test.js` | 10 | 0.31秒 | 通常 |
| `src/components/offseasonReview.test.js` | 13 | 0.13秒 | 通常 |
| `src/components/playoffFlow.test.js` | 6 | 0.22秒 | 通常 |
| `src/components/resultScreen.test.js` | 6 | 0.04秒 | 通常 |
| `src/components/salaryRenewalFlow.test.js` | 2 | 0.07秒 | 通常 |
| `src/components/scheduleLeagueFlow.test.js` | 5 | 0.05秒 | 通常 |
| `src/components/screenRoutes/ContractRenewalRoute.test.js` | 1 | 0.02秒 | 通常 |
| `src/components/tabs/ContractTab.consistency.test.js` | 2 | 0.09秒 | 通常 |
| `src/components/tabs/FinanceTab.test.js` | 4 | 0.04秒 | 通常 |
| `src/components/tacticalGame.test.jsx` | 定義3 | — | 未実行・要調査 |
| `src/components/tacticalRosterRoute.test.js` | 6 | 0.49秒 | 通常 |

### ゲームエンジン（33本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `src/engine/__tests__/allstar.test.js` | 4 | 0.18秒 | 通常 |
| `src/engine/__tests__/awards.test.js` | 10 | 0.02秒 | 通常 |
| `src/engine/__tests__/barrelClassification.test.js` | 6 | 0.01秒 | 通常 |
| `src/engine/__tests__/battedBallProfile.test.js` | 2 | 0.01秒 | 通常 |
| `src/engine/__tests__/contract.test.js` | 23 | 0.05秒 | 通常 |
| `src/engine/__tests__/contractPayroll.test.js` | 18 | 0.01秒 | 通常 |
| `src/engine/__tests__/contractReplies.test.js` | 10 | 0.03秒 | 通常 |
| `src/engine/__tests__/cpuBatterEvaluation.test.js` | 3 | 0.00秒 | 通常 |
| `src/engine/__tests__/draft.test.js` | 2 | 0.00秒 | 通常 |
| `src/engine/__tests__/emergencyLineupCoverage.test.js` | 8 | 0.02秒 | 通常 |
| `src/engine/__tests__/faDeclaration.test.js` | 13 | 0.06秒 | 通常 |
| `src/engine/__tests__/finance.test.js` | 4 | 0.00秒 | 通常 |
| `src/engine/__tests__/frontend.test.js` | 14 | 0.02秒 | 通常 |
| `src/engine/__tests__/injury.test.js` | 6 | 0.01秒 | 通常 |
| `src/engine/__tests__/managementPolicy.test.js` | 3 | 0.02秒 | 通常 |
| `src/engine/__tests__/matchHistory.test.js` | 3 | 0.01秒 | 通常 |
| `src/engine/__tests__/parkEffects.test.js` | 2 | 0.01秒 | 通常 |
| `src/engine/__tests__/physics.test.js` | 14 | 0.02秒 | 通常 |
| `src/engine/__tests__/player.test.js` | 2 | 0.01秒 | 通常 |
| `src/engine/__tests__/playoff.test.js` | 28 | 0.20秒 | 通常 |
| `src/engine/__tests__/pressConference.test.js` | 12 | 0.01秒 | 通常 |
| `src/engine/__tests__/renewalRules.test.js` | 10 | 0.01秒 | 通常 |
| `src/engine/__tests__/rosterAutomation.test.js` | 3 | 0.20秒 | 通常 |
| `src/engine/__tests__/sabermetrics.test.js` | 2 | 0.01秒 | 通常 |
| `src/engine/__tests__/salaryDemand.test.js` | 21 | 0.02秒 | 通常 |
| `src/engine/__tests__/saveload.test.js` | 2 | 0.01秒 | 通常 |
| `src/engine/__tests__/saveloadScopes.test.js` | 3 | 0.01秒 | 通常 |
| `src/engine/__tests__/scheduleGen.test.js` | 5 | 0.07秒 | 通常 |
| `src/engine/__tests__/seasonProgress.test.js` | 22 | 0.81秒 | 通常 |
| `src/engine/__tests__/simulation.test.js` | 30 | 0.11秒 | 通常 |
| `src/engine/__tests__/simulationFastMode.test.js` | 1 | 0.10秒 | 通常 |
| `src/engine/__tests__/trade.test.js` | 7 | 0.01秒 | 通常 |
| `src/engine/__tests__/utils.test.js` | 18 | 0.03秒 | 通常 |

### 進行 / Hooks（14本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `src/hooks/careerPersistence.integration.test.js` | 6 | 0.35秒 | 通常 |
| `src/hooks/postGameConsistency.test.js` | 8 | 0.66秒 | 通常 |
| `src/hooks/useGameState.contractReplies.test.js` | 4 | 0.07秒 | 通常 |
| `src/hooks/useGameState.initialization.test.js` | 5 | 0.11秒 | 通常 |
| `src/hooks/useGameState.matchHistory.test.js` | 2 | 0.05秒 | 通常 |
| `src/hooks/useGameState.offseasonSave.test.js` | 3 | 0.07秒 | 通常 |
| `src/hooks/useGameState.posting.test.js` | 6 | 0.05秒 | 通常 |
| `src/hooks/useOffseason.market.test.js` | 7 | 0.09秒 | 通常 |
| `src/hooks/useOffseason.multiyear.test.js` | 7 | 0.10秒 | 通常 |
| `src/hooks/useOffseason.posting.test.js` | 3 | 0.08秒 | 通常 |
| `src/hooks/useOffseason.resume.test.js` | 5 | 0.08秒 | 通常 |
| `src/hooks/useSeasonFlow.boundaries.test.js` | 2 | 0.13秒 | 通常 |
| `src/hooks/useSeasonFlow.cpuRoster.test.js` | 5 | 0.71秒 | 通常 |
| `src/hooks/useSeasonFlow.test.js` | 1 | 0.00秒 | 通常 |

### Worker / 大量シミュレーション（4本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `src/workers/__tests__/cpuTradeRoster.test.js` | 5 | 0.22秒 | 通常 |
| `src/workers/__tests__/seasonBatchCore.test.js` | 3 | 0.46秒 | 通常 |
| `src/workers/__tests__/seasonBatchPayload.test.js` | 3 | 35.5秒 | 負荷/統計 |
| `src/workers/__tests__/singleDayCore.test.js` | 4 | 0.52秒 | 通常 |

### 保存状態（2本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `src/state/persistentDataStore.test.js` | 5 | 0.01秒 | 通常 |
| `src/state/saveDirtyTracker.test.js` | 4 | 0.01秒 | 通常 |

### 分野横断・統合（18本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `tests/batted-ball-aggregate.test.js` | 6 | 0.01秒 | 通常 |
| `tests/career-generations.test.js` | 17 | 0.38秒 | 通常 |
| `tests/career-history.integration.test.js` | 2 | 0.12秒 | 通常 |
| `tests/career-stats.test.js` | 2 | 0.00秒 | 通常 |
| `tests/game-stats.test.js` | 3 | 9.7秒 | 負荷/統計 |
| `tests/github-preservation.test.js` | 2 | 0.00秒 | 通常 |
| `tests/initialization-equivalence.test.js` | 5 | 1.6秒 | 通常 |
| `tests/initialization-policy-equivalence.test.js` | 1 | 0.13秒 | 通常 |
| `tests/pitcher-batting.test.js` | 3 | 0.00秒 | 通常 |
| `tests/player-identity.test.js` | 2 | 0.00秒 | 通常 |
| `tests/relief-workload.test.js` | 17 | 0.01秒 | 通常 |
| `tests/roster-automation.test.js` | 8 | 0.06秒 | 通常 |
| `tests/save-feedback.test.js` | 2 | 0.01秒 | 通常 |
| `tests/save-generations.test.js` | 27 | 0.33秒 | 通常 |
| `tests/starting-pitcher-role.test.js` | 8 | 0.30秒 | 通常 |
| `tests/tactical-actions.integration.test.js` | 1 | 0.27秒 | 通常 |
| `tests/tactical-actions.test.js` | 12 | 0.01秒 | 通常 |
| `tests/team-id-zero.test.js` | 5 | 0.01秒 | 通常 |

### 解析 / ベンチマーク（4本）

| ファイル | 件数 | テスト処理時間 | 区分 |
|---|---:|---:|---|
| `scripts/fa-economy-benchmark.test.js` | 1 | — | 条件付きskip |
| `scripts/faEconomyModel.test.js` | 5 | 0.02秒 | 通常 |
| `scripts/salary-demand-benchmark.test.js` | 1 | — | 条件付きskip |
| `scripts/validate-physics-hr.test.js` | 1 | 8.6秒 | 負荷/統計 |

## 次に検討する改善（今PRには含めない）

1. `tacticalGame.test.jsx` をVitestに収集させる（現行includeが `.js` のみ）。jsdomの依存整備またはNode環境に移行し、3ケースを実際に通す。
2. `scripts/validate-physics-hr.test.js` の結果チェックを分布・再現性が担保できる条件へ強化。現状の長いMonte Carloを不要と言い切れないが、件数assertionだけでは品質を保証しない。
3. `match-history` のfixture開始/終了を計測してボトルネックを絞る。DH×homeの4組合せは削らず、共通setupの最適化を検討。
4. 手動フルE2EのGitHub Actions初回完走を確認してから週次実行の費用対効果を判断する。
5. このテスト戦略PRのCIを確認し、テスト一覧とCI実行範囲が最新mainと一致しているか再比較する。
