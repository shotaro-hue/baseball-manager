# D01 ポスティング金額の単位統一

作業日: 2026-10-08。開始時main: `3e0076fd8148c6d3d5bbb75583e62481da802ceb`（PR #419反映後）。
作業ブランチ: `fix/posting-budget-units`。PRのbaseはmain。マージ・自動マージは行わない。

## 再現と原因

入札額1億円、移籍金率20%、開始予算1000万円で、`useOffseason.handleMailAction` が円単位の移籍金20,000,000を万円単位の予算へ直接加算し、予算が20,001,000万円になる。正しい予算は3000万円（増分2000万円）。

修正前に追加した `useOffseason.posting.test.js` は2失敗/1成功。整数ケースは実際の出力20,001,000に対して3000を期待して失敗。端数ケースも100,000,003円の入札に対する円での丸めを保持した3000.0001万円に一致しない。

実Appの承認E2Eは現行chunk形式・旧inline version-4形式の双方で失敗。メールアクションが呼ぶ `getMailboxItemById` が `useGameState` に公開されていないため、金額加算以前に例外が発生する。実際の両hookを接続した `useGameState.posting.test.js` の承認/拒否2件も `TypeError: getMailboxItemById is not a function` で失敗した。

初回の拒否E2Eは「予算・所属が変わらない」だけを検証しており、例外による無処理でも成功した。この不足を修正前に発見し、士気-10・resolved/read・pageerrorなしの検証を追加した。無処理を正しい拒否として扱わない。

## 最小修正

- `useOffseason.js`: 入札を`bidYen`、移籍金を`feeYen`と明示。従来どおり`Math.round(bidYen * POSTING_FEE_RATE)`を行い、予算へ加算する直前だけ`feeYen / 10000`へ換算。万円単位での追加丸めはしない。通知・メール・ニュースは円の値を既存`fmtM`へ渡す。
- `useGameState.js`: 既存persistent storeの`getMailboxById`、非persistent時のmailboxを参照するgetterを公開。承認/拒否のルールを変更せず、欠落していた接続を修復する。他のメールアクションも同じgetterを使うため、メール経路への影響を既存回帰と併せて確認する。
- `posting.js` / `utils.js`: 入札・移籍金と`fmtM`は円、予算・年俸と`fmtSal`は万円であることをコメントに明記。入札生成・料率・フォーマッタの実行ロジックは変更しない。
- 回帰テスト2ファイルと `e2e/posting.spec.js` を追加。後者を既存CIのsmoke実行対象へ追加（再試行0）。CI設定やタイムアウトは変更しない。

選手所属、打順3種類・rotationからの除去、拒否時の士気低下、他球団の予算不変を検証。入札生成はE2Eで実コードを使用し、tradeValue=20、固定乱数で倍率1.0とする。

## 保存互換性

保存バージョン、IndexedDB構造、保存/復元処理は変更しない。実saveGame/loadGame、タイトルの「続きから」、UIの手動保存を使用する。

E2Eで現行chunk形式と旧inline version-4形式の承認後予算3000万円を保存・再開し、メール・編成の復元、再承認ボタンが出ないことを確認する。拒否では予算1000万円・所属・士気・解決済みメールを確認する。既存の20,001,000万円という予算は、由来を推測せず保存・再開後もそのまま保持する。

## 検証記録

- 開始時mainのローカル既存テスト: 572成功、既存2skip。
- 開始時main CI: [37773301113](https://github.com/shotaro-hue/baseball-manager/actions/runs/37773301113) はcompleted/success。過去の履歴E2E失敗を根本解決した証拠とは扱わない。
- 修正後の追加単体/統合回帰: 5/5成功。
- 修正後の全単体/統合: `npm test -- --maxWorkers=2 --minWorkers=1`、577成功・既存2skip。skip追加・削除なし。
- `npm run build`: 成功。既存の500kB超chunk警告あり。
- `npm run validate:physics-hr`: 成功。自動生成の `scripts/physics-hr-report.json` はPRに含めない。
- ポスティングE2E: 4/4成功。承認2形式、拒否、旧予算の非補正を検証。
- 全E2E: `npm run test:e2e -- --workers=1 --retries=0`、29成功/1失敗（10.4分）。通常/5試合バッチ/戦術履歴、旧セーブ進行、年度更新、引分境界、Mobile WebKit E1は成功。100試合バッチのみ失敗。全E2E成功とは扱わない。
- 差分の `git diff --cached --check`: 成功。PR CIの完了結果はPR本文に記載する。

### 100試合バッチの失敗切り分け（未解決）

`e2e/batch-100.spec.js` が120秒で「ホームへ戻る」を待ち切れなかった。失敗traceのconsoleでは開始約14.7秒時点で次のエラーが出ているため、単なる実行時間超過として期限を延ばさない。

```text
runBatchGames failed Error: DHなしの先発は重複なしで8人必要です
    at worker.onmessage (.../src/hooks/useSeasonFlow.js:866:20)
```

検証元は`rosterAutomation.validateLineup`の打順数/重複検査。失敗時の画面は第1戦・0勝0敗に留まる。どの球団・日・編成遷移で不足したか、なぜその状態に至ったかは未特定。

開始時mainを別worktree・別port 5174・別結果出力先で実行した同じ100試合テストは、再試行なしで53.2秒、1/1成功。mainでは今回再現できず、既存不具合とも今回の回帰とも断定しない。該当テスト、Worker、useSeasonFlow、rosterAutomationのコードは開始時mainから無変更だが、それだけで原因を確定しない。乱数を含む条件の追加切り分けは別課題とし、推測のコード修正、期待値変更、skip、期限延長は行っていない。

この未解決の全E2E失敗を明示するため、PRはドラフトで作成する。CIのsmokeには100試合テストが含まれず、CI成功と全E2E成功を区別する。

Mobile WebKitは既存E1の範囲であり、ポスティング固有テストはChromium。iPhone実機・全画面の目視検証は未実施。表示文言やレイアウト/CSSは変更していない。

## ステータスと残存課題

| ID | 状態 | 次の確認 |
|---|---|---|
| D01 | 再現済み → 本ブランチで修正・回帰成功。main未反映 | PRのCI確認、レビュー/マージ後mainへの反映確認 |
| D02 | 疑い（コード上、`postGame.js`がHRをHpから除外） | 次のPRで通常/バッチ/戦術・累計・WHIP・保存を再現 |
| D03 | 疑い（表示配列と計算定数の不一致が残存） | 次のPRで各レベルの表示と同一入力の出力を再現 |
| D04 | 疑い（予測は71〜72試合、通常収入処理は全試合） | 次のPRで引分/通常日程・開幕前/終了時を再現 |
| D05 | 疑い（正常な正の年俸で自分の110%/90%と比較） | 別PRで同一乱数の動作不変を検証 |
| D06 | 疑い（終了画面は勝利/敗北の二択） | 別PRで2対2/0対0等の表示を再現 |

D02〜D06はソース確認のみで、実行による再現・修正は行っていない。先行PRがmainへ反映されるまでは次の修正に進まない。第2段階の仕様評価、F3/F4、物理/確率/契約査定/CPU配点の変更は含めない。

追加発見: `HubHeader.jsx` と `DashboardOverview.jsx` は万円単位の予算に円用の`fmtM`を使用している。経営タブは`fmtSal`を使用しており、今回の受取額との整合を検証した。ホーム表示の別経路は本PRで変更せず、別課題として残す。過去に誤加算された予算も補正しない。
