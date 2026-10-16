# 支配下人数・残枠の共通基盤 第1PR

基準main：`17c7cc206dfa44cec9a8f43b7719bc53d381f05b`（#476マージ後）。最新mainをfetchし、承認済みの[設計](../superpowers/specs/2026-10-16-roster-capacity-design.md)・[実装計画](../superpowers/plans/2026-10-16-roster-capacity-foundation.md)に沿って実装。状態：未マージ。最終head SHA・同一headのCI結果・独立レビューの結論はPR本文に記録する。

## 原因と変更

従来はFA・育成登録・概要表示で`育成`だけを見ている一方、ドラフト・編成自動化では`isIkusei`も見ていた。また、指名予約の除外条件が重複し、放出見込みの総所属人数から70枠の残数を判断できなかった。

- `rosterCapacity.js`に現在所属R、育成、受諾済み未所属指名P、実残枠`max(0,70-R-P)`、超過数、放出後見込みを集約。両育成フラグ・負傷・登録待機・外国人で所有の定義を変えない。
- ID 0を保持し、所有ID欠測／重複／数値文字列の割当キー衝突は未確認として変更を止める。拒否・既所属・他球団・当選競合は理由付きで予約から除外し、他の有効候補を失わない。候補レコードは有効性確認後に重複排除する。
- 同年度の結果・候補・保存済み途中指名から予約を復元。正式な結果・候補の当選が古い途中抽選stateより優先する。派生人数は保存しない。
- FA・スカウト・育成登録・交換後の両球団・ドラフト一括入団で共通上限を確認。古いコールバックや連打でも最新所属で再確認し、二重支払い・重複獲得を防ぐ。
- オフシーズン、FA、編成概要、二軍育成、ドラフトで同じ数値を表示。放出候補は見込みだけへ反映し、実残枠は放出確定まで増やさない。既存の総所属人数・年俸・予算の意味を維持する。

育成登録は従来通り二軍に残る。今回、一軍28人が満員だと登録を止める既存制約を維持し、誤って70枠と説明していた文言を修正。両育成フラグを解除する。登録後の一軍昇格は別操作。FAの年俸×年数の先払い、育成登録の年俸差額、CPU評価係数は変更しない。

## 検証

- 作業前：organizationNeeds・draftNeedsConfirmedPicks・catcherDepthPolicy・initialization-equivalenceの39件成功。
- Task 1：新モジュール未存在のREDから、同4本＋rosterCapacityの49件成功。初期snapshotと乱数消費の期待値は変更なし。
- Task 2：境界6件・埋め込みFA経路1件のREDを確認。獲得関連6ファイル65件、FA経路を含むoffseasonPlanning 28件成功。
- Task 3：表示／見込み3件のREDを確認。関連6ファイル74件成功。実saveGame/loadGameで所属ID・球歴・候補・手番を維持し、翌年に古い指名予約を混ぜないことを確認。
- 追加統合確認：13ファイル169件成功。
- Build成功。既存の大きいchunkに関するVite案内は残る。
- Chromiumの360/390/1440pxで69→70人の育成登録、両フラグ、詳細からのフォーカス復帰、横スクロール、保存再開を確認。確定指名P=1で追加FA不可、放出候補の付与／取消で実残枠0を維持するケースを確認。
- 実トレード受信箱の承諾で相手球団が70人を超える交換を拒否し、所属・予算・履歴・未処理メールを維持するケースを確認。
- 最終PRのBuild・全Unit・中核E2Eは同一headのCIで確認する。未完了のCIを成功扱いにしない。

最初の画面fixtureは開幕日のままオフシーズンへ復帰しており、既存の二軍移行検証が正しく拒否した。完了済み143試合の状態へ直して変更前後を再撮影した。テスト実行中に新規トレードcaseのタイトルを変更したため1回はworkerの「test not found」となった。同ケースを単独で再実行し成功を確認した。FA追加シナリオでも新しいrevision 0のfixture上書きが拒否されたため最新保存から入団拒否を設定する方式へ変更し、保存された個別条件画面から実契約する経路を使用した。製品のテスト削除・skip・CI設定変更はない。

