# UI-04A-FIX 検証・引継ぎ

実施日: 2026-10-19。基準main `f7dd9d8ac6575c7b4a899dafbd49ef7026096ee7`（[#482](https://github.com/shotaro-hue/baseball-manager/pull/482)マージ済み）。[全体要件・後続工程](../../implementation/ui-04.md)／[実装計画](../../superpowers/plans/2026-10-19-ui-04a-fix.md)。提出headと同一headのCI確定結果はPR本文に記載する。

## 再現と原因

財務→通知→ニュース→ヘッダー通知→ニュース→戻るを、修正前mainのChromium・mobile-webkitで実行。両方とも財務を期待したassertionが`Received: news`で失敗した。潜在問題ではなく実ブラウザで再現した不具合。

`open`はtab IDの一致で祖先を判定し、`replace`は現在の末尾だけを変更していた。受信箱とニュースの同じ通知訪問を別スロットとして積み直すため、`finance,news,mailbox`を`finance,news,news`へ置換していた。[実履歴ログ](./history-before.json)では3回の反復で履歴長が3→4→5と増え、ニュースが連続した。既存の1回だけの通知切替・同一tabへの祖先再訪テストでは検出しない条件だった。

## 変更と影響

- `hubNavigation.navigationSlot`で受信箱/ニュースを同じ訪問に対応付け、hookの`visit`をopen/replaceで共有。同一スロットの切替では履歴を増やさず、祖先再訪は実履歴を遡って要求サブタブをそのエントリーへ反映する。
- 主ナビと外部tab変更で一時セッションを区切る。年度/セーブ/球団切替でも初期化し、旧履歴を踏んだ場合は現在のルートへ再基準化する。ドキュメントごとのIDを含め、再読込前の履歴を同一セッションとして再利用しない。
- HubShell本文のkeyをsave IDからsave/球団/年度のscopeへ揃える。通知往復の未確定トレード下書きは維持し、別年度に同じトレード画面を表示したときは前年度の下書きをクリアする。
- URLは引き続きネイティブの`#hub/<tab>`。productionへの`pushState`導入、ゲームロジック・保存スキーマ・取引・試合/財務計算の変更なし。履歴の物理エントリー削除は行わない。

## RED→GREENと回帰

| 確認 | 結果・範囲 |
|---|---|
| 変更前ベースライン | 既存hook/Shell 2ファイル7件成功 |
| 通知反復の再現 | Chromium/WebKitともRED→GREEN。戻る後に財務、進む後にニュース、再度戻った後の再読込成功。反復3回でも通知の追加履歴は1つ |
| hook | 通知サブタブ・祖先への指定サブタブ再訪・主ナビ・scope・境界越えのRED→GREEN。既存のFA→通知→取引→通知→戻るを維持 |
| 非同期の祖先再訪 | 独立レビューで通知の同時連打による二重history.goを実Chromiumで再現。遅延popstateのhookと既存FAブラウザ旅程を強化してREDを確認。移動完了まで再訪要求をまとめ、対象スロットを確認して保留を解除 |
| 本文の年度境界 | 年度変更後に旧下書きが残るREDを確認。本文key変更でGREEN。セーブ切替時のクリアと同一セッション通知往復の保持も成功 |
| 関連Vitest | 8ファイル58件成功。ナビ/試合進行Shell/受信箱/トレード/財務/既存取引・ポスティングhook |
| ビルド | `npm run build`成功。既存の500KB超chunk警告あり |
| 未解決提案の既読化 | 未読→既読で要対応件数を維持し、取引・所属・金額が変化しない実ブラウザ回帰を追加 |
| ナビ全体・CI | 最終のChromium/WebKitナビ結果と、全Vitest/既存保存・年度・試合・取引・財務E2EはPR本文でheadと対応付けて記録 |

実行コマンド:

```sh
npx vitest run src/components/hub/useHubNavigation.test.js src/components/hub/HubShell.navigation.test.js src/components/hub/HubShell.progression.test.js src/components/tabs/MailboxTab.trade.test.js src/hooks/useOffseason.trade.test.js src/hooks/useOffseason.posting.test.js src/components/tabs/TradeTab.test.js src/components/tabs/FinanceTab.test.js --maxWorkers=1 --minWorkers=1
npx playwright test e2e/hub-navigation.spec.js --workers=1 --retries=0
npm run build
```

ローカルWebKitは既存scratchのOSライブラリを`LD_LIBRARY_PATH`のusr/libとlibへ追加し実バイナリを起動。検出側のlibGLESパッケージ有無チェックは`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`で回避したが、ブラウザ・テストはskipしていない。CIは標準の`playwright install --with-deps chromium webkit`で同一headを検証する。

## 実画面の比較

mainのgit archiveと修正後ツリーを別Viteサーバー/cacheで起動。同じ新規fixture、2026年初日、全12球団を`startClubFinance`で初期化した実画面。下記はモックではなく、同じ通知切替2回後に「元の画面へ戻る」を1回押した状態。修正前はニュースのまま、修正後は財務へ戻る。CSSと財務本文は変更していない。

| 幅×高さ | 修正前 | 修正後 |
|---|---|---|
| 360×800 | [実画面](./before-return-360.png) | [実画面](./after-return-360.png) |
| 390×844 | [実画面](./before-return-390.png) | [実画面](./after-return-390.png) |
| 1440×900 | [実画面](./before-return-1440.png) | [実画面](./after-return-1440.png) |

[比較JSON](./comparison.json)の全6状態で全12球団データSHA-256が一致。横はみ出し・pageerrorなし。モバイル/PCの画面復帰を画像でも確認した。旧財務/ニュース本文の低コントラストは今回の修正対象ではなく、B/Dで移行する。[WebKitの修正前失敗画面](./before-webkit-390.png)も保存した。

## 未完了と次工程

今回の変更はUI-04A-FIXのレビュー待ちであり、M2/B/C/D/QA-04の実装完了ではない。実iPhone、全旧セーブ世代、長期経済バランスの確認は未実施。ブラウザforwardで一旦経路から外れた本文を再マウントする場合の全下書き保持までは保証しない。

FIX-M2は本PRのレビュー・マージ後、最新mainから独立ブランチで開始する。`regularGameUpdates`が勝敗/人気を更新した後のチームで収入を計上している入力順を最初に再現検証し、試合前需要/価格が当該試合へ反映される共通契約を決める。通常/CPU/単日Worker/まとめWorker・負予算と支出制約・年度/保存の調査先、データ定義、B〜QAの完了条件は[UI-04要件](../../implementation/ui-04.md)へ整理済み。今回は財務コードを変更していない。

## 独立レビュー

変更差分を独立レビュアーが確認。Criticalなし、Importantは非同期の祖先再訪連打1件。hookと実ブラウザでREDを確認し、移動中の再訪要求をまとめる最小修正を追加した。Minorの残課題なし。追加トレード入力E2Eの初回失敗は、球団選択のテキストに絵文字を含めていなかったテスト側の誤り。実際のカード本文へセレクタを修正し、期待する下書き値・全12球団一致・timeoutは維持した。
