# UI-03B: 契約更改の一覧・条件提示・返答

基準main: `081c3c558018acd44966792dd7043af0e30e0c97`（PR #467マージ済み）。添付ZIPは実装基準に使わない。
対象は契約更改の内部UIと、その独立経路の保存・復帰接続。未マージで引き渡す。

## 目的と採用した構成

各選手の成績と前年／要求年俸を比較し、提示額と年数を入力して、確認後の返答から次の対応へ進める。
DES-01の承認済み[360px](../design/des01/des01_contract_360.png)・[390px](../design/des01/des01_contract_390.png)・[1440px](../design/des01/des01_contract_1440.png)を参照。ネイビー・白・青、写真なし、44px操作を採用し、説明やカードを増やさない。

| 領域 | 表示・操作 |
|---|---|
| 概要 | 未解決／全対象・合意。独立画面には年俸総額の見込みと更改前比。埋め込みは親の年俸・予算を重複表示しない |
| 一覧 | 名前・ポジション・年齢・一軍／二軍／育成・状態、前年／要求または合意額と年数。FA取得までの長い説明は外し、取得済み資格を短く表示 |
| 個別 | 選手概要・今季の一軍成績 → 前年／要求 → 入力 → 減額制限内の下限・同意条件 → 前年差・交渉回数 → 提示 → 最新の返答 |
| 詳細 | 要求額の理由、能力・年度別成績、履歴、FAまでの目安、戦力外手続きは折り畳み。共通の交渉・数値説明は画面に1か所 |
| 一括 | 対象選択 → 基準額／割合／年数 → 下書き適用 → 対象別下書き → 確認 → 1回ずつ提示 → 結果。下書き適用では交渉しない |
| レイアウト | 表示領域の内容幅800px未満は一覧／詳細を切り替え。800px以上は選択時のみ並置。viewportだけで判定しない |
| 復帰 | フィルター・下書きを維持。窓と一覧のスクロール、選手行の画面内位置とフォーカスを復帰。行が消えた場合は近い行、最後の行、選択中フィルターへ戻す |

未合意・合意・再交渉待ち・減額制限の対応待ち・FA宣言・自由契約・戦力外の7状態を維持する。完了フィルターにも放出・宣言等の内訳が文字で残る。
減額制限超過を一律禁止せず、確認後に既存判定へ渡す。不同意には制限内の再提示と自由契約、再交渉待ちには再交渉を用意する。
未解決者がいれば終了できず、全員解決後に最終確認から次工程へ進む。成立済み条件の取り消しは追加しない。

## 既存機能・データとの対応

- `evaluateRenewalOffer`・`salaryCutRule`・`ikuseiContractYears`と既存の個別／一括共通処理を使用。受諾判定、回数、再交渉、最低保障、FA、CPU、予算の計算は変更しない。
- 年俸見込みは既存のsession集計。合意は`terms.salary`、未合意は前年年俸。下書きの`salary`を集計せず、FA宣言・自由契約・戦力外を除外する。FA用残予算とは別の年額。
- 主要成績の計算式・精度、CareerTableのデータ読取と年度別計算は維持。0・未記録を区別し、率の「—」は分母0または必要な記録なしと説明する。欠測の要求額は「未記録」、値を推測して確定表示しない。
- 個別確認は両経路で対象ID・年俸・年数のスナップショットを使用。個別／一括の確認は一度だけ消費し、確定時にも所有・当年未契約・pendingを再検証する。
- 選手の前年年俸・要求は更改sessionの記録を参照し、能力・今季成績は現在の同一ID選手を優先する。親更新・宣言残留・放出は既存`reconcileRenewalSession`で同期する。
- 既存の`plan.session`・`plan.renewalView`、`savedSession`・`savedView`、更新callbackとcompact処理を保持。開閉、フォーカス、一括のチェック、確認済み識別は永続化しない。
- 独立の`ContractRenewalRoute`に欠けていたsession／view接続を補い、既存ID`contract_renewal_phase`を保存・復帰対象へ登録。新しいroute／ナビIDや保存スキーマ・保存キューは作らない。有効なversion 1の既存編成planが保存の前提で、planのない旧経路に新規永続stateは生成しない。
- 埋め込みのタブ・保存表示・終了はUI-03Aの既存責務。独立は既存の更改最終確認と次工程を維持する。

