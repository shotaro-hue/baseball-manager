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
