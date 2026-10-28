# GM-01C-2C 新人・育成入団の共通取引

基準main: `ea9457d269b0199db7d9af871798884b11b75fbc`（#509マージ済み）。実施日: 2026-10-28。

## 変更と金額

`reserve-rookie`で受諾済み未加入選手の翌年1年契約を実年俸で留保し、`decline-rookie`で新人の留保と受諾済み枠を一緒に解放する。翌春の`join-rookie`は同じ契約を台帳と二軍名簿へ確定する。

年額1,000万円の在籍選手と、新人の例（年間許可50,000万円、必要支配下1人）:

| 状態 | 確定給与 | 新人留保 | 最低維持費 | 追加余力 |
|---|---:|---:|---:|---:|
| 支配下新人600万円を留保 | 1,000 | 600 | 0 | 48,400 |
| 同新人が入団 | 1,600 | 0 | 0 | 48,400 |
| 育成新人240万円を留保 | 1,000 | 240 | 0 | 48,760 |
| 同育成新人が入団 | 1,240 | 0 | 0 | 48,760 |

必要支配下2人で育成新人を留保・入団した場合、420万円の不足維持費は残り、追加余力48,340万円となる。育成新人で支配下の不足を埋めない。

受諾は既存capacityの正当な獲得球団・区分を参照。古いプール先頭や抽選スナップショットを採用しない。明示区分・最低年俸・翌年2月1日・1年契約を検証し、旧データの区分は自動補完しない。現在名簿と旧budgetは留保時に変更しない。入団後も指名メタデータを残し、所有権がある選手を未加入枠へ二重計上しない。

## ローカル検証

- 変更前の関連3ファイル135件成功。
- Task 1: 新規27件中11件が未対応コマンドによるRED、残り16件は不正入力拒否の保護。実装後27件GREEN、関連4ファイル162件成功。
- Task 2: 全52件中、未対応の入団操作10件RED、42件成功。実装後の新規52件を含む関連7ファイル297件成功。
- 支配下69人＋受諾済み1人→入団後70人、支配下70人＋育成新人、両育成フラグ、71人拒否、辞退済み/別球団/区分変更/市場/引退、未来日/年度/フェーズ、予算不足、別案件保持、見積非変更、失敗時全体非変更、JSON往復・同ID再適用を検証。
- `npm run build`、`git diff --check`を実行。通常CIの最終headで全`npm test`と既存ブラウザ群を検証し、結果と独立レビューの最終状態はPR本文を正本とする。CI待ちや再実行を未記載の成功扱いにしない。

再現コマンド:

```bash
npx vitest run src/engine/__tests__/annualRookieTransactions.test.js src/engine/__tests__/annualTransactions.test.js src/engine/__tests__/annualDevelopmentTransactions.test.js src/engine/__tests__/annualRenewalTransactions.test.js src/engine/__tests__/annualSpending.test.js src/engine/__tests__/contractLedger.test.js src/engine/__tests__/rosterCapacity.test.js
npm run build
git diff --check
```

## GM-01C-2C-FIX：重複新人属性の整合性

レビュー対象head: `d4385d1c0de305f9fa5525036e68477714280001`、既存PR #510へ追加。実装計画は[重複候補修正](../../superpowers/plans/2026-10-28-gm01c2c-duplicate-fix.md)。

### 原因と正本調査

`evaluateRosterCapacity`は候補ごとに獲得球団と区分を検証した後、同じID・区分の重複を除外する。受諾済み候補の任意の属性までは比較せず、`acceptedRookie`がその先頭を使うため、同一球団・同一区分でも能力50/80の配列順で入団データが変わり得た。`drafted`はIDに対する最終指名球団、`_drafted`/`_r1winner`は候補の指名履歴、`confirmedPicks`は途中の抽選結果であり、候補単位の鮮度や能力の正本は示さない。draftCapacityContextが選ぶdraftResult.poolにも重複内の版情報はない。

### 修正と比較境界

製品変更は`annualTransactions.js`の新人取引境界のみ。共通`rosterCapacity.js`や本番のドラフト加入処理は変更しない。

- 同じIDの各重複候補を、元のteams/drafted/confirmedPicksを保ったまま単一レコードのcapacityで再判定する。球団不一致等で不受理の古い候補は比較しない。既存の球団/区分/所有権検証はそのまま残す。
- 正当な候補が複数あるとき、入団後へ引き継ぐ全属性を、ネストしたオブジェクトのキー順を正規化して比較する。能力だけの許可リストにせず、将来追加される選手属性も対象とする。
- 入団時に上書きするsalary/contractId/contractYears/contractYearsLeft/contractSignedYear/育成/isIkusei/ikuseiYears/isFAと、指名履歴_drafted/_r1winnerは比較から除く。区分の同値性は共通capacityが先に検証し、育成フラグ表現の違いを許容する。これらのフィールドの上書き方を将来変更する場合は比較境界も見直す必要がある。
- 留保時に成功していても、入団/辞退時や見積後に矛盾が加わればquote/applyを拒否する。取引前のstate、予算、留保、台帳、両球団名簿、確定履歴は一切変更しない。

### RED → GREENと回帰

- 変更前の新人/人数計算2ファイル77件成功。
- 再現テスト追加後、製品コード変更前は**120件中66件失敗・54件成功**。失敗は「拒否を期待したquote.okがtrue」という不具合そのもの。同一内容/契約正規化後に等しい候補の正常系2件と、既存52件は成功した。
- 修正後は**120件全成功**。追加68件は支配下/育成、能力50/80と15種の別属性、両配列順、留保/翌春の再検証、曖昧な辞退、全体非変更、同一内容/育成フラグ表現/契約上書きだけの差、古い抽選結果、JSON復元後の一度だけの台帳・入団と別取引ID拒否を含む。
- 新人/育成/更改/FA/トレード、支出審査/契約台帳/登録人数と関連hook/UIの**14ファイル445件成功**。既存テストの削除・skip追加・期待値緩和なし。
- `npm run build`と`git diff --check`成功。既存のarchive static/dynamic import警告と500kB超chunk警告は残る。配信ファイル44件は変更前のPR headのビルドと相対パス・SHA-256が全件一致し、本番未接続を維持した。
- 最終headと一致する全単体・統合・負荷・物理演算および全必須E2EのCI結果、独立レビューと最終SHAはPR本文へ記録する。過去headの成功を最新headの結果として扱わない。

追加回帰コマンド（上記7ファイルに加えて）:

```bash
npx vitest run src/engine/__tests__/trade.test.js src/engine/__tests__/tradeTransaction.test.js src/engine/__tests__/faDeclaration.test.js src/engine/__tests__/renewalRules.test.js src/hooks/useGameState.rosterCapacity.test.js src/hooks/useOffseason.trade.test.js src/components/offseasonFaFlow.test.js
```

## 限界・後続

これは本番未接続の新制度state上の共通API。春のfixtureは年度更新済みの入力を明示構成し、実ゲームの年度更新を通したとは扱わない。新stateのJSON往復と、既存capacityテストの実保存再開を区別する。

FA遅延回答、人/CPU/委任/Workerの本番呼出、育成ドラフトUI、年度更新・旧保存移行・コーチ、係数校正と実iPhone性能は後続C-2/D。本番の新人加入、年俸・契約年数・保存形式・画面・ゲーム係数は変更しない。基盤のマージだけで新制度を公開しない。#509で記録された年次E2Eの未処理引退ダイアログは本PRの修正対象ではなく、CIで再発すれば失敗と証跡を報告する。
