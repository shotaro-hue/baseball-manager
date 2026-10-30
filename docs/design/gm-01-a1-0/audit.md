# GM-01 A1-0 本番接続監査

監査日: 2026-10-30（日本時間）。対象: `shotaro-hue/baseball-manager`。

## 基準と結論

- 基準main: **`b255d2c2482dd50cba49f9620405e669c7f159b5`**、tree `673a7f5d2022c385b1112d10fe949813c19ba237`。
- #514に加え、[#515](https://github.com/shotaro-hue/baseball-manager/pull/515)も2026-10-30 12:30 JSTにマージ済み。#515 headは`b715aba9e551685211bcad50d77ea04009cd5646`。本監査はその契約移管・精算を含む。未マージの変更を仮定していない。
- 開始時のオープンPRは0件。#515の[CI](https://github.com/shotaro-hue/baseball-manager/actions/runs/40986959901)と基準mainの[CI](https://github.com/shotaro-hue/baseball-manager/actions/runs/40997755958)はcompleted / success。後者は開始時実行中、その後成功を確認した。
- 添付ZIPは古いため、GitHubの固定コミットから対象ソースを取得した。取得・使用した542ファイルをGit blob SHAで照合し、不一致0件。これは全2070 tree entryの取得を意味しない。実行時の`src/`、関連設計、対象テストを優先し、無関係な画像・検証記録は取得していない。

**新基盤は再利用できるが、本番へ単に呼出しを追加する段階ではない。** 契約・市場・オフ進捗が別々のReact stateにあり、Reducer/Worker/保存ペイロードは新状態を往復できない。年度更新、移行用の契約型、未更改留保、退団/コーチ等の不足もある。A1-1〜4を通じて接続し、最後まで一般プレイの切替を閉じる。

成果物: [接続設計](../../superpowers/specs/2026-10-30-gm01-a1-integration-design.md) / [実装計画](../../superpowers/plans/2026-10-30-gm01-a1-integration.md) / [検証マトリクス・今回の結果](../../validation/gm-01-a1-0/README.md)。本PRは文書だけで、製品コード・テスト・依存・保存形式・CIを変更しない。

## 調査方法と到達性

`src/main.jsx → App.jsx → useGameState/useOffseason/useSeasonFlow → AppScreenRouter/HubContentRouter`を確認し、lazy import、`new URL(...Worker...)`、通常/戦術/単日/まとめ進行を追った。関数の存在・テストの成功と、アプリからの呼出しを区別した。

```bash
rg -n 'annualTransactions|annualSpending|contractLedger|monthlyPayroll|seasonContract' src --glob '!*.test.*' --glob '!**/__tests__/**'
rg -n 'budget\s*:|budget\s*[-+]=|contractYearsLeft\s*:|\.salary\s*=' src --glob '!*.test.*'
rg -n 'performanceBonusRate|titleBonus|optOut|contractIncentives' src --glob '!*.test.*'
rg -n 'processCpuFaBids|cpuRenewContracts|executeCpuTrade|applyRegularSeasonTeamUpdate' src
```

| モジュール | 基準mainでの本番到達性 | 確認結果 |
| --- | --- | --- |
| `annualTransactions` | **なし** | hook/UI/Workerからimportされない。`__tests__/faPersonnelFixtures.js`はテスト補助である |
| `annualAcquisitions / annualSpending / contractLedger / monthlyPayroll / seasonContract / faProtection / faPersonnel` | **なし** | 新基盤同士とテストからの利用。`tradeTransaction.removeDepartingPlayers`の抽出・共用を、新制度の有効化と混同しない |
| `contractReplies / renewalRules` | あり | 旧更改・旧メール回答と年数投影 |
| `clubFinance / regularGameUpdates` | あり | 試合収支と旧budget、春の旧年度予算 |
| `tradeTransaction` | あり | 人/CPUの旧移籍・金銭・名簿更新。契約台帳の移管はしない |

静的なモジュール参照と対象テストを根拠とする。全分岐の実機実行や、外部ルールの最新性を証明する監査ではない。

## 経路監査表

列の「新基盤」は**本番未接続**。「追加必要」は既存APIを呼ぶだけでは成立しない部分。保存は現在の永続化対象であり、将来の接続後の仕様ではない。

### プレイヤー・市場・編成

