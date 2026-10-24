# 長期容量対策 — 不変打球履歴の参照付き回収

2026-10-24。基準main `19dd33d0e5862c511c90c4a4cc0c767a139cdf72`（#499マージ済み）。[計画](../../implementation/archive-retention-plan.md)。利用者の合意範囲は長期容量対策のみ。完全バックアップ/復元は保留する。

## 実装範囲

- 現行root・backup1・backup2のSHA参照鎖を保護。共通の祖先は一度だけ確認し、run metadataを検証して参照キーを列挙する。GCでは打球event chunk全体を展開しない。
- 生存タブは一意なnative Web Lockへ、runのIDと採用前の参照を保持する。GCは`locks.query()`のheld一覧を使う。途中のrunは全chunkを保護し、未保存の親鎖・ロード済み旧root・再試行中の参照を保持する。期限で生存タブを推測しない。
- 保存しようとしているsnapshotにも一時pinを取り、保存前の回収で自分の未公開参照を消さない。ロードはpin取得後にroot/削除epoch/要求の所有権を再確認してから採用する。
- 保存→archiveの既存ロック順序を維持。rootが読めない・参照が改変されている・lock inventoryが不正/取得不能・回収中にrootが変わる場合はarchiveの削除を中止。legacyで帰属不明な保存は、そのsaveIdのversion全体を保守的に残す。
- 回収対象は構文が正しい`batted-ball-version:`キーだけ。他のprefixや未知のキーを消さない。同期delete例外でもtransaction全体をabortする。
- 通常のarchive回収は5分間隔。世代準備時のquota再試行と保存削除後は強制確認する。通常のgeneration/root-body回収は既存どおり。最後に確定した主保存・バックアップを容量確保のために削らない。
- DB接続epochを4→5へ更新。既存5ストア・索引・行を維持し、pin非参加の旧v4以下の明示版接続を拒否する。妨害時の中止・再試行・診断も維持する。v4コードへの単純rollbackには互換loaderが必要。
- 取消はchunk書込と進行中sealの両方を待ち、自分が新規作成した行だけを削除する。採用済みrunをdiscardしない。

## 再現と修正

- 基準の関連4ファイル68件成功を確認して開始。
- 回収なしによる孤立versionの残留、3保存世代/生存参照の選別、壊れた参照やinventory失敗時の中止、seal/discard競合の未参照metadata、旧v4再接続を新規8件で検証。初回は7失敗・1成功（非対応時の保全）を観測。
- 保存前GCで候補自身のreceiptが消えるケースを実save/loadでRED確認し、一時pinでGREENへ修正。
- root.saveIdとreceipt.saveIdの不一致を拒否するケース、二重sealが従来どおりPromise rejectionになるケースもRED→GREEN。
- root変更中の全rollback、同期delete例外後の全rollback、5分cadenceと強制回収、legacy帰属不明の保全、削除後回収を実fake-IDBで検査。さらに読取専用loadが未保存の進行pinを置換するREDを再現し、ロード参照と進行参照を別々に保持してGREENへ修正。新規単体は17件。
- Native WebKitで古い自タブのpinが残るケースを再現。weak-keyだけだったstorage identityを現在のrealmで強く保持し、同一ネイティブケースのRED→GREENを確認。ページcloseの応答とnative lock解放は別なので、テストはheld一覧が消えてから回収する。行数・再読込・期待する打球値のassertionは維持。

## 容量検証の意味

20年分は**合成履歴**で、20年の経営ロジックを実際に進行した試験ではない。毎年12試合×20event、全240 batch/4,800eventの不変鎖を作り、5/10/15/20年時点を測る。保存値のJSONをUTF-16換算したbytesで、IndexedDBの物理ディスク使用量・ピークRAMではない。

必要な履歴をすべて残した20年時点の基準値に対し、別タブで20runずつ孤立させる操作を3回繰り返す。各回40行を回収し、保存内容・行数・bytesが同じ基準値に戻ることを検査する。その後cold reloadし、2045年・全240 batch/4,800event・打球値の一致を確認する。browser reporterの`archive-capacity-evidence`添付と[数値証跡](./measurements.json)を参照。

## 検証結果

