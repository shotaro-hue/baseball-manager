# GM-01 A1-2b-4 旧スカウト停止・保全 検証記録

基準main `753adc5da2818432f96f4ace3466370d1af11db5`（#534マージ後）。2026-11-02。
[承認仕様と残課題](../../superpowers/specs/2026-11-02-legacy-scout-retirement.md)。
最終公開HEADとCIはPR本文で確認する。以下の途中結果をCI完了とは扱わない。

## 停止経路と維持範囲

| 追跡対象 | 確認結果・変更 |
|---|---|
| `useGameState.sendScout` | 唯一の旧派遣入口。旧budget控除、mission追加、3秒timer、遅延loadPlayerModule→makePlayer→結果追加、成功通知を除去。互換APIは常にfalse |
| `useGameState.signPlayer` | 旧名簿追加・年俸控除・残年数2・候補削除・成功通知を除去。互換APIは常にfalse |
| HubScoutTab / Router | 派遣・契約・候補削除callbackを除去。旧報告/停止派遣の閲覧・検索・比較だけ維持 |
| `initDraftPool` | 旧scoutResultsをドラフトへコピーする経路を停止。160人/投手80人の生成・給与準備・評価・指名は維持。保存済みドラフトプールは遡及変更しない |
| navigation / dashboard / badges | 経営と補強ナビに、記録がある時だけ旧記録導線。要対応/候補数バッジを抑止。Dashboard/MobileHome/notificationSummaryの要対応集計はtrade/posting/interviewのみで旧scout再接続なし |
| 通常進行 / Worker / CPU / 年度更新 | 直接参照の検索に加え、seasonBatchCoreのsnapshot複製→team更新→戻り値、useOffseasonの年度生成・draft init呼出を確認。旧missionを消費/再開する独立経路なし。既存143試合旅程に旧記録を投入し保全を検証 |
| 保存/ロード | teamsの既存保存経路に両配列を残す。schema/DB version変更なし。主保存/バックアップ・ロック/CAS/session/version fenceは無変更 |
| 正式経路 | ドラフト内調査（draftReports）、makePlayer、外国人generateForeignFaPool、FA/自由契約、育成、新人、トレードは停止対象外 |

既存選手を由来属性で除外せず、過去費用の返金、候補の別市場転送、新しい選手生成、署名/保証の推定補完を行わない。

## 再現・単体/統合

- 変更前の対象5ファイル: **75 passed**。
- RED: 旧APIが両modeでtrueを返しstateを書き換える、旧候補がドラフトへ追加される、旧UI/ナビに派遣/契約/削除/要対応が残ることを確認。
- 対象8ファイル: **104 passed**。追加の保存失敗/旧Routerテスト込みの回帰18ファイル: **242 passed**。
- 実hook + fake-indexeddb: 旧APIと保持callbackのfalse、timerなし、teams/契約/市場/receipt/revision/dirty/進行token/保存領域非変更、候補/派遣待ち/獲得済み選手の通常保存→再読込2回、欠落/空配列、主保存失敗時の既存primary/backup保持。
- `npm run build` と `git diff --check` 成功。既存のmixed import / chunk size警告あり。

回帰コマンド:

```sh
npx vitest run src/hooks/useGameState.legacyScout.test.js src/hooks/useGameState.economyCommit.test.js src/hooks/useGameState.rosterCapacity.test.js src/hooks/useGameState.offseasonSave.test.js src/hooks/useSeasonFlow.boundaries.test.js src/hooks/useSeasonFlow.batchSave.test.js src/hooks/useOffseason.multiyear.test.js src/hooks/useOffseason.market.test.js src/workers/__tests__/seasonBatchCore.test.js src/engine/__tests__/saveload.test.js src/engine/__tests__/saveloadScopes.test.js src/engine/__tests__/draftConference.test.js src/engine/__tests__/rookieContracts.test.js src/engine/__tests__/contractEconomy.test.js src/components/hub/HubShell.navigation.test.js src/components/hub/legacyScoutNavigation.test.js src/components/hub/managementDecisions.test.js src/components/management/marketListFlow.test.js
```

## ブラウザ

既存の旧獲得成功/削除成功/派遣成功テストを、停止と記録保全の検査に置換。無関係な契約/FA/トレード/比較・一覧復帰は維持する。新規ゲームでは旧ナビなし、旧タブ指定はRouterテストで終了案内と復帰を確認。

- Chromium/mobile WebKitの`management-decisions.spec.js`と`management-lists.spec.js`: 360/390/1440px、詳細/検索/比較、一覧のfocusとscroll復帰、旧記録の保存/再読込、派遣待ちの時間経過/再読込。
- `annual-journey.spec.js`: 実Worker/CPUを含む143試合、単試合、まとめ進行、年度更新、翌年初戦/保存再開の全checkpointで旧候補/missionが同一。
- `hub-navigation.spec.js`: 記録なしの通常ナビに旧項目なし。

| 幅 | 変更前 | 変更後 |
|---|---|---|
| 360 | [PNG](./before-360.png) | [PNG](./after-360.png) |
| 390 | [PNG](./before-390.png) | [PNG](./after-390.png) |
| 1440 | [PNG](./before-1440.png) | [PNG](./after-1440.png) |

同じmanagementFixture＋旧派遣1件を使用。実iPhoneの実機テストは未実施。

## 基準mainの既存失敗・限界

#534のPR HEADではCI成功だが、マージ後mainの[CI 41389519545](https://github.com/shotaro-hue/baseball-manager/actions/runs/41389519545)ではmobile WebKitの`save generations: human rookie reserve, failed write, decline and reload at 360px`が1失敗（他130 passed）。今回の旧スカウト差分とは別に、最終HEADのCIで再確認する。

更新前JSを実行中の旧タブに今回のfalse callbackを遡及適用はできない。保存基盤の既存排他・世代検査は維持するが、同一互換versionの旧クライアント排除は本変更の保証外。大規模worldの追加性能測定、新スカウト制度、annual一般公開は未実施。

## ローカル最終確認と独立レビュー

- Chromiumの上記management 2specは39 passed / 1 failed。失敗は旧派遣タブ内の状態保持を通常ナビ移動にそのまま求めたテスト移植ミス。通常ナビは既存仕様どおり画面を再mountするため、再訪時の旧操作不存在・120件の報告・全teams非変更を検査するよう修正し、当該1件はpassed。対象40ケースを確認（無変更39件＋修正後1件）。
- ローカルmobile WebKitは`libgles2`不足で起動前失敗。aptのシステムディレクトリ書込権限制約、ローカル展開＋LD_LIBRARY_PATHでも依存検査を満たせなかった。ローカルWebKit合格とは扱わず、PR CIの同一HEADで確認する。
- 独立コードレビュー: Critical/Importantのコード指摘なし。Task 8の工程表に残った「調査」の文書指摘1件は、ユーザー要件の「計画の矛盾解消」に該当するため修正。仕様・テスト・6画像を確認したレビューであり、テスト/CI結果の独立再実行を意味しない。
- レビューで未判定とした実行結果は本記録/PR CIで実装者が確認する。実iPhone・追加大規模world性能・更新前JS停止は明示した検証/保証範囲外のまま。
