# SAVE-01A — 外部バックアップ設計草案

作成日: 2026-10-21。調査基準main: `46d75e21b1f6e27c0f60274a38cd7619a80d951d`（#489）。CORE-02は[PR #490](https://github.com/shotaro-hue/baseball-manager/pull/490)でレビュー/マージ待ち。この文書だけを別ブランチで先行し、製品コードは変更していない。

**状態: 調査・推奨設計の草案。未承認。SAVE-01A完了ではない。** 10/20年相当の容量・入出力時間・メモリ実測、復元中断の試験設計レビュー、CORE-02マージ後の再照合を残す。SAVE-01Bは設計承認前に開始しない。

## 目的・成功条件

iPhoneで、保存時点のゲームと実際に保持されている履歴をファイル1個として持ち出せるようにする。別ブラウザ/端末へ戻しても試合・年度更新を継続できること、復元が途中で失敗しても従来の正常な保存への参照を失わないことを最優先とする。クラウド同期・アカウント・複数スロット管理は追加しない。

## 1. 現行保存の棚卸し（コード確認済み）

| データ | 正本・形式 | バックアップ時の注意 |
|---|---|---|
| 球団/選手/契約/年俸/財務/FA/ドラフト途中 | localStorage `baseball_manager_v1`のroot。LZ-UTF16または既存非圧縮JSON。現行saveDataVersion=6 | `teams`（players/farm/history/育成を含む実際の球団構造）、faPool/faYears/offseasonPlan、年度/試合日、日程等をrootごと保持。表示用selectorの小さな要約で代用しない |
| 一軍/二軍成績 | root内の選手stats/通算・farmCompetition、および下記の履歴chunk | 一軍と二軍の実測/旧推定を区別。farmCompetitionVersion、saveId、year、nextRound、archiveSignatureを照合 |
| 球団史/移籍/表彰/過年度二軍 | IndexedDB `save_chunks`の`seasonHistory`参照 | awards/records/hallOfFame/championships/standingsHistory/transfers/farmArchivesを丸ごと含む |
| ニュース | 同`news`参照 | 回答済みansweredを含む原データ。表示件数制限や既読バッジだけを持ち出さない |
| 受信箱 | 同`mailbox`参照 | 契約/取引等の対応済み・未対応と案件識別子を保持 |
| 試合/日程/特殊イベント | 同`matchHistory`参照 | gameResultsMap/allTeamResultsMap/allTeamBoxScoresMap/scheduleArchive/recentResults/allStarDone/allStarResult/lastPressDay/pressEventの9項目 |
| 全通算キャリア | version6の`careerLogs`世代参照 | `{version:1,players:[[stringPlayerId,entries],...]}`。plain/gzip-base64/lz-utf16の符号化あり。全player行を含め、現役だけに絞らない。rootの最近3年要約では代用不可 |
| 旧通算移行ストア | `career_logs`、旧playerId単位 | 現行v6の正本ではない。他セーブの固定playerId行を丸ごと持ち出さない。v1外部形式は検証済みv6を対象とし、旧形式は通常保存による現行化後に対応する方針をレビュー |
| 打球の詳細 | `batted_ball_batches`、keyPath=id、saveId索引 | 対象saveIdの全記録のみ。playerId/year/gameId/source/events/record idを含む。root内80件/散布40点のサンプルでは代用不可 |
| 打球の集計/状態 | `batted_ball_aggregates`、`batted_ball_meta` | 対象saveIdの全行。aggregate idはsaveId:year:playerId。metaの保存済み範囲/件数/履歴状態を含める。取得失敗を「記録なし」としない |
| 内部バックアップ | localStorage `_bk1`/`_bk2`。原則5分間隔で回転 | 外部ファイルは選んだ1保存時点の完全な参照閉包を含める。内部バックアップ2個の同梱はv1の必須にせず、ファイルへ保存した時点を明示 |
| メタ表示・計測 | `_meta`、回転時刻、保存perf/debugキー | `_meta`は正本でない。エクスポートのプレビュー情報は検証したrootから作る。計測/debug/cacheは対象外 |
| メモリ内store/キュー | persistentDataStore、通常保存queue、打球pending/failed queue | storeはReactから分離したメモリ上のデータで別DBではない。エクスポート前に通常保存と打球キューを完了させ、未完了/失敗が残れば完全バックアップと表示しない |

