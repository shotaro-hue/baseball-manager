# FIX-S3：OPS精度・成績表示整合性

実施日：2026-10-16（日本時間）。基準main：`5ec2e7672115bb2a4fac2f54a4c00b8818ff7fb1`（PR #472マージ済み）、tree `0dc826fdb58e8a9d1bebc85cab1b8539f5b2826b`。git cloneとGitHub mainを照合。古い添付ZIPは使用していない。作業ブランチ：`fix/s3-ops-consistency`。本工程はPRレビュー待ちで、マージ済みとはしない。

## 原因と変更

- `saberBatter().OPS`が`r2`で数値を丸め、一覧・詳細・年度別がその数値を3桁表示していた。年度別は正の保存済みOPSも優先し、古い`.800`が残った。
- 通算は保存済み／丸め済みOBPをPA加重、SLGをAB加重して合算していた。OBPの正しい分母はAB+BB+HBP+SFであり、SHを含むPAとは異なる。単年でも途中丸め誤差が残る。
- 生OPSを返す`rawBatterOps()`を共通化し、`saberBatter()`は最後に`r3`。OBP・SLGを丸めて足し直さない。他指標の式・丸めは維持。
- 契約更改・FAの主要表示も共通のOPSを使用する。JSの生値`.0875.toFixed(3)`が`.087`となる一方、既存`r3`の丸め方では`.088`になる境界を含め表示方針を統一する。
- `careerOpsMetrics.js`は表示専用。年度別の完全カウントを保存OPSより優先する。通算は各行のカウントの合算から計算し、年度OPSの平均を使わない。年度・球団・ポスト区分・履歴読込と保存形式は維持。
- 現在年の仮追加行でcompactが補完した0を元の欠測と誤認しないよう、OPSのみrawの記録を読む。既存の他指標の読取は維持。
- 詳細履歴が取得不能の場合、直近履歴だけのOPSを「通算」として確定表示しない。年度別の記録は残し、通算OPSを`— 未記録`とする。

### 旧履歴の判断と限界

AB/H/D/T/HR/BB/HBP/SFが有限・非負で揃い、記録PAに説明できない残差がない場合は再計算。SHはPA内訳の確認にのみ使用し、OBP分母へ加えない。

既存の`compactCareerStats()`は未保存のカウントと率を0へ補完するため、旧実在選手履歴のHBP/SF/SHには未記録由来の0がある。PA内訳の残差がある履歴は完全扱いせず、正の保存OPSを維持する。カウント不足かつ保存OPSも不明なら`— 未記録`。実測0は完全なカウントから`0.000`、AB0は`— 算出不可`。一部年度が不完全、または過去詳細が未取得なら通算OPSは`— 未記録`。

保存済みOPSが0でカウントも欠ける場合、旧compactの初期値と実測0を区別する手掛かりがないため0を確定しない。PA残差で検出できない過去の欠測0まで復元した保証はない。一括移行・保存書換え・スキーマ変更は行わない。

### OPS参照先とゲーム影響

| 参照先 | 扱い |
|---|---|
| 一軍一覧／リーグランキング | `firstTeamMetric`→共通OPS。数値ソート・規定・参加条件・同値順序を維持 |
| 選手詳細／比較／詳細編成 | 既存selector経由で3桁が自然に整合 |
| 年度別表／OPS推移／通算 | 表示専用helperで元カウント優先、欠測はnull。保存値は不変 |
| 球団比較の打線OPS | 既存の合算カウント→共通OPS。選手OPSの平均ではない |
| 契約更改／FA | 表示計算のみ共通OPSへ。FAの前年snapshotと今季の集計条件は維持 |
| `cpuBatterEvaluation`／`managementPolicy` | **生OPSのr2を明示**して従来のCPU判断入力を維持。r2(r3(raw))にはしない |
| 表彰 | OPSは記録値。MVP等の評価点は既存のWAR等を使用、重み変更なし |
| 打球分析の助言・編成OPSの色 | 数値精度に応じ境界付近の説明・色が変わり得る。しきい値そのものは変更しない |