| ID / 経路 | 入口 → 現行処理・更新state | 対応する新基盤 | 契約・効力・保証 | 年度予算・留保 | 所属 | 保存・復元 | 主なリスク |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 オフ更改 | `ContractRenewalRoute`、計画画面 → `useOffseason.handleContractRenewalSign`(740) → `applyAgreedContract`、`teams` | `offer/replace/accept/cancel-renewal` | salary/年数/署名年を即更新。保証記録なし | 人の確定時控除なし | 一軍/二軍維持 | teams、offseasonPlan.session等 | P2: CPUと費用時点が違う。新制度は翌年signと現在投影を分離 |
| R02 期中更改・後日回答 | `ContractTab → handleContractOffer`(346) → mailbox → `useGameState` effect(571) → `resolveContractReplies` | 同じ更改command＋回答scheduler追加 | 受諾すると当年salaryを変更。`contractIncentives`も保存 | 正式提示の全年度留保なし、受諾時の費用審査なし | 所属維持 | mailboxは分離保存、teamsはroot。提示snapshotあり | P2: 来季更改が今季給与を書換え。別state更新を原子的確定へ |
| R03 国内FA宣言 | `handleRetirePhaseNext → resolveOffseasonFaDeclarations`、計画放出 | 宣言→市場投入/満了のcommand追加 | 旧権利判定・決定snapshotはある。市場`marketEntry`は未生成 | 旧年俸と補償ランク/初回反復を台帳に固定していない | 名簿→faPool、旧所属・成績を記録 | teams/faPool/offseasonPlan/history | P1接続阻害: 台帳の雇用と冬の保有権/退団を区別する必要 |
| R04 国内/海外FAのNPB内獲得 | `HubFaTab.confirm`(108) → `faMarket.validateMarketContract/addMarketSigning`(34/46) | 明示`offer-fa/accept-fa/join-fa` | 1〜3年、即salary/年数。海外FA資格と外国人属性は別 | **salary×yearsを旧budgetから一括控除** | 即一軍または二軍、faPool削除 | teams/faPool/faYears。UI内交渉Mapは非永続 | P2: 月割り/翌年度負担なし。新オフFAは受諾と春加入が別 |
| R05 自由契約獲得 | R04と同じ市場 | `marketEntry.kind='released'`の後日回答 | 新APIは回答日効力・期中月割り。旧表示理由だけからFA扱いしない | 全年度留保→確定 | 期中即加入/オフ加入待ち | 同上 | P2: 国内側の暦日期限漏れ。旧市場の分類不能データを捏造しない |
| R06 外国人獲得 | `generateForeignFaPool → HubFaTab`代理人UI、CPU市場 | 当年の共通獲得＋外国人元データadapter追加 | 旧代理人交渉は局所Map、主に1/2年。外国人＝海外FAではない | 旧人は総額、CPUは単年年俸控除 | marketPlacement、外国人一軍枠 | pool/契約済み名簿、交渉途中Mapは復元なし | P2: 登録日・費用の人/CPU差。代理人の高度化は後続 |
| R07 発掘選手契約 | `useGameState.signPlayer`(1051) | `sign-scouted` adapter→同じ獲得見積/確定 | 年俸満額控除、`contractYearsLeft:2`のみ明示、署名年なし | 新制度は加入日からの当年負担＋残年 | scoutResults→二軍 | teams内scoutResults/名簿 | P2: 契約開始/満了の定義不足、共通登録期限なし |
| R08 新人受諾・辞退・加入 | `Draft`各画面 → `handleDraftComplete`(304) → `applyDraftAcquisitions`(190) | `reserve-rookie/decline-rookie/join-rookie` | 旧経路は全員を支配下単年として即二軍へ。新APIは育成区分も保持 | 旧即時控除0。新APIは実年俸留保と未資金新人最低費 | 旧は冬に加入済み、新は翌春加入 | draftPool、結果/lottery、draftApplied、teams | P1接続阻害: 旧加入と新joinを併走させない。指名・契約留保・春加入は別 |
| R09 育成更改/満了 | `renewalRules/cpuRenewContracts/useOffseason`育成3年処理 | 同じ更改、育成満了→released command追加 | 区分付きnative契約は既存最低年俸/3年制約 | 育成は420万円維持費や70人枠に含めず実額を計上 | 二軍維持/市場へ | 育成/isIkusei/ikuseiYears、teams/pool | P2: OR判定と片方だけを見る表示・集計の不一致 |
| R10 育成→支配下 | `useGameState.convertIkusei`(1005) | `convert-to-controlled` | 旧は差額控除、残年数を1へ。新は元期間/保証を維持 | 既存240→420の期間別差額、全年度審査 | 二軍のまま、昇格は別 | teams、将来更改は旧経路に記録なし | P2: 旧は暦日期限なし。新APIは将来育成更改との競合を拒否済み |
| R11 人のトレード | `TradeTab/メール → useOffseason.handleTrade`(391) → `applyTradeTransaction` | `trade`、`projectTradeRosters`を再利用 | 旧は所属のみ、給与の支払者期間なし | 旧金銭±cashのみ。新は双方の当年按分/将来契約/金銭 | 一軍/二軍/配置参照を両側更新 | teams、transfer log/mail。局所refは再読込で消える | P1接続阻害: 旧金銭控除と新oneOffの二重化、将来契約取り残し |
| R12 退団・解雇・引退・海外離脱 | 計画放出、`ContractRenewalRoute.onRelease`、`HubContentRouter`直接放出、retire/posting | ledgerの`end`は再利用可。**所属/市場/保証と一括のend/enter-market command追加必要** | 保証を記録しない旧削除では債務を再構成できない | 新制度ではretain/waiveを明示、保証解雇は残債維持 | 名簿→市場/履歴。海外FAはNPB市場の獲得と別 | teams/history/faPool/mailbox | P1接続阻害: 有効契約を名簿削除だけで終わらせない。過去の放出債務は推定しない |