DBは`baseball_manager_storage`、version3、5ストア。世代chunkの正本はroot.saveManifest.chunksで、seasonHistory/news/mailbox/matchHistory/careerLogsの5scope。参照先は同じgenerationとは限らない（未変更scopeの古い世代を再利用する）。rootのgeneration名だけでDBを検索してはいけない。各refのsaveId/generation/version/key/signatureと実行rowを全て検証する。

**保持範囲:** 試合詳細のscheduleArchiveは既存の直近5年方針。キャリアのroot最近3年とは別に全履歴chunkがある。外部バックアップは現存データを保持し、既に破棄された過年度詳細を生成・復元しない。保存前に打球書込が失敗した履歴まで復活させる機能ではない。

根拠: [DB](../../src/engine/baseballManagerDb.js) / [保存](../../src/engine/saveload.js) / [世代](../../src/engine/saveGenerations.js) / [キャリア](../../src/engine/careerGenerations.js) / [試合](../../src/engine/matchHistory.js) / [二軍検証](../../src/engine/farmMigration.js) / [打球](../../src/engine/battedBallArchive.js) / [メモリstore](../../src/state/persistentDataStore.js)。

## 2. 方式比較と推奨

| 項目 | A: 全体を1つのJSONへ格納 | B: 本体/履歴を分けた単一ZIP | C: 本体/履歴の複数ファイル |
|---|---|---|---|
| 実装難易度 | 最小。ただし巨大JSONのメモリ対策が必要 | 中。ZIPの順次入出力と分割レコードが必要 | 中。組合せ/再選択/欠落の扱いが複雑 |
| 整合性 | 全体hashと内部参照検証 | 全entryのhash・件数・参照をmanifestで照合 | セットIDを全ファイルで照合する必要 |
| iPhoneの操作 | 1ファイル選択/保存 | 1ファイル選択/保存、利用者による展開不要 | 複数選択と一式管理が負担 |
| 容量 | 無圧縮は最大。圧縮すれば減る | 履歴を分割して圧縮。1つの巨大JSON文字列を回避可能 | 分割自体では縮まらない |
| 出力/復元時間 | 短い実装で済むが全体parse/stringifyが長くなる可能性 | 順次処理/進捗/中断境界を作りやすい | 選択/照合を含む時間が増える |
| 10/20年相当 | 単一object化時のメモリを要測定 | 複数年・全打球でもentry単位に上限を設けられる | サイズは分けられるが取り違えリスク |
| 破損検出 | ファイル全体+スキーマ | ファイル一覧/hash/件数/各スキーマ | セット欠落・混在・各ファイルhash |
| 将来変更 | ファイル全体version | formatVersionと各entry schemaVersionを分離 | manifestと各ファイルversionを同期 |

**最有力はB。** 利用者は1ファイルだけ扱い、内部ではroot/世代/打球を独立検証できる。Aは最短だが、20年相当を一括展開するメモリ失敗がiPhoneで許容できるか未確認。Cは復元時の操作と欠落リスクに見合う利点が少ない。

これは構造からの推奨で、速度・容量の実測優位を示すものではない。現行lockにはfflate 0.8.2/0.6.10の推移依存があり順次ZIP APIを確認できるが、実装時は直接依存として選定・固定し、重いUI/3D依存の再利用として取り込まない。追加するのは1つの軽量な入出力依存までとし、ZIP64/暗号化ZIP/任意のZIP展開機能はv1対象外。

## 3. ファイル形式案

拡張子`.bmb.zip`、ファイル名例`BaseballManager_2026_day001_20261021T120000Z.bmb.zip`。保存時点のUTC ISO日時、球団・年度・試合日・保存revisionと元saveIdをmanifestへ入れる。

- `manifest.json`: format=`baseball-manager-backup`、formatVersion=1、minReaderVersion=1、saveDataVersion=6、exportedAt、source（saveId/year/gameDay/myId/revision）、全entryのpath/役割/schemaVersion/展開後byte数/row数/SHA-256、履歴範囲、保存時のarchive状態。
- `root.json`: 検証済み保存root。元saveManifestも保持し、プレビューだけを別に信用しない。
- `chunks/<scope>.json`: 正確に参照される5scopeのrow。キャリアは既存符号化を保持し、検証の際にdecodeも行う。
- `archive/batches-000001.ndjson`、`archive/aggregates-000001.ndjson`、`archive/meta.json`: 対象saveIdの全行。件数0もmanifestに明示する。

