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


## 2026-10-21 最終P2-C追補

### 原因と変更

`saveFeedback.js`がtransition以外を一律再試行へ誘導していた。競合/staleは古い状態の上書きを止め、未保存変更の控えと既存root/backupの保全を優先し、タイトル再開には未保存変更が含まれないことを明示。ロック非対応は環境の制約、SecurityError/NotAllowedErrorは保存・権限設定の確認へ分ける。AbortErrorだけは中断原因が解消した場合の条件付き再試行を案内。容量不足は正常セーブを残して空き容量を確認し、解消した場合だけ再試行を案内する。

invalid_state/session_changed/save_failedも明示的に分類。sanitize/serialization/compression/farm/snapshot/read/write/unknownは理由・診断の確認を案内し、無条件の反復は勧めない。未知のreasonや例外本文は表示せず、既存の安全なdiagnosticsを参照する。競合reasonは誤ったquotaフラグより優先する。

UIでは「手動待機→後の共有成功→次の保存で共有結果null→古い手動失敗到着」で古い警告が復活した。共有結果の最新の確定世代を保持し、開始後に新しい共有結果を見た手動応答は表示へ戻さない。nullだけの変化で有効な手動応答を捨てない。保存中の理由保持・dirty表示・成功時の解除は既存テストで維持する。

### RED→GREEN

- 新しい原因別feedback13件は修正前すべてRED。追加したUI到着順1件もRED。
- 修正後: feedback / offseasonPlanning / useGameState.saveStatus / useGameState.offseasonSave / save-diagnostics の5ファイル91件成功。production build成功（既存chunk警告のみ）。
- 保存エンジン・フォーマット・世代・バックアップ内容はこの最終修正で変更しない。root/backup保全と再読込のブラウザ検証および#490統合結果は後述またはPR本文の最新記録が正本。
- #490と共通のROADMAP基準mainを#489の46d75e2へ合わせ、古い基準記載による文書競合を避ける。製品変更の混入や履歴書換えは行わない。
- 実機iPhoneの元障害のreasonは依然未確定。エミュレーション成功を根本解決認定には使わない。

### 最終統合検証の追補

#490の最終head `4d288a52f84a7995acd23158aab407bcf8be02ac`（通常CI #469全9ジョブ成功）と本修正をローカルで順番に統合した。ソース・Hook・ROADMAPはコンフリクトなし。保存/読込/削除/世代/キャリア/Hook/編成UI/年度移行/ドラフト/二軍の22ファイル264件が成功し、production buildも成功。

実サイズのDeNA進行E2Eで、遅延ロードされる引退画面の描画前に5秒の可視確認を開始するテスト同期漏れを確認。フッターボタンが操作可能になるまで既存の操作待ちを行い、モバイル画面内へスクロールしてから元の可視確認を行う。保存内容や期待値、タイムアウトは変更しない。ローカルWebKitでは5回のfixture保存だけで145秒、画面遷移と保存もそれぞれ数十秒となり、8分のテスト全体上限に達した例がある。保存失敗reasonは観測せず、途中2回の保存は成功したが、最終再開確認が未完了の実行を合格扱いにはしない。提出headの通常CIと、統合版の追加ブラウザ検証結果はPR本文を正本とする。

### WebKit容量と通常CIの実行枠

統合版の追加確認で、生成した65人の2026 DeNA編成root（約112万文字）を3世代とも最大サイズにそろえると、WebKitの3回目は主セーブが`ok:true`、`warnings:[backup_failed]`となり、backup2の作成で実際の`QuotaExceededError`を観測した。root/backup1は残る。元の実機の63人保存とは別条件で、元障害の原因特定ではない。容量を確保するためのユーザーセーブ削除は行わず、失敗した容量条件を合格扱いにしない。容量設計・SAVE-01A/01Bには着手しない。

初期・中盤・年度末の実データを通常の保存APIで順に保存した3世代は、約112万/92万/18万文字でWebKitも全3rootが警告なしで保存できた。ここから補強予定をUIで変更し、自動保存・連続手動保存・タイトル再開を実行し、全teams/plan/FAのSHA-256、選手ID・人数・契約条件を照合する追加確認を行った。最新の360/390px両エンジンの結果とローカル時間切れの範囲はPR本文を参照。ローカル機能検証は取得できないGoogle Fonts CSSのみを端末内Notoフォントへ固定し、アプリ・保存API・判定条件を変えない。通常CIではこの固定を行わない。

CI #470の契約・財務群は1回目132/132成功後の終了処理、2回目131/132成功の時点で30分のジョブ上限へ到達した。結果を成功扱いにせず、同じ6 specをposting/finance等4 specとmanagement UI 2 specへ分割する。テスト集合の一致を`--list`で確認し、テスト・skip・期待値・単一worker・個別/ジョブtimeoutは維持。新headの通常CIを受入ゲートにする。
