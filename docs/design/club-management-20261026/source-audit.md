# 球団経営ゲームデザインの現行照合

2026-10-26。main `677c14fb5f96723846d01d0f72c25ac6a0d651b7` / tree `d4ce215447219b21887a5ed4d1768ef44ef4f4b1`。GitHubのmainとopen PRを照合。開いていた既存PRは完全バックアップ設計の#494で、今回も保留。添付ZIPを最新ソースと見なさず、現行リポジトリを読んだ。

本書は設計のためのコード読解であり、新しい不具合の再現・修正・動作確認ではない。問題の可能性と確認済みの処理を区別する。正本の構想は[GM-01設計](../../superpowers/specs/2026-10-26-club-management-gameplay-design.md)。

## 1. 現状の強みと接続点

| 領域 | 確認した実装 | 設計への影響 |
|---|---|---|
| 主催別収支 | `src/engine/clubFinance.js`のstart/calc/apply/forecast。年額配賦は累積丸め差分、postedRoundsで重複排除 | 売上縮小で難度を作らず、この実測を継続 |
| 年度予算 | 同ファイル`nextClubBudget`。基礎予算＋前年の給与前運営差額60%−新名簿の給与、信頼補正、50%下限 | 現行の残枠と新しい総許可額は意味が違う。単純な改名では移行不可 |
| 年度の時点 | `src/hooks/useOffseason.js`の`handleNextYear`。春季処理後に年齢/契約/予算/financeを更新 | 新制度の翌年許可は更改前へ移し、春に二重配布しない |
| 契約基礎 | `renewalRules.js`。合意年と残年数、当年合意済みの二重更改防止 | 効力年度を明示し、既存の年数扱いを無造作に減算しない |
| 年俸と計画 | `contractPayroll.js`、`offseasonPlanning.js` | ID重複除外・欠測区別・未確定計画を維持して将来計画へ拡張 |
| 枠の基盤 | `rosterCapacity.js`、`rosterPlanning.js`、`organizationNeeds.js` | 受諾済み未加入/拒否/既加入を再実装せず、年度別費用を接続 |
| 二軍 | `farmProgression.js`、`farmRecords.js`、`farmSelection.js`、`farmSelectors.js` | 実測機会・疲労・捕手成立を使える。成長のために過剰起用させない |
| ドラフト情報 | `draftReports.js`。公開/球団別観測、固定hash、5ポイント、配分、既存報告保持 | 閲覧で乱数を使わない基盤を通常調査にも適用 |
| 方針 | `trade.js`のfrontOfficePlan、`managementPolicy.js`、`rosterAutomation.js` | 勝負/再建と日々の起用の好みを混同せず再利用 |
| 価格と投資 | `FinanceActions.jsx`、`financeView.js`、`clubFinanceProfiles.js` | 下書き→同条件比較→確認を維持。投資は10/25/50億円 |
| 保存/長期証拠 | #498〜#503と既存の保存/長期検証資料 | 信頼性基盤を維持。未完成の完全復元を完成扱いしない |

## 2. 金額の意味が異なる経路

以下はソースで確認した控除方法であり、それぞれ単独の確定バグという断定ではない。契約期間・対象年度が異なるため、年額を揃える新制度で共通の見積へ整理する。

