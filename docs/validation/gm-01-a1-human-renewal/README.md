# GM-01 A1-2a-1 人の更改接続の検証

基準は main `cb2eea56`（#529）。年次契約fixtureで、人の提示・差替・取消・回答を確定保存とReact採用確認へ接続した。今季年俸10000万円に対する翌季12000万円×3年の提示でも、今季の年俸・所属は維持する。

## 範囲と未接続部分

- 年次契約の公開gateはOFF。通常アプリの年次モード開始／読込を有効化していない。
- FA・外国人・CPU/Worker・日次進行・年次繰越・activation anchor・storage fenceは後続。A1-1d/A1-2a全体の完了ではない。
- 現在の評価式を提示時に固定し、2～4日／ターン後を回答期日にする。新しい乱数消費はない。オフの新規提示は30ターンまで、回答の最終期限は37ターン。
- この段階では保存済みclockに対して明示的な「届いた回答を確認する」で処理する。日次進行からの自動回答は後続。

## ローカル検証

関連Vitest 252件（9ファイル）が成功。内訳は更改decision 18、年次更改transaction 50、save migration 146、人の更改hook 7、既存commit hook 18、旧回答hook 4、新UI 4、旧UI consistency 3、offseason route 2。

`npm run build` 成功。既存のchunk size警告は残る。全Vitest・重要E2Eの合否は、PRの最終HEADに対応するCIを別途正本とする。

追加E2EはChromium 5件・WebKit 5件の計10件が成功。既存のCI対象 `e2e/save-generations.spec.js` 内。保存先・React hook・IndexedDBは実物を使い、障害注入箇所以外はmockしない。

- 360 / 390 / 1440px：保存失敗でも旧rootと入力値を保持、再試行後だけ成功表示、cold reload後も回答待ちを表示、取消を保存。
- 表示用mailが空でも保存済みdecisionから受諾を処理。再読込後も今季年俸10000万円・翌季の契約1件を確認。
- React反映後のack読取障害では成功表示を出さず復旧操作を表示。復旧はrootを書き換えず、取引1件のまま。
- オフ単独routeの背景を実画面で検出し修正（RED→GREEN）。年度別表を開いてページ横overflowがないことを検証。

ローカル実行環境ではWebKitの共有ライブラリが未導入だったため、Ubuntu配布パッケージを一時展開してブラウザーのライブラリ探索先へ接続。ldconfig一覧を参照する事前検査だけ `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` で省略し、実WebKitを起動してテストする。CIは通常の `playwright install --with-deps` と標準検査を使用する。テストの期待値・対象・retriesは変更していない。

## 画面比較

同じ保存済みfixtureの選手Aを選択。beforeは既存ContractTab、afterは年次画面（入力ドラフト12000万円×3年）。旧画面の「当年契約済み」表示に対し、新画面は台帳の満了年度で翌季の更改を判定する。公開gateを通らないテスト専用DOM harnessでhubと同じ背景・描画routeを使用。全アプリの年次journey検証ではない。

| 幅 | Chromium | WebKit |
| --- | --- | --- |
| 360 | [前](chromium-360-before.png) / [後](chromium-360-after.png) / [保存失敗](chromium-360-write-error.png) / [回答待ち](chromium-360-pending.png) | [前](mobile-webkit-360-before.png) / [後](mobile-webkit-360-after.png) / [保存失敗](mobile-webkit-360-write-error.png) / [回答待ち](mobile-webkit-360-pending.png) |
| 390 | [前](chromium-390-before.png) / [後](chromium-390-after.png) / [保存失敗](chromium-390-write-error.png) / [回答待ち](chromium-390-pending.png) | [前](mobile-webkit-390-before.png) / [後](mobile-webkit-390-after.png) / [保存失敗](mobile-webkit-390-write-error.png) / [回答待ち](mobile-webkit-390-pending.png) |
| 1440 | [前](chromium-1440-before.png) / [後](chromium-1440-after.png) / [保存失敗](chromium-1440-write-error.png) / [回答待ち](chromium-1440-pending.png) | [前](mobile-webkit-1440-before.png) / [後](mobile-webkit-1440-after.png) / [保存失敗](mobile-webkit-1440-write-error.png) / [回答待ち](mobile-webkit-1440-pending.png) |