打撃シミュレーション・乱数・成長・契約ルール・FA評価重み・保存処理は変更していない。

## 検証

### RED → GREEN

- 共通計算：既知`.797`、`1/3+1/3=.667`、`.803`を追加。修正前3失敗／既存2成功を確認し、修正後5成功。既存wOBAの2ケースと既知wOBA`.343`／WAR`1.22`も維持。
- 年度別・通算：旧`.800`の再計算、3行／移籍の分子分母合算、レギュラー／ポスト、部分欠測、実測0、ライブ欠測、実save/loadを検証。NodeではRechartsの描画だけをstubし、表と保存APIは実物。初回は複数年のRechartsがResizeObserver不足で実行不能となったため、成功扱いせず環境stubを整え、元CareerTableへ戻して6ケースのassertion失敗を確認した。
- CPU互換：生`.794871...`→従来`.79`（新OPS`.795`を再丸めすると誤って`.80`）、既知`.796888...`→従来`.80`を検証。CPU呼出を旧実装に戻すと2ケース失敗、互換処理復元後成功。
- 追加欠測：年度statsオブジェクト欠落、取得不能な過去詳細があるのに通算値を表示するケースを各RED→GREENで確認。後者は独立レビュー指摘を修正したもの。
- 修正途中の複数年テストは期待値の手計算に誤記があり、正しい`235/654 + 213/553 = .744499...`を確認して`.744`へ訂正。期待値緩和ではなく算術誤記の訂正。

最終の関連Vitest：7ファイル／70件成功（`careerOps`8、`opsConsistency`7を含む）。別途、career保存世代・実在選手履歴・hook統合を含む9ファイル66件も成功。これらは部分的に重複するため合計件数にはしない。

```bash
npx vitest run src/components/careerOps.test.js src/components/opsConsistency.test.js src/engine/__tests__/sabermetrics.test.js src/engine/__tests__/analysisComparison.test.js src/components/contractRenewalUI.test.js src/components/hub/HubFaTab.test.js src/components/careerGenerationRead.test.js
```

### 数値の根拠

| 条件 | OPS |
|---|---:|
| 佐藤海斗：OBP174/500 + SLG202/450 | .796888… → **.797** |
| 同AB450・H130・D26、その他同じ | .803333… → **.803** |
| 上記2人合算 | .800111… → **.800** |
| AB100・H10・BB50・SF1の選手と佐藤を合算 | 234/651 + 212/550 = .74490155… → **.745** |
| 上記にAB3・H1の別年を加算 | 235/654 + 213/553 = .744499… → **.744** |

リーグ順位は`.803`→同値`.803`（入力順維持）→`.797`→欠測。規定・最低PAは変更しない。実測0は欠測より前、欠測は数値0として扱わない。

### 画面・操作

`e2e/player-detail.spec.js`へFIX-S3の3条件を追加し、既存CIのroster-settingsに自動で含める。CI設定は変更しない。既存部品を使用した制御fixture（実プレイ済みシーズンの完成認定ではない）。旧OPS`.8`を実保存APIで先に保存し、その履歴を表示する。

最終ローカルブラウザ試験は3件成功（8.8秒）。360×800・390×844・1440×900のChromiumで、一軍一覧・選手詳細・年度別／通算・ポスト切替・比較・ランキング・保存再開・横スクロール・ページ幅を検証する。保存／ロード後も所属・成績・履歴と保存OPS`.8`が不変で、描画は`.797`。

初回ブラウザ試験は存在しないアクセシブル名で詳細ボタンを探してタイムアウト。実際の既存`.stats-player-button`へ修正。次の試験では不完全fixtureの保存前後比較が、既存ロード処理の欠測0補完で失敗。欠測を明示的nullにして、保存前後が同一の適切なfixtureへ修正した。履歴取得不能ガード追加後は未作成saveIdが原因で通算未記録となることも正しく検出したため、履歴を先に実保存してから表示する条件に改めた。失敗を成功扱いにはしていない。

