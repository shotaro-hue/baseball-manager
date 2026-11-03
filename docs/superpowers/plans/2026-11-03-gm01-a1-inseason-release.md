# A1-2c-2b 期中解雇の共通取引への接続

承認済みユーザー計画を実施する。基準mainは #538 マージ後の bd73308a00fbfda9c9cfd875e78c96e7e114ba94。

## 目的・制約

- v2/season の enter-market / reason:release を共通取引へ接続。時計・gameDayはworldの正本から供給し、commandから指定させない。
- 名簿除去後に両軍の成立を検査し、証明用配置は採用しない。既存の待機を維持し、新しい10日待機は設定しない。
- 現在日からend/release/retain。過年度・経過給与・残債・旧保証不明を維持し、直接返金しない。
- 更改留保は取消履歴を保持。将来受諾契約と人向けpending更改decisionは拒否する。
- 既存offseasonDeparturesに期中新規行だけphase:season/gameDayを記録。元契約単体から通知時点を再構成し、再雇用や後日の健康状態へ依存しない。
- 冬/v1/legacy、schema/DB version、公開ゲートOFFを維持。引退/UI/CPU/Worker/一般公開は対象外。

## 実装・検証順

1. 正常・不足・時計/入力・給与・留保/競合・市場/期限・再読込/改変のREDを追加する。
2. 退団recordとworldの一時gameDay投影を最小実装しGREENへ進める。
3. 実際の初期データ、保証不明、移籍/昇給、小/大root保存失敗と再実行を検証する。
4. 冬/成立判定/台帳/更改/FA/保存commit回帰とbuildを確認する。
5. 独立レビュー・指摘検証/修正・最新HEADの必須CI確認後、新規PRで未マージ提出する。

## Review Focus

時計/roundの外部指定とengineへの重複保存、通知前への巻戻し、孤立/改変された退団とreceipt/action、同日再雇用時の旧契約再構成、最低維持費の復活と負債保全、人のdecisionと留保の不整合、同じ検証の重複による性能劣化を確認する。
