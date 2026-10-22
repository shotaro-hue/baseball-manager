# 保存容量不足の緊急修正

基準main: `756af98dafb219f9e4d3f540c69148be38cb389f`（#490/#491マージ済み）。[設計PR #492](https://github.com/shotaro-hue/baseball-manager/pull/492)。添付ZIPは旧版だったため、既存統合checkoutの全1843 blobを最新GitHub treeとSHA照合して使用した。

## 原因・再現範囲

履歴5scopeはIndexedDBへ分離済みだが、選手・OB・二軍台帳等の本体はlocalStorageに残り、主＋バックアップ2世代に複製される。#491は理由表示を改善したが容量設計は変更していなかった。

`node scripts/generate-save-capacity-fixture.mjs` はseed 20261022で本番初期化・公式戦・二軍同時進行を実行する。生成した**阪神・2026年8月1日・106戦目**のmain本体はUTF-16換算 **2,043,048 bytes**。3世代なら約6.13MB。既存DeNA fixtureは初期365,428、中盤1,850,476、年度末2,244,884 bytes。

Linux Playwright WebKit 26.0 / iPhone 13設定でmain年度末データを5分経過相当のローテーションで3回保存。1回目はroot約2.24MB、2回目はroot＋backup1約4.49MB、3回目に実ブラウザのQuotaExceededErrorと`warnings:[backup_failed]`を観測した。Storage APIへの例外注入なし。

**実セーブ未取得のため、実iPhoneの主保存quota_exceededと同一条件の再現・原因断定は未達。** 確認できた容量ボトルネックを修正し、実機診断で不足した保存領域を判別できるようにした。

## 実装・保全

- 大きい本体は既存IndexedDB `save_chunks` の不変`root-body:`行へ置き、localStorageは各世代約218 bytesの参照にする。旧JSON/LZ/version3–6の読込を保持。
- transaction完了→別transactionで本文一致・チェックサム確認→通常の全履歴hydrate・二軍/財務/チーム検証→原子的localStorage setItemの順で公開。再読込可能と確認するまで成功を返さない。
- 読込だけでは既存rootを書き換えない。保存時の旧本体も正確なコピーと読戻しが完了する前に変更しない。削除・初期化・履歴切捨てなし。
- 旧primary/backup変換のI/O・quotaは破損として握りつぶさず公開前に失敗。純粋な破損だけを候補から除外する。
- Web Locks、別タブ観測、削除/読込epochを維持。GCは主・backup1・backup2の本体と全履歴世代を保護し、解釈不能rootがあれば回収しない。新世代準備前に孤立行を回収し、失敗後の永久quotaを防ぐ。
- 大きいJSONはnative gzip、非対応/小容量は従来LZ。inline gzipもチェックサムで保護。内容破損と、チェックサム正常時の環境側decode失敗を区別し、後者はfail closed。
- シーズン中・オフシーズンの失敗画面から診断をコピー可能。キー・ID・本文・例外message/stack・URLは含めず、Clipboard拒否時は選択可能textareaを出す。

## 容量・長期検証

[測定値](measurements.json) は数値のみ。localStorageはUTF-16換算、IndexedDBはstore別JSONのUTF-16換算であり物理ディスク使用量ではない。Origin見積もりは別欄。今回のLinux WebKitはStorageManager非対応のためnullを返し、容量ゼロとは扱わない。

10/20年相当は実2026年データから、全現役選手の年度成績、12球団×毎年8人のOB、二軍年次記録、既存方針どおり5年の試合履歴を積んだ容量fixture。20年相当はJSON約81.5MB・現役/OB計2700人。**20年の全経営ロジックを実行した試験とは区別する。**

native圧縮のChromium/mobile WebKit各4件・計8件成功（132秒、retry0）。2026/10年/20年を各3世代保存し、cold reload後にID・年俸・契約・成績・OB・履歴・二軍・メール・ニュース・FAのSHA-256一致、年度別careerの復元年数を確認。大容量の古い別タブはsave_conflictで最新を維持。WebKit20年相当は約24秒。最終アプリコードでも容量8件＋診断画面6件、計14件が両エンジンで成功（3.9分、1 worker、retry0）。診断画面は360/390/1440pxとClipboard拒否を含む。