## 変更前後の画面

同じ保存fixture（支配下69・育成2・確定指名1、放出候補なし）を使用。一軍27人は既存の育成登録制約も操作できる境界fixtureで、初期人数の仕様変更ではない。

| 画面 | 360px | 390px | 1440px |
|---|---|---|---|
| 編成・変更前 | [PNG](../validation/roster-capacity-1/before-planning-360.png) | [PNG](../validation/roster-capacity-1/before-planning-390.png) | [PNG](../validation/roster-capacity-1/before-planning-1440.png) |
| 編成・変更後 | [PNG](../validation/roster-capacity-1/after-planning-360.png) | [PNG](../validation/roster-capacity-1/after-planning-390.png) | [PNG](../validation/roster-capacity-1/after-planning-1440.png) |
| 二軍・変更前（確定指名なし） | [PNG](../validation/roster-capacity-1/before-farm-360.png) | [PNG](../validation/roster-capacity-1/before-farm-390.png) | [PNG](../validation/roster-capacity-1/before-farm-1440.png) |
| 二軍・変更後（確定指名なし） | [PNG](../validation/roster-capacity-1/after-farm-360.png) | [PNG](../validation/roster-capacity-1/after-farm-390.png) | [PNG](../validation/roster-capacity-1/after-farm-1440.png) |

## 判断・保存互換・未検証

- 同一育成選手が放出予定と昇格予定の両方にある場合、放出を優先し昇格を計上しない。未知IDや既支配下の昇格予定で架空の枠を作らない。誤りなら競合予定を明示的な入力エラーへ変更する必要がある。
- 受諾指名は通常カレンダー上トレード期限後にしか存在しない。そのため予約付き交換はUnit、ブラウザは実際の70人境界を検証。将来カレンダーを変える場合は予約付き交換の実UIケースを追加する。
- 保存スキーマ・生成人数・6巡・通常候補80人・順位得点・拒否確率・シミュレーション乱数は変更しない。旧保存の強制人数調整、候補再生成、履歴の一括移行はしない。
- 新会議10人／160候補／選択終了、新規65人、CPU67人目標と編集可能な予定、3seed×10年は後続PR。実端末・Safari/WebKitの今回追加操作、全世代の実ユーザー保存は未検証。


## 独立レビュー

fresh contextの別担当がmainからの全差分をread-onlyで確認。P2を3件検出し、各再現テストのRED（3件失敗）→GREEN（関連32件成功）を確認して修正した。

1. 同じ候補IDの先行する他球団レコードを組織の役割へ使う回帰：共通集計が検証した`acceptedPicks`（元のレコード参照）を組織評価へ直接渡し、IDだけで復元しない。
2. 所有IDが数値0、FA候補が文字列'0'の場合の獲得：所属キー衝突を変更前に拒否し、予算・所属・履歴を維持。
3. スカウト一覧のindex 0を連打すると次の候補まで獲得する問題：画面の対象IDを固定し、現在の候補から同じIDを解決。再描画後に明示的に次の候補を選ぶ操作は維持。

Minorの保留なし。独立担当は実画面品質・フォーカス、FA試験fixtureの修正、最終head CI、後続の長期バランスを独立認定していない。画面・fixtureは本担当のブラウザ試験、CIはGitHubの同一head結果を根拠とする。長期バランスは承認済みの後続範囲。

## 実行上の判断

- 既に作業専用のWork checkoutを、新規featureブランチで使用した。別ディレクトリのworktreeを追加する場合の隔離は増えるが、既存ブランチは変更していない。
- スキルの補助スクリプトは利用できず、同じbrief・ledger・review packageを直接記録した。自動記帳の保証はなく、git履歴と検証記録で追跡する。
- `evaluateRosterCapacity`は検証済みの元レコード`acceptedPicks`を追加で返す。既存の数値・ID APIを保持し、保存には追加しない。レコードを必要とする役割評価で再検証がずれる危険を避ける。将来callerがレコードを変更しない純粋関数契約を守る必要がある。