### 補償・スタッフ・日常の費用

| ID / 経路 | 入口 → 現行処理・更新state | 対応する新基盤 | 契約・効力・保証 | 年度予算・留保 | 所属 | 保存・復元 | 主なリスク |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R13 FA金銭補償 | **本番入口なし** | `settle-fa-compensation`、`faCompensations/oneOffCosts` | 元年俸/初回反復を提示snapshotに固定 | 最大金銭留保→同年度の両側費用、相殺で履行 | 変化なし | 新engineのJSONのみ検証済み | P1接続阻害: 実FA宣言から補償根拠が届かない。旧budgetの仮受取禁止 |
| R14 人的補償 | **本番入口なし**、#514/#515の基盤 | `submit-fa-protection/settle-fa-personnel/join-fa-personnel` | 既存/将来契約・保証・終了年を維持、原則翌2/1移管 | 減額金銭両側と全年度負担、最低維持費を再審査 | 元名簿→faPersonnelMoves→翌春二軍 | 元command/名簿/順位/移管/加入receiptを照合 | P1接続阻害: CPU人選・期限・順位context・春加入adapterなし。同率は現APIが拒否 |
| R15 コーチ採用/解任 | `HubContentRouter` → `hireCoach/fireCoach`(1030/1036) | 一時coach費だけでは足りない。**年度雇用/担当枠の共通取引追加必要** | 旧はgrade.salary×12をsalaryへ保存、無期限在任 | 同額を採用時控除、春の継続費なし | coaches配列追加/削除 | teams.coachesを保持 | P2: 同職種別gradeを重複雇用、効果が加算。旧費用とstored salary自体は一致する |
| R16 調査/球場投資 | `sendScout`(1041)、`upgradeStadium`(1080付近) | 一時`scouting/stadium`費の審査は再利用、commandとreceipt追加 | 選手契約と分離 | 旧budget直控除。新はoneOffに1回 | scoutMissions/scoutResults/stadiumLevel | team内。3秒timer自体は保存されない | P1接続阻害: 旧財布への抜け道。調査のゲーム時計化・精度改善はGM-02 |
| R17 試合収支/臨時収入 | `regularGameUpdates → applyClubGameFinance`(83)、posting(456)、引退試合(514) | `clubFinance`継続、配分adapter/臨時収支receipt追加 | 給与は試合毎に控除しない | 現行は運営差額/臨時収入をbudgetへ加算。新は年度枠へ自動加算しない | posting時は退団も更新 | clubFinance.postedRounds、teams/history | P1接続阻害: 予算化済み収益の再配分。賞金は検索対象経路に加算箇所なし、未実装を架空計上しない |

### CPU・進行・保存

