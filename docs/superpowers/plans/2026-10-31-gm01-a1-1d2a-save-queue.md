# GM-01 A1-1d-2a 保存要求の置換防止

基準main: `9f00e24c4f0a0c35b0b942e862320c5024eaf3d6`（#521マージ）。親Task 4と`2026-10-30-gm01-a1-integration-design.md`のS15を段階的に実装する。

## 対象と受入条件

- 既存`createSaveRequestQueue`に非置換要求を追加する。保護された要求の前後で通常要求を合体しない。各保護要求は自身の保存結果だけを返す。
- `saveGame`の手動保存と`enqueueSaveGame`を同じFIFOへ通す。契約envelopeがある要求は明示legacy/未知schemaも含め非置換とし、不正候補を他の成功結果で隠さない。
- envelopeのない旧形式の自動保存は隣接する待機要求を集約し、dirty scopes/career情報の引継ぎを維持する。保護要求へ別候補のoptionsを持ち込まない。
- A保存中→B契約候補→C旧snapshotを自動/手動の両経路で再現し、Bは保存され、Cは既存revision検証で拒否されること。入力をenqueue後に変えても保存候補へ反映しない。
- 世代保存、削除・他タブ競合、容量エラー、career/farm、hook保存状態を回帰検証。inline/大rootを両browserの既存CIで確認。

## 実施順序

1. 対象queue/世代保存の基準確認。
2. queueの順序・結果帰属・失敗・options境界と実保存競合をRED。
3. 既存queueを最小拡張し、対象と関連回帰をGREEN。
4. 独立レビュー、専用PR、最新head CI。

## 境界・判断記録

Ruling: 親Task 4をさらに保存要求キュー単位へ分割する。保存I/Oとhook採用・移行を同時変更すると失敗原因を分離しにくいため。代償として、このPRだけでは契約確定の公開→採用保証は完成しない。

Pre-flight: 共通world/revision（#521）→保存queue。旧Cの拒否は既存保存境界で担保されるが、Bのqueue置換は保存境界へ到達しないため、queue側の非置換化が必要。

非対象: `commitEconomyCandidate`、公開root由来ack、publish→adopt barrier、hookの原子的hydration、activation anchor、storage fence、日付/年度移行の本番接続。今回の`ok:true`は既存のI/O成功であり、候補を画面へ採用してよい証拠へ昇格させない。一般公開ゲートOFF、DB version 5、旧形式の自動移行なし。

後続は共通queueから保存中/待機中の要求を排出し、最新worldから候補を構築する排他区間を設ける。公開rootを再読込したackと候補を照合し、一括採用/復旧までbarrierを保持する。保護された失敗要求のcareer/optionsを別候補へ暗黙に引き継がず、同一候補を明示的に再試行する。

## 実施記録

- 基準: queue/世代保存2ファイル30件成功。
- 新規7件RED: FIFO境界1、保護要求の返却失敗/throw2、options分離1、実契約保存→古い自動/手動保存2、不正契約候補の結果帰属1。
- 実装後: 関連9ファイル265件成功。保存/契約world/世代保存/容量/削除/キャリア/二軍/保存scope/hook保存状態を含む。
- ブラウザ: inline/大rootの既存テストにA実行→B契約→C旧自動→D旧手動を追加し、両ケースでRED。最終headのChromium/WebKit結果と全体CIはPR本文に記録する。
- 非置換要求は件数分のsnapshotを保持する。後続barrierは候補待ちの進行を制限し、古い通常snapshotを採用後に破棄/再構築する必要がある。本PRだけでメモリ待機量・publish→adopt競合まで解決したとは扱わない。
