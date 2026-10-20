# UI-04C-FIX 検証記録

基準main: `698dafef6ec6a352a754bcc464800588694f292d`（#486）。[実装方針](../../implementation/ui-04c-fix.md)。対象のsrc subtreeと所属データのhash（scoutResultsを含むteams。FA市場は固定fixtureで再現）は[比較要約](./comparison-summary.json)に収録。最終提出headのCI結果はPR本文を正とする。

2026-10-21追記：#487はマージ済み。FAのCSSコンテナ800pxとDOM側viewport760pxの差による非表示行保持は、[UI-04C-FIX2](../ui-04c-fix2/README.md)で再現・修正・追加検証する。本書の#487時点の測定値と限界は履歴として保持する。

## 原因調査と変更

- トレードは一軍28人×2球団の全行に成績・能力・評価・比較操作を生成し、430pxの内部縦スクロールを2つ作っていた。片側の軽量行、検索/所属/ポジション/年俸順、選択サマリーと選択済みだけの比較へ変更。既存取引関数が対応している二軍/育成も候補として表示し、相手選択後の70人でも全体DOMを削減した。
- 契約は状態判定で選手ごとにmailboxを探索し、閉じた年俸詳細も生成。メールを一度読んで要対応/回答待ち/当年契約済みを導出し、バッジと一覧で母集団を共用。年俸内訳は開くまで生成しない。
- 契約・スカウト・FAはモバイルの詳細中も非表示一覧の行を保持していた。選択中は行をアンマウントし、一覧の殻と検索/位置を保持。FAの全行の成績計算と比較ボタンを選択後へ移動した。
- 対象一覧、共通復帰、Hubのコードにスクロールに伴うReact state更新は見つからなかった。主な確認対象は初回/選択時のDOM・計算・レイアウト量と内部スクロール。選手行と読取モデルをメモ化し、スクロール購読や全件ページ分割は追加していない。
- 固定メニューと既存の760/761・1023/1024境界を維持。1つの選択サマリーだけをstickyで保持し、比較の見出しへフォーカス/スクロールを移す。閉じた選手名一覧の長文をsticky領域へ詰めない。
- CIのmobile-WebKitで、候補削除後の一覧復帰が59pxずれることを実測。traceでは選択時/復帰時ともscrollY=3946、フォーカス復帰後に`div.notif.nok`（💾 オートセーブ）が一覧の上へ挿入されていた。ヘッダーが成功を表示できている契約/トレード/スカウト/FAでは、この成功通知だけを重複表示せず、後置のレイアウト変化を防ぐ。失敗・警告・手動保存・取引結果の通知は維持。保存処理自体は変更していない。[trace抽出](./late-feedback-evidence.json)。

この環境の基準版では持続的なフレーム落ちを再現できず、報告されたスマホの引っ掛かりの単一原因を特定したとはしない。上記はコードと実操作で確認できた負荷構造への改善で、実機の原因確定と滑らかさの検証は別に残る。

## 同一データの性能比較

Chromium 141.0.7390.37、production build、CPU4倍スロットル、同じ日本語フォント。12球団それぞれ所属70人（支配下上限内）、報告120人、市場240人。390×844は3試行の中央値、360×800/760/761/1023/1024/1440×900は各1試行。保存データを読み直して各ルートを開いた。表示時間/詳細時間はドライバの操作から2描画フレーム後までの往復を含み、純粋なJS時間やINPではない。heapはGC後のページ全体で、当該コンポーネント単独の値ではない。

| 画面 | ルート内DOM | 表示まで | スクロールframe p95（rAF間隔） | GC後heap | 変更後の詳細応答 / DOM |
|---|---|---|---|---|---|
| 契約（70人） | 646 → 345（46.6%減） | 368 → 309ms | 16.7 → 16.7ms | 11.85 → 11.61MiB | 137ms / 120 DOM |
| トレード | 1266 → 636（49.8%減） | 646 → 474ms | 16.8 → 16.8ms | 12.36 → 12.06MiB | 188ms / 94 DOM |
| スカウト（120人） | 1012 → 522（48.4%減） | 529 → 268ms | 16.7 → 16.7ms | 12.44 → 12.09MiB | 102ms / 68 DOM |
| FA（240人） | 2924 → 1005（65.6%減） | 826 → 470ms | 16.8 → 16.7ms | 13.57 → 12.38MiB | 123ms / 80 DOM |

