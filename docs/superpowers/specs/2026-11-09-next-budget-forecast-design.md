# PR-B 翌年度予算forecast

基準main `0e0fef008750585df428e4d3cb3bceb7fed16c43`（#559マージ済み）、着手時open PR 0。根拠はユーザーの次工程スコープ指示とマージ後の実行指示、既存GM-01/A1-1c設計。

## 目的と範囲

親目標は、プレイヤーがオフの更改・補強判断前に、翌年度の支出許可とその根拠を確認できること。本PRは12球団×必要年度のforecastと既存承認計算を結ぶ純粋producerを完成させる。通常プレイの画面・native open-offseasonへの採用/保存はPR-C。公開OFF/schema1/DB5、旧財布/契約/セーブを維持する。新規巨大state、保存schema、年度receiptや新しい係数の本番既定値を追加しない。

## 現行の正本と決定

- `clubFinance`は現年度の給与控除前の運営実績。過年度の同ledgerを保存する標準archiveは未実装。`revenueThisSeason`や旧budgetから過去の純運営差額を逆算しない。
- `annualBudgetPolicy`は明示入力から承認する既存正本。係数/支援には校正済み本番既定値がない。記録済み当年の`annual-budget-approval`から共通係数と球団別支援を再利用するか、同じ項目を明示設定する。テストの固定許可額を既定値にしない。
- 前年基準は当年`budgetPolicies.approvedManYen`だけ。posting追加後のauthorizationsや旧budgetを基準にしない。開始承認の記録がなければ明示null。将来年度は既存null連鎖を使う。
- 入力は検証済みannual world。legacyは非変更で拒否し、暗黙移行しない。球団ID/leagueは既存12球団と一致することを検査する。

## APIと計算

`forecastNextAnnualBudget(world, { policy?, financeHistory? } = {})`

- 対象は`world.year+1`〜`annualBudgetHorizon({...spending,budgetSeason:world.year+1})`。長期台帳/提示の終了年度も含む。
- `policy`を明示する場合は`{policyVersion,allocationPercent,smoothingYears,maxChangePercent,supports:[{teamId,supportManYen}]}`。12球団を一意に要求する。未指定なら当年の記録済み生成policyから構築し、不足/不一致を拒否する。
- `financeHistory`は任意の明示入力`[{teamId,finance}]`。過年度の完了ledgerのみ。重複・未来・不正・部分ledgerを拒否する。現在のworldへ保存しない。未提供/欠測は推定とする。
- 審査年度Sの平滑化入力はS-N〜S-1。143試合完了の現年度/明示過年度ledgerを実測として使い、0も維持する。当年部分ledgerは既存`forecastClubFinance`の残り見込みを使用。欠測/将来は既存`startClubFinance`と生成日程で推定する。既知の価格・人気・球場条件を固定し、勝敗は通常条件の5割へ戻す。過去の実績を再現したとは主張しない。
- 不確実な当年日程による幅は下限を選び、元の幅と日程判定を根拠に残す。未来の価格・投資・成長・景気変化を生成しない。
- 検証済みretirement-game収入は帰属年度のsampleへ一度加算し、将来の通常収益へ複製しない。postingは通常収益・平滑化・前年承認から除外し、既存承認計算の年度限定追加枠だけを使う。
- 戻り値は`{budgetSeason,endSeason,policy,evidence,quote}`。policy.forecastsは既存入力形式、evidenceはsampleごとの年度/実測・推定/basis/通常差額/臨時収入/receipt ID/推定幅、quoteは既存のauthorizations/budgetPolicies/rosterRequirements。球団・年度・receipt ID順を決定的にし、入力/乱数/日付を変更しない。

`quoteNextAnnualBudgetPolicy(world, policy)`を既存policyモジュールへ追加する。現worldを検証したまま対象年度だけ翌年にして、既存の計算を共用する。偽の12/1 worldや保存候補を作らない。既存`quoteAnnualBudgetPolicy`の当年/オフの契約は維持する。純粋quoteは採用や年度境界receiptではない。

## 比較した方法

- 旧nextClubBudgetへ名前だけ付けて再利用: 給与控除後/旧財布/二重原資になるため不採用。
- producer内で12/1時計・年度candidateを生成: PR-Cの責務と保存barrierを越えるため不採用。
- 既存収支/承認へ明示入力と一時的な証拠を渡す: 採用。校正未済を維持しながら、全年度のforecastと見積を検証できる。

## 受入・後続

実bootstrapの12球団と実収支計上を使い、欠測/0/赤字/部分/完了/3年平滑/長期最終年/順序とJSON/無乱数/入力不変/保存復元/改ざん拒否を確認する。posting年度限定追加と引退収入を実native commandで作り、正常/拒否を対で試す。別コンテキスト独立レビューと最新HEAD必須CIでPR提出し、マージしない。

PR-Cはこの戻り値を確定した単一candidateへ採用し、保存→公開identity/revision照合→採用確認へ接続する。forecast evidenceはまだ永続schemaではないため、保存先・不足時の扱いはその候補設計で決める。実iPhone/年度完走/成長・要求年俸/翌春builder/annual Worker全面接続・係数校正は完成認定しない。