初回LZ方式はChromium3件・WebKit2件成功、WebKit20年相当は約41秒の同期圧縮後にcontext消失。原因を断定せず失敗として記録し、nativeへ変更して両エンジンで再検証した。測定8件の後にinline gzipチェックサムを追加したため、**最終コミットの確定結果は修正PRのexact-head CIを正本**とする。

## RED→GREEN・回帰

- 容量・中断・本文破損・backup復元・再読込不能な保存: 初回7件RED→GREEN。
- 独立レビューの旧primary/backup変換失敗2件、孤立行quota1件: 3件RED→GREEN。
- native圧縮1件、inline gzip破損2件、診断コピー/アクセス拒否/秘密混入防止/内訳: RED→GREEN。
- 最終の保存・二軍・career・削除読込・診断9ファイル121件成功。build成功（既存500kB chunk警告）。
- 初回全Vitestは1750成功・7失敗・2skip。7件はrootが常にinline JSONとのテスト前提だった。readRootBodyで解決後、従来どおり破損注入する形へ直し期待値を維持。該当回帰114件成功。
- 最終全Vitestのローカル並列実行は1763成功・2skipの後、`scripts/qa-d1-offseason.test.js` がNodeの2GBヒープ上限に到達。単独でも再現した。原因はテスト用fake-indexeddb 6.2.5の完了済transaction保持で、公式[6.2.6リリース](https://github.com/dumbmatter/fakeIndexedDB/releases/tag/v6.2.6)（2026-10-16）の修正を確認しdevDependency/lockを更新。テスト・期待値・heap上限を緩めず全件再検証する。追加ブラウザ回帰・確定CIは修正PR本文/Checksを参照。
- 保存側もv6の検証済みキャッシュを所有した小さいmanifest/年度情報へ変更。legacyのinline career情報は保持する。公開前検証の一時コピーを短い関数scopeに限定し、JSON本文を早期解放する。呼出側のmanifest変更が内部キャッシュへ混入しないことを追加RED→GREENで検証した。
- 6.2.6更新後のCIで、既存の手動transaction解放補助と新adapterの自動解放が競合する1失敗・3非同期例外を検出。補助APIは互換用のno-opとし、adapter内部を変更しない。自動解放後にtransaction参照が残らないこと、保存値・active transaction・commit/abort・versionchange rollbackの検証を保持してRED→GREEN。全回帰・CIの最終結果は修正PRを正本とする。

## 実iPhone Safari確認手順 — 未実施

1. 未保存の変更があれば現在のタブを維持し保全する。セーブ削除・初期化・Safariサイトデータ消去をしない。**更新でも未保存変更を失うため、無条件に再読込しない。**
2. 修正配信後、未保存変更を保全できた状態で同一URL・同一Safariプロファイルを更新。別ゲームタブを同時操作せず、残るタブも新コードへ更新する。
3. 阪神・2026年8月1日・106戦目で保存。「保存済み」を確認。失敗時は画面を維持して「保存エラーの詳細」→「保存診断をコピー」。拒否されたらtextareaを長押しして選択・コピー。
4. 成功後の年度・日付・勝敗・人数・契約を控える。タイトルの「続きから」、Safariの再読込から再開して一致を確認。未保存の間は再読込確認しない。
5. 数試合進めて再保存・再開。backupは5分間隔で更新。別タブ競合は正常な上書き防止として扱い、初期化で解消しない。

## 残リスク

実iPhone、低ディスク空き容量、OS強制終了時の物理的耐久性、OS側サイトデータevictionは未保証。IndexedDBも有限で、無制限保存やサイトデータ消去からの復元は保証しない。gzipはCPU負荷低減を優先し最小バイト数を保証しない。旧コードは新参照を読めないため、rollback時も対応loaderを保持する必要がある。実セーブの診断取得・実機確認まで元事象の実機解消とは認定しない。
