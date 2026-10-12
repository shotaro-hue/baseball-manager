# UI-01B — ホーム刷新

基準main: `1e607e753b09bb87da16a626f6de33377ac0f82b`（tree `ac86b33ff05f2dd14ed7082526e73df8e55667bb`）。#436、#444〜445、#447〜449の導入済み処理を再実装せず、DES-01ホームをモバイル/PCの両描画経路へ適用する。

## 範囲と責務

- `homeSections.jsx`: 共通の順位・戦績・直近5試合、対戦・進行設定、要確認、直近結果。ランキングは既存`rankLeague`、進行可否と理由は既存`regularSeasonRequest`へ委譲。既存表示を新UIに移し、UIに試合処理を追加しない。
- `MobileHome`/`DashboardTab`: 両方で上記を使う。PCは全打線、控え選手選択、能力/成績切替、選手詳細、比較への既存操作を維持。モックの4行抜粋を実装に転記しない。
- `HubHeader`/`useGameState`: `queueSave`の実結果を非永続`saveResult`として公開。保存処理開始後に実キューsnapshotを取得する。dirty/実キュー処理中は過去成功より優先、失敗は成功表示に置換しない。結果のないロード直後は「保存状態未確認」。本体保存成功でもarchive失敗/warningsは注意を併記。トラッキングリセット時に結果をクリア。既存保存通知・再試行ボタン・保存形式を維持。
- `HubSimPanel`: 共通Buttonと白い操作面へ移行、まとめ/残り全試合のフル自動編成設定を独立維持。旧グラデーション・装飾書体を除去。
- `home-ui.css`: `[data-ds="home-shell"]`とホームの専用classに限定。ナビ名・順序・タブID、既存760/1024境界を維持。ホーム以外のシェル・Headerをテーマ変更しない。共有SimPanelのみ既存他タブの進行設定にも新部品を適用。

表示母集団: 順位/戦績は当年度の同リーグ球団、要確認は現一軍選手、結果は既存recentResults（最新順）、契約警告は現一軍の契約残1年以下。年俸や成績集計・ランキング算式・保存スキーマ・編成不備のタブ移動制限は変更しない。

## 承認モックと変更前後

前後は同じnew-game保存fixture（開幕前）。承認PNGの第73戦と架空選手はサンプルであり、現データへの差し替え指示として扱わない。PCは全打線と選手操作を残すため、モックの右列4行抜粋ではなく、その下へ実打線/選手詳細の比較領域を置く。

| 幅 | DES-01承認 | 変更前 | 変更後 |
|---|---|---|---|
|360×800|[承認](../design/des01/des01_home_360.png)|[前](../validation/ui01b/before/home-360.png)|[後](../validation/ui01b/after/home-360.png)|
|390×844|[承認](../design/des01/des01_home_390.png)|[前](../validation/ui01b/before/home-390.png)|[後](../validation/ui01b/after/home-390.png)|
|1440×900|[承認](../design/des01/des01_home_1440.png)|[前](../validation/ui01b/before/home-1440.png)|[後](../validation/ui01b/after/home-1440.png)|

七幅の画像・寸法: [前layout](../validation/ui01b/before/layout.json)、[後layout](../validation/ui01b/after/layout.json)。境界画像は両folderの760/761/1023/1024ファイル。全文はafter/home-full-360、390、1440。再取得は`node scripts/capture-ui-home.mjs after`。前は基準mainに同スクリプトを配置して取得。beforeには画面変更前の旧操作領域が含まれる。

## 検証記録

- 新階層/正確な保存状態/グラデーション除去は15件RED。保存結果公開は2件RED。追加のHeader日程なしは1件RED（既存formatterのfallbackを使用していた）→homeだけ予定日の存在を確認。
- 関連Reactと保存テスト、build、実試合E2Eの最終結果を下記へ追記する。CIはPR最新headを別途確認する。
- 実試合ケースと状態fixtureを区別する。`e2e/fixtures/ui01b`は既存本番部品へ日程なし/進行不可/処理中/通常シーズン終了のpropsを渡す表示検証。実試合・実永続化成功の証拠はreal gameとactual saveのケースで確認する。
- 既存UI-01Aの実ゲーム/結果/戻る/保存再開を維持。初回検証で見つかったヘッダー戦績依存とPC二重CTAを解消し、セレクタをskipせず回帰テストで確認。

