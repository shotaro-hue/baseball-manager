# FIX-CORE-01 — 信頼性改善

作成日: 2026-10-21。基準main `305e87149247cf5d886dcc0d0c4d59fa6e3df485`、#488マージ済み。着手時のGitHub照会でopen PRは0件。添付ZIPは旧ソースのため実装には使わず、GitHubから取得した最新mainを使用した。

## 目的・対象

正常な保存への入口を失わず、回答が一度だけゲームに反映され、保存済み移籍履歴が画面に届く状態にする。FIX-CORE-01だけを実装し、外部バックアップ・UI刷新・バランス変更は含めない。mainへのpush、マージ、自動マージは行わない。

## 原因と最小再現

| 不具合 | 原因・修正前の再現 | 修正 |
|---|---|---|
| A: 保存があるのに再開できない | hasSaveは主保存/バックアップの有無を調べるが、TitleScreenは別キーのgetSaveMetaがtruthyのときだけ再開ボタンを描画。保存成功後にメタだけ消すとボタンが消える。構造不正なJSONでは表示が欠けたりReactが例外を出す | saveExistsで入口を描画。メタが欠損/不正なら「保存データあり・詳細未取得」。メタは小さなJSONの型だけ検査し、タイトルでは保存本体/IndexedDB履歴をロードしない |
| B: 同じ会見の効果が重複する | NewsTabのローカルansweredと選択オブジェクトが保存ニュースから独立。handleInterviewはID/種別/answeredを確認せず球団を更新。人気50/モラル60から+5/+7と-3/+2を同じIDへ続けると52/69になる | 既存news stateを既存gameStateReducerへ移し、現在のニュースと球団を一つの純粋な遷移で更新。登録された選択肢・ID/種別・answered・球団/セーブIDを再検査。同じバッチの2回目はno-op。UIはIDから最新ニュースを引き直す |
| C: 移籍トラッカーが空 | HubContentRouterはseasonHistoryを渡すがNewsTabはtransfersを受け取る。正しい移籍行を保存しても空表示になる | gs.getSeasonHistory().transfersを渡す。既存セレクター、年度フィルター、空表示を利用 |

## 保存・ゲーム仕様の境界

- 保存形式・バージョン・保存キー・世代マニフェスト・回転/復旧処理は変更しない。タイトルでの自動削除、バックアップの書換え、メタの自動再生成はない。ブラウザ検証で、従来のloadGame失敗通知がタイトルでは描画されないことも確認したため、既存notifの警告をAppScreenRouter→TitleScreenのalertへ接続した。新しい状態や失敗処理は追加しない。
- hasSaveは候補の存在判定であり、保存が正常だという判定ではない。全候補が破損していても読み込み時の検証へ接続し、既存の「復旧できませんでした」を表示する。破損を正常と認定しない。
- 記者会見は既存の選択肢と増減値、従来の`||50`/`||60`既定値、0〜100制限、一軍選手だけへのモラル反映を維持。二軍や他球団には加算しない。生成条件は変更しない。
- 新しい回答内容フィールドは保存しない。既存のansweredのみを正本にするため、新旧どちらも回答内容を復元できない会見は「回答済み」と表示し、内容/効果を推測しない。
- 永続状態の追加やイベント購読はない。newsを別useStateから既存reducerへ移し、setNews(value/updater)・hydrate・保存payloadの契約を維持する。純粋なreducer内で通知や保存を実行しない。独立レビューで、reducerが拒否しても古いcallbackが成功通知/dirty/progress更新を行う問題と、同じsaveIdの再読込後に古いcallbackが適用できる問題を追加再現した。既存rosterCommandRefの同期スナップショットを再利用して受理を先に判定し、既存progressSessionでロード世代を検査する。ニュースsetter/hydrateも同じスナップショットを同期し、通知・dirty・progressを受理時だけ更新する。新しいref/stateは増やさない。
- トレード・履歴生成・CPU編成、契約/FA/スカウト、#487/#488の一覧/CSS/幅判定は変更しない。

## RED → GREEN

| 検証 | 修正前 | 修正後 |
|---|---|---|
| TitleScreen.resume | 13件中11件失敗。メタなし/構造不正/書込失敗/バックアップのみで入口消失、構造不正の描画例外 | 13件成功。既存初期化7件と合わせ20件成功 |
| タイトルのロード失敗通知 | AppScreenRouter経由でalertなしのRED（1件） | 既存警告を渡し、resume/初期化を合わせ21件成功 |
| useGameState.interview + NewsTab | 16件中13件失敗。同一IDの重複効果、無効ID/対象外/回答済み/不正選択肢による更新、nullの例外、保存再開で再回答、古い選択表示 | 16件成功。既存初期化/保存結果/永続ストアを合わせ38件成功 |
| HubContentRouter.news | 2件中1件失敗。保存移籍が描画されない | 2件成功。現在/過去年/全年度・履歴なしを確認 |

初回の失敗ログと要約は[red-summary.txt](./red-summary.txt)を参照。期待値を弱める修正やskip追加はない。

## 検証範囲と実行方法

```sh
npx vitest run src/components/TitleScreen.resume.test.js src/components/TitleScreen.initialization.test.js
npx vitest run src/hooks/useGameState.interview.test.js src/components/tabs/NewsTab.test.js src/hooks/useGameState.initialization.test.js src/hooks/useGameState.saveStatus.test.js src/state/persistentDataStore.test.js
npx vitest run src/components/hub/HubContentRouter.news.test.js
npm run test:e2e -- core-reliability.spec.js --workers=1 --retries=0
npm run build
```