| ID / 経路 | 入口 → 現行処理・更新state | 対応する新基盤 | 契約・効力・保証 | 年度予算・留保 | 所属 | 保存・復元 | 主なリスク |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R18 CPU更改/放出 | `handleRetirePhaseNext`(682) → `cpuRenewContracts`、`planCpuRenewals` | 方針/候補は再利用、成立は人と同じ更改/end command | 1/2年等、旧フィールドへ即適用 | budgetから更改年俸を控除、新人用独自留保 | active/farm、市場へ放出 | teams/faPool、判断trace | P2: 人と異なる財布。新台帳を変更せず旧CPUを残せない |
| R19 CPU FA/外国人/複数年 | オフ`handleWaiverPhaseNext`(831)、通常`useSeasonFlow`(324)、まとめ`seasonBatchCore`(217) → `processCpuFaBids` | 判断と成立を分離。同じoffer/accept/join | 現行FAは単年。新では必要時2/3年を同じ全年度審査 | 独自budget比率/年俸控除、台帳審査なし | pool→一軍/二軍 | teams/pool、Worker snapshot | P2: 選手側`evalOffer.total`が獲得候補scoreの主項。ただしneed/mode補正もあり「それだけ」ではない |
| R20 CPUトレード/新人/育成/人的 | `executeCpuTrade → applyTradeTransaction`、Draft自動指名、R18/R19 | 全て共通確定へ。人的選択・育成昇格計画は追加 | CPUだけ保証を免除しない | 無金銭例外は既存審査条件のまま | 両名簿、配置再構成 | teams/draft/engine/判断receipt | CPU育成昇格・人的の本番経路は現時点なし。既実装と数えない |
| R21 通常/戦術/単日/まとめ/Worker | `useSeasonFlow`(385/819)、`singleDayCore`、`seasonBatchCore.normalizeSnapshot`(484) | 同じcommand reducer/schedulerをWorkerにも供給 | 現在は旧CPU/旧メールeffect | 新engine/予算revisionを明示往復する必要 | 全球団/市場/二軍 | `applyProgressCandidate`→`G.APPLY_PROGRESS`は7フィールドだけ採用 | P1: 新payloadを追加するだけではReducerで失う。単日の市場復元、まとめ途中の回答処理も確認対象 |
| R22 年度更新 | `handleNextYear`(142)、春完了 → `remainingContractAfterSeason`、**nextClubBudget**(181)、startClubFinance | **純粋な年度候補builderと永続receipt追加必要** | 今は署名年で減算除外 | 今は春に旧枠再算定。新はオフ前提示の枠を春に再配布しない | 新人/FA旧即加入済みの名簿 | 候補を先にhandleSave、成功後採用する既存構造は再利用 | P1接続阻害: 旧減算/旧予算と新処理の二重実行。局所refだけでは再読込後の冪等性不足 |
| R23 保存/読込/旧移行 | `useGameState.handleSave`(647)、`saveload`(267/613/1006)、`App.handleLoad`(51)、Reducer | 既存世代root/バックアップ/競合排除を維持、**制度schema/降格防止/原子的hydration追加** | migrateInitialContractYearsは2026 day1だけ補完。新台帳を検証しない | serializerは未知rootを保持できてもhookのpayload/hydrationは新engineを組み立てない | players/farm/pool/加入待ちを一括復元へ | 大きな履歴は別世代、root bodyはIndexedDB参照 | P1: 「JSON往復済み」は本番保存互換ではない。旧クライアントによる新root上書きも防ぐ |

## P1・P2の判断と修正範囲

P1は**新制度を有効化する前に必ず解決する接続阻害**。現行mainで新制度の二重請求や保存破壊が既に発生したと主張するものではない。P2の実測は対象fixture/範囲に限定する。

