# UI-03C: FA市場と契約更改の操作を揃える

基準main: `4adc38e7dc8d7b870dff7e1d5a3cb38b49f2be07`（PR #469マージ後）。2026-10-15の依頼に基づく既存FA画面内の改修。ゲーム処理・保存形式・画面IDは維持する。

## 目的・実装

候補を一覧で比較し、選んだ1人の条件を確認して契約できることを優先する。既存選手の契約更改と同じDES-01トークン、2列の選手／年俸行、選手見出し・成績・契約条件・主操作・補足の順序、44px操作、戻るラベルを使用する。

- 一覧に打率／本塁打または投球回／防御率と年俸を表示。既存`marketMetrics`を使い、実測0・欠測・算出不可を区別する。市場の保存成績を今季と断定しない。
- スマホと内容幅800px未満では一覧／詳細を切替、800px以上は選択後に並置する。画面幅が広くても狭い親の中で2列にしない。コンテナは本文だけに置き、確認ダイアログをビューポート全体に表示する。
- 「← 選手一覧に戻る」で絞り込み・並び順・一覧内スクロール・選手行の画面内位置・フォーカスを復元する。獲得により行が消えた場合は次の行、末尾、絞り込みの順に復帰する。復帰情報を新たな永続項目にしない。
- 詳細は年俸・年数・総額・契約後予算・配属予定と確認操作を優先し、FA宣言の理由、詳細／比較、補強ポイント・ルールを折り畳む。
- 編成画面へ埋め込む場合は親の予算概要を使用し、同じ概要を重ねない。契約後予算は個別条件と確認ダイアログに引き続き表示する。
- 自球団選手との比較は既存の2人比較を維持し、全員分のボタンから選手1人の選択＋追加／取消へ整理。数値ID 0を含め、文字列IDとは区別して扱う。
- 契約成立で確認ボタンが消える場合は選手見出しへフォーカスを戻す。確認を戻る／Escapeでは元の確認ボタンへ戻る。選手詳細・年度別成績・比較ダイアログとの往復を維持する。

## 維持する処理・対象経路

`HubFaTab`は編成内・旧独立オフシーズン・シーズン中の市場で共有されるため3経路を対象とする。国内FA・自由契約の固定年俸、1〜3年契約、外国人交渉・期限、育成の契約年数制約、支配下枠・一軍枠・外国人制限・ファーム配属、年俸×年数の先払い、確定時再検証、二重契約／二重支出防止を既存関数のまま保持する。

`faMarket.js`、engine、hook、保存キュー／形式、ナビID、依存、CI設定は変更しない。通常更改はFAと異なり残予算を即時控除しないことも維持する。獲得後の更改除外、移籍前成績、自球団への宣言残留、契約下書き・市場条件の保存は既存経路を使用する。OPSの丸め精度はFIX-S3へ分離する。

## 同一状態での変更前後

新しいUI-03C fixtureを基準mainと本ブランチの両方で使用。4候補、同一成績・年俸・予算で比較する。添付ZIPは旧版のため実装基準に使用していない。

| 幅 | 一覧の初期表示 | 選択した1人の条件 |
|---|---|---|
| 360 | [前](../validation/ui-03c/before-viewport-360.png) / [後](../validation/ui-03c/after-viewport-360.png) | [前](../validation/ui-03c/before-detail-360.png) / [後](../validation/ui-03c/after-detail-360.png) |
| 390 | [前](../validation/ui-03c/before-viewport-390.png) / [後](../validation/ui-03c/after-viewport-390.png) | [前](../validation/ui-03c/before-detail-390.png) / [後](../validation/ui-03c/after-detail-390.png) |
| 1440 | [前](../validation/ui-03c/before-viewport-1440.png) / [後](../validation/ui-03c/after-viewport-1440.png) | [前](../validation/ui-03c/before-detail-1440.png) / [後](../validation/ui-03c/after-detail-1440.png) |

確認ダイアログ: [360](../validation/ui-03c/confirmation-360.png) / [390](../validation/ui-03c/confirmation-390.png) / [1440](../validation/ui-03c/confirmation-1440.png)。再現スクリプトは`scripts/capture-fa-market.mjs`。画像の日本語はローカルNoto Sans CJK JPフォールバックで確認し、iPhoneの字形確認とは区別する。埋め込みfixtureの余白は親が提供する前提で0、実Appでは編成画面の左右余白を使用する。

## 検証

- 主要成績の一覧表示、共通の戻る操作と市場条件保持、埋め込み概要の重複除去、自球団選手の比較選択の4回帰は修正前REDを確認しGREEN。
- 契約成立後に確認操作が消え、フォーカスがbodyへ落ちる既存の問題もブラウザでREDを確認。成立後の選手見出しとShift+Tabで戻る操作への復帰を追加してGREEN。
- 既存のUnit期待は削除・skipせず維持し、戻るラベルと比較の新しい入口のみ更新。関連Unit／結合は7ファイル89件成功。年度更新失敗のテストは意図したエラー注入を行い成功している。
- Build成功（既存のchunk-size警告あり）。
- Chromium対象の画面幅360／390／760／761／1023／1024／1440で通常・長名・0・欠測・空・予算不足・一軍満員・自球団FA宣言を確認。44px操作、横はみ出し、確認のTab循環／Escape、フォーカス、契約可能／不可を検証。
- 内容幅500／799／800、長い一覧、選手選択／復帰・獲得による行の消失・隣の選手への復帰、外国人希望額受諾・2年先払い・期限、既存選手詳細2幅を検証。
- 実App360／390／1440で候補と既存選手の比較、3年契約の確認、二重確定防止、残予算を1回だけ控除、更改対象から除外、タブ往復、検索／並び順／年数と契約の保存・再開を確認。最終ソースで画面／共通詳細14件成功（38.4秒）と実App3件成功（59.3秒）、合計17件成功。selectの完全一致ラベルも明示し、元の保存・条件・予算の期待は維持した。

```sh
npx vitest run src/components/hub/HubFaTab.test.js src/components/offseasonFaFlow.test.js src/components/offseasonPlanning.test.js src/components/contractRenewalUI.test.js src/components/farmRenewalFlow.test.js src/hooks/useOffseason.resume.test.js src/hooks/useGameState.offseasonSave.test.js --maxWorkers=2 --minWorkers=1
npm run test:e2e -- progression.smoke.spec.js player-detail.spec.js --project=chromium --grep 'UI-03C|UI-02C shared planning' --workers=1 --retries=0
npm run build
```

独立read-onlyレビューでCritical／Importantの指摘なし。対象ソース・呼出経路・既存市場処理・トークン・テスト・3幅画像・diff checkを確認し、テスト全件の再実行は行っていない。最終headとCI結果はPR本文へ記録する。通常CIには既存の進行specへの登録でUI-03Cの回帰を含め、CI設定自体は変更しない。

## 限界・次工程

対象画面のWebKit実行はブラウザを取得できたが必要なOSライブラリがなく起動できず、依存導入も環境の権限制約で失敗したため未検証。iPhone実機、スクリーンリーダー、200%拡大も未検証。通常CIのWebKit保存回帰と対象FA画面のSafari検証を区別する。実Appは合成完了シーズンのfixtureであり、実複数年のバランスや全画面QAの完了を意味しない。

FIX-S3、ドラフト・経営のDES-01移行、CPU補強AIの残調査、長期検証・QA-01は別工程。