| 経路 | 現行の処理 | 新制度での扱い |
|---|---|---|
| 試合収支 | `applyClubGameFinance`で運営差額100%をbudgetへ加算 | 収支計上を継続し、既に予算化した収入の二回目の許可を廃止 |
| 手動FA | `components/hub/faMarket.js`のvalidate/addでsalary×yearsを検査/控除。FA最大3年 | 契約総額は表示、年額は対象各年度に帰属 |
| CPU FA | `contract.js`のprocessCpuFaBidsは1年契約を提示し、その年俸を控除 | 現行の差はまず年数の違い。同一条件の共通負担審査が必要。複数年評価は新制度へ追加 |
| 通常更改 | `contractReplies.js`で条件を適用。ここではbudgetを控除しない | 翌年度の既存留保から確定負担へ置換 |
| CPU更改 | `contract.js`のcpuRenewContractsは更改年俸をbudgetから控除 | 人と同じ年度別負担に統一 |
| 新人 | `draftRules.js`のapplyDraftAcquisitionsは年俸を設定、immediateSpending:0 | 受諾時留保→加入時確定。入団時と年度更新で重複消費しない |
| 発掘契約 | `useGameState.js`のsignPlayerはsalaryを控除し、contractYearsLeft:2を付与 | 契約の全対象年度へ共通ルールを適用 |
| 育成の支配下化 | 同ファイルで最低支配下年俸との差額を控除。現在は一軍満員も実行制約 | 年俸差と支配下枠を扱い、一軍昇格とは別判断に整理 |
| コーチ | hireCoachでCOACH_GRADES.salary(3,000/7,000/15,000/30,000万円)の12倍を採用時に控除（実額3.6/8.4/18/36億円）。翌年の継続費は年次予算式に明示されない | 継続費を年次へ明示。現行の参考給与表示と現金支払いを混同しない |
| トレード | tradeTransactionは金銭の両球団budgetを原子的に更新。移籍に伴う給与差のbudget再計算はない | 金銭と各年年俸の引受を両側で審査 |
| 臨時収入 | useOffseasonのpostingはfeeManYenを、引退試合は50000万円をbudgetへ加算 | 旧年度維持。新制度では使途/帰属年度と配分方針を明示 |

選手年俸を再び試合ごとに払う変更を、この整理へ追加しない。完全現金会計を入れず、年額の許可・確定負担・留保を揃える。

## 3. 財務変更だけでは残るゲーム上の疑義

### 契約年数の効力年度

`src/engine/renewalRules.js`の`remainingContractAfterSeason`は`contractSignedYear === year`ならそのシーズンの残数を減らさない。`applyMarketSigning`系と`cpuRenewContracts`等は同じカレンダー年に署名しても、公式戦中とオフシーズンで契約が効く年度が違う。現行の公式戦中新規契約1年を同年度のオフで更新すると1年余計に残る可能性があり、`renewalEligible`の同年署名禁止は当該選手の適法な翌年更改まで止めうる。`src/hooks/useGameState.js`のスカウト選手契約はさらに`contractYearsLeft:2`のみで署名年度を持たず、経路差がある。GM-00で現行の年度進行を再現し、GM-01は合意フェーズ・効力開始年度・満了年度を正本化する。

