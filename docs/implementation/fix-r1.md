# FIX-R1: まとめシム結果の保存・打撃ハイライト整合性

基準main: `fe754ac053177701a519dba2d0a3d713cf02094e`（#462・#463マージ済み、2026-10-13再取得）。添付ZIPは実装基準に使用していない。
本修正は独立ブランチで実装・検証。未マージでありmain反映済みとは扱わない。

## 原因と修正

- 保存: `useSeasonFlow` が `enqueueSaveGame` を直呼びし、`gs.saveQueueState/saveResult`、dirty完了、打球履歴flushを経由しなかった。
  採用済みの `nextState + nextMatchHistory` を既存 `handleSave` のpayloadへ渡す。`skipBackupRotation/preferMainSave` は維持し、キューの二重投入はしない。
- 保存要求に一時的request IDとprogress sessionを付け、最新の要求・セッションだけが結果とdirty完了を更新する。
  dirty versionが進んだ場合は未保存の変更を保持。主体セーブ成功後も打球履歴flush/retryの完了を待つ。
- 打撃: Workerの軽量 `batchResults` はlogを含まないが、旧画面はそれを集計していた。
  Routeが当該年度・save ID・球団・ロードセッションと対象試合番号を確認して現行 `gameResultsMap` へ接続する。
  履歴logを既存の遅延処理内で集計し、`batId`（0を含む）で同名選手を分離。旧名前のみのlogはID付き記録とは別に集約する。
- 有効な打席記録がない試合を本塁打0にせず、記録あり試合数を表示。部分欠損は記録のある試合だけを集計する。
  記録の例外でも試合一覧・ホーム操作を保持。詳細画面も同じ履歴解決関数を使用する。

Worker、試合・成績計算、保存形式、保存ロック・キューのcoalescing、他画面のUIは変更していない。
batch context/request IDは表示用の一時情報で、セーブpayloadへ追加しない。

## 保存状態の優先順位

| 条件 | 表示・扱い |
|---|---|
| 主体の保存キューが動作中／最新要求の履歴flush中 | 保存中。以前の成功を表示しない |
| 最新要求が失敗 | 保存失敗。結果・dirtyを保持し、ホームの既存保存で再試行 |
| 最新変更が未保存／保存要求待ち | 保存待ち |
| 最新要求の主体保存成功、打球履歴失敗 | 保存済み・一部履歴は要確認。ホーム保存で履歴を再試行 |
| 最新要求成功、保存情報のwarningあり | 保存済み・保存情報は要確認 |
| 最新要求の主体・履歴とも成功、dirtyなし | 保存済み |
| 対象結果が未確認 | 保存状態未確認 |

古い要求の履歴完了は新しい失敗・成功表示を上書きしない。ロード/reset後の通知も破棄する。
主体セーブ成功と全履歴成功は別に扱う。保存失敗を理由に試合結果を消さない。

## 回帰検証

- Unit: 保存開始前・即時保存中・主体失敗・履歴部分失敗・保存成功、新規編集、重複要求の実キューcoalescing、古いarchive完了、ロード後の通知を検証。
- Unit: 実ログ参照、複数試合/選手、同名別ID/ID=0、旧名前のみ、相手HR除外、0/欠測/部分欠測、対象外試合番号、年度/save ID/球団/session違い、malformed・例外と戻る操作を検証。
- `e2e/batch-results.spec.js` は既存の通常CI対象。追加3ケースも同じspecに含め、CI範囲は変更していない。
  新規ゲーム→10試合→保存ロックを一時停止して保存中/保存前gameDay=1を確認→解放→保存済み/gameDay=11。
  保存された10試合のlogから独立集計した選手名/HR数をUIと照合。詳細→フォーカス復帰→ホーム→保存・ロードで履歴/teamsを照合。
- 主体保存QuotaExceeded、打球archiveのIndexedDB put失敗はブラウザ内のtest-only障害注入。
  実Worker/キュー/永続化を維持し、前回セーブの保持、失敗/部分失敗ラベル、8件の一覧、ホーム再試行・ロードを検証する。
- 7幅×10状態（360/390/760/761/1023/1024/1440）、44px操作・横はみ出し・キーボード、実App360/390/1440の既存検証も維持。

ローカル: 関連Unit 10ファイル63件成功、Build成功、対象Chromium E2E 13件成功（4.4分）。
独立レビューで複数chunkの途中完了と不正ログの実測0表示を検出。
実archiveキュー＋fake IndexedDBで後続chunk待機/失敗を再現し、全chunkのsettle後の失敗残数まで確認する修正でRED→GREEN。
不正・非打席・名前欠損のみのログと、有効out＋名前不明HRもRED→GREEN。不完全な打席は確認済み0と区別する。
レビュー後の最終版は新規3E2Eと390px表示ケースを再実行し、通常CIで全Unit/Build/中核E2Eを確認する。
通常CIの最終head結果は本PRに記録する。全E2Eを重複実行しない。
Buildの既存500kB chunk警告は残る。新しい依存・テストskip/削除はない。

## 同じ状態の画像

fixtureを実Worker同様の軽量summary＋別history mapへ修正。12試合・全件表示・詳細展開を同じデータで撮影。
旧画面は存在しないsummary.logを参照して未記録を表示。修正後は履歴から4本塁打を表示する。

| 幅 | 修正前 | 修正後 |
|---|---|---|
| 360 | [before](../validation/fix-r1/before-360.png) | [after](../validation/fix-r1/after-360.png) |
| 390 | [before](../validation/fix-r1/before-390.png) | [after](../validation/fix-r1/after-390.png) |
| 1440 | [before](../validation/fix-r1/before-1440.png) | [after](../validation/fix-r1/after-1440.png) |

[実新規ゲーム390px](../validation/fix-r1/actual-390.png)は保存済み・実10試合のログ集計と詳細復帰後の画面。
画像は全文PNGで、初期表示はviewportによる。目視と操作確認を別に実施する。

未検証: iPhone実機、当画面のSafari/WebKit・スクリーンリーダー、実複数年/長期バランス、通常CI外の全E2E。
日程・球団詳細の試合履歴、UI-03、総合QAは未完了のまま。FIX-R1だけでUI-01全体完了とはしない。