## 変更ファイル

| ファイル | 変更 |
|---|---|
| `src/components/ContractRenewalPhaseScreen.jsx` | 構成、条件確認、親更新同期、表示フィルターと復帰、折り畳み |
| `src/calm-renewal.css` | 契約更改とダイアログだけをDES-01へ置換。親の内容幅による切替 |
| `src/components/screenRoutes/ContractRenewalRoute.jsx` | 既存planのsession／viewの保存・復元callback接続 |
| `src/engine/offseasonResume.js` | 既存の独立画面IDの保存／再開接続のみ。計算変更なし |
| 契約関連Unit、`contractRenewalDesign.test.js`、routeテスト | 既存期待を保ち、確認操作と新規回帰を追加 |
| `e2e/helpers/renewal-*-cases.js`、`e2e/fixtures/ui03b/` | 状態・幅・実Appの操作／保存／終了検証 |
| `e2e/progression.smoke.spec.js` | 新回帰を既存の通常CI経路へ登録。CI設定・既存監視・skipは維持 |
| `scripts/capture-ui-contract.mjs`、本書、`ROADMAP.md` | 比較と検証記録 |

## 同一入力の変更前後

6選手、前年年俸4,800万円・要求6,200万円、2026年、未合意を使用。個別画面は佐藤海斗を選択。変更前は上部のFA説明・成績・理由が提示操作より前に続いていた。変更後は入力と主操作を近接させ、360／390pxでも初期範囲に提示ボタンを表示する。
これは表示用fixtureであり、実Appの全ロスター保存検証とは区別する。モックの架空人数や成績を本番に固定しない。

| viewport | 一覧 | 選手選択後の全体 | 初期範囲 |
|---|---|---|---|
| 360×800 | [前](../validation/ui-03b/before-list-360.png) / [後](../validation/ui-03b/after-list-360.png) | [前](../validation/ui-03b/before-detail-360.png) / [後](../validation/ui-03b/after-detail-360.png) | [前](../validation/ui-03b/before-viewport-360.png) / [後](../validation/ui-03b/after-viewport-360.png) |
| 390×844 | [前](../validation/ui-03b/before-list-390.png) / [後](../validation/ui-03b/after-list-390.png) | [前](../validation/ui-03b/before-detail-390.png) / [後](../validation/ui-03b/after-detail-390.png) | [前](../validation/ui-03b/before-viewport-390.png) / [後](../validation/ui-03b/after-viewport-390.png) |
| 1440×900 | [前](../validation/ui-03b/before-list-1440.png) / [後](../validation/ui-03b/after-list-1440.png) | [前](../validation/ui-03b/before-detail-1440.png) / [後](../validation/ui-03b/after-detail-1440.png) | [前](../validation/ui-03b/before-viewport-1440.png) / [後](../validation/ui-03b/after-viewport-1440.png) |

実Appの解決済み台帳: 埋め込み [360](../validation/ui-03b/actual-embedded-360.png) / [390](../validation/ui-03b/actual-embedded-390.png) / [1024](../validation/ui-03b/actual-embedded-1024.png) / [1440](../validation/ui-03b/actual-embedded-1440.png)、独立 [390](../validation/ui-03b/actual-standalone-390.png) / [1440](../validation/ui-03b/actual-standalone-1440.png)。

## ローカル検証と独立レビュー

開始時の関連4ファイル45件は成功。追加動作は修正前REDを確認して実装した。
最終関連Unit／結合は11ファイル117件成功（契約UI・入力・一括・二軍・編成・route・契約ルール・FA・保存・再開）。

```sh
npx vitest run src/components/contractRenewalDesign.test.js src/components/contractRenewalUI.test.js src/components/salaryRenewalFlow.test.js src/components/farmRenewalFlow.test.js src/components/offseasonPlanning.test.js src/components/screenRoutes/ContractRenewalRoute.test.js src/engine/__tests__/contract.test.js src/engine/__tests__/renewalRules.test.js src/hooks/useGameState.offseasonSave.test.js src/hooks/useOffseason.resume.test.js src/engine/__tests__/faDeclaration.test.js
npm run test:e2e -- contract-renewal.spec.js progression.smoke.spec.js --project=chromium --grep 'UI-03B|mobile negotiation|release dialog' --workers=1 --retries=0
```

