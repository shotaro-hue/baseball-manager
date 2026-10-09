# 財務画面：選手契約年俸（年額）

基準 main c39882596a8c7390f9ef2bb1d2f9066d7981c025、2026-10-09。

目的: 球団所属の契約年俸を確認でき、表示操作で選手・編成・予算を変更しない。
対象は現在の所属データ players（一軍）と farm（二軍、育成を含む）。育成フラグは現行契約処理と同じ `育成`。未使用の空フィールド `育成players` は現行の所属源ではない。FA市場・未契約スカウト候補は対象外。
各IDは一度のみ（重複時は一軍の現行レコード優先）。育成フラグがあれば配列に関わらず育成、残りは一軍支配下／二軍支配下。ID 0も有効。ID欠損は同じオブジェクト参照のみ重複排除。
単位は万円、表示は既存fmtSal。0は記録済み、null/undefinedは未記録、負値・非数値・非有限値は不正値。未記録／不正値は人数を表示し、内訳・合計を確認済み分として示す。合計は有効値の内訳合算。年俸上位6名は同じ所属集合で、有効値の降順、同額は元の所属順、欠損は末尾で状態を表示する。
集計は毎描画で導出し、保存stateを増やさない。昇降格・契約・獲得・放出は現行所属と年俸から反映する。保存形式／IndexedDB構造は変更しない。

## 別課題（今回未解決）
- 年俸支払時期、契約時／年度更新時の予算控除ルール
- コーチ継続給与、出来高・タイトル賞与・オプトアウト精算
- 本拠地／ビジターの収入ルール、年間収入予測
- 契約評価式・ゲームバランス

## 検証
結果・比較画像・残存制約は検証終了後に追記する。

## 実装・描画経路

`calcContractPayroll(team)` は元配列ではなく新しいentry配列だけをソートする。選手は参照として読むだけで変更しない。FinanceTabで毎描画算出し、永続stateを追加しない。
財務はモバイル／PCともHubShell → HubContentRouter（遅延読込）→ FinanceTab。ホームの別実装は変更しない。対象の年俸内訳と年俸上位だけを明色の読める面にし、全画面のCSSは置換しない。

## 回帰・レビュー記録

- 修正前のFinanceTab回帰4件は全失敗。一軍のみの600万円表示、表示による選手順の変更、freeze配列sort例外、未記録salaryのfmtSal例外を再現した。
- セレクタ7件は未実装のためRED、その後GREEN。表示4件に同じteam参照で年俸更新を反映する1件を加え、計12件成功。
- 初回ブラウザREDは財務へ入る前の共通saveHubで失敗したため、集計のRED証拠として使わない。全12球団の戻り値を含む保存確認は負荷が大きく、自球団の検証対象だけをブラウザ内で抽出するテストへ変更した。実IndexedDB保存／loadGameは維持。開発途中の中断実行は完走扱いにしない。
- 独立レビューで白背景上の予算額（旧#60a5fa、2.54:1）と年俸見出し（旧#71849a、3.84:1）のコントラスト問題を発見。実ブラウザcomputed styleを検査する回帰を追加し、見出し3.84:1でREDを確認。見出し#17243a・太字、予算#095cc7へ修正し、Chromium360/390/1440とWebKit390でGREEN。
- Minor残存: 欠損／不正値の描画はChromium390のみ（PC・WebKitの異常表示は未検証）。E2E保存比較は所属順・ID・名前・年俸・育成・守備位置・投手種別・契約・成績・打順・投手編成・予算の指定フィールド。選手の全属性のE2E比較ではない。単体freeze／全文比較は元データ全体を検証する。
- iPhone実機・支援技術実機は未検証。既存の収入欄などに旧ダークUIが残るが、今回の全面刷新対象外。

## 現時点の実行結果

Node v24.19.0（CIはNode20）、npm ci終了0、依存関係変更なし。
`npm test -- --silent --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile=…` の全件JSONで639成功／0失敗／既存2skipを確認。既存skipはfa-economy-benchmarkとsalary-demand-benchmark各1件。テスト件数はログ切出しから推測せずJSONを基準にする。
`npm run build` 成功（23.41秒、既存chunkサイズ警告あり）。
財務E2E: `npm run test:e2e -- finance.spec.js --workers=1 --retries=0 --trace=on` 5成功／0失敗／0skip（2.2分）。実IndexedDB保存・再読込、ホームからの再訪、3幅の内訳合計／年俸上位、ページ横はみ出しなしを確認。360/390/1440の同一保存データでmain／修正後の比較画像を採取。
CIに独立finance matrixを追加。既存の2suite、10分上限、1worker、retry0、集約progression-e2e gateを維持する。CI／smoke／全E2E／physics最終結果は完了後追記。

## 全体検証とCI（2026-10-09）

- physics HR: 1成功／0失敗／0skip、終了0。単体97ファイル成功＋既存2ファイルskip、639成功／0失敗／2skip。専用回帰12件はskipなし。
- ローカルsmoke（1 worker、retry 0）: 17成功／4失敗／0skip、全21件実行、21.9分。失敗は下表。成功になるまで同じsuiteを無変更で繰り返す運用は行わず、別途要求された全44件E2Eを実行している。
- 実装head `9740bdde400d91a1e2c36a78f0a8fd8d38d49857` の [CI run280](https://github.com/shotaro-hue/baseball-manager/actions/runs/37917672027) は build-and-test、e2e-finance、e2e-initialization-and-progression、e2e-history-and-posting、集約progression-e2eの全5ジョブ成功。CIは各1 worker／retry 0。
- この文書の追記はゲーム・テスト実装を変えない。最新headのCIと全E2Eの完走結果、証拠ファイルへのリンクは [PR427](https://github.com/shotaro-hue/baseball-manager/pull/427) に記録する。過去smoke失敗は全E2Eが成功しても上書きしない。

| ローカルsmoke失敗 | 確認できた段階／限界 |
| --- | --- |
| slow CPU paints pending… | CPU低速化／生成開始より前のpage.reloadが終了せず、その後context teardownも30秒超過。traceの外部Google Fonts要求も失敗しているが、それが唯一の原因とは未確定。 |
| T1/T2/T3/T4 normal, batch and tactical history… | 戦術試合の終了ボタンを待つpollで60秒超過。財務への遷移なし。 |
| E1 new game, five games, persisted reload… (Chromium) | ケース全体の制限内に完了しなかった。詳細traceと失敗ログを保持し、今回の財務変更起因かは未確定。 |
| E2 final regular game, postseason… | ケース全体の制限内に完了しなかった。詳細traceと失敗ログを保持し、今回の財務変更起因かは未確定。 |

このローカル失敗をCI成功だけで解決扱いにしない。テスト削除・skip・期待値変更・既存timeout/retryの変更はない。

公開時に同目的の別Draft PR426が作業中と判明したため、既存ブランチを上書きせず独立PR427へ作成した。同じ修正の2本を重ねてマージしない。mainは開始時／PR作成時ともc398825で、PR420–425を保持している。