| ID | 優先度 / 根拠 | A1で必須の対応 | 後続へ分離 |
| --- | --- | --- | --- |
| F01 | P1: R21/R23。新状態がReducer/明示保存/hydrationの外にある | 単一world更新、revision/epoch、Worker protocol、保存の降格禁止 | 保存エンジン全面置換、完全バックアップ製品化 |
| F02 | P1: R22。旧予算/旧減算が本番で実行中 | modeによる排他的分岐、オフ開始/翌春の永続receipt、保存成功後採用 | なし |
| F03 | P1: ledgerは保証boolean・署名フェーズ必須だが旧保存に根拠がない | 開始残高専用の契約型、保証不明の明示、境界で一括移行 | 架空の旧支払/署名履歴の復元は禁止 |
| F04 | P1: R03/R12〜R16。共通取引に未定義操作あり | 宣言/退団/海外離脱、コーチ年度費、調査/投資費の原子性。未更改予定留保も追加 | 代理人、出来高、詳細な再建/入札AI |
| F05 | P2実測: 1億×3年の旧FAは3億控除、7/1加入の新見積は0.5/1/1億。期中更改は当年1億→1.2億、budget差0 | 契約正本と効力年度、全年度の同一審査に切替 | 価格そのものの高度な交渉モデル |
| F06 | P2実測: 条項ありscore72、固定のみ64。旧条項を保存したまま実hookで翌春へ | 新提示/評価から未履行条項を除外、旧条件は経過表示/保持 | 条項の発動・精算・CPU・保存を揃えた再導入 |
| F07 | P2実測: coach費3.6/8.4/18/36億、同職種2名が残り翌春も2名 | 年度雇用/担当1枠/費用と効果の同一年度。原文の「費用と年俸が不一致」は数値上は否定、継続費/価格意味が問題 | 800/1200/1800/3000万円は既存設計の校正候補。実相場・適正値とは断定しない |
| F08 | P2静的: `isIkuseiPlayer`はOR、`contractPayroll`は育成だけ、通知はisIkuseiだけ | 新制度の区分正本→両互換flagと表示を統一。旧読込だけで書換えない | 育成効果の新モデル |
| F09 | P2静的: CPU候補scoreが選手側の受諾評価を含む | 獲得価値と受諾可否を分離、既存役割/評価を使う。資金不足時の縮小案・見送りを必須化 | 競合入札/代理人/複雑な効用モデルの調整 |
| F10 | P2実測: 8/1に旧国内市場validateがnull、外国人だけ拒否。発掘・育成にも共通暦日なし | 実scheduleの暦日で全主体を共通審査。ポストシーズンは新獲得禁止 | 新しい出場資格制度を勝手に追加しない |
| F11 | P1接続阻害: primaryが破損するとrootだけのmodeでは旧backupへの巻戻しを防げない | per-save activation anchorと同epochの復旧。成立を証明できない場合は非破壊で停止 | 暗黙の旧形式復元は禁止 |
| F12 | P1接続阻害: 現行の年次抽選はglobal RNG、成長は更改/加入より前に実行される | 年Yの成長/スタッフ/ロスター、保存失敗後のscoped乱数再生を明示 | 試合乱数全体の刷新は含めない |

F06は「全ての将来・外部分岐に絶対に履行がない」という証明ではない。productionキー検索、当該評価/保存処理、143回の固定条件収支と1回の実hook年度更新を照合した結果である。`salaryDemand.titleBonus`は要求年俸評価の実績補正であり、契約条項の支払処理とは別。

## 再利用できる境界と不足

- 維持: `quoteAnnualTransaction/applyAnnualTransaction`の非変更見積/失敗、全年度審査、原command署名/receipt、競合留保解放、#515の両側精算・移管・加入照合、`projectTradeRosters/removeDepartingPlayers`、`evaluateRosterCapacity`。
- 維持: 月割りの累積差分と整数計算、2〜11月、取得年も契約期間に含める方式、FA最大3年/更改最大7年、新人単年、同じ赤字例外。
- 追加: native署名と区別したlegacy開始残高、未更改予定留保、年度承認policy、退団/スタッフ/費用command、clock/scheduler、年度candidate、保存/Worker adapter。
- 存在しないものを補完済みとしない: 本番人的UI/CPU、FA取得件数上限の制御、旧保証/過去送金履歴、最新NPB規約全体、実iPhone/新制度長期合格。

## 既存設計との関係

[GM-01親設計](../../superpowers/specs/2026-10-26-club-management-gameplay-design.md)の正本/予算/固定年俸方針を継承する。旧SPECの「budgetへ運営差額を加算」「春にnextClubBudget」は**legacyモードだけの仕様**へ限定する計画であり、このPRで変更しない。C-2Eの「A/B受諾保留」はF/G-2により基盤内では解消済み。本番接続済みという意味ではない。詳細な仕様の優先順位と明示した拡張は接続設計の最終節を参照。
