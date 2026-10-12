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

## PR #452 レビュー指摘修正・main追従（2026-10-12）

追従main: `789b0e8fee5c571e70bd90fdaad6de2c16fc5eda`。元PR head: `99e1c2cbd811a10c75a11001b469141fefff8816`。CHANGELOGだけの競合を解消し、UI-01B・FIX-S2・AI-02の全エントリを保持。履歴を書き換えずmainをmergeし、#450/#451のエンジン・テスト・仕様・CIを維持する。

- `home-ui.css`: 761px以上での共通SimPanel先頭ボタン非表示を `.home-settings` 内へ限定。現headでは共通Buttonの詳細度が元のルールに勝っており、他画面の非表示は再現しなかった。ホームの重複ボタンが表示されていたことはブラウザでRED確認。修正後はPCホームの「試合へ進む」を維持して重複だけ隠し、他タブの「1試合」は表示する。スマホの既存重複非表示を維持。
- `HubShell.jsx`: `regularSeasonRequest` に `gameResultsMap` を渡す。元headでは次戦結果が既に存在しても非ホームの3操作が有効になることをRED再現。ホームルーターと同じ既存ガードで判定する。エンジンや保存形式は変更しない。
- `HubShell.progression.test.js`: 実HubShellと実HubContentRouterで正常・日程欠落・結果重複・対戦重複・進行位置不一致・終了・ポストシーズンの7ケースを比較。
- `e2e/helpers/ui-home-cases.js`: 既存CI progressionへの一重登録を維持。390/760/761/1440pxのホームと日程・編成で可視性、enabled、実クリック、独立した自動編成checkboxを検証。4幅で各2試合を実行。非ホーム5試合まとめ、残り全1試合からポストシーズン、保存も実操作。日程欠落・結果重複・位置不一致の保存は既存farm migrationがロード時に拒否し、タイトル維持・試合開始不可・保存の進行情報不変を確認。ガードのUI比較は上記部品テストと区別する。

ローカル検証（最終製品差分）:

- 関連Vitest8ファイル72件成功。ガードテストを実ルーター比較へ強化後、その7件も成功。既存テストの削除/skip/弱体化なし。
- UI-01B Chromium既存8件成功。追加8件は最終3件＋対象5件で全成功（390/760/761の3件、1440・異常セーブ2件・非ホームまとめ・全試合の5件）。計16件。初回追加テストの失敗は、モバイル重複ボタンの既存非表示、ナビ1024境界、結果復帰先の元タブ、既存数値バッジ、farm保存検証に合わせて修正した。
- `npm run build` 成功。`git diff --check` 成功。エンジン/Worker/SPEC/CIのmain差分なし。独立した読み取りレビューの指摘なし。
- 最新公開headのCI全6ジョブ結果・SHAはPR本文に記録する。元headのCI成功を修正後headの成功とは扱わない。

保存表示Dは今回維持する。新規初期保存は直接enqueue経路で、状態公開とdirty追跡が続くため、表示結果を単純接続して「保存済み」と認定しない。ロード時も実保存結果をnullに戻す。初期保存スナップショットと表示結果の安全な接続は後続課題。保存待ち/中/失敗/成功/一部未保存の区別と実保存E2Eを維持。

未検証: 実機Safari/iPhone、読み上げ、200%拡大、全タブ全状態。変更対象外の画面・ゲームバランス・セーブ形式・CPU評価・球団比較計算・ナビ構成は維持。マージ・自動マージは行わない。
