# オフシーズン編成: 方針一覧と契約更改の統合

基準main: `f9135fe2c230104d76d854b1b4bfbeb05c190ae1`（#468マージ後）。2026-10-15にユーザーが承認した構成変更。UI-03A/Bのフォローアップであり、UI-03CのFA画面刷新ではない。

## 目的と構成

全員の「残留予定／交渉予定」を指定する長い表をなくし、選手を比較し、交渉か放出候補を選ぶ場所を1つにする。DES-01の配色・文字・44px操作を維持する。

- 上部は人数・年俸見込み・補強の残予算・未解決人数の4指標。スクロール用の重複数値と、埋め込み更改の重複概要を除去。保存状態・再試行、3つの既存タブは維持。
- 市場を開く前から同じ選手一覧を使用。全員／未合意／放出候補／完了で絞り込める。継続契約・獲得済み選手も表示し、名前・所属・状態・主要成績・年俸を比較する。
- 選手詳細で契約条件を入力するか、取り消せる放出候補を指定する。候補中は提示せず、取消後は元の下書き・交渉状態へ戻る。市場を開く前の「交渉を始める」は既存stageをopenにするだけで、オファーを実行しない。
- 放出候補の全員表は置かず、「放出候補 ○人（未確定）」に候補だけを折り畳む。取消、選手への移動、既存の即時放出確認を維持する。編成終了でも候補の名前と人数・年俸見込みを最終確認する。
- PCは既存の内容幅800pxの境界で一覧／個別を並置。スマホは選択した1人に切り替え、フィルター・スクロール・フォーカスを戻す。選手詳細モーダル、年度別成績、FA・減額制限・再交渉の詳細も保持する。

## データと既存機能

ゲーム処理・成績計算・保存形式・キュー・ナビIDは変更しない。`planningSummary`、`renewalEligible`、提示・放出・FA・終了ハンドラーは既存のまま。

`plan.intents`のreleaseが候補、negotiateが取消後の状態。旧retain／negotiateの保存値は読み込め、どちらも契約を成立させず交渉可能とする。候補だけを既存の人数・年俸見込みから除外し、所属・実年俸・残予算は変えない。候補は一括選択・下書き対象・実提示から除外し、確認中に候補へ変わった場合にも確定時に再検証する。

編成の更改対象は既存の`renewalEligible`に一致する全所属選手を参照し、要求額のID表だけで対象を落とさない。未合意の要求額生成・判定は既存処理を使用する。継続契約と当年契約済みの追加行は表示専用で、更改sessionのcohortへ追加しない。開閉・候補操作後のフォーカス等を永続項目にしない。下書き・履歴・選択・フィルターは既存session／renewalViewへ保存する。

獲得済みの追加行は「前年年俸」や未交渉の要求額を作らず、現在の契約年俸・年数を表示する。当年の外部移籍は既存の年度末処理と同じ`faArchivedYear`・`contractSignedYear`・出身球団の条件で判断し、保存された`marketLastStats`を主要成績に使用して「移籍前」と明記。それ以外は現在の所属での記録を使用する。過年度のmarketLastStatsを今季へ流用せず、live statsやCareerTableの読み取り・計算を変更しない。

## 変更前後

最新mainの同一fixture、6選手・2026年・候補1人・同一年俸と保存状態を使用。変更前は旧方針表、変更後は統合一覧。ユーザーの実セーブや添付ZIPを実装基準にはしない。

| 幅 | 初期表示 | 全体 |
|---|---|---|
| 360 | [前](../validation/planning-roster/before-viewport-360.png) / [後](../validation/planning-roster/after-viewport-360.png) | [前](../validation/planning-roster/before-360.png) / [後](../validation/planning-roster/after-360.png) |
| 390 | [前](../validation/planning-roster/before-viewport-390.png) / [後](../validation/planning-roster/after-viewport-390.png) | [前](../validation/planning-roster/before-390.png) / [後](../validation/planning-roster/after-390.png) |
| 1440 | [前](../validation/planning-roster/before-viewport-1440.png) / [後](../validation/planning-roster/after-viewport-1440.png) | [前](../validation/planning-roster/before-1440.png) / [後](../validation/planning-roster/after-1440.png) |