`core-reliability.spec.js`の14シナリオをChromium/WebKitへ展開する。メタ正常/なし/壊れたJSON/構造不正/書込失敗、主保存破損/欠損・第1/第2バックアップ復旧、候補なし、全候補破損を検査。保存候補の未変更もassertする。

会見・移籍は360/390/1440pxで、二連続DOMイベント、一覧からの再選択、通知のニュース/受信箱往復、主ナビ離脱、実saveGame/loadGameの再開後、他球団/二軍不変、移籍の年度/空表示を検査する。連続コマンドをReactの描画前に呼ぶ回帰は実hookテストでも直接検査する。

関連11ファイル73件のVitestが成功。独立レビューの追加3ケースをRED→GREENで修正し、hook/ニュース/編成/初期化/保存結果/永続ストアの6ファイル46件も成功。production buildは成功（既存の500kB超chunk警告あり）。最終headの全単体/統合・通常CI E2E・ジョブURL/件数はPR本文を正本とし、CI待ちを成功扱いにしない。Chromium初回は12/14成功。全候補破損の失敗通知の未描画は上記修正。第2バックアップ用fixtureは5分の回転抑制を考慮せず保存していたため、既存の回転時刻マーカーだけをリセットして準備を修正し、バックアップ自体の生成・検証・復旧は実処理を維持した。修正後、第2バックアップ復旧と失敗通知のブラウザ検証も成功。誤ったマーカー名を使った準備の再失敗も記録に保持し、製品の回転ルールは変更していない。WebKitの初期実行はOSライブラリ不足で起動前に失敗し、展開済みの実ライブラリを使うローカル起動ラッパーで検証を進めた。公式CIは標準のPlaywright/OS環境を使用する。ローカルWebKitの最終14シナリオはすべて成功（再試行0）。

実iPhone Safariでのタッチ/スワイプ/表示速度、別端末の実ユーザーセーブ、10〜20年相当の外部バックアップは今回未検証。WebKit E2Eを実機検証と表現しない。

## 後続工程（今回コード未着手）

1. **SAVE-01**: 保存本体とIndexedDB世代データの対応を維持した外部バックアップ/復元。球団/選手/契約/ドラフト/二軍/通算/試合履歴と打球アーカイブ等の範囲を棚卸しする。ファイル形式/容量・iPhone Safari入出力・インポート前スキーマ検証・失敗時の既存セーブ保護を設計する。新しい世代への段階投入、検証後の参照切替と途中失敗の復旧等を比較し、現行保存への直接上書きだけの方式は採らない。10〜20年相当の容量/処理時間・別端末/別ブラウザ復元を受け入れ条件にする。設計の比較と承認後に別PRで実装する。
2. **QA-04A**: 新規・通常/手動/まとめシム・結果/一軍二軍成績・契約/FA/取引/スカウト・オフシーズン/ドラフト・年度更新/再開・CPU編成/支配下・保存失敗/復旧/競合の旅程を検証。通常CI外のE2Eについて必要性/重複/所要時間を評価し、重要な品質ゲートを選ぶ。全件常時実行自体を目的にしない。
3. **UI-04D**: 正式なansweredと復元状態を前提に、通知の未読/要対応/対応済み、ニュース一覧/詳細/回答、球団史/OB検索、実在する設定をDES-01へ移行。スマホの一覧→詳細→元位置、PCの必要な並列表示を設計する。ゲームルール/保存形式をデザイン目的で変えない。
4. **QA-04B**: 360/390/760/761/799/800/1023/1024/1440px、Chromium/WebKit、キーボード、保存/復帰を検証。実iPhone Safariのタッチ/スクロール/速度は別途記録する。

FIX-CORE-01のPR提出・同一head CI確認後は、ユーザーの独立レビューとマージ判断を待つ。ここから後続コードを自動で開始しない。

## 独立レビュー

ブロッカー2件を追加3テストで再現・修正した。2回目の無効な回答の増減値を通知しないこと、dirty/progressが1回だけ増えること、同じsaveIdの再読込で古いcallbackを無効化すること、Reactの描画前にnews/teamsが変わった場合の拒否を確認。既存の一般的な不正記事payload検証、記録がない年度のメニュー追加、旧ニュースのレイアウト/キーボードは後続のSAVE-01/QA-04A/UI-04D/QA-04Bの範囲とし、今回に混ぜない。実iPhoneと最終CIは独立レビューの対象外であり、CI結果を別途照合する。

## 同一fixtureの画面比較

最新mainと修正後を同じ保存球団・年度・回答済みニュース/移籍でChromium撮影。日本語fallbackフォントを用意し、Webフォント取得不可による文字欠落の初回画像は提出版へ含めない。全3幅で、メタなしの再開ボタン0→1、回答済み会見の回答待ち1→0・選択肢非表示、移籍行0→1をDOMでも照合した。[計測値](./capture-summary.json)。レイアウト刷新や実機検証の証拠ではない。

| 幅 | メタなしタイトル | 保存済み会見・移籍 |
|---|---|---|
| 360px | [修正前](./before-title-360.jpg) / [修正後](./after-title-360.jpg) | [修正前](./before-news-360.jpg) / [修正後](./after-news-360.jpg) |
| 390px | [修正前](./before-title-390.jpg) / [修正後](./after-title-390.jpg) | [修正前](./before-news-390.jpg) / [修正後](./after-news-390.jpg) |
| 1440px | [修正前](./before-title-1440.jpg) / [修正後](./after-title-1440.jpg) | [修正前](./before-news-1440.jpg) / [修正後](./after-news-1440.jpg) |