Chromiumの対象20件が成功。その後の独立経路の親更新修正は両経路のブラウザ2件で成功確認。年度別成績の展開・狭い親と1440pxの表示も追加検証し、同一入力の年度・打席・打率・本塁打・打点と開閉を確認。新回帰は通常CIで全件実行する。
7幅（360／390／760／761／1023／1024／1440）で通常・長名・空・欠測・0・合意・再交渉待ち・減額制限の対応待ち・選択不整合を検証。横はみ出しなし、44px操作、入力、フィルター、確認、合意、一括下書きと実提示、終了を確認。
799／800pxの親内容幅境界、500pxの狭い埋め込み、28行からの連続選択・復帰、行が消える場合、選択中の幅変更、Tab／Shift+Tab／Escapeとフォーカス復帰も検証する。

実Appは埋め込み360／390／1024／1440pxと独立390／1440px。既存の完了シーズンfixtureを実保存APIで読み込み、実際のハンドラーと保存キュー・ロードを使用する。下書き保存／再読込、未記録の新規stateを作らないこと、全7状態と履歴／回数、二軍ID 0の2年契約と所属維持、育成の年数上限、通常更改で予算が減らないこと、タブ往復、未解決時の終了拒否、全員解決後の最終確認と次画面を確認。保存前後・再読込後のsessionも照合した。完了シーズンは制御fixtureであり、実1年・複数年プレイの完成認定ではない。

独立のread-onlyレビューで次を修正した。

1. 確認中に親が対象を合意／放出へ更新すると、no-op提示後にロックが残る。個別／一括・両経路の4回帰でRED→GREEN。確認の一度だけの消費と再検証を追加。
2. 同じ親更新でダイアログ外の選手見出しへフォーカスが移る。guardを外したブラウザ回帰でRED、修正後に両経路GREEN。元の操作が消えた場合の代替復帰も確認。
3. containerと固定ダイアログの干渉疑義は実Chromiumで再現せず、viewport全体の被覆とEscape復帰を回帰へ追加。不要なportal変更はしない。

最終再レビューでCritical／Importantの残件なし。既存テストは確認／折り畳みの入口を追加しただけで、元の数値・保存・二重操作・FA等の期待を弱めない。

## CI結果の記録

通常CIのBuild・全Unit／結合（負荷／物理を含む）・中核E2E・保存／再開・契約／財務・最終ゲートを最終headで確認する。結果は[UI-03BのPR](https://github.com/shotaro-hue/baseball-manager/pulls?q=is%3Apr+head%3Aui%2F03b-contract-renewal)本文に、head SHA・Actions run URL・各jobの結果として追記する。同じcommitで成功した全セットをローカルで重複実行しない。未実行・失敗・待機を成功として記録しない。

## 限界とUI-03Cへの引き継ぎ

この画面のローカルWebKitはブラウザを取得したがOSライブラリが不足し、導入が実行環境の権限制約で失敗したため未検証。iPhone実機、スクリーンリーダー、200%拡大も未検証。通常CIのWebKit保存回帰が成功しても、この画面のSafari検証とは区別する。
古いplanなしの独立経路に新しい保存モデルを導入しない。FA・CPU・財務・成績の丸め精度などのゲーム処理は本工程で変更しない。
FIX-S3向けの再現記録: 表示fixtureの佐藤海斗（AB450・H129・D25・T3・HR14・BB40・HBP5・SF5）で、主要成績OPSは0.797、CareerTableの2026年行は0.800、通算行は0.797。既存の`saberBatter()`がOPSを`r2`で丸め、年度行がその戻り値を小数3桁で表示するため。主要表示と通算は元の値から算出する。両処理は今回変更しておらず、精度統一は独立FIX-S3へ分離する。
UI-03Cでは、FA契約の年俸×年数先払い、残予算と通常更改年俸の区別、宣言残留後のsession同期、狭い親内容幅、タブ往復と保存表示、条件確認・不可逆操作・フォーカス復帰を同じ観点で検証する。ドラフト・経営・QA-01は未完了のまま維持する。