トレードの変更前は一軍28人×両球団、変更後は一軍/二軍/育成70人×選択中の片側。データ自体は同一だが表示対象と構成は異なるため、ページの高さだけで改善率を比較しない。内部縦スクロールは2→0。全幅の変更後で横はみ出し/ページエラー/内部縦スクロール0。一覧復帰の最大誤差は0px。

[変更前36測定](./before-metrics.json) / [変更後36測定](./after-metrics.json) / [要約](./comparison-summary.json)。390px第1試行の4画面のPerformance traceを`before-*-trace.json.gz`/`after-*-trace.json.gz`に収録。解凍したJSONをDevTools Performanceで読み込める。

Long Task（スクロール観測区間、50ms超）の観測は以下。ルート初回表示全体のLong Task件数ではない。単発の長いタスクを無かったことにはしない。

```json
{
  "before": [],
  "after": []
}
```

探索時に他E2Eと同時実行したデータは`exploratory-*-metrics.json`に保持。変更後にFA390pxで55ms、スカウト761pxで59msのLong Taskを各1件観測した。また前回の直列runでもFA390pxに1件を観測した（`paired-after.log.gz`）。そのrunは一覧復帰の計測基準がクリック直前の自動スクロールより前だったため、実際のclickイベントを基準に修正して再計測した。前回runのraw/traceは後続runで上書きされ、ログ以外の詳細は残っていない。最終表は修正した計測器による直列比較で、Long Taskを恒常的に解消したという意味ではない。現在のデータ量では軽量化後のp95と探索操作を根拠に仮想スクロールを採用しない。性能の合否は環境依存のmsをCIの固定閾値にせず、同一環境の前後値・DOM・操作を併記する。

初期のCDP合成touchは実際のスクロール移動量0だったため計測手段を修正し、移動量を必ず検査する合成mouse wheelで取り直した。ブラウザ幅とhasTouchは実iPhoneのタッチスクロールそのものではない。実iPhoneでの指追従・滑らかさ、スクリーンリーダー実機は未検証で、引っ掛かりが完全に消えたとは保証しない。

## 画面比較

同じfixture・フォント・viewportで取得。候補行を比較しやすいよう一覧の検索/絞込付近へページをスクロールした実画面。初回表示時間の測定とは別の撮影位置で、画像編集でUIを作り替えていない。

| 画面 | 360px | 390px | 1440px |
|---|---|---|---|
| 契約（70人） | [前](./before-contract-360.png) → [後](./after-contract-360.png) | [前](./before-contract-390.png) → [後](./after-contract-390.png) | [前](./before-contract-1440.png) → [後](./after-contract-1440.png) |
| トレード | [前](./before-trade-360.png) → [後](./after-trade-360.png) | [前](./before-trade-390.png) → [後](./after-trade-390.png) | [前](./before-trade-1440.png) → [後](./after-trade-1440.png) |
| スカウト（120人） | [前](./before-scout-360.png) → [後](./after-scout-360.png) | [前](./before-scout-390.png) → [後](./after-scout-390.png) | [前](./before-scout-1440.png) → [後](./after-scout-1440.png) |
| FA（240人） | [前](./before-fa-360.png) → [後](./after-fa-360.png) | [前](./before-fa-390.png) → [後](./after-fa-390.png) | [前](./before-fa-1440.png) → [後](./after-fa-1440.png) |

詳細は`before-{contract,scout,fa}-detail-{360,390,1440}.png`と`after-{contract,trade,scout,fa}-detail-{360,390,1440}.png`。トレード変更前は常時詳細描画、変更後は選択後に詳細を生成する。

## 回帰とレビュー

