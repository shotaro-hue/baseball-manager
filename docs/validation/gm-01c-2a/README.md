# GM-01C-2A 契約区分・支配下転換の検証

基準main: `818ae5025dd749b9bb254bbfcdcd7ba4ceb5cbc9`（#507マージ後）。

## 実装範囲

契約正本に任意の`registrationType`（`controlled`/`development`）を保持し、既存台帳に転換日と新年俸を一つの境界として追加する。`contractEmploymentAt`が日時別の区分と給与を導出する。現在名簿と明示区分が矛盾する場合は拒否。未記録の旧GM-01基盤入力はC-1と同じ分類で見積できるが、育成区分を推測して転換することはしない。

`quoteAnnualTransaction`/`applyAnnualTransaction`へ`convert-to-controlled`を追加し、台帳・名簿・支配下人数・年度別予算/最低維持費・確定履歴を同じ候補stateへ反映する。一軍/二軍配置は変えず、満員一軍でも二軍で転換する。確定時に現所属・契約ID・期限・予算・受諾済み新人を含む70人上限を確認する。契約ID、終了年度、保証を継承する。

```js
const command = {
  id: 'unique-conversion-id', type: 'convert-to-controlled',
  teamId: 0, playerId: 'player-id', contractId: 'contract-id',
  annualSalaryManYen: 420,
};
// 効力日は最新state.dateから。quoteの結果stateを保存/確定する方式ではない。
```

## 金額と境界の確認

| 条件 | 当年の選手負担（万円） | 次年度以降 | 配置・期間 |
|---|---:|---:|---|
| 年俸240→420、7月16日転換 | 322 | 420 | 二軍に残留。元の終了年を維持 |
| 年俸600、同額で転換 | 600 | 600 | 区分だけ変更。年俸低下なし |
| 2026〜2028契約を2027年に転換 | 2027年322 | 2028年420 | 残年数2、終了2028年 |
| 支配下69人＋受諾済み支配下新人1人＋育成 | 変更なし | 変更なし | 転換で71人になるので全体拒否 |
| 支配下69人＋受諾済み育成新人＋転換対象 | 月割り差額を計上 | 新年俸 | 支配下70人まで可能 |

7月31日までの転換、8月1日の拒否、途中移籍後の区分/年俸、退団後の保証残債、元の終了年を確認する。未来の明示支配下契約留保は、現在の育成フラグを引き継いで分類しない。転換の増額を同時の引退による負担減で隠し、赤字年度に新規支出を通すことも禁止する。

## RED → GREEN

- 契約/台帳追加19ケースのうち12ケースが修正前RED、7ケースは既存の拒否境界を保護。修正後2ファイル67件成功。
- 共通取引/支出審査追加ケースで15件REDを確認。育成転換の未対応、支配下専用FAに明示育成契約が入る問題、転換増額を隠す赤字審査を検出。
- 修正後、契約/台帳/月割り/暦/人数/取引/支出審査の8ファイル260件成功。独立レビュー後に6件を追加し、最終8ファイル266件成功。新しい年度取引ファイル33件、支出審査1件、契約/台帳19件の合計53追加ケース。
- 再読込後の同ID再適用、変更条件でのID衝突、二重転換、古い契約/所属、凍結入力、見積と確定行の一致を検証。テスト削除・skip・期待値の緩和は行わない。

```bash
npx vitest run src/engine/__tests__/annualDevelopmentTransactions.test.js src/engine/__tests__/annualTransactions.test.js src/engine/__tests__/annualSpending.test.js src/engine/__tests__/contractLedger.test.js src/engine/__tests__/seasonContract.test.js src/engine/__tests__/contractCalendar.test.js src/engine/__tests__/monthlyPayroll.test.js src/engine/__tests__/rosterCapacity.test.js
```

## 統合確認・独立レビュー・CI

既存hook/契約/トレード/FA/編成計画/GM-00の11ファイル127件も成功。上記8ファイルと合わせた関連確認は19ファイル393件。`npm run build`成功、既存の500kB超chunk警告は継続。`git diff --check`成功。

```bash
npx vitest run src/hooks/useGameState.rosterCapacity.test.js src/hooks/useGameState.contractReplies.test.js src/hooks/useGameState.offseasonSave.test.js src/engine/__tests__/contract.test.js src/engine/__tests__/renewalRules.test.js src/engine/__tests__/tradeTransaction.test.js src/engine/__tests__/salaryDemand.test.js src/engine/__tests__/faDeclaration.test.js src/engine/__tests__/rosterPlanning.test.js src/engine/__tests__/rosterPlanning.integration.test.js scripts/gm00-contract-audit.test.js
npm run build
git diff --check
```

独立した新しいコンテキストのレビューでImportant1件、Critical/Minor0件。受諾済み新人の明示契約区分と候補フラグが矛盾すると、費用側と70人枠側の分類が異なる問題を確認した。両方向の矛盾・71人目の抜け道を3件のREDで再現し、受諾球団まで検証した新人データと`rookie`留保の明示区分が異なる状態を拒否するよう修正。整合した支配下/育成留保、古い重複候補、正当な将来更改の区分変更も保護した。レビュー後の関連8ファイル266件は全成功。二回目の独立レビューを行ったとは扱わない。

最終headのCIはPR本文の品質ゲートを正本とする。全スイートは既存CIを再利用し、ローカルで重複実行しない。未完了・失敗を成功と認定しない。

## 合成見積負荷

ソースcommit `ed85dac96a34616f15cc5af358b639e683452ce5`、Node24.22.1/Linux x64/AMD EPYC 9V74で既存780選手・7年契約・84年度枠の無金銭交換見積を測定した。ウォームアップ1回、同じ凍結入力で5回。中央値596.5ms、最小558.1ms〜最大643.8ms。全行の一致、入力非変更、確定履歴0件を確認。[生データ](./performance.json)。

```bash
node scripts/benchmark-annual-transactions.mjs
```

既存FA/トレードAPIの極端な性能退行を探す合成測定であり、新しい転換の実運用性能や実iPhoneの保証ではない。同時比較をしていないため改善率は示さない。本番接続時に連続見積の頻度と主スレッド停止を別途測定する。

## 未接続・未検証

C-2全体の完了ではない。本番hook、CPU/委任/Worker、通常更改/オフの翌年効力/新人の加入/本物の育成加入/非同期回答は後続C-2。年度更新、実保存移行、UI/コーチはD。未接続・未校正の新制度は有効化しない。実機iPhoneの操作や連続見積性能は未検証で、本番接続時の必須ゲート。既存本番の支配下転換で契約を1年にする制度自体を変更したものではない。JSON往復と候補stateの原子性を、実保存の競合・クラッシュ回復完了の根拠にしない。
