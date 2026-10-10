# テスト棚卸し（2026-10-10）
 
> 対象: `shotaro-hue/baseball-manager` / main `1808bb0f484c4fa7613ee01a11ba00205776ad59`（PR #429・#430マージ済み）。Gitツリーから漏れなく列挙し、PR #430 のCI [run 292](https://github.com/shotaro-hue/baseball-manager/actions/runs/38010758680) のログで実収集・時間を突合。**時間は当該CIの参考値であって保証値ではない。**

## 集計

| 区分 | ファイル | ケース | 実行状況 |
| --- | ---: | ---: | --- |
| Vitest単体・統合 | 106 | CI収集712件（うち2件opt-inでskip） | 105ファイル収集、1ファイル未収集 |
| Playwright E2E | 15 | 全体65件 | 通常PR CIは47件・7ファイル、残り18件・8ファイルはフル実行のみ |
| 合計 | 121 | 既定の登録済みテスト777件 | ただしVitest未収集の3件は別 |

**注意点:** `src/components/tacticalGame.test.jsx` は3件のテストを定義するが、`vitest.config.js` の `include: ['src/**/*.test.js', …]` に合致せず、`npm test` で全件未収集。加えて `@vitest-environment jsdom` を要求するが `jsdom` は `package.json` にない。単純にglobだけ変更するとテストが失敗する可能性があるため、jsdom導入と実テスト検証を**別の修正PR**で行う（skipや削除で隠さない）。

**意図した2 skip:** `scripts/fa-economy-benchmark.test.js`（`RUN_FA_ECONOMY_BENCHMARK=1`）、`scripts/salary-demand-benchmark.test.js`（`RUN_SALARY_BENCHMARK=1`）。これらは通常CIでは走らず、バランス変更時に明示的に実施する。

## 長時間化・重複の実測

- `npm test`: 710 pass / 2 skip、約48.9秒。主要な実行時間は`src/workers/__tests__/seasonBatchPayload.test.js`の3 seed・合計約35.5秒、`tests/game-stats.test.js`の10万打席検証を含む約9.7秒、`scripts/validate-physics-hr.test.js`約8.6秒（テストは並列なので単純加算できない）。
- `npm run validate:physics-hr`は同じHRテストを改めて実行するため、同じCIコミットで重複（別実行約7秒）。
- ローカル記録は`test:e2e:smoke` 21件・約7分、`test:e2e` 65件・約13.5分。前者は後者に含まれ、同じ最終コミットで連続実行すると同一テストが再実行される。
- PR CIは3つのE2E並列ジョブ。最長の`history-and-posting`は23件・約8分のテストでジョブ所要約9分10秒。内訳は`match-history`8件・約281秒、`finance`10件・約121秒、`posting`5件・約72秒。グループ分割の余地が大きい。
- E2EのDH有無・ホーム/ビジター4条件や異なる画面幅は**観点が異なるため、ファイル名・経路が似るだけで重複と見なして消さない**。

## Playwright全ファイル一覧

「全E2E」は15ファイルの65ケース。通常PR CI以外の8ファイル・18ケースも、定期/必要時の全件検証で維持する。

| ファイル | フルでの件数 | PR CIでの件数 | PR CI内実行秒（合計） | 通常対象 |
| --- | ---: | ---: | ---: | --- |
| `e2e/batch-100.spec.js` | 1 | — | 未計測 | 全E2Eのみ |
| `e2e/batch.spec.js` | 2 | — | 未計測 | 全E2Eのみ |
| `e2e/career-generations.spec.js` | 6 | 6 | 105.2 | PR CI |
| `e2e/club-comparison.spec.js` | 2 | — | 未計測 | 全E2Eのみ |
| `e2e/contract-renewal.spec.js` | 2 | — | 未計測 | 全E2Eのみ |
| `e2e/finance.spec.js` | 10 | 10 | 121.3 | PR CI |
| `e2e/game.spec.js` | 2 | — | 未計測 | 全E2Eのみ |
| `e2e/hub.spec.js` | 3 | — | 未計測 | 全E2Eのみ |
| `e2e/initialization.spec.js` | 2 | 2 | 26.1 | PR CI |
| `e2e/match-history.spec.js` | 8 | 8 | 280.9 | PR CI |
| `e2e/posting.spec.js` | 5 | 5 | 72.3 | PR CI |
| `e2e/progression.smoke.spec.js` | 6 | 6 | 130.9 | PR CI |
| `e2e/save-generations.spec.js` | 10 | 10 | 36.1 | PR CI |
| `e2e/tactical-actions.spec.js` | 2 | — | 未計測 | 全E2Eのみ |
| `e2e/title.spec.js` | 4 | — | 未計測 | 全E2Eのみ |