NPBは[2026年7月31日の新規支配下契約・契約譲渡の終了](https://npb.jp/news/detail/20260731_02.html)を公示。`faMarket.js`には外国人用`FOREIGN_DEADLINE_DAY`の判定があるが、国内FA/スカウト/CPU等の契約経路を含む共通の暦日判定はGM-00で照合する。出場資格も[2026年CSの8月31日支配下登録要件](https://npb.jp/games/2026/info_cscl.html)と別に扱い、加入時期と契約年数で戦力を無償延長させない。

### 契約条項

`evalOffer`は出来高/タイトル/optOutを交渉評価に加点。`ContractTab`で選べ、`resolveContractReplies`は`contractIncentives`を保存する。非testの`src`をキーで検索した範囲では、年度末の精算やoptOutの行使処理を確認できなかった。これは静的確認の限界を伴うため、GM-00の実再現で処理の有無を確定する。新しい予算を作る前に「約束には履行がある」条件を整理する。

### コーチの費用と加算

コーチの4段階価格はゲーム定数と`hireCoach`を照合済み。実球団の公開資料では個々の給与台帳は揃わないが、[2024年の年俸相場解説](https://athlete-live.com/category_taiikukai/baseballcoach-income/)および[元二軍コーチの取材証言](https://www.nikkan-gendai.com/articles/view/sports/363081/2)と比べて、現行の一括費用は著しく高い。GM-01では追加専門5枠の年額を800/1,200/1,800/3,000万円（校正候補）とし、一般スタッフの費用が固定運営費に含まれる設計仮定を明示する。安くしたまま現行ボーナス加算を残すのも過剰投資の誘因なので、同職種1担当を同時に導入する。実際の球団会計と同値だと主張しない。

`HubContentRouter`は同じ職種・同グレードの重複をUIで禁止する一方、異なるグレードは選べる。`developPlayers`は同職種のbonusを合計し、育成対象全体へ使う。採用handlerはcoaches配列へ追加する。継続費・主任枠・効果上限の設計が必要で、単に予算を減らすだけでは買い揃える方針の相対的な強さは変わらない。

### 実戦と年度成長

`developPlayers(players,coaches)`の成長入力は年齢・潜在・偶発性・trainingFocus・コーチが中心で、PA/BFや二軍出場量を参照しない。useOffseasonは一軍・二軍へ同関数を呼ぶ。二軍実測は選考・疲労へ既に接続されているが、実戦機会による年度成長を実装済みとは言えない。少量の実戦効果を足す際は現行成長量との合成上限が必要。

### 通常スカウト

`sendScout`は派遣費とweeksLeftを記録する一方、結果生成はsetTimeout(...,3000)内。検索した非testのsrcではweeksLeftを進行に沿って減らす別経路は見つからなかった。結果生成時の残budgetから`_scoutBudgetFactor`を付ける。派遣費を払ってお金が減ると調査精度が不利になり得る接続のため、費用の意味を調査力へ分ける。

報告はmakePlayerで新たに生成される。生成頻度・同じ地域の同時派遣・保存中のタイマー消失等の実影響は未再現。無限発掘が実利用で成立したとは断定しない。共有年度候補とゲーム時計へ移す対象として記録する。

### 情報の一貫性

`draftReports`はprivate/publicの評価と幅を保持する。`fromScout`候補の幅0と、`PlayerModal`の確定したpotential表示がある。スカウト画面だけを曖昧にしても、別画面/ソート/CPU入力で真値を使う余地がある。潜在評価を変える工程では全参照を棚卸しする。現行の全能力を今すぐ隠す指示ではない。

### モラル・会見と収益循環

useOffseasonの年俸によるモラル比較は、marketBase=p.salaryを定義した後にp.salaryと比較するため、通常の正年俸では±10%の枝へ入らない。また出場機会評価は役割の期待値を区別していない。`pressConference`には人気/モラルとも有利な選択が複数ある。人気は`clubFinance`の需要/年間契約に効く。

これらを全て既知の実プレイ不具合として扱わず、安い定型選択が経営を支配する可能性として後続工程で再現/校正する。再建の合意目標と一貫した評価を作る前に、オーナー解雇を追加しない。

## 4. 実測基準と限界

[#503の正本](../../validation/cpu-finance-long-20261025/README.md)は3seed×10年、360球団年度の収支、330 CPU球団年度の予算、140回の保存再開を記録。二軍未実施・記録時点の負予算・70人超過・所属重複は0、補強完了の捕手は6〜9人、指名は平均4.05人、4年連続指名0は0だった。

この観測を失ってはならないが、新しい金額ルールで同じ結果になる保証はない。途中の単年PA/BF0が2人年度残り、健康/守備のみ等の原因は未確定。利用者は今回その個別診断をスキップした。新成長式の検証で全員の0を一律の不正としない。

CPU判断の正本はseed JSONのcpuDecisions。補助JSONLは欠落があるため全判断の集計元にしない。旧版の原本とSHAを変えず、新しいsource snapshot・方針・seedを区別して結果を出す。既存ハーネスはプレーオフ/賞金やimmutable receiptの実App経路を網羅しない。新しい財務の受入で実Appシナリオを省かない。

## 5. 今回の作業と未実施

今回行ったのは、main/PR照合、対象ソースの静的確認、公式参考資料の調査、設計書と段階ロードマップの作成である。製品コード・定数・保存形式・依存・CIを変更していない。新制度の実シミュレーション、動作再現、ブラウザ表示確認、実機確認は未実施。

文書リンク/数値例/差分を確認して提出する。文書だけの検証を製品テストの成功と表記しない。
