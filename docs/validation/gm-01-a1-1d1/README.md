# GM-01 A1-1d-1 保存・復元境界

2026-10-31。基準main: `9dd6cda2ff8bdeaf0b41b184c2fbaffff8103f55`（#520マージ）。

## 実装範囲

既存世代保存を使用し、新契約worldを保存前・再読込後に検証する。未知schema、engine/必須値の欠落、所属不整合、年俸/残年数/区分/予算の台帳投影との矛盾を補完せず拒否する。annualの読込には旧契約の初期年数補正等を適用しない。

同一saveIdのannual→legacy、epoch変更、revision逆行、同revisionでの条件変更を拒否。旧→新への同一saveId切替も専用移行処理が未接続のため拒否する。annualの通知chunkはdirtyScopesに関係なく同じworldから保存する。判読可能なannual/未知schemaから旧backupへ自動降格しない。同epochの正常backupは復旧できる。

一般公開ゲートOFF、DB version 5。Appはannualセーブを旧hydrationへ流さずタイトルで停止し、データを保持する。

## 検証

- 基準の関連3ファイル59件成功。
- 新規保存テスト38件＋Appゲート1件。初回RED 20件。null/移行禁止2件、先頭backupの未知schema1件もRED→GREEN。
- 独立レビューで旧形式の比較cacheの参照共有1件を検出。downgrade/epoch/revision/条件変更4件RED→修正。legacy career seedを維持。
- 表示投影の矛盾は保存境界の不整合として対応。7件RED→GREEN、区分矛盾1件は既存検証で拒否済み。
- 最終対象回帰は10ファイル164件成功（4.35秒）。
- 修正後の対象回帰: `tests/economy-save-migration.test.js`, `src/App.loadError.test.js`, `tests/save-generations.test.js`, `tests/save-capacity.test.js`, `tests/farm-save-generations.test.js`, `tests/save-delete-load.test.js`, `tests/career-generations.test.js`, `src/engine/__tests__/saveload.test.js`, `src/engine/__tests__/saveloadScopes.test.js`, `src/hooks/useGameState.saveStatus.test.js`。
- Chromium `save-generations.spec.js` 7件成功（新規inline/大rootの冷起動→受諾→再保存→App拒否2件を含む）。独立レビュー修正前の結果。最終公開headのCIで再検証する。
- ローカルWebKitはlibgstreamer不足で7件とも起動不可。install-depsも実行環境のsetgroups/uid制約で失敗。未検証を成功とは扱わない。CIに同specを既存設定で含む。
- Build: 独立実行で成功、21.77秒、既存large chunk警告。最初の試行は依存導入と並行し、`fatal library error, lookup self`の出力があったため成功根拠に不使用。
- 公開headの全テスト/Build/E2EはPRのCIで確認する。結果はPR本文へ記録する。

## 判断・残る工程

親計画Task 4の分割許可を使用したI/O境界の第1PR。A1-1d全体完了ではない。

1. 次工程: 確定保存の非置換queue、publishからadoptまでのbarrier、公開root由来のack、hookの原子的hydration。
2. 次工程: 移行candidate、activation anchor、旧クライアントのstorage fence。完全に判読不能なprimary・未知の冷起動を永続anchorなしに判別できるとは主張しない。
3. 表示投影の比較は新たな保存境界で実施。元台帳を修復・捏造せず不整合を拒否する。誤ったproducerは保存が止まるため、今後の各接続工程で同じ検証を通す。
4. 一般の契約交渉/CPU/Worker/春越え、校正と本番有効化は後続のまま。

独立レビューのCritical/Minorは0。レビューで対象外とされたqueue/barrier/ack/hydration/anchor/fenceとopaque破損は上記の未接続範囲として明記し、保護済みとは扱わない。表示投影については対象内と判断して修正した。

## PR #521 レビュー修正（A1-1d-1-FIX）

対象head `b9f74ff0b0b7ddcbbcdc5f1db1c1c604866ed662`、基準mainは上記と同じ。開始時CI #585は14ジョブ成功だったが、revision増加時に過去のworldとの比較がなく、現在の名簿・予算と矛盾しない過去契約の改変やreceipt削除、乱数seed変更を保存できた。履歴を失うと取引の再実行検出や再現可能性を損なう。