- 最終関連回帰は16 files / 151 tests成功。新規17件、既存の保存3root/career/二軍/4進行経路/削除・ロード競合/キュー・再試行/ロックを含む。
- 最終build成功（12.54秒、既存large chunk/import警告）。公開commitの全体CI結果はPR本文/Checksを正本にする。
- 最終新規browserはChromium5/5・mobile WebKit5/5、計10/10成功（レビューの解放待ち修正後14.0秒、worker1/retry0）。JSON expected10/unexpected0/skipped0/flaky0。両browserで20年時点80行・336,852 serialized bytesを維持し、孤立40行を作る3回の各操作後にも同じ基準値へ戻った。WebKit初回のpin解放失敗は上記RED→GREENの証跡として保持する。
- 既存DB epoch/妨害/将来版/再試行のbrowser回帰はChromium4/4・WebKit4/4成功（27.8秒）。旧v3と新たな旧v4の拒否、現在v5の全行保全と将来v6への接続解放を区別する。
- 既存receipt browser回帰はChromium11/11・WebKit11/11、計22/22成功（35.6秒）。実アプリ新規→まとめ進行→保存/reload→1日Worker→保存、取消、StrictMode、再試行/別save独立性を含む。
- 古いブラウザ実行環境の欠落と、途中で結果が完結しなかったローカル実行は合格件数へ含めない。OS設定を変更せず、一時的な実行環境で実browserを検証する。
- CIは新規10ケース（Chromium5/WebKit5）を既存probe job内の必須stepで実行する。既存品質gate/advisoryの位置付けを変えない。
- 独立全差分レビュー1回で製品コードのCritical/Important指摘なし。退出済みタブのnative lock解放前に容量を比較するテストの競合を指摘。新しい必須CIゲートで誤失敗を起こす問題として、すべての回収ケースで所有権解放を確認してから測定するよう修正し、行数/bytes/再読込のassertionを維持した。再レビューは行わない。

## 初回CIの経営画面テスト

head `8115460` のCI40081146605ではbuild/全体単体・容量対策10件・既存receipt22件・DB fence8件・容量suiteが成功。既存management-listsの360/390px WebKitだけ、一覧復帰の位置比較が基準4px未満に対して59pxとなった。初回artifact12555720815のSHA-256は`bb4eacf43fba9437ffd6a9e3575a2d5a5e534f0dad565b90d5dfa190375c7413`。

traceには事前の手動保存通知`💾 セーブしました`が残り、3500msの消失時刻と基準/復帰位置測定が重なっていた。ローカル同一headの未変更ケースは4/4成功（2幅×2回）で、単独成功をCI成功として扱わない。テストの初期条件を「UI保存完了＋一時通知終了」に揃え、4pxの位置・focus・DOM・filter・teams不変のassertionを維持した。修正後の該当360/390px WebKitは2/2成功（51.3秒、retry0）。UI/通知タイマー・ゲームコードは変更しない。修正後の正確なheadのCIで再確認する。

## 後続CIの進行テスト

CI40082585122（head `9349258`）では、修正した経営画面を含む11ジョブが成功し、残る進行E2Eの「残り1試合→進行を保存」だけが失敗した。artifact12556650366（SHA-256 `a3b03254645a5d046f3213dbf39be92807a170cbfc02ab909ce57f34a547c4d9`）のtraceは、読込開始807297ms→root公開807317ms→古いseasonHistory行の読込失敗807391msを記録している。保存自体は成功し、loadは変更されたrootを採用せずnullで返した。`expect.poll`のcallbackがnullを想定せずTypeErrorで終了していたため、一時nullを扱って同じ143試合の永続結果を待つようにした。永続的な欠損や古い142試合のままでは引き続き失敗し、保存/読込処理・timeout・retry数を変更しない。修正後の当該Chromiumケースは1/1成功（9.2秒、retry0）。

## 限界

必要な履歴はプレイに伴って増える。全履歴を無期限・無制限に保存できるとは保証しない。今回は保持年数変更・過去データ切捨て・全鎖のcompactionを行わない。

生存する別タブ・未保存run・失敗再試行は保護され、使っている間は容量を解放しない。プロセス終了でpinが消えた孤立データは、次の回収対象になる。raw無版指定IDB/localStorage直接書込を完全に排除する仕組み、将来のimport/journalとの統合、外部バックアップ/復元、実iPhoneの全工程メモリ/物理容量は本工程の受入範囲外。現行製品にimport/journal writerは存在しないため仮の実装を追加しない。未知の保存prefixはそのまま残す。

利用者は元の保存失敗が実利用で改善したと報告した。これは再読込後の同一状態・長期実機容量まで検証した証拠とは区別する。