- 関連単体7ファイル48件成功。契約状態・欠測/実測0/ソート・旧dateLabelの年度・通知ID・最新候補/予算/枠・確認取消/二重実行/逆提案を確認。
- Chromiumの契約/補強21件は初回20件成功、1件がテスト用メールの読込時期限到来で失敗。実際の回答待ちと同じ未来のdeliverOnDayへfixtureを修正し、同じ期待値の対象1件が成功。失敗と修正後のログを保持し、全21件を一括成功したとは記載しない。最終headの通常CIを別途確認する。
- 通常CI外の関連3spec（`contract-renewal.spec.js hub.spec.js ui-foundation.spec.js`）をChromium/1 worker/再試行0で実行し9件成功。更改下書き・ダイアログのフォーカス・Hub・境界の操作領域・試合結果・保存再開を確認。全E2Eを一括実行したという意味ではない。[ログ](./extended-relevant-green.log.gz)。
- 独立レビュー5件を修正：派遣先往復のフォーカス喪失、比較が一覧末尾へ埋もれる問題/選択サマリー、球団側切替時の別IDへのジャンプ、退団済み通知から戻る際のフォーカス喪失、旧年度メールの誤判定。2単体＋3ブラウザケースのREDを確認し、単体48件/ブラウザ3件のGREENで検証。
- 360/390/1440pxの深い行→詳細→検索条件/元の行/位置、削除後の隣接行、契約バッジ、一軍/二軍/育成、両球団検索と選択済みだけの比較、境界4幅、閲覧のみの全12球団不変、獲得/提示/通知確定と保存再開を確認。Playwrightの再試行/テスト削除/新規skipは追加していない。
- ローカルWebKitは当初OS依存不足で起動不能。後続調査で依存をscratchへ展開し、同じWebKit2215/WPEの候補削除テストが1件成功（再試行0、4px基準を維持）。[WebKitログ](./late-notification-webkit.log.gz)。標準CIは通常のOS依存をインストールし、同じmanagement specをChromium/WebKitで実行する。最終結果はPR本文に記載。FAの埋め込み/代理人/配属/保存は既存UI-03Cケースも維持。
- `npm run build`成功（既存chunkサイズ警告）。`src/engine`/`src/hooks`/保存形式/金銭・CPU判断に差分なし。UIモデルはゲームstateを変更しない。

初回CI [#456](https://github.com/shotaro-hue/baseball-manager/actions/runs/39438274822)（`b998e9e`）は全単体8件失敗/1583件成功/既存skip2件。年俸内訳の遅延描画とFA詳細への比較移動に追従していない既存3specを、内訳/候補詳細を開く手順へ更新。年俸・欠測/不正値・並び順・元データ不変・ID0との比較の期待値を維持し、同じ8件のRED→3spec28件GREENを確認（[RED](./ci-compat-red.log.gz) / [GREEN](./ci-compat-green.log.gz)）。修正後CI [#457](https://github.com/shotaro-hue/baseball-manager/actions/runs/39440350778) のビルドと全単体1591件は成功（既存skip2件）。

初回CIの契約/補強/財務E2Eは88件中87件成功、WebKitの候補削除後の位置が59pxずれる1件を検出した。位置の基準4px未満を維持し、後置の重複オートセーブ通知を修正。HubShellの4件RED→17件GREEN、同じ削除E2EのChromium/WebKit各1件GREENを確認（[単体RED](./late-notification-red.log.gz) / [単体GREEN](./late-notification-green.log.gz) / [Chromium](./late-notification-direct.log.gz)）。この製品コード修正後にafterの36測定と画像を取り直した。修正前の測定は`before-notification-fix-after-metrics.json`に保持した。最終提出headのCI結果はPR本文を正とする。

ログ: [単体RED](./review-mail-red.log.gz) / [ブラウザRED](./review-focus-red.log.gz) / [単体GREEN](./focused-unit-green.log.gz) / [ブラウザGREEN](./review-focus-green.log.gz) / [初回21件](./browser-initial.log.gz) / [fixture修正1件](./badge-fixture-green.log.gz) / [初回build](./build.log.gz) / [最終build](./notification-build.log.gz)。

再計測: 基準commitのproduction buildを別ディレクトリで用意し、このブランチで`node scripts/measure-ui04c-fix.mjs before /absolute/baseline-dist`、`npm run build`、`node scripts/measure-ui04c-fix.mjs after /absolute/final-dist`を直列で実行。画像のみの一覧撮影は同じコマンドに`UI04C_CAPTURE_ONLY=1`を付ける。最終表の時刻/幅別値はJSON、CIの対象commitはPRで確認する。
