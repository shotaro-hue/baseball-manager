# GM-01C-2A-FIX — PR #508 レビュー指摘修正

実施日：2026-10-28。修正前head：`c6a081245d9433b43d40dd0329cd3026ce61857a`。main：`818ae5025dd749b9bb254bbfcdcd7ba4ceb5cbc9`。既存PR #508に追加し、マージ・自動マージは行わない。

## 再現と根本原因

1. `annualTransactions.inspect`の受諾済み新人Mapは選手だけを保存し、獲得球団を捨てていた。別球団の同区分留保も通り、同じIDが複数球団の受諾済み一覧に現れた場合は後の球団で上書きしていた。
2. `validateSeasonContract`は明示区分の列挙値と非負の年俸を検証していたが、区分別の最低額を検証していなかった。そのため低額の留保も資金確保済みの支配下人数に算入され、最低維持費を小さくできた。

## 修正の責務

- 新人の正本は既存の`evaluateRosterCapacity`がドラフト確定情報と照合した受諾済みレコード。Mapに`{player, teamId}`を保持し、複数球団で同一新人が受諾済みなら拒否する。`rookie`留保の球団と明示契約区分を、この正本と照合する。旧C-1の区分未記録留保も球団照合は行う。
- 明示区分付きの契約は実際の選手契約を表すため、既存の`validateSeasonContract`に最低額の検証を集約。`MIN_SALARY_SHIHAKA`／`MIN_SALARY_IKUSEI`を利用し、固定値を重複定義しない。構築・台帳正規化・支出留保・JSON入力検証へ既存API経由で適用する。`annualSpending`に同じ判定を重複追加しない。
- 区分未記録のC-1入力と汎用ゼロ金額台帳は従来どおり。保証残債・移管・終了の計算と、現在の育成フラグから独立した正当な翌年更改は変更しない。

## RED → GREEN の実測

| 実行 | ファイル | 成功 | 失敗 | skip |
|---|---:|---:|---:|---:|
| 修正前の既存関連テスト | 4 | 153 | 0 | 0 |
| 追加テストのみ反映、製品コード修正前 | 3 | 128 | 19 | 0 |
| 製品コード修正後、同じ期待値 | 3 | 147 | 0 | 0 |
| 関連回帰 | 19 | 417 | 0 | 0 |

追加24件。19件は期待した拒否不足でRED、5件は境界の正常系・旧入力互換性を修正前から保護。独立レビューで区分未記録ケースのfixtureにヘルパーの既定区分が残る問題を指摘され、明示的に区分プロパティを省き、正当な球団では成功することも確認する形へ修正した。最終テスト3ファイルを修正前headの別checkoutへ適用し、改めて19件REDを確認し、修正後の同じ最終テスト147件がGREEN。テスト削除、追加skip、期待値緩和なし。実行結果は[RED](./red-summary.json)、[GREEN](./green-summary.json)、[関連回帰](./regression-summary.json)。

検査対象：別球団の支配下／育成／区分未記録留保、同一新人の複数球団受諾、古い不整合候補の両順序と古い抽選結果、正当な獲得球団、支配下419/420・育成239/240、明示区分のゼロ拒否、区分未記録0/239/419維持、偽造JSON留保と有効台帳、70/71人境界。異常時のquoteにrowsがなく、applyが元stateをそのまま返し、名簿・台帳・予算・確定履歴の全JSONが非変更であることを、凍結入力とJSON再読込の双方で確認した。

```bash
npx vitest run src/engine/__tests__/seasonContract.test.js src/engine/__tests__/annualDevelopmentTransactions.test.js src/engine/__tests__/annualSpending.test.js
```

RED再現は修正前headの別checkoutへこのPRで追加した3テストファイルだけを適用し、上のコマンドを実行する。製品コードの最低額検証または球団照合を外すと対応テストが失敗する。

## 回帰・ビルド

契約台帳・年度別支出審査・共通取引・支配下転換・新人分類・70人枠・FA/トレード・月割り・契約更新・保存JSON往復を19ファイル417件で検査した。元の7月16日240→420万円転換の当年322万円／翌年420万円、契約ID・終了年度・保証・同額転換・二軍残留・確定IDの冪等性は既存テストが成功。

```bash
npx vitest run src/engine/__tests__/annualDevelopmentTransactions.test.js src/engine/__tests__/annualTransactions.test.js src/engine/__tests__/annualSpending.test.js src/engine/__tests__/contractLedger.test.js src/engine/__tests__/seasonContract.test.js src/engine/__tests__/contractCalendar.test.js src/engine/__tests__/monthlyPayroll.test.js src/engine/__tests__/rosterCapacity.test.js src/hooks/useGameState.rosterCapacity.test.js src/hooks/useGameState.contractReplies.test.js src/hooks/useGameState.offseasonSave.test.js src/engine/__tests__/contract.test.js src/engine/__tests__/renewalRules.test.js src/engine/__tests__/tradeTransaction.test.js src/engine/__tests__/salaryDemand.test.js src/engine/__tests__/faDeclaration.test.js src/engine/__tests__/rosterPlanning.test.js src/engine/__tests__/rosterPlanning.integration.test.js scripts/gm00-contract-audit.test.js
npm run build
git diff --check
```

ビルド成功（16.64秒）、既存の500kB超chunk警告あり。依存やlockfileは変更していない。最新headの全CIジョブ結果とマージ判定はPR本文の最終品質ゲートを正本とする。

## 独立レビュー

新しいコンテキストのレビューで製品コードのCritical／Importantは0件。区分未記録ケースのfixture不足1件は、今回保証する互換性の検証に必要と判断して修正し、上記の修正前headでのRED再現からやり直した。レビュー後の新しい製品コード変更はない。二回目の独立レビューを行ったとは扱わない。

## 後続工程の条件

C-2へ進む前提は、本修正を含む最新headの全CI成功と#508のマージ確認。本PRでは本番hook、CPU・委任・Worker、新育成ドラフト、契約更改全面改修、年度切替・保存移行、UI、バランス係数、既存本番の支配下転換を1年契約にする仕様は変更しない。

本番接続前には人/CPU/委任/Workerの経路、非同期回答、正当な翌年効力・新人加入の統合と、実iPhoneの連続見積性能を確認する。今回のJSON往復を実セーブ移行・実機性能の検証とは扱わない。
