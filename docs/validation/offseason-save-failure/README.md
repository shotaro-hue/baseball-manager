# 2026年オフシーズン保存失敗の調査・修正

## 対象と結論

基準main/deployは `46d75e21b1f6e27c0f60274a38cd7619a80d951d`（#489）。GitHub Pagesの成功deploymentと照合した。保存形式は既存のlocalStorage root＋IndexedDB世代のまま。#490の削除・読込競合から独立したmain由来の不具合を扱う。

**実iPhone Safariで報告された「保存失敗」のreasonは未確定・同一事象の再現未達。実機解消とは認定しない。** iPhoneの保存データ・iOSバージョン・元の失敗例外は入手できていない。容量不足やWeb Locks非対応を原因と断定していない。実機で未保存の変更がある場合に再読込・削除・初期化を要求していない。

確認できた問題は次のとおり。

- `OffseasonPlanningScreen.jsx` の保存領域は失敗理由を描画していなかった。さらにこの独立画面はHubShellの通知領域を描画しないため、通知だけでは理由を確認できない。
- `saveload.js` のWeb Locks request拒否は結果オブジェクトを返さずrejectしていた。UI側では原因不明の失敗になる。安全なロックを維持したまま例外を理由付き失敗へ正規化した。
- 診断追加後の独立レビューで、JSON.stringify/圧縮の例外が汎用失敗になること、localStorage読取拒否がIndexedDB書込失敗になることを再現。API境界ごとに分類した。
- UIの独立レビューで、手動失敗→共有成功→次回保存開始のnull結果により古い失敗が復活することを再現。新しい共有結果で古い手動結果を無効化した。

## 実装と保全

画面にユーザー向け理由、未保存リスク、既存ボタンによる再試行、理由コードを常設する。再試行中も直前の失敗説明を維持し、確認された書込成功で解消する。履歴の一部失敗・メタデータ警告は完全成功と区別する。

ローカルの構造化診断はreason/quota・工程・API・許可された例外名・キュー状態・dirty・root/backupの概算UTF-16バイト数のみ。選手名・ID・保存本文・例外メッセージ/stackは含めず、送信先は追加しない。ストレージサイズはroot/backupのみの概算であり、IndexedDBを含むブラウザquotaの実測値ではない。

失敗時にroot/backupを削除せず、書込前失敗は既存3rootを維持。排他ロック・別タブ競合検知・保存形式・世代/互換・ゲーム進行処理は変更しない。不要データの削除や容量設計の改変を本件へ混ぜない。

## 再現と回帰

`tests/save-diagnostics.test.js` はquota/SecurityErrorによるroot書込拒否、IndexedDB transaction abort、structuredClone失敗、lock request拒否、シリアライズ/圧縮失敗、各localStorage読取拒否を注入する。既存root/backup不変、機密文字列を含まない診断、通常再試行・再読込を検証する。これは実機の元障害の再現とは区別する。

- 最初の診断RED: 5/5失敗。レビュー追加RED: シリアライズ/圧縮2件、読取分類2件、dirty1件。
- UIのRED: 恒久理由・戻り値/例外・共有結果の更新順を検証。レビュー追加で古い理由復活2件もRED。
- 最終修正後: エンジン/Hook関連5ファイル61件、UI/feedback関連2ファイル54件が成功。production build成功（既存500kB chunk警告）。
- 実シーズンの最終条件はmobile WebKit360/390の2件成功（6.3分）。Chromium360はバックアップ1世代がシーズン中盤の前段階でも成功。最終条件のChromium360/390を含む提出SHAの通常CIはPR本文を正本とする。

`e2e/offseason-save-feedback.spec.js` はroot書込にQuotaExceededErrorを注入する。編成変更→失敗→4秒後も説明維持→フィルタ変更→再試行待ち→成功→再読込で放出候補とフィルタが残ることを確認。360/390/1440pxで横溢れなし・操作44px以上。Chromium各3件、mobile WebKit各3件がローカル成功した。

`e2e/offseason-save-progression.spec.js` は本番のチーム初期化・schedule・farm・`simulateSeasonBatch`で143試合を実行した2026 DeNA fixtureを使う。生成コマンドは `node scripts/generate-offseason-save-fixture.mjs`。初期・72試合後・143試合後を保存し、終盤の同状態を再保存してbk1/bk2の両方にも実サイズのデータを保持する。5分経過相当としてローテーション時刻だけを0へ戻し、rootや結果を手で改変しない。

その後は実際のUIでポストシーズン→引退確認→編成計画へ進み、750ms自動保存・手動/連続保存・タイトルから再開を実行。年度、チーム、選手ID/所属人数/契約、FA一覧、編成計画全体のSHA-256一致で再開内容を比較する。360/390px×Chromium/mobile WebKitを通常CIに追加した。重い実シーズンデータの圧縮がWebKitで約15秒を要することをtraceで観測し、この新規テストの遷移/保存待ちを90秒に設定した（既存の期待値やテストは緩めていない）。最初の15秒待ち失敗時のDOMは編成画面の「保存中」で、保存失敗reasonは観測していない。

fixtureをPlaywright引数へ巨大オブジェクトとして渡すとtraceシリアライズでworkerがSIGKILLしたため、Vite配信のgzip fixtureをブラウザ内で読み込む。これも製品の保存失敗とは区別する。

## 画面比較

同じ編成fixture・同じquota注入・放出候補の状態を比較。前は失敗ラベルのみ、後は理由/未保存注意/再試行/コードが表示される。日本語フォントNoto Sans CJKで確認。

| 幅 | 変更前(main) | 変更後 |
|---|---|---|
| 360 | [before-360](before-360.png) | [after-360](after-360.png) |
| 390 | [before-390](before-390.png) | [after-390](after-390.png) |
| 1440 | [before-1440](before-1440.png) | [after-1440](after-1440.png) |

[モバイルWebKit 390px](webkit-after-390.png) はiPhone 13エミュレーション。実iPhone端末・実Safariとは異なる。ローカルWebKitはOS依存ライブラリを個別ディレクトリに展開したランチャーで実行し、CIではPlaywright標準ブラウザを使用する。

## 残課題と停止点

元のiPhone障害と同じ条件でのreason特定、実機の保存・再開確認が残る。今回の診断/表示で理由を採取できるようにしたが、コード変更が元障害を解消したとは主張しない。保存方式変更・SAVE-01A/01B・UI刷新・10/20年QAには進まない。CI後も未マージ・自動マージなしでレビュー待ち。
