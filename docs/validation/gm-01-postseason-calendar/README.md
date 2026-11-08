# GM-01 postseason calendar — 検証と接続範囲

main `bb77dad693769c0eef454eb4422326b0d0545635`（#557マージ後）から実施。
[設計](../../superpowers/specs/2026-11-08-gm01-postseason-calendar-design.md)／[実装計画](../../superpowers/plans/2026-11-08-gm01-postseason-calendar.md)

## 今回の効果と実データ経路

通常プレイの最終公式戦から開始する新しいCS・日本シリーズは、最終公式143戦目の実日程を起点にしたゲーム内calendar v1を持つ。起点は既存`economyClockFor`で検証し、配列末尾の7月All-StarやgameDay144を使用しない。新しい`series.startDate`・`games[].date`は既存`offseasonPlan.playoff`に含め、手動/自動保存・読込・途中再開を通じて固定する。通常シミュレーションと一括シミュレーションの共通fixtureを利用し、乱数・結果・所属・予算の計算は変えない。

`postseasonClosingDate`は新しい日付付き全seriesの試合結果を既存seriesルールで再生し、日付、得点、ホーム、勝敗、advantage、勝ち上がり、日本一が一致した完了時だけ最終試合日を返す。未完了はnull。旧未記録履歴は日付を補完せずnull。日付の一部削除、元公式日程の改変、12/1以降へ越える日程は拒否する。最終戦を含む操作は日程検査を先に行い、検査失敗時にはWorkerやstate更新を開始しない。

## RED → GREEN

- 実日程からのcalendar生成テスト：旧実装ではcalendarが未定義で失敗。
- 最終戦のhook入口：旧実装では日付付きplanを生成せず、実施不能な日程でもWorkerを開始して失敗。テストfixtureに必要な既存setterを揃えてから、この期待したREDを再確認した。
- 再開時の元日程欠落と上限超過試合：拒否されないREDを確認し、明示拒否へ。
- 既存のfixture省略API：日付付き試合のhomeIdが未記録になって終了照合が失敗するREDを確認し、日付付き新規履歴では共通fixtureを取得するよう修正。旧未記録履歴の値は変更しない。
- 独立レビューで11戦上限の誤りを検出：7引分＋勝敗交互なら14戦が必要。実ルールによる第12戦での拒否と、11/1最終公式戦の日程を誤って受け入れるREDを確認し、14戦までの容量と11月境界を検証するよう修正。

## ローカル検証

- 関連Vitestはcalendar、playoff、economyCalendar、season hook、保存、画面flowを対象とする。修正前77件成功、レビュー修正後の最終件数はPRへ記載。
- calendar専用15件：実生成日程、2025/2026/2027、早期決着/両リーグ順序、特殊CS7戦、日本シリーズ7引分+追加4戦/追加7戦、移動日、途中JSON、旧履歴、日付/勝者矛盾、日程不足、12月境界、保存再試行を関連テストと合わせて確認。
- build：初期実装で成功。最終HEADのbuild・全unit/integration・必須E2Eの正本はPRのCI結果。
- Chromium/WebKit：既存E2の「最終公式戦→CS途中保存→再開→日本一→翌年」を日付・終了照合付きへ拡張。従来WebKitの対象外だった同テストを対象へ追加した。初回WebKitはPC用入口指定`startSingle(page,false)`で存在しないdesktop buttonを待って120秒で失敗。snapshotはmobile-homeの実ボタンを示しており、画面幅を既存helperへ渡す修正を行った。timeout/retry/期待値の緩和はしていない。最終の両ブラウザ結果・HEAD・独立レビュー結果はPR本文を正本とする。
- 画面/CSS/ユーザー操作の変更なし。実機iPhone Safariは未実施。

## 未完了範囲

今回の終了日はnative年度取引のreceiptではない。annual時計に新phaseを追加せず、無効なgameDay144の拒否を維持している。翌年度予算forecastと承認、native open-offseason、期末の新規引退判断、成長・要求額、翌春builder、annual Worker、長期プレイ、実iPhoneが残る。公開OFF/schema1/DB5。親機能・A1・通常プレイannual年度完走は未完成であり、この基盤PRの完了と区別する。次優先は翌年度予算forecastと、今回の終了根拠を併せて利用するopen-offseason。
