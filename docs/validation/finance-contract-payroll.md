# 財務画面契約年俸：検証記録

基準main: `c39882596a8c7390f9ef2bb1d2f9066d7981c025`。新規cloneで最新mainの一致を確認。添付ZIPは旧版であり実装・検証基準にしていない。#420〜425はマージ済み、既存修正を保持。

## 原因と修正

FinanceTabはteam.playersだけの年俸合計を「支出」として表示し、年俸上位のsortが同じ配列を破壊していた。現在の所属players/farmから純粋関数で重複除外し、支配下一軍・二軍・育成の内訳と年額合計を算出。元の選手配列・オブジェクトは変更しない。

独立レビューで、上位6人に年俸未記録の選手が入ったとき、詳細画面のfmtSal(null/undefined)が例外となることを発見。FinanceTab→PlayerModalの実callback回帰を追加し、修正前4失敗/1成功、修正後5/5成功。両画面の共有分類で未記録・不正値を表示し、選手データの書換え・補完をしない。

## 回帰と実描画

- 修正前の実FinanceTab SSR：4/4失敗（集計漏れ、freezeされた配列のsort、異常額、空状態）。
- 集計18件＋表示4件＋詳細callback5件：27/27成功。
- 昇降格で総額不変、契約変更・獲得・放出の差額、ID0、育成優先、配列間・配列内重複、ID未記録、0、null/undefined/非有限/負数/文字列等、空所属、上位6名・同額順、freeze、JSON往復。
- モバイル下部ナビ／PC監督メニュー→その他→球団運営→HubContentRouterの遅延読込FinanceTab。両経路で同じ実部品を検証。
- 固定fixture：一軍400万円＋二軍200万円＋育成50万円＝650万円。上位は一軍300、二軍200、一軍100、育成50。元の打順・投手編成等はfixtureを維持。
- Chrome/WebKitの360/390/1280pxで表示、同一タブ再表示、IndexedDB保存・アプリ再読込で同じ内訳・合計・上位。全球団の全フィールドJSONをブラウザ内でSHA256比較し、元の選手順・編成・予算の不変を確認（大きなfixtureの転送量を減らすためで比較項目は省略しない）。
- 正常な二軍選手の詳細開閉と、未記録年俸の上位選手の詳細開閉も実操作。保存形式・IndexedDB構造は無変更。

## 画面比較

同じ固定fixture、同じ幅。Chromeの変更前後とWebKitの変更後を保存。外部フォント通信が使えないため、以下のローカル用設定でGoogle FontsのCSS importだけを除外した。製品ソース、既存E2E、保存処理の代替・モックはない。フォントの公式配信状態やiPhone実機の見た目を検証したという意味ではない。

| 幅 | 変更前Chrome | 変更後Chrome | 変更後WebKit |
|---|---|---|---|
| 360 | [年俸](finance-contract-payroll/before-360-finance-payroll.png) / [画面](finance-contract-payroll/before-360-finance-viewport.png) | [年俸](finance-contract-payroll/after-chromium-360-finance-payroll.png) / [画面](finance-contract-payroll/after-chromium-360-finance-viewport.png) | [年俸](finance-contract-payroll/after-webkit-360-finance-payroll.png) |
| 390 | [年俸](finance-contract-payroll/before-390-finance-payroll.png) / [画面](finance-contract-payroll/before-390-finance-viewport.png) | [年俸](finance-contract-payroll/after-chromium-390-finance-payroll.png) / [画面](finance-contract-payroll/after-chromium-390-finance-viewport.png) | [年俸](finance-contract-payroll/after-webkit-390-finance-payroll.png) |
| 1280 | [年俸](finance-contract-payroll/before-1280-finance-payroll.png) / [画面](finance-contract-payroll/before-1280-finance-viewport.png) | [年俸](finance-contract-payroll/after-chromium-1280-finance-payroll.png) / [画面](finance-contract-payroll/after-chromium-1280-finance-viewport.png) | [年俸](finance-contract-payroll/after-webkit-1280-finance-payroll.png) |