ndjsonは1行1レコード。partsは検証用の目安2MiBで区切り、単一行/entry/合計展開量/圧縮率/行数を上限付きで読む。実運用の上限は10/20年計測後に確定する。manifestにないentry、重複path、親ディレクトリ/絶対path、同名entry、対応外codec/version、不正hash/件数は取込前に拒否する。ZIPを利用者のファイルシステムへ展開しない。

既存のsignatureは長さ+32bit hashで偶発破損の検査用。外部形式のSHA-256と併用し、元manifestとの対応も確認する。どちらもファイル作成者の真正性を保証する署名ではない。

## 4. エクスポート案

1. 設定の「保存してバックアップを作成」。通常の保存処理を完了させ、失敗したら出力しない。
2. 打球queueをflushし、pending/failedが残る場合は理由と再試行を表示して停止する。既に保存された記録だけの不完全なファイルを「完全」と表示しない。
3. 既存と同じ`baseball-manager-save`ロック下でrootと全参照chunkを検証。打球のmutationを静止/完了させ、スナップショット中に保存revisionや対象saveIdが変わっていないことを終了時にも照合する。打球の同一時点保証は通常save lockだけでは足りず、共通のmutation境界の設計が必要。
4. 参照先を列挙し、対象saveIdの打球のみcursorで読み、順次ZIPへ出す。全DBのgetAllや全履歴を巨大React stateへ展開する方式にしない。
5. hash/件数を確定したmanifestとともにファイルを閉じ、入出力の自己検証後に「準備完了」とする。
6. 利用者の別タップで「ファイルへ保存」「共有」を行う。長い非同期処理後に自動共有を呼んでユーザー操作の有効期間を失わないようにする。共有を閉じた場合は保存完了と断定せず、生成済みファイルを再操作可能にする。

Web Shareは`canShare({files})`を確認し、共有できない環境でもファイル保存を利用できる入口を残す。APIの対応だけでiPhoneの大きなファイルの保存・共有成功を保証しない。Blob生成時には最終圧縮データ自体のメモリが必要なので、ZIPの順次化だけで無制限容量を扱えるとはしない。

## 5. 安全な復元案

復元先には新しいsaveIdを採番し、既存の球団と同じ元saveIdのバックアップでも別namespaceへ投入する。playerId/teamId/gameIdの意味は維持する。変更対象はroot/manifest/chunk参照、farmCompetition.saveId、seasonHistory.farmArchivesのsaveIdとarchiveSignature、打球のsaveId/record id/aggregate id/meta key。任意の文字列に対する一括置換はしない。旧`career_logs`への固定ID書込は行わない。

1. ファイルを選択し、書込前にversion/entry一覧/上限/hash/構造/参照閉包を検査。球団、保存時点、年度、履歴範囲と現在の保存をプレビューする。
2. 「このバックアップを復元」で明示確認。保存/試合/年度更新/新規選択を止め、既存のsaveロックを取得。別タブが更新していた場合は元rootの観測値を照合して中止する。
3. 旧主保存と2つのバックアップへの参照を保護する。復元journalに旧raw root、対象namespace、ステージ中の参照一覧と状態を記録する。新しいjournalストア/DB versionは設計確定時に明示する。
4. 新saveIdのchunkと打球を小分けのIndexedDB transactionで投入。旧root/旧chunk/旧打球/旧careerを上書きしない。
5. 投入した全行を再読込し、hash/件数/参照/二軍のarchiveSignature/財務/日程/継続フェーズを検証。読込候補を独立した値として準備し、ゲームの現行stateへまだ適用しない。
6. 最終観測値と容量を再確認し、**検証済みrootへの主保存参照の切替をcommit点とする**。root切替は1回のlocalStorage書込。メタ表示の書込や旧世代cleanupはcommit条件に混ぜない。
7. commit後に新データを表示する。メタ情報等の補助処理失敗は「復元自体は完了、補助情報は要確認」と区別する。commit後の表示失敗を、正常な復元が無かったことにしてもう一度投入しない。旧rootを保護したjournalから再読込/旧保存への復帰を可能にする。

**重要な設計ゲート:** localStorageとIndexedDBは一つのtransactionにできない。復元journalとroot実値を照合する中断回復が必要。rootが旧値なら旧セーブを使い、新値ならステージ済みの検証済み保存を使う。不一致/書込結果不明なら自動削除せず旧正常保存と新候補を両方保持し、検証して再選択する。commit前の失敗を「復元成功」と表示しない。

現在のcollectUnusedChunksは3つのrootだけを保護するため、そのまま使うとステージ行を消し得る。保存ロック・journalの保護参照をcleanupへ接続する設計が必須。中断後の孤立行は全root/バックアップ/journalから未参照と証明できるものだけ後で回収する。容量不足対策として正常な旧保存を削除しない。