交渉時の全体: [360](../validation/planning-roster/negotiation-360.png) / [390](../validation/planning-roster/negotiation-390.png) / [1440](../validation/planning-roster/negotiation-1440.png)。再現スクリプトは`scripts/capture-planning-roster.mjs`。beforeには基準mainの読み取り用checkoutを指定する。

## 検証とレビュー

変更ファイルは`OffseasonPlanningScreen.jsx`・`ContractRenewalPhaseScreen.jsx`と両画面の局所CSS、編成／二軍Unit、既存UI-03Aのfixture・ブラウザ操作、進行E2Eの開始ボタン参照、比較スクリプトと画像・本書・ROADMAP。engine・hook・依存・CI設定は変更していない。

関連Unit／結合9ファイル84件成功。統合一覧・候補の指定取消・一括除外・直接交渉開始・放出後所属表示の5回帰は修正前REDを確認。獲得済み契約表示と移籍前成績、過年度の市場記録を持つシーズン中延長の2回帰もRED→GREENを確認した。

```sh
npx vitest run src/components/offseasonPlanning.test.js src/components/contractRenewalDesign.test.js src/components/contractRenewalUI.test.js src/components/salaryRenewalFlow.test.js src/components/farmRenewalFlow.test.js src/components/offseasonFaFlow.test.js src/components/screenRoutes/ContractRenewalRoute.test.js src/hooks/useGameState.offseasonSave.test.js src/hooks/useOffseason.resume.test.js
npm run test:e2e -- progression.smoke.spec.js --project=chromium --grep 'UI-03A planning states and actions|UI-03A actual App|UI-03B actual App|UI-03B long-list|unified roster keyboard' --workers=1 --retries=0
```

ブラウザの記録・最終headのCI URLと各job結果はPR本文に記録する。CI全セットの同一commitでの重複実行は行わない。

ローカルChromiumの対象19件が通しで成功（4.9分）。指定7幅×15状態、実App3幅の候補保存・取消・実放出・保存失敗／再試行・補強・タブ往復、既存更改の長い一覧復帰3幅、実Appの独立2幅／埋め込み4幅の全7状態・保存再開・終了を含む。追加のキーボード開始・候補取消・再交渉／減額制限待ちでの復帰も成功（重複を除く20シナリオ）。最終の獲得後契約・移籍前成績の追加確認は実App390pxで再検証して成功した。

独立read-onlyレビューの指摘を修正した。

1. 候補指定・取消・交渉開始で操作が消え、フォーカスがbodyへ落ちる。ブラウザでREDを確認し、候補取消・入力欄・再交渉時の見出し・市場タブへの復帰を追加してGREEN。ダイアログ中のフォーカスを奪わない。
2. 獲得済みの新年俸を前年年俸として表示し、更改用の空欄・返答が出る。現在の契約だけを表示する。
3. 移籍後の0成績と、過年度の市場記録を今季として表示する。既存の当年移籍条件を使用し、記録の出所を表示する。

最終再レビューでImportantの残件なし。前回のセルフレビューで確認した二軍選手の放出後「一軍」誤表示も、所属名簿にいない場合は「所属なし」とする表示修正と回帰で対応した。

## 限界・次工程

対象画面のSafari/WebKit・iPhone実機・スクリーンリーダー・200%拡大は未検証。通常CIのWebKit保存回帰と対象画面のSafari検証は区別する。合成完了シーズンの実App保存／操作は実複数年プレイの認定ではない。

添付画像の「保存失敗」の個別原因はセーブ・実行環境がないため特定していない。既存の失敗表示・前回セーブ保持・再試行を回帰検証し、保存失敗を成功表示で隠す変更は行わない。

次のUI-03Cは補強市場の内部UI。通常更改の年額とFAの先払い・残予算、宣言残留、獲得後の契約と成績の出所、保存・タブ往復を維持する。ドラフト・経営・QA-01は未完了。