年俸の2カードを白背景と濃い文字で読み取り可能にし、PCシェルの既存paddingによる横はみ出しは `.hub:has(.finance-tab)` に限定したbox-sizing補正で解消。全画面のCSS・既存ブレークポイントは変更しない。

## 実行環境と途中の失敗（最終結果と区別）

- npm ci成功。Chrome/WebKitは導入済み。初回install --with-depsはAPTのsetgroups制限で失敗し、APT sandbox user/キャッシュをローカル環境向けに指定して不足依存を導入。両ブラウザの起動確認に成功。
- 通常設定で最初の財務E2E4件は、外部GoogleフォントCSSの接続待ちでnavigateに失敗。アプリ固有回帰の証拠とは扱わない。
- 外部設定のwebServer cwd不足で1回起動不能。実テスト未実行。cwdをリポジトリルートへ指定して訂正。
- フォント通信除外後、修正前UIで4/4失敗（新しい契約年俸領域が存在しない）。3幅の変更前スクリーンショットを取得。
- 初回修正後4件は2成功/2失敗。360pxは4回の巨大fixture返却を含む複合ケースで2回目のreload中に30秒のケース期限。PCはページ横はみ出しの実不具合。比較は全フィールドのままブラウザ内ハッシュへ変更し、PCの幅を局所修正。
- その後の描画・保存8件は8/8成功（Chrome4/WebKit4）。この段階は詳細クリック追加前の結果。
- 新規の複合幅ケースだけ60秒とした（4保存・2再読込を含む）。既存テストのtimeout/期待値/retry設定は緩和していない。新規skipなし。

ローカルE2Eは元Playwright configのtestDir、projects、testMatch、grep、assertion timeout、全テストを継承したscratch設定を使用し、port5177・出力先・webServerのローカル用Vite configだけ変更。E2Eはすべてworkers=1/retries=0。CIはリポジトリの標準Vite/Playwright設定を使う。

## 最終検証

| 検証 | 成功 | 失敗 | skip/未実行 |
|---|---:|---:|---|
| npm ci | 成功 | 0 | なし |
| npm test | 654 | 0 | 既存benchmark2skip |
| npm run build | 成功 | 0 | 既存chunk-size警告 |
| npm run validate:physics-hr | 1 | 0 | なし。生成report差分は除外 |
| npm run test:e2e:smoke | 18 | 3 | 0skip、21件、16.3分、1worker/retry0 |
| npm run test:e2e | 未完了 | — | 全49件、1worker/retry0 |

## レビュー・残存課題

独立レビュー1回。Importantの詳細画面例外は実callbackでRED→GREEN。Minorの詳細クリック不足は同修正の実E2Eへ取り込み。異なる年俸・育成フラグを持つ同ID二重記録の競合専用テストは未追加（一軍優先は仕様・実装に明記、同IDの重複除外は検証済み）。生成物physics-hr-reportはPRから除外。

年俸精算・コーチ継続給与・賞与等・収入予測・球場費用/単位・契約評価式は [対象外の記録](../finance-contract-payroll.md) の通り未解決。iPhone実機、外部フォントの正常配信、その他財務カード全体の視認性/全面刷新は未検証・対象外。


### smoke失敗とmain比較

旧inline v4拒否はfixture投入中のevaluateで30秒期限切れ、context終了/trace ZIP切断も発生。旧予算維持ケースは2回目の手動保存中に30秒期限切れ。引き分け含む完了fixtureは保存待機のevaluate中に60秒期限切れ。いずれも財務タブへの遷移なし、年俸期待値の不一致ではない。ログ/取得できたtraceを確認したが、原因は未確定。

c398825をgit archiveした未修正mainで「旧予算維持」を同じローカル設定・1worker/retry0で単独比較し、1/1失敗（最初の続きから操作中の30秒期限切れ、context終了30秒超過）。mainでも失敗したが、変更後の失敗箇所と同一ではないため原因の同一性は断定しない。全E2Eで改めて検証する。テストの削除/skip、既存timeout・期待値の緩和、自動リトライで成功扱いにはしない。