## 6. 失敗時の扱い

| 状況 | 保護/再試行 |
|---|---|
| 形式/hash/参照不一致 | 書込なし。問題を示して選び直す |
| IndexedDB容量/書込失敗 | transactionを中断、新namespaceだけを失敗扱い。旧rootと全履歴は維持 |
| タブ終了/OSによる途中終了 | journalとroot実値でcommit前後を判定。二重投入/二重切替をしない |
| 最後のroot書込が失敗 | commit前。旧rootを利用、失敗したstagingは他の参照確認後に回収 |
| commit後のメタ情報/cleanup失敗 | 復元完了と補助警告を区別。旧rootの保護を解除しない |
| 別タブの保存/削除/新規開始 | 共通ロックと観測値の再確認で競合拒否。古いcallbackからroot/stateへ適用しない |
| 打球の旧失敗/記録の欠損 | 空配列へ置換して成功扱いにせず、保存時点の欠損/不完全状態をプレビューへ明示 |

## 7. テスト計画・計測の残作業

- 単体: v1正常/未来version/対応外codec/0件/欠落/重複/hash違い/上限超過、5scopeの異なる世代参照、同じ元saveIdの復元、全saveId再割当と二軍archiveSignature、0と未記録の保持。
- 統合: 旧主保存/両バックアップ/chunk/キャリア/打球のsnapshotを取り、各staging transactionの直前・途中・直後、最終commit直前、commit直後、補助処理で故障注入。失敗前後で旧保存がloadGameにより検証・再開できることをassertする。
- 再開: 同じjournalを繰返し処理しても二重投入/二重反映なし。別タブ保存・削除・新規ゲーム・年度切替と相互排他。export中の打球flush競合も含める。
- ブラウザ: Chromium/WebKitの別contextへ1ファイルで移し、新規環境/既存正常セーブの両方で復元。通常試合・まとめシム・契約・ドラフト途中・年度更新→保存再開の実旅程。
- iPhone: Safariのファイル保存/Filesから選択/共有の取消と再操作、キーボード/背景化/OS中断、大きなファイルの処理。実機がなければ未検証と明記し、代替テストで保証したとしない。

**未計測の項目を数値で埋めない。** 10/20年の固定seed由来の実保存と、行数を制御した合成負荷を分ける。root/各scope/打球各storeの行数とbyte数、圧縮前後、export/validate/stage/commit/loadの時間、最大単一entryとメモリ指標を記録する。合成負荷は実ゲームの長期健全性の証拠にしない。実保存が用意できない場合はAの容量ゲート未完として残す。

| データ | サイズ | export/import時間 | 最大メモリ | 状態 |
|---|---|---|---|---|
| 開幕時 | 未計測 | 未計測 | 未計測 | 次の計測対象 |
| 実10年 | 未計測 | 未計測 | 未計測 | QAデータ作成/収集が必要 |
| 実20年 | 未計測 | 未計測 | 未計測 | 同上 |
| 打球最大側の合成負荷 | 未計測 | 未計測 | 未計測 | 行数/byte数を明示して別計測 |

## 8. 承認後のPR分割案

1. SAVE-01B-1: 形式の純粋検証と完全export。画面は実際に動作する保存/共有のみ。復元の未実装ボタンは出さない。
2. SAVE-01B-2: namespace再割当、journal、staging、保護参照、commit、中断回復を統合。失敗注入で旧セーブを保護できるまでrestoreを一般UIへ公開しない。
3. SAVE-01B-3: プレビュー/明示確認/結果/再試行/取消、別context・モバイル・長期データの受入を完了。別PR化に価値がない場合は2へまとめ、工程だけ増やさない。

各PRは独立レビュー/CI/マージ後に次へ進む。B完了後にQA-04Aの通常旅程と固定seed10/20年・複数seed傾向確認を行う。今回の文書は実装計画の承認やSAVE-01B着手許可ではない。

## 一次情報（APIの存在と仕様、実機保証とは区別）

- [WebKit: Safari 16.4 Compression Streams](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/): ストリーム圧縮の公式説明。現行career chunkも機能検出してgzip/lzを使い分けている。ZIPコンテナ自体の処理とは別。
- [W3C Web Share](https://www.w3.org/TR/web-share/): files/canShare、secure context、ユーザー操作の条件。準備完了後に別タップで共有する理由。大容量での実端末成功は別途検証する。