未検証: iPhone実機/Safari・読み上げ・200%拡大、全タブ全状態。シムを進めないときの過去結果fixtureを実試合成功扱いにしない。結果画面全体刷新/UI-01C、記録整合性FIX-S3/S4、オフシーズン/UI-03は別工程。

## 最終結果

| 検証 | 結果 |
|---|---|
| `npx vitest run src/components/homeRefresh.test.js src/components/dashboardCalm.test.js src/components/mobileFlow.test.js src/components/hub/HubSimPanel.test.js src/hooks/useGameState.saveStatus.test.js src/hooks/useGameState.offseasonSave.test.js src/hooks/useGameState.matchHistory.test.js src/hooks/useGameState.initialization.test.js` | 8ファイル/54件成功。実結果失敗・成功・in-flight変更のdirty維持・表示と既存保存/初期化を検証 |
| 部分保存の文言回帰 | metadata warningsとarchive失敗を異なる注意表示で区別。warnings専用RED→GREEN、homeRefresh17件成功 |
| `npm run build` | 成功（12.81秒）。既存の500kB超chunk警告あり |
| `npm run test:e2e -- progression.smoke.spec.js ui-foundation.spec.js --grep UI-01 --project=chromium --workers=1 --retries=0` | 12件中11件成功。唯一の残件は故障注入の期待quotaログを既存共通error監視が拾ったため失敗。製品の保存失敗・再試行assertは成功していた |
| `npm run test:e2e -- progression.smoke.spec.js --grep 'UI-01B actual save' --project=chromium --workers=1 --retries=0` | 故障注入ケースで正確な期待診断1件をassertして消費し、該当1件再実行成功（16.5秒）。上記11件と合わせ対象12件の成功を確認。単一一括実行12passという記録ではない |
| 実ゲーム操作 | 360/390/1440で実1試合オートシム→結果→ホーム、実5試合まとめ進行→結果→ホーム、保存・再読込後の進行/選手stats一致。PCの選手選択・詳細・比較への登録、両経路の編成移動を検証 |
| 実保存状態 | 実試合後の編成変更で保存待ち、実origin-lock保留で保存中、実localStorage quotaで保存失敗→再保存成功。旧正常saveの維持は既存保存層へ委譲 |
| 終了・異常 | 実143戦終了saveからplayoff→編成→ホーム→通常進行不可・postseason復帰ボタン。日程なし/進行位置不一致/処理中/終了は同本番部品fixtureでも3幅検証 |
| 七幅と広い可視操作計測 | 正常7幅＋異常fixture12状態＝19表示状態、ページ全体横はみ出し0件。可視button/select/summary/checkboxのタップ対象labelを含め44px未満0件 |
| 旧CSS | 編成画面のcomputed style（色・背景・書体・ボタン寸法）前後一致。`old-roster-style.json`のdiffなし |
| full E2E収集 | `playwright test --list`で81tests/20files、UI-01B8件が各1回。非spec helperから既存CI対象progressionへ登録し、standaloneの重複specなし |

ローカルの並行作業を隔離するため上記E2Eには一時configでport5174を指定した。通常config/CIでは既存5173を使用する。GitHub CIは公開PR最新headで別途確認し、未実行の全Vitest/全E2Eをローカル合格扱いにしない。

異常の[日程なし](../validation/ui01b/after/state-no-schedule-390.png)／[進行不可](../validation/ui01b/after/state-blocked-390.png)／[処理中](../validation/ui01b/after/state-processing-390.png)／[終了](../validation/ui01b/after/state-complete-390.png)は部品表示fixture。各画像内にも実試合/保存の成功を示す資料ではないことを明示する。保存処理の成功/失敗は上記実操作ケースに基づく。

## PR #452 のCIで確認した非ホーム経路の回帰

初回CIの全Vitestで、既存`ContractTab.consistency.test.js`の「explicit farm release uses the shared release path…」が`gs.getSeasonHistory is not a function`で失敗した。新しいホーム用`rankingContext`をrouterの全タブで先に計算していたため、契約タブにもホーム専用の履歴依存を持ち込んでいたことが原因。

既存ケースでRED（1失敗/1成功）を確認し、その計算1行だけを`tab === 'dashboard'`分岐内へ移動した。契約タブのfixtureに無関係なstubを追加せず、optional-callで依存不足を隠さず、既存リリース処理・履歴・市場追加のassertionを維持する。修正後は既存契約テストと上記ホーム/保存テストを合わせて9ファイル/56件成功。公開PRへ追加コミットで反映し、GitHub CIは更新後headで再確認する。