`economyOverwriteIssue()`は、独立したcanonical文字列として既にcacheに保持している`terms`から確定済み状態を読み、revision増加時にも以下を検証する。呼び出し元worldへの参照や別の保存エンジンは追加しない。

- `randomRoot`は同一saveId・epoch内で不変。
- 台帳は`isContractLedgerExtension()`による合法的拡張（締め年度の単調増加を含む）。加えて既存recordの順番・原記録・changesの先頭部分をそのまま保持し、削除・改変・並べ替えを拒否する。
- `engine.transactions`の既存receiptを同じ順番・内容で保持し、末尾への追加を許可する。
- 予約一覧や予算・clock全体を不変にはしない。更改提示/差替え/受諾/キャンセル、台帳への新規契約/変更追加、予算更新、締め年度・年度移行を許可する。
- 旧開始残高のsignatureは元objectの項目順を残すため、比較の両側をcanonical化してから既存台帳チェックへ渡す。保証unknownや未記録の署名情報を補完しない。

### 修正の検証

- 10種類（seed、receipt削除/改変/並べ替え、契約条件改変、台帳record削除/並べ替え、台帳change削除/改変、締め年度逆行）×5経路（同一プロセス、冷起動から直接保存、冷起動load後、backup復旧後、versionless rootのload後）×inline/IndexedDB大root＝100件で、修正前に不正保存成功のREDを確認。
- 各異常候補は単体worldとして妥当であることを確認したうえで保存を拒否し、primary・backup 2世代・入力worldを保持する。元world/loaded worldの直接変更も同じ試験で扱う。
- 正常な提示→差替え→受諾→年俸変更→同revision再保存、予算policy更新、複数年契約の翌年度持越し、旧開始残高の再保存を検証。新しい履歴保護で旧開始残高を誤拒否する問題を検出し、両側canonical化で修正。
- Chromiumの既存inline/大root E2Eでも、冷起動後のseed/receipt/台帳順序改変拒否と正常受諾を追加。修正前は2ケースともRED。
- 最終headの単体・回帰・E2E・CIの件数と結果はPR本文へ記録する。

### 後続A1工程のrevision更新責務

1. 現状は`reduceEconomyCommand()`が新しい正常取引で+1し、replayでは増やさない。`economyClockFor()`は時計を作るだけ、`fromAnnualState()`は投影するだけで採番しない。保存層も採番しない。
2. 実日程とclockを翌日へそろえても同revisionなら`economy_revision_conflict`になる。producer側でrevisionを増やした候補は保存可能、という挙動を回帰テストで固定した。
3. 後続の通常/戦術/まとめ/Worker進行とオフturn・年度移行は、clock・cycle・年度予算などの経済状態を変更する単一world候補を作る責務を持ち、その候補へ最新revisionからの増分を付与する。単一の進行操作では+1を基本とし、内包する契約commandで既に採番した場合の扱いも共通Reducerで一元化する。保存回数をrevisionにせず、quote・同一worldの再保存・replayは増やさない。
4. 日付/年度だけ先に採用しない。baseRevisionを照合し、契約履歴とclock・予算・通知を一つの候補として検証し、後続のbarrier/公開root ack/原子的採用を通す。失敗時は未公開候補のrevisionや通知を採用せず、同一commandで再試行する。Workerに独立した採番器を置かない。
5. 未来の年度移行でも確定履歴は保持して末尾追加する。台帳/receiptの並べ替え・削除による圧縮、randomRoot再生成、台帳schema変更をこの通常上書き経路へ流さない。将来アーカイブ等で必要になった場合は、検証可能な履歴継承と専用移行仕様を先に設計する。
6. 通常の試合進行・年度移行の本番接続は今回未実施。非置換queue、publish→adopt barrier、公開root ack、原子的hydration、activation anchor、storage fenceは従来どおり後続。冷起動でprimaryが完全に判読不能な場合の保証は追加していない。DB version 5、一般公開ゲートOFF、旧セーブ自動移行なしを維持する。
