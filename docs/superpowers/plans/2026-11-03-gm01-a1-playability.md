# A1-2c-2a 退団後の試合成立判定 Implementation Plan

**Goal:** 親計画Task 7の期中退団に先立ち、取引後の保有選手から一軍・二軍を同時成立させる純粋な共通判定を追加する。
**Spec:** [承認済み接続設計 §3・§5.1](../specs/2026-10-30-gm01-a1-integration-design.md)。ルートAGENTS.mdの「次へ進めて」に従って実施。

## 対象・非対象

`assessPostTransactionPlayability(team, {round})` は取引後の球団snapshotを受け、`{ok, reasons, team?}`を返す。成功時のteamは成立を示す検証用の配置で、最適な編成や実際の採用候補ではない。保存・契約・選手能力・待機日数を変更しない。期中command、引退予約、hook/UI、CPU、Worker、年度更新は後続。公開ゲートOFF、schema/DB versionを維持する。

## 方針

既存の完全編成plannerだけでは一軍を埋めて二軍人数を不足させる可能性があり、全配置列挙は不要に重い。最小成立配置（一軍9野手＋1投手、二軍9野手＋1投手と捕手）を構成し、既存validateTeamRoster/selectFarmTeamへ通す方式を採用する。一軍は実捕手適性を持つ選手を必須とし、他守備位置は既存の緊急配置を使う。外国人枠、育成、故障、元から二軍にいる選手の再登録待機を守る。これは65/67人方針・一軍捕手2人推奨・投手疲労の保証ではない。

## Review Focus

- 同じ捕手/投手を両軍で使わず、二軍の実捕手適性を残す。
- 育成・故障・再登録待機・引退済み選手を一軍成立の根拠にしない。
- ID 0、重複/文字列衝突ID、不正役割/日数を処理する。
- 元チーム/選手を変更せず、再読込後も同じ判定になる。
- 実際の初期データでも成功し、能力/給与/契約/予算を変えない。

## Task 1: 共通判定

Files: `src/engine/postTransactionPlayability.js`、`src/engine/__tests__/postTransactionPlayability.test.js`。

- [ ] 最小成立/捕手・投手・野手不足/育成・故障・待機/外国人/実データ/非変更のテストを先に書き、REDを確認。
- [ ] 最小成立配置を構成し、既存の両軍validatorで最終検査する。
- [ ] 対象テスト、既存編成・退団回帰、buildを確認する。
- [ ] 独立レビューの指摘を検証し、修正後のテストを記録する。
- [ ] main向けPRを作成し、最新HEADの必須CIを確認。マージしない。
