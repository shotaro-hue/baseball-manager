# PR #530 更改レビュー修正（GM-01 A1-2a-1-FIX）

基準HEAD: `768339ae44f41ab838e2fac1cda875c675954a89`。新規PR・mainへのpush・マージは行わない。年次公開ゲートはOFFのまま。

## 修正と互換性

- 旧判定は総合点だけで受諾し、金銭を重視しない1億円選手が420万円でも受諾した。`calcPlayerDemand` / `evaluateRenewalOffer`を共通利用し、要求年俸・最低受諾額・総合評価による結果を提示時に固定する。減額制限超過への本人同意は維持。成績未記録時は共通モデルの前年年俸基準を用い、不正な評価値から正式提示を作らない。表彰・優勝は保存済み`seasonHistory`の当年記録から渡す。
- 回答期日到達後の未処理pendingを、共通のdue判定でpure reducerの取消・差替から保護。暦日・オフturn・11月末からオフへの境界を同じスケジューラーで扱う。画面も回答確認へ誘導する。
- 新しいversion 2 decisionは総合点75以上を2日/turn、55以上75未満を3日/turn、55未満を4日/turnとする。速さは総合条件への評価であり、年俸条件を無視した受諾を意味しない。
- version 1は保存された回答と従来の2/4日期限を維持する。修正前HEADから採取した`renewal-v1.json`（8000万円・3年、60点、受諾予定、7月18日期限）で旧データを検証。既存decisionを再評価・再抽選・期限変更しない。新旧とも提示receiptとの一致を検証する。
- 回答待ちの選手選択時は正式提示の年俸・年数を入力初期値へ読む。入力は未保存のドラフトと明記し、差替確認で旧条件と新条件を併記。通常のstate更新・保存失敗で入力を上書きせず、選手切替ではその選手の正式提示/新規初期値へ切り替える。

## 再現と検証

修正前に4件を再現（8ケース失敗）。低年俸受諾、当日期限の取消/差替、3日/turn分岐、保存済み入力の初期化と差替表示が、修正後に成功。表彰・優勝contextの欠落も追加でRED→GREENを確認。

ローカルVitestは関連16ファイル・427件成功（重複再実行を除く）。

- `renewalDecisions.test.js` 28件、`annualRenewalTransactions.test.js` 50件
- `useOffseason.economyRenewal.test.js` 11件、`AnnualContractTab.test.js` 6件、`useGameState.economyCommit.test.js` 18件
- `economy-save-migration.test.js` 146件、`salaryDemand.test.js` 21件、`renewalRules.test.js` 14件
- `saveload.test.js` / `saveloadScopes.test.js` / `save-generations.test.js` / `economyMigration.test.js` / `economyMigrationProjection.test.js` / `useGameState.contractReplies.test.js` / `ContractTab.consistency.test.js` / `ContractRenewalRoute.test.js` 合計133件

年内/オフ、受諾/拒否それぞれについて、実hook・ストレージで回答保存失敗→旧root/world保持→取消/差替拒否→再読込→回答再試行→一度だけ確定を確認。メール削除、stale session/revision、ack障害復旧、既存履歴/留保/来季台帳も回帰対象。乱数呼出しを禁止した提示テストと、提示後に成績/人格を変更した固定結果テストを含む。

Playwright: `save-generations.spec.js --grep 'human renewal' --workers=1 --retries=0` はChromium 5件＋WebKit 5件成功。360/390/1440pxの新規保存失敗・再試行・cold reload・保存条件初期化・差替比較/確定・取消、期日後ボタン無効化、メールなし回答、ack復旧を確認。ページ横overflowなし。WebKitは既存の一時配置されたOSライブラリを利用し、ldconfig検出だけを省略して実ブラウザーを実行（CIは標準の依存導入・検査）。

`npm run build`成功。既存の500kB chunk警告あり。全テストと重要E2Eは追加コミットの最終HEADに対するCIを正本とし、旧HEADの成功を転用しない。

独立レビュアーは変更差分だけでなく取引・予算留保・台帳・保存/React採用/復旧・両UIルートを確認。追加のP1/P2指摘なし。公開ゲート、FA/CPU/Worker、日次進行、年次繰越、activation anchor、storage fenceの本格接続は変更していない。

## 画面比較

同じ7月16日の保存済み12000万円×3年提示を再読込し、選手Aを選択。修正前の10000万円×1年と、修正後の12000万円×3年を比較する。fixture用DOM harnessの検証であり、未公開の年次モード全体のjourney検証ではない。

| 幅 | 修正前 | 修正後 |
| --- | --- | --- |
| 360 | [前](before-360.png) | [後](after-360.png) |
| 390 | [前](before-390.png) | [後](after-390.png) |
| 1440 | [前](before-1440.png) | [後](after-1440.png) |

[390pxの差替確認](replacement-390.png)。長い選手名・アプリ全体ナビとの重なり・全キーボード導線は今回追加検証していない。
