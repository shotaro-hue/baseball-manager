# UI-04C-FIX2 検証記録

2026-10-21。基準main: `a1d07b803ea1a3b2f167a8612d7a57dfcf2142f4`（#487マージ済み）。添付ZIPは使用していない。[計画・対象と非対象](../../superpowers/plans/2026-10-21-ui-04c-fix2.md)。提出headとその全CIジョブの最終結果はPR本文を正とする。

## 再現と根本原因

#487では`useMobileDetail()`がviewportの760px以下を判定し、FAのCSSは`.fa-body`のcontent幅800px以上で一覧と詳細を並べていた。単位となる領域と境界値の両方が異なり、狭い表示で一覧を隠してもviewportが広ければ選手行が残った。

追加E2Eを修正前のmainに適用し、Chromiumで以下の2件をREDにした。[失敗の原文](./red-evidence.json)。表示は非表示でもDOMには行が存在していた。

| 条件 | 条件適用後の候補数 | 詳細中の期待行数 | 修正前の実測 |
|---|---:|---:|---:|
| viewport780px、実際のHub FA画面 | 100 | 0 | 100 |
| viewport1440px、オフシーズン埋め込み799px | 30 | 0 | 30 |

## 最小修正と方式の比較

viewport基準への統一では、広い画面に埋め込まれた狭いFA領域を正しく扱えないため採用しない。`HubFaTab.jsx`の`.fa-body`をResizeObserverで観測し、**content幅800px以上**という一つのフラグをCSSの`fa-split`とPlayerListの生成条件で共有する。CSSに別の閾値を残さない。

初回はlayout effectで幅を読み、800px未満で詳細表示中は行を生成しない。以後は領域幅変更にだけ追従する。初期ロード中で`myTeam`がnullの場合は、取得後に観測を開始する。アンマウント時はobserverを解除する。スクロール購読・仮想スクロール・保存stateは増やしていない。

実装の変更は`src/components/hub/HubFaTab.jsx`と`src/calm-fa.css`のみ。`PlayerList.jsx`の共有760px判定と契約/トレード/スカウトの仕様は維持。選択・検索・ソート・位置/フォーカス復帰・交渉・金額・確定の既存処理は変更していない。

## 回帰範囲と結果

`e2e/management-lists.spec.js`を既存のChromium/mobile-webkit・通常CI枠で拡張した。実行結果の集計は`browser-results.json`、提出head全体のCIはPR本文で追跡する。リトライはすべて0。初回失敗と再確認は下に分けて記す。

- 実Hub: viewport360/390/760/761/780/799/800/801/1023/1024/1440px。240人→検索/年俸ソート後100人をID・順序まで検査。深い70番目の行から選択/復帰。詳細中の一覧可視性とDOM行数を実幅から確認し、検索/ソート・全ID・フォーカス・復帰位置4px未満を維持。
- 実埋め込み: viewport1440px、コンテナ500/799/799.5/800/801px。境界の両側と小数幅を確認。801→799.5→800→500→801pxとviewportを変えずに領域だけ変更し、選択IDと表示全行を保持。
- 市場からの削除/国内FAの契約確定後は隣接候補に復帰。検索/年俸順、位置4px未満を保持。取消時予算不変、二重確定を1回に制限。780pxで外国人交渉・2年/総額2,400万円の確定と残予算を確認。
- 実Appのオフシーズン編成で選択/3年/検索/ソートを保存し、再読込から詳細へ復帰。戻ると行へフォーカスし、球団データ不変を確認。
- 読込待ち→球団取得、通知へ移動して保持済みFAを再表示、デスクトップの一覧/詳細同時表示を確認。
- 横はみ出し、意図しない内部縦スクロールなし。既存の契約・トレード・スカウト・通知・比較・保存回帰も維持。

### 初回の失敗・調査記録

- 元不具合の2件は期待0行に対して100/30行というRED。修正後、同じ期待値でGREEN。
- 独立レビューは実装上のブロッカーなし。追加観点として初期nullと保持画面の再表示を指摘され、実ブラウザのケースを追加した。
- 追加の保持画面テストは当初、メインナビの再訪で一時画面履歴を破棄していた。`useHubNavigation.navigate/reset`の既存仕様と照合し、実際に画面を保持する「通知→元の画面へ戻る」へテストの操作経路を修正。ゲーム実装や期待値は変更していない。
- 初回ローカル同時実行中、保存fixtureの準備/再読込でタイムアウトした。Chromiumの対象再確認では元の金額・保存・フォーカス条件を維持して成功。タイムアウトの原因を製品コードの不具合と断定しない。ローカルWebKit WPEではcontext終了時のタイムアウトも観測した。これらを成功件数に含めず、最終の対象結果と公式ランタイムのCIを別に確認する。
- ローカルWebKitはOS依存不足のため、Playwright配布のWPE MiniBrowserと既存のローカル共有ライブラリを使用した。通常CIは`playwright install --with-deps chromium webkit`による公式環境で検証する。ローカル実行用設定・launcherは製品リポジトリへ追加しない。