日本語フォントを検証環境へ用意し、数字と日本語を視認可能にした。モバイル年度表の撮影は既存の横スクロールでOPS列を表示する。レイアウト・CSSは変更していない。

| 同一fixture | 360px | 390px | 1440px |
|---|---|---|---|
| 一覧・変更前 | [PNG](../validation/fix-s3/before-list-360.png) | [PNG](../validation/fix-s3/before-list-390.png) | [PNG](../validation/fix-s3/before-list-1440.png) |
| 一覧・変更後 | [PNG](../validation/fix-s3/after-list-360.png) | [PNG](../validation/fix-s3/after-list-390.png) | [PNG](../validation/fix-s3/after-list-1440.png) |
| 年度／通算・変更前 | [PNG](../validation/fix-s3/before-career-360.png) | [PNG](../validation/fix-s3/before-career-390.png) | [PNG](../validation/fix-s3/before-career-1440.png) |
| 年度／通算・変更後 | [PNG](../validation/fix-s3/after-career-360.png) | [PNG](../validation/fix-s3/after-career-390.png) | [PNG](../validation/fix-s3/after-career-1440.png) |

基準mainを別worktreeへ展開し同じfixtureを配置して撮影。[変更前数値](../validation/fix-s3/before.json)。再現：`node scripts/fix-s3-capture.mjs /absolute/base-worktree`。変更後：`npx playwright test player-detail.spec.js --grep FIX-S3 --workers=1 --retries=0`。

## PR品質ゲート・未検証

最終PRの同一head SHAに対するBuild・全Unit・中核E2Eの確定結果はPR本文を正本とする。文書へのCI結果追記だけでheadを変え、同じ巨大suiteを再実行することは避ける。作成前のローカルBuildは成功（既存の大きなchunk警告あり）、最終全体ゲートはCIで確認する。

未検証：実機iPhone/Safari、実ユーザーの全世代セーブ、全実在選手履歴の欠測由来0の識別、3年超のゲームバランス。ブラウザでの複数年推移グラフの全hover・年度境界操作は未網羅（年度／移籍／ポスト／通算は実componentの単体テストで補完）。

二軍捕手不足の原因分析、経営画面DES-01移行、CPU長期編成は次工程に残す。QA-D1の20seed・3seed×3年・42保存再開・最終CI全8ジョブ成功は#472の確定範囲で、捕手不足の原因分解・実機・3年超検証は未完了。

## CI追検出：既存FIX-S4 fixtureの引退イベント

初回head `397560e54a249010f76c915d21cc6e736fd23bfe` の[CI #404](https://github.com/shotaro-hue/baseball-manager/actions/runs/38818917011)はBuild（13.65秒）・全Unit（170 files / 1,242 pass、従来の条件付き2件）・保存16件・財務23件・QA-D1 browser14件・編成73件が成功。一方、match-historyは46/47成功で、FIX-S4 home=falseが保存ボタンのclick待ちで90秒停止した。進行ジョブの確定結果はPR本文を参照。

[初回artifact](https://github.com/shotaro-hue/baseball-manager/actions/runs/38818917011/artifacts/12011534530)のtraceと画面では、2試合後の大島洋平（40歳）の「引退表明」overlayが保存ボタンを覆っていた。ローカルの対象1件でも同じoverlayによる停止を再現した。成績assertion不一致ではない。未変更の`singleDayCore.js`には4%の抽選と35歳以上の候補条件があり、OPSは参照しない。

投手の勝敗・保存を検証する`result-decision-cases.js`の当該fixtureだけ、自球団の35歳以上を34歳へ設定する。無関係な確率イベントがテスト操作を妨げないための入力条件の明示で、シミュレーション・乱数・引退処理・保存形式・全W/L/S／再開assertionは変更しない。テスト削除・skip・force click・期待値緩和は行わない。引退UIの検証完了を意味しない。

修正後の対象E2Eはホーム40.8秒・アウェイ32.3秒、2件成功（計1.3分）。最終headのBuild・全Unit・中核E2Eはこのfixture修正を含めてCIで確認し、初回失敗と区別してPR本文へ確定結果を記録する。
