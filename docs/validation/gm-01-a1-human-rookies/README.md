# GM-01 A1-2b-1 人の新人契約 — 検証

PR #532の追加修正: [新人最低年俸のRED→GREEN・旧セーブ対応・画面比較](minimum-salary/README.md)。以下は初回実装時点の記録。

基準: #531 merged / `628c0f365f4f70a44723ff3e151627b47b1816af`。
対象: 冬の自球団新人の年俸留保・明示辞退。年次契約の公開ゲートはOFF。

## 動作と保存

- 指名結果の支配下600万円、育成240万円を翌年度の保証付き単年契約として留保。今季年俸・名簿・契約台帳の雇用を変更しない。
- 辞退で対象の留保と指名枠を解放し、履歴を残す。他の新人の留保を保持。
- 69人＋受諾新人1人＋既存の未回答FAを扱い、回答時の満枠拒否、辞退後のFA受諾を確認。70/71人・育成枠・人的加入待ちは既存annual rookie/acquisition/roster回帰も実行。
- 実hook/IndexedDB/localStorageで、二重押下・同一request再試行・旧session・保存失敗の旧root/world維持・公開後ack復旧を確認。
- 保存されたcanonical draftResultを使用し、古いReactローカル指名結果で辞退を隠さない。
- human-rookie取引IDにsave/epoch/revision/年度/球団/操作/選手を固定。receipt・留保・指名を検証し、未記録給与や重複給与の推測補完をしない。
- 旧即加入・手動春進行・手動年度更新をannualで拒否。春加入は親計画Task 10のみ。

## RED → GREEN と独立レビュー

1. 初期engine/hook: 9 failing / 14 passing。未接続の人操作を実装して成功。
2. UI: 4 failing / 1 passing。留保確認・保存待機・失敗保持・保存済み履歴を接続して成功。
3. 保存検証: receipt欠落、指名消失、辞退の復活を再現し拒否を追加。
4. 独立レビューP2: 旧legacy callbackがannual hydration後にも成功を返し春キャンプへ画面遷移。実hookでRED→GREEN。名簿/planは既存reducerに保護されていたが、live mode/sessionの照合で誤進行を防止。
5. 独立レビューP2: human名義のnative receiptで固定年俸/単年/contract IDの条件を迂回。native経由の給与420・別ID、二年契約の整合した不正保存をRED→GREEN。
6. 独立レビューP2: 同一新人の重複年俸600/1000が配列順に依存。assignment-validな複製の年俸一致を両順序でRED→GREEN。

最終独立レビューで上記3件の解消を再確認。残るP1/P2なし。

## 実行結果

- Vitest: 関連 **24ファイル / 748テスト成功**。新規はengine 28、実hook 6、UI 5。
- 対象は `rookieContracts`、`annualRookieTransactions`、`annualDevelopmentTransactions`、`annualTransactions`、`annualDelayedFaTransactions`、`annualRenewalTransactions`、`contractEconomy`、`rosterCapacity`、`renewalDecisions`、`acquisitionDecisions`、`useOffseason.economyRookies/economyRenewal/economyAcquisition/resume`、`useGameState.economyCommit/rosterCapacity`、`AnnualRookieContracts`、`draftResume`、`draftDecision`、`economy-save-migration`、`economy-commit`、`economy-commit-recovery`、`saveload`、`saveloadScopes`。
- Playwright `save-generations.spec.js --grep 'human rookie' --workers=1 --retries=0`: **8成功**（Chromium 4 + mobile WebKit 4）。実AppScreenRouter・useGameState・useOffseasonを使用。保存失敗後の再試行、冷起動、育成留保、辞退、ack復旧を確認。
- `npm run build`: 成功。既存のchunkサイズ警告あり。
- `git diff --check`: 成功。
- 最終HEADの全体CIはPR本文を正本とする。ローカルで全テストの重複実行はしない。

WebKitは実ブラウザで検証。ローカル共有ライブラリを `LD_LIBRARY_PATH` に設定し、`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` はホストのldconfig検出のみ省略。CIは通常の依存インストールを使用。

## 画面比較

同じ保存fixture、360/390/1440px、両browser。`before` は旧レビューの即開幕ボタン、`after` は新人契約操作。`failed` は保存失敗・確認保持、`history` は冷起動後の支配下辞退と育成留保。年次公開フラグは変更せずfixtureをhydrateした。

| Browser / 幅 | 変更前 | 変更後 | 保存失敗 | 再読込後 |
|---|---|---|---|---|
| Chromium 360 | [before](chromium-360-before.png) | [after](chromium-360-after.png) | [failed](chromium-360-failed.png) | [history](chromium-360-history.png) |
| Chromium 390 | [before](chromium-390-before.png) | [after](chromium-390-after.png) | [failed](chromium-390-failed.png) | [history](chromium-390-history.png) |
| Chromium 1440 | [before](chromium-1440-before.png) | [after](chromium-1440-after.png) | [failed](chromium-1440-failed.png) | [history](chromium-1440-history.png) |
| WebKit 360 | [before](mobile-webkit-360-before.png) | [after](mobile-webkit-360-after.png) | [failed](mobile-webkit-360-failed.png) | [history](mobile-webkit-360-history.png) |
| WebKit 390 | [before](mobile-webkit-390-before.png) | [after](mobile-webkit-390-after.png) | [failed](mobile-webkit-390-failed.png) | [history](mobile-webkit-390-history.png) |
| WebKit 1440 | [before](mobile-webkit-1440-before.png) | [after](mobile-webkit-1440-after.png) | [failed](mobile-webkit-1440-failed.png) | [history](mobile-webkit-1440-history.png) |

横はみ出しなし、操作到達と状態表示を確認。実機タッチ端末での検証は未実施。育成の支配下転換・トレード・発掘・CPU・日次/年度更新・activation/fenceは後続工程。