## #487との同一データ比較

production build、Chromium141、CPU4倍、所属70人/各球団・FA240人の同一fixture。390pxは3試行、360/780/1440pxは各1試行。前後ともローカルのNoto Sans JPを使用し、Google Fontsへのアクセスを遮断して字形をそろえた。初回の日本語フォント未導入データは採用せず、環境を整えた後に前後を計測する。

[修正前](./before-metrics.json) / [修正後](./after-metrics.json)。計測値の要約は`comparison-summary.json`。表示/詳細応答は操作から2描画フレームまでのドライバ往復を含み、INPではない。スクロールframeはrAF間隔で、合成mouse wheelが実際に動いたことを確認する。ページ全体heapと当該コンポーネント単独のメモリは区別する。試行数の少ない測定値から一般の端末での速度を保証しない。

再計測コマンド（baselineは#487のproduction dist）:

```bash
UI04C_BASELINE=487 UI04C_WIDTHS=360,390,780,1440 UI04C_TABS=fa UI04C_OUTPUT_DIR=docs/validation/ui-04c-fix2 node scripts/measure-ui04c-fix.mjs before /absolute/before-dist
UI04C_WIDTHS=360,390,780,1440 UI04C_TABS=fa UI04C_OUTPUT_DIR=docs/validation/ui-04c-fix2 node scripts/measure-ui04c-fix.mjs after /absolute/after-dist
```

`measure-ui04c-fix.mjs`へ対象幅/画面/出力先と#487 baselineを指定する引数相当の環境変数を追加した。指定しない既存#486比較の動作は保持する。390px各初回のPerformance traceは`before-fa-trace.json.gz`/`after-fa-trace.json.gz`。

| 幅 | 修正前の一覧/詳細 | 修正後の一覧/詳細 |
|---|---|---|
| 360 | [一覧](./before-fa-360.png)・[詳細](./before-fa-detail-360.png) | [一覧](./after-fa-360.png)・[詳細](./after-fa-detail-360.png) |
| 390 | [一覧](./before-fa-390.png)・[詳細](./before-fa-detail-390.png) | [一覧](./after-fa-390.png)・[詳細](./after-fa-detail-390.png) |
| 1440 | [一覧](./before-fa-1440.png)・[詳細](./before-fa-detail-1440.png) | [一覧](./after-fa-1440.png)・[詳細](./after-fa-detail-1440.png) |

## 実iPhone Safari: 未確認

Chromiumの合成スクロール、WebKitのE2E、実iPhoneで指を動かした際の滑らかさは別の確認である。今回、実iPhoneにはアクセスしていない。QA-04で以下を確認し、端末/OS・ブラウザ・データ量・結果を追記する。

1. 契約・トレード・スカウト・FAの4画面に多人数のデータを用意する。
2. 一覧を連続して上下にスワイプし、引っ掛かりや指の動きへの遅れを確認する。
3. 画面下部の選手を開き、戻った位置とフォーカスを確認する。
4. 検索・絞り込みを連続操作し、入力と一覧の追従を確認する。
5. FAの詳細中に一覧が残らず、戻ると全候補と条件を保持することを確認する。

UI-04Dの機能・要件への変更はない。FIX2のレビュー/マージ後、最新mainから次の独立PRへ進む。

## 提出前に確認できた結果

- 関連Vitest: 3ファイル40件成功。ビルド成功（既存chunk警告のみ）。
- Chromium: 関連2specの初回37/38件成功。保存fixture準備で停止したトレードと追加の保存/観測ライフサイクルを対象再確認し、3件成功。異なる40ケースをすべて確認。
- WebKit WPE: 新規FA回帰22件は境界761pxの対象再確認を含め成功。保存/ライフサイクル2件も成功。既存回帰を含めた一括runの初回context終了タイムアウトは上記の通り保持し、全体結果は提出headの公式WebKit CIで確認する。
- 前後各6測定の一覧DOMは1,005。詳細DOMは360/390pxで80、1440pxで1,041を維持し、780pxは1,041→80。全幅の復帰誤差0px、合成スクロールframe p95は16.7〜16.8ms、観測区間Long Task0。
- 390pxの3試行中央値は一覧表示241→279ms、詳細144→105ms。1440pxの単発詳細は200→220ms。他の測定も含む生値を保持し、速度の改善を一律には主張しない。DOM・フレーム・heapに持続的な悪化は観測していない。
- 360/390/1440pxの画像を目視し、モバイル詳細とデスクトップ2列の構成維持を確認した。
