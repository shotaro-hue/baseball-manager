# GM-01C-2D 同一年度FAの後日回答

基準main: `daddaf8a17f14e533ce290e1ec20ec0d74640779`（#510マージ済み）。[設計](../../superpowers/specs/2026-10-28-gm01c2d-delayed-fa-design.md)／[実装計画](../../superpowers/plans/2026-10-28-gm01c2d-delayed-fa.md)。新制度専用stateの共通APIであり、本番のFA進行は切り替えない。

## 変更と不変条件

- `annualSpending`は元提示を解決履歴の`proposal`に残し、後日受諾だけ任意の`acceptedProposal`を記録する。実signは受諾日の効力日を使う。受諾条件が元のFAから同一開始年度内で効力日だけ後進したものか、実台帳と一致するかをquote/assessment/commit/再読込時に検証する。
- `commitContractReservation(plan, proposal, {effectiveDate})`は元提示を入力に取る。更改/新人の効力日は変更できない。同日受諾と既存二引数APIのデータ形は維持し、元提示の再適用、確定済み受諾日の変更拒否、履歴の追記専用性を保つ。
- `annualTransactions`はFAの新提示と回答を区別する。新提示は当日の現フェーズ、後日回答は同年かつ時期が前進する場合に限定。実効力日はstate.dateから導出する。見積と失敗は全体非変更。現在名簿・市場・予算・登録/配置制限を再審査し、名簿/台帳/留保/確定IDを一括更新する。

年俸10000万円×3年、7月1日提示→7月16日受諾では、初年度の留保5000万円が確定4516万円へ変わる。将来2年度は各10000万円、契約ID/年数/満了/保証/合意フェーズは変わらない。現在年俸の表示と旧budgetは維持する。

## RED→GREENとローカル検証

依存は既存lockの`npm ci --no-audit --no-fund`で初回のみ準備。依存/lock/CIは変更しない。

| 段階 | 実行・結果 | 確認したこと |
|---|---|---|
| 変更前 | annualTransactions / annualSpending / contractLedger の3ファイル124件成功 | 既存FA・審査・台帳の基準 |
| Task 1 RED | 新規annualDelayedFaSpending 34件中19失敗/15成功 | 受諾日が無視されること、後日受諾メタデータが未検証であることを確認 |
| Task 1 GREEN | 新規34件＋既存spending/ledger85件、計119件成功 | 4516万円の実効力日、元提示/実受諾履歴、型/日付/年/区分/保証/額/IDの偽装拒否、再適用 |
| Task 2 RED | 新規annualDelayedFaTransactions 34件中26失敗/8成功 | 同日限定のFA検証が後日の正当な回答を拒否することを確認 |
| Task 2 GREEN | 新規2＋既存annualTransactions/development/renewal/rookie/spending/ledger/capacity、9ファイル433件成功 | 以下の取引全体の回帰 |

最終関連コマンド:

```sh
npx vitest run src/engine/__tests__/annualDelayedFaTransactions.test.js src/engine/__tests__/annualDelayedFaSpending.test.js src/engine/__tests__/annualTransactions.test.js src/engine/__tests__/annualDevelopmentTransactions.test.js src/engine/__tests__/annualRenewalTransactions.test.js src/engine/__tests__/annualRookieTransactions.test.js src/engine/__tests__/annualSpending.test.js src/engine/__tests__/contractLedger.test.js src/engine/__tests__/rosterCapacity.test.js
```

- 月またぎ、開幕前→同年シーズン、7月31日成功/8月1日拒否、提示日前/フェーズ逆転/不正日/年度越え拒否を検証。
- 見積後の3契約年度の各予算不足・許可/必要人数の欠測、市場離脱・引退・両育成フラグ変更、69人＋受諾新人1人の満員を再審査。受諾日負担が減った結果、新しい許可額内に収まる場合は許可する。
- 現在の故障/再登録待ち/一軍28人/外国人枠で二軍配置する。年俸の市場メタデータが変わっても合意年額を維持する。両球団それぞれを勝者にし、赤字の敗者も留保を解放。別件の新人・更改、別市場選手を維持する。
- 期限後の当年度取消・失敗/見積の全体非変更・JSON再適用・別ID二重受諾拒否を確認。新制度stateのJSON往復は、本番保存移行の検証とは区別する。

本番ビルド・配信hash・最終差分検査と独立レビュー/全CIの結果は、確定後の対象PR本文を正本とする。CI待ちや未実行を合格と扱わない。

## 境界と後続

このPRは同一年度FAの後日回答まで。合意フェーズは提示時の値を保持し、開幕前→シーズン中でも契約終了年を延ばさない。通常のJSON保存対象データと信頼済みsnapshotの日付/フェーズを前提とし、実ゲームの暦への接続や自動回答スケジュールは未実装。

オフFAの翌年効力・加入、人/CPU/委任/Workerの本番接続、年度更新・旧保存移行・UI/コーチ、接続後の動的校正、実iPhone性能は後続C-2/D。既存の本番ゲーム係数・FA評価式・乱数呼出・育成ドラフト・保存形式・画面は変更しない。完全バックアップ/復元は保留。#509で記録された年次E2Eの引退ダイアログによる保存クリック遮蔽は未修正であり、このPRの成果と扱わない。main直接push・マージ・自動マージは行わない。