## Vitest全ファイル一覧

各ファイルの「件数」はCI出力の実際のケース数。最後の「未収集」は例外。`秒`はテストファイル報告値（プロセス全体の経過時間とは異なる）。オプトインのベンチマークは通常CIの実行時間では測れない。

| ファイル | 分野 | 件数 | 実行秒 | 判定 |
| --- | --- | ---: | ---: | --- |
| `scripts/fa-economy-benchmark.test.js` | 検証・ベンチマーク | 1 | 0 | 環境変数で無効 |
| `scripts/faEconomyModel.test.js` | 検証・ベンチマーク | 5 | 0 | 標準CI |
| `scripts/salary-demand-benchmark.test.js` | 検証・ベンチマーク | 1 | 0 | 環境変数で無効 |
| `scripts/validate-physics-hr.test.js` | 検証・ベンチマーク | 1 | 8.6 | 標準CI |
| `src/App.initialization.test.js` | アプリ起動 | 3 | 0.1 | 標準CI |
| `src/App.lazy-load.test.js` | アプリ起動 | 3 | 2.9 | 標準CI |
| `src/components/appScreenConfig.test.js` | 画面・UI | 2 | 0 | 標準CI |
| `src/components/awardRecordsFlow.test.js` | 画面・UI | 3 | 0 | 標準CI |
| `src/components/batchResult.test.js` | 画面・UI | 2 | 0 | 標準CI |
| `src/components/BoxScoreModal.test.js` | 画面・UI | 8 | 0.1 | 標準CI |
| `src/components/careerGenerationRead.test.js` | 画面・UI | 2 | 0.1 | 標準CI |
| `src/components/clubComparisonFlow.test.js` | 画面・UI | 5 | 0.1 | 標準CI |
| `src/components/contractRenewalUI.test.js` | 画面・UI | 12 | 0.3 | 標準CI |
| `src/components/dashboardCalm.test.js` | 画面・UI | 13 | 0.1 | 標準CI |
| `src/components/dashboardDate.test.js` | 画面・UI | 4 | 0 | 標準CI |
| `src/components/detailScreens.test.js` | 画面・UI | 4 | 0 | 標準CI |
| `src/components/draftResume.test.js` | 画面・UI | 8 | 0.1 | 標準CI |
| `src/components/farmRenewalFlow.test.js` | 画面・UI | 11 | 0.2 | 標準CI |
| `src/components/hub/HubFaTab.test.js` | 画面・UI | 18 | 0.2 | 標準CI |
| `src/components/hub/HubSimPanel.test.js` | 画面・UI | 3 | 0 | 標準CI |
| `src/components/mobileFlow.test.js` | 画面・UI | 8 | 0 | 標準CI |
| `src/components/offseasonFaFlow.test.js` | 画面・UI | 6 | 0.1 | 標準CI |
| `src/components/offseasonPlanning.test.js` | 画面・UI | 10 | 0.3 | 標準CI |
| `src/components/offseasonReview.test.js` | 画面・UI | 13 | 0.1 | 標準CI |
| `src/components/PlayerModal.salary.test.js` | 画面・UI | 5 | 0.1 | 標準CI |
| `src/components/playoffFlow.test.js` | 画面・UI | 6 | 0.2 | 標準CI |
| `src/components/resultScreen.test.js` | 画面・UI | 6 | 0 | 標準CI |
| `src/components/salaryRenewalFlow.test.js` | 画面・UI | 2 | 0.1 | 標準CI |
| `src/components/scheduleLeagueFlow.test.js` | 画面・UI | 5 | 0 | 標準CI |
| `src/components/screenRoutes/ContractRenewalRoute.test.js` | 画面・UI | 1 | 0 | 標準CI |
| `src/components/tabs/ContractTab.consistency.test.js` | 画面・UI | 2 | 0.1 | 標準CI |
| `src/components/tabs/FinanceTab.test.js` | 画面・UI | 4 | 0 | 標準CI |
| `src/components/tacticalGame.test.jsx` | 画面・UI | 3（定義） | — | **収集漏れ** |
| `src/components/tacticalRosterRoute.test.js` | 画面・UI | 6 | 0.5 | 標準CI |
| `src/components/TitleScreen.initialization.test.js` | 画面・UI | 7 | 0.1 | 標準CI |
| `src/engine/__tests__/allstar.test.js` | 試合・経営エンジン | 4 | 0.2 | 標準CI |
| `src/engine/__tests__/awards.test.js` | 試合・経営エンジン | 10 | 0 | 標準CI |
| `src/engine/__tests__/barrelClassification.test.js` | 試合・経営エンジン | 6 | 0 | 標準CI |
| `src/engine/__tests__/battedBallProfile.test.js` | 試合・経営エンジン | 2 | 0 | 標準CI |
| `src/engine/__tests__/contract.test.js` | 試合・経営エンジン | 23 | 0.1 | 標準CI |
| `src/engine/__tests__/contractPayroll.test.js` | 試合・経営エンジン | 18 | 0 | 標準CI |
| `src/engine/__tests__/contractReplies.test.js` | 試合・経営エンジン | 10 | 0 | 標準CI |
| `src/engine/__tests__/cpuBatterEvaluation.test.js` | 試合・経営エンジン | 3 | 0 | 標準CI |
| `src/engine/__tests__/draft.test.js` | 試合・経営エンジン | 2 | 0 | 標準CI |
| `src/engine/__tests__/emergencyLineupCoverage.test.js` | 試合・経営エンジン | 8 | 0 | 標準CI |
| `src/engine/__tests__/faDeclaration.test.js` | 試合・経営エンジン | 13 | 0.1 | 標準CI |
| `src/engine/__tests__/finance.test.js` | 試合・経営エンジン | 4 | 0 | 標準CI |
| `src/engine/__tests__/frontend.test.js` | 試合・経営エンジン | 14 | 0 | 標準CI |
| `src/engine/__tests__/injury.test.js` | 試合・経営エンジン | 6 | 0 | 標準CI |
| `src/engine/__tests__/managementPolicy.test.js` | 試合・経営エンジン | 3 | 0 | 標準CI |
| `src/engine/__tests__/matchHistory.test.js` | 試合・経営エンジン | 3 | 0 | 標準CI |
| `src/engine/__tests__/parkEffects.test.js` | 試合・経営エンジン | 2 | 0 | 標準CI |
| `src/engine/__tests__/physics.test.js` | 試合・経営エンジン | 14 | 0 | 標準CI |
| `src/engine/__tests__/player.test.js` | 試合・経営エンジン | 2 | 0 | 標準CI |
| `src/engine/__tests__/playoff.test.js` | 試合・経営エンジン | 28 | 0.2 | 標準CI |
| `src/engine/__tests__/pressConference.test.js` | 試合・経営エンジン | 12 | 0 | 標準CI |
| `src/engine/__tests__/renewalRules.test.js` | 試合・経営エンジン | 10 | 0 | 標準CI |
| `src/engine/__tests__/rosterAutomation.test.js` | 試合・経営エンジン | 3 | 0.2 | 標準CI |
| `src/engine/__tests__/sabermetrics.test.js` | 試合・経営エンジン | 2 | 0 | 標準CI |
| `src/engine/__tests__/salaryDemand.test.js` | 試合・経営エンジン | 21 | 0 | 標準CI |
| `src/engine/__tests__/saveload.test.js` | 試合・経営エンジン | 2 | 0 | 標準CI |
| `src/engine/__tests__/saveloadScopes.test.js` | 試合・経営エンジン | 3 | 0 | 標準CI |
| `src/engine/__tests__/scheduleGen.test.js` | 試合・経営エンジン | 5 | 0.1 | 標準CI |
| `src/engine/__tests__/seasonProgress.test.js` | 試合・経営エンジン | 22 | 0.8 | 標準CI |
| `src/engine/__tests__/simulation.test.js` | 試合・経営エンジン | 30 | 0.1 | 標準CI |
| `src/engine/__tests__/simulationFastMode.test.js` | 試合・経営エンジン | 1 | 0.1 | 標準CI |
| `src/engine/__tests__/trade.test.js` | 試合・経営エンジン | 7 | 0 | 標準CI |
| `src/engine/__tests__/utils.test.js` | 試合・経営エンジン | 18 | 0 | 標準CI |
| `src/hooks/careerPersistence.integration.test.js` | 画面遷移・進行 | 6 | 0.3 | 標準CI |
| `src/hooks/postGameConsistency.test.js` | 画面遷移・進行 | 8 | 0.7 | 標準CI |
| `src/hooks/useGameState.contractReplies.test.js` | 画面遷移・進行 | 4 | 0.1 | 標準CI |
| `src/hooks/useGameState.initialization.test.js` | 画面遷移・進行 | 5 | 0.1 | 標準CI |
| `src/hooks/useGameState.matchHistory.test.js` | 画面遷移・進行 | 2 | 0.1 | 標準CI |
| `src/hooks/useGameState.offseasonSave.test.js` | 画面遷移・進行 | 3 | 0.1 | 標準CI |
| `src/hooks/useGameState.posting.test.js` | 画面遷移・進行 | 6 | 0.1 | 標準CI |
| `src/hooks/useOffseason.market.test.js` | 画面遷移・進行 | 7 | 0.1 | 標準CI |
| `src/hooks/useOffseason.multiyear.test.js` | 画面遷移・進行 | 7 | 0.1 | 標準CI |
| `src/hooks/useOffseason.posting.test.js` | 画面遷移・進行 | 3 | 0.1 | 標準CI |
| `src/hooks/useOffseason.resume.test.js` | 画面遷移・進行 | 5 | 0.1 | 標準CI |
| `src/hooks/useSeasonFlow.boundaries.test.js` | 画面遷移・進行 | 2 | 0.1 | 標準CI |
| `src/hooks/useSeasonFlow.cpuRoster.test.js` | 画面遷移・進行 | 5 | 0.7 | 標準CI |
| `src/hooks/useSeasonFlow.test.js` | 画面遷移・進行 | 1 | 0 | 標準CI |
| `src/state/persistentDataStore.test.js` | 保存状態 | 5 | 0 | 標準CI |
| `src/state/saveDirtyTracker.test.js` | 保存状態 | 4 | 0 | 標準CI |
| `src/workers/__tests__/cpuTradeRoster.test.js` | Worker・一括処理 | 5 | 0.2 | 標準CI |
| `src/workers/__tests__/seasonBatchCore.test.js` | Worker・一括処理 | 3 | 0.5 | 標準CI |
| `src/workers/__tests__/seasonBatchPayload.test.js` | Worker・一括処理 | 3 | 35.5 | 標準CI |
| `src/workers/__tests__/singleDayCore.test.js` | Worker・一括処理 | 4 | 0.5 | 標準CI |
| `tests/batted-ball-aggregate.test.js` | 横断・回帰 | 6 | 0 | 標準CI |
| `tests/career-generations.test.js` | 横断・回帰 | 17 | 0.4 | 標準CI |
| `tests/career-history.integration.test.js` | 横断・回帰 | 2 | 0.1 | 標準CI |
| `tests/career-stats.test.js` | 横断・回帰 | 2 | 0 | 標準CI |
| `tests/game-stats.test.js` | 横断・回帰 | 3 | 9.7 | 標準CI |
| `tests/github-preservation.test.js` | 横断・回帰 | 2 | 0 | 標準CI |
| `tests/initialization-equivalence.test.js` | 横断・回帰 | 5 | 1.6 | 標準CI |
| `tests/initialization-policy-equivalence.test.js` | 横断・回帰 | 1 | 0.1 | 標準CI |
| `tests/pitcher-batting.test.js` | 横断・回帰 | 3 | 0 | 標準CI |
| `tests/player-identity.test.js` | 横断・回帰 | 2 | 0 | 標準CI |
| `tests/relief-workload.test.js` | 横断・回帰 | 17 | 0 | 標準CI |
| `tests/roster-automation.test.js` | 横断・回帰 | 8 | 0.1 | 標準CI |
| `tests/save-feedback.test.js` | 横断・回帰 | 2 | 0 | 標準CI |
| `tests/save-generations.test.js` | 横断・回帰 | 27 | 0.3 | 標準CI |
| `tests/starting-pitcher-role.test.js` | 横断・回帰 | 8 | 0.3 | 標準CI |
| `tests/tactical-actions.integration.test.js` | 横断・回帰 | 1 | 0.3 | 標準CI |
| `tests/tactical-actions.test.js` | 横断・回帰 | 12 | 0 | 標準CI |
| `tests/team-id-zero.test.js` | 横断・回帰 | 5 | 0 | 標準CI |

## 判断・今後の更新

詳細方針は [EXECUTION_STRATEGY.md](./EXECUTION_STRATEGY.md) を参照。品質を落とす削除やskip追加は実施せず、まず**実行順序・分割・重複除去**を改善する。新しいテストファイルの追加やVitest/Playwrightの設定変更後、`npm test`の収集対象と`npx playwright test --list`をGitツリーに照合して、この一覧を更新する。
