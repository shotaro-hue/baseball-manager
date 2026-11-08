# annual 引退予約→12/1 posting 接続

基準main `7f01546f9a113bf0cedf5f5303501d5854785cab`、#556マージ済み。
[設計](../../superpowers/specs/2026-11-08-gm01-offseason-posting-entry-design.md)の独立工程。

## 今回できることと入口

annualの保存済み12/1の引退整理で、一軍/二軍/CPUの既存予約を確認し、
既存finalize-retirement→advance-posting-phaseを一候補・一revisionで保存する。
引退者の当年/ポストシーズン成績はcareerへ、保証残債と欠員留保は共通予算審査へ残す。
自球団の希望は受信箱で承認待ち。当年の能力・成績・年齢はリセットしない。

実入力は`createInitialTeams`の名簿→annual作成/保存/読込→useGameState→useOffseason→
AppScreenRouterのretire_phase。試験は同じreserve-retirement commandで実際に予約し、
既存の明示winter fixtureで12/1へ置く。実12球団は元の年俸・能力・欠測志向を使う。
fixtureの12/1生成を、未接続の年度Workerや通常年度完走の成功とは扱わない。

## 検証

- RED: 合成command未対応、年度handlerが予約を確定しない、画面が旧抽選を表示することを確認。
- 予約確定後にCPU予算不足があれば`future-budget`で拒否。引退そのものが生んだ不足は残すが、postingでさらに悪化させない。
- 既存phaseの無改変再利用、希望確認後の未確定予約は順序不整合として失敗。
- 原本保持、同入力の決定性、旧receipt再利用、save/epoch/revision/年度/日付/自球団/session/unmount/重複準備を確認。
- 契約/予算台帳と親子receiptの改変・削除・順序破損は明示失敗。親へ新規子を後付けする保存を拒否。
- 実12球団の予約確定込みの非同期候補・検証は約10.2秒（同時に関連テストを実行したローカル値）。性能保証や実iPhone測定とはしない。
- 引退/CPU posting/日程/人の判断/保存の関連8ファイルでは、初回168成功・1失敗。失敗は読込後の期中記者会見effectがannualオフのbaseをdirtyにし、保存が2回になる再現。
- phaseガードと非同期取消後、同じ1回保存条件、hook/既存画面/年度再開/試合履歴4ファイル47件がGREEN。
- Chromium/WebKit各3サイズ、計6ケース成功。容量エラーで元root/履歴を保持→同じ入力の再試行→1回保存→cold reload→受信箱と人判断待ちを確認。
- ローカルWebKitは既存Playwright配布の同一バイナリへ不足OSライブラリを/tmpから供給。テスト/timeout/retry条件は変更していない。
- build成功。正確な最終HEAD・追加回帰・独立レビュー・必須CI結果はPR本文を正本とする。
- 別コンテキストのレビュアーがbase `7f01546`→実装`edd6310d`を独立確認し、P1/P2指摘なし。子の予算審査、保証/欠員留保、履歴/順序/後付け、保存/career、競合防御とUIを対象にした。レビュー担当は同じテストの重複実行をしていない。
- 最終native回帰は22件成功、実12球団は約7.5秒（共通入口準備を含めた当該テスト約8.9秒）。実施済み予算/保存回帰は7ファイル332件成功。

## 画面

同じ12/1保存状態。beforeは既存legacy表示を同じ入力で描画したもの。

| 幅 | 変更前 | 変更後 |
|---|---|---|
| 360px | [before](./360-before.png) | [after](./360-after.png) |
| 390px | [before](./390-before.png) | [after](./390-after.png) |
| 1440px | [before](./1440-before.png) | [after](./1440-after.png) |

[390px保存失敗](./390-failure.png)／[保存後再開](./390-reload.png)。横溢れなし、確認ダイアログ・再試行・受信箱遷移を確認。
既存CSS/部品/表示境界は維持し、レイアウトのbreakpointは変更していない。

## 残工程・公開

open-offseason全体とポスティング全体は未完成。gameDay144から有効な閉幕日付を生成する
postseason/年度Worker、期末の新規引退判断、翌年度budget forecast、成長/要求額/更改/FA/
翌春builder、通常プレイの年度完走・長期検証が残る。次優先は明示時計と予算producerの接続。
過去に希望/phaseを先に保存して未確定予約が残るセーブは読み込めるが、新合成入口では順序不整合として停止する。過去判断を改変する自動修復はこの工程に含めない。
実機iPhone Safariは未実施。公開OFF/schemaVersion1/DB5、legacy互換と既存履歴を維持。
