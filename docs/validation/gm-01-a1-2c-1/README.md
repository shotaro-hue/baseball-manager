# GM-01 A1-2c-1 検証記録（2026-11-02）

対象: [冬の退団共通処理](../../superpowers/plans/2026-11-02-gm01-a1-winter-departures.md)。基準main: `bf4651a` (#535マージ済み)。

## 調査と変更

現行annualは非空のoffseasonDeparturesを一律拒否し、冬の名簿を11/30の雇用と一致させるため、名簿だけ削除すると保存不可になる。
台帳上の給与負担と現在の名簿を分離し、receiptに裏付けられた冬の退団だけを照合から除外する。
自然満了はend actionを作らない。継続保証/旧保証unknownは翌2/1から所属を終了し保証残額を留保する。
元年俸/契約/能力/成績snapshotは記録に残し、既存の配置参照削除helperを再利用する。

未更改計画の原本は変更せず、検証済み退団記録をspendingへの一時投影として見積に渡す。永続正本はengine.offseasonDeparturesのみ（receiptは確定証跡）。投影の重複保存は拒否する。

## 検証

- 着手時のcontractEconomy/annualTransactions: **118 passed**。
- RED: annualDepartures **11 failed / 7 passed**。冬のenter-marketが未対応で拒否されることを確認。
- GREEN: 初期18件成功。既存annual/契約world/移行/計画の回帰 **17 files / 877 passed**。
- 追加検証: annualDepartures **32 passed**（自然満了・保証継続・旧unknown・正式市場で再獲得・履歴改変・engineの11/30境界）。
- 実保存: economy-save-migration **148 passed**。小root/大rootとも保存→冷読込→失敗保存時のroot保全→再保存→再読込→取引replayを確認。
- 追加テストの初回2件失敗はfixture条件の誤り: 移行元phase未指定、world時計が固定12/1なのに11/30を設定。前者は既存移行前提を満たすseason、後者は暦日を明示できる共通engineで検証。productionの時計制約は変更しない。
- 自己点検で、過去に解雇された保証契約が残る再加入選手の翌冬退団を拒否する問題を再現（RED 1/24）。将来の有効な雇用約束だけを拒否対象に修正（GREEN 24/24）。元球団の保証残額は維持。
- 独立レビューの指摘: 市場掲載/退団履歴の欠落・改変と元契約短縮を冷読込時に拒否できなかった。7件REDを確認し、元台帳recordのsnapshot、退団履歴、掲載または正規市場受諾との照合を追加。GREEN 31件＋保存148件。引退予約済み選手を獲得不能な市場候補にしてしまう指摘もRED→GREENで修正（退団テスト合計32件）。
- 最終build/回帰/独立レビュー/最新HEADのCIはPR本文に記録する（CI確認後の文書だけの再commitで検証HEADを変えない）。

## 非対象・未検証

UI変更はなく、今回の新退団操作のブラウザ画面検証対象はない。既存Chromium/mobile WebKit回帰は必須CIで確認する。人の操作・メールdecision・CPU・期中退団・FA宣言・海外離脱・収入・翌春/年次の本番接続は未実装。本PR単独でTask 7/A1完了やannual一般公開としない。
旧タブのJavaScriptを停止する仕組みは追加しない。既存CAS/セッション保護/保存schema・DB versionを維持する。
