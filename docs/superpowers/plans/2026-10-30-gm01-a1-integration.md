# GM-01 A1 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement an explicitly authorized stage task-by-task, with test-driven-development for behavior changes and an independent review before PR submission. 本書は後続の計画。A1-0の依頼は後続実装の開始許可ではない。完了済みA1-0のPRを提示して止める。

**Goal:** 既存の新契約/全年度予算を、保存を保護して人/CPU/Worker/年度更新へ揃えて接続する。

**Architecture:** 現在の共通quote/applyを再利用し、単一worldの純粋更新と保存成功後の採用を境界にする。一般プレイはA1-4の最終PRまでlegacy。既存セーブは次の未開始オフで一括移行する。

**Tech Stack:** 現行JavaScript/React/Vitest/Vite/Playwright、既存IndexedDB世代保存。新依存を前提にしない。

**Spec:** [A1接続設計](../specs/2026-10-30-gm01-a1-integration-design.md)、[経路監査](../../design/gm-01-a1-0/audit.md)、[検証マトリクス](../../validation/gm-01-a1-0/README.md)。

## Global Constraints

- 基準mainは`b255d2c2482dd50cba49f9620405e669c7f159b5`。#515はこのmainにマージ済み。各着手時に最新main/関連PR/CIを再確認し、未マージコードを取り込み済みとしない。
- mainへの直接push、マージ/auto-merge、旧セーブの破壊的移行は禁止。各PRのマージ判断はユーザーに委ねる。
- 未完成の新制度を一般プレイで有効化しない。人/CPU/Workerごとの部分フラグを作らない。
- 新旧の保存形式を混在させない。legacyにannual engineを一部だけ入れず、annualはschema/全必須データを一括で保存する。
- 見積と失敗は非変更、最新状態で再検証、同じ取引は一度だけ、保存成功後だけ候補を採用する。
- 金額は整数万円。未記録と0を区別する。保証/過去支払/FA行使歴/署名フェーズを捏造しない。
- nativeのFA最大3年、更改最大7年、新人単年、2〜11月給与を維持する。新規獲得/登録は7/31当日まで、翌年度更改はこの登録期限の対象外。5/7年契約の検証は更改等の許可された経路で実施し、FAの上限を緩めない。
- 各PRで対象回帰と同一公開headのCIを確認。期待値の緩和/skip追加で合格にしない。一般の有効化前に全主体と年度更新を揃える。
- コードは小さな責務へ追加するが、既存の大きいhookを理由なく全面書換えしない。下記はファイル候補であり、無関係な再構成の許可ではない。

## Review Focus

1. 旧同年署名の残年数と保証不明を、推定したnative契約へ変換しない（A1-1b/1d）。
2. オファーを見積後に他の取引が成立した場合と、保存中の古いWorker結果を採用しない（A1-1a/1d/3b）。
3. 冬の退団と満了・更改・人的移管が雇用/名簿照合を壊さない（A1-2c/3b）。
4. 同一年度の再開/保存失敗で春の予算・加齢・乱数・加入を二重適用しない（A1-1d/3b）。
5. 小さいinline root/大きいIndexedDB root、冷起動、旧タブの保存/削除/新規初期化でも新契約を失わない（A1-1d/4a/4b）。
6. 確定保存Bを通常保存Cで置換せず、公開したrevision/receiptを確認してから採用する（A1-1d）。オフで翌シーズンの更改最終年度まで枠を用意し（A1-1c/3b）、登録期限後も更改回答を処理する（A1-2a/3b）。

## PR順序と依存

元のA1-1〜A1-4を段階名として維持する。現行コードでは移行型・未更改計画・退団/スタッフ等の不足があるため、**12作業単位・最低14PR**へ分割する。Task 10（A1-3b）は年次/乱数、不戦結果、Workerの3本とする。保存/移行のTask 4等が独立責務へ広がる場合はさらに分割してよい。

| 順序 / PR | 前提 | 機能ゲート | 成果 |
| --- | --- | --- | --- |
| 1 / A1-1a | A1-0承認 | OFF | 共通world/clock/projection/revision |
| 2 / A1-1b | 1a | OFF | legacy開始残高とnativeの台帳union |
| 3 / A1-1c | 1b | OFF | 年度許可/未更改計画/スタッフ費の見積 |
| 4 / A1-1d | 1c | OFF | 保存/hydration/移行candidate/降格防止 |
| 5 / A1-2a | 1d | OFF | 人の更改/FA/自由契約/外国人の接続 |
| 6 / A1-2b | 2a | OFF | 新人/育成/トレード/発掘契約 |
| 7 / A1-2c | 2b | OFF | 冬/期中の退団・市場・海外離脱・収入 |
| 8 / A1-2d | 2c | OFF | コーチ年度雇用/調査/投資 |
| 9 / A1-3a | 2d | OFF | CPU全操作・有限fallback/再建 |
| 10 / A1-3b-1 | 3a | OFF | 年次候補/前年成長/操作別乱数/翌春 |
| 11 / A1-3b-2 | 3b-1 | OFF | 不可避な試合不能の不戦結果・収支・保存 |
| 12 / A1-3b-3 | 3b-2 | OFF | 全進行/Worker/scheduler/protocol |
| 13 / A1-4a | 3b-3 | OFF | UI/係数選定/統合・長期・実機の証拠 |
| 14 / A1-4b | 4aの全必須受入 | 最後にONを提案 | 新規ゲーム/未開始オフの切替・storage fence |

各行はそのPR単体のCIを通してマージ可能にする。未完成のannual fixtureを通常Appへ流さない。前PRが未マージなら依存を明示したdraftに留めるか、承認を待ち、mainへ勝手に足さない。

## Task 1: A1-1a 共通worldとclock

2026-10-30追記: #517マージ後の実装・検証範囲は[記録](../../validation/gm-01-a1-1a/README.md)を参照。実bootstrapの支配下最低年俸不整合を発見し、合法seed fixtureでの初期factory検証と分離した。一般プレイのゲートはOFF。

**Files:** Create `src/engine/contractEconomy.js`, `src/engine/economyCalendar.js`, `src/engine/__tests__/contractEconomy.test.js`, `src/hooks/useGameState.economy.test.js`; modify `src/hooks/gameStateReducer.js`, `src/hooks/useGameState.js`。名前は本計画の新規API。

**Interfaces:** `toAnnualState(world) / fromAnnualState(world, annualState) / quoteEconomyCommand(world, command) / reduceEconomyCommand(world, command)`、`createAnnualNewGameWorld({teams,faPool,myId,saveId,season,policy,randomRoot})`。current fieldがないmodeはlegacy。clockのseasonとroot yearの一致、dateの暦、epoch/revision、single-world更新を検証する。通常のbuildでは`ANNUAL_ECONOMY_RELEASE_ENABLED=false`。

- [ ] `test_quote_does_not_mutate_world`、`test_one_reducer_action_keeps_engine_market_mail_and_teams`、`test_rejects_stale_revision_epoch_and_typed_id_collision`をREDで作る。`expect(after).toBe(before)`を拒否時に確認し、同じID 0も有効にする。
- [ ] `npx vitest run src/engine/__tests__/contractEconomy.test.js src/hooks/useGameState.economy.test.js`で意図した不足によるREDを確認する。
- [ ] 年度/フェーズ/日付を明示し、schedule欠損をラウンド数で補わないadapterと、単一Reducer actionを実装する。legacyは従来actionのまま。
- [ ] fresh rosterの全選手へ2/1開始/seed年俸・残数のnative契約を作るfixtureを追加し、初期/人/CPUの新契約は全てguaranteed=true、falseを入力した費用免除は拒否する。旧openingのunknownとは別に扱う。
- [ ] 同コマンドGREEN、既存hook/進行回帰、`npm run build`、ゲートOFFの通常新規ゲームE2Eを実施し、専用PRを作る。

**受入:** coreの見積/失敗の非変更、current/future projectionの分離、一般プレイの旧挙動を確認。UI/CPUをまだ接続しない。

## Task 2: A1-1b legacy開始残高

2026-10-30追記: #518マージ後の実装範囲・検証は[開始残高の記録](../../validation/gm-01-a1-1b/README.md)を参照。候補は契約部分のみで、通常セーブの切替は未接続、一般公開ゲートはOFF。

**Files:** Create `src/engine/economyMigration.js`, `src/engine/__tests__/economyMigration.test.js`; modify `src/engine/contractLedger.js`, `src/engine/seasonContract.js`, `src/engine/annualTransactions.js`, `src/engine/faPersonnel.js`。必要ならselectorを`contractEconomy.js`へ置く。native v1の既存テストを維持。

**Interfaces:** `prepareEconomyMigration(world,boundary) -> {ok,candidate?,issues}`の契約部分、`projectLegacyCarryForward(player,Y)`、`remainingEmploymentSeasons(employment,targetSeason)`。openingのobserved fields/保証unknown/旧投影の将来残を保持する。nativeの署名型は拡張用の嘘の値を要求しない。

- [ ] `test_import_preserves_missing_guarantee_and_no_past_payments`、`test_opening_can_renew_trade_and_transfer_as_personnel`をREDで作る。`expect(opening.guaranteeStatus).toBe('unknown')`、`expect(opening).not.toHaveProperty('signedSeason')`。
- [ ] `test_legacy_same_year_sign_preserves_carried_future_years`でY=2026/L=3/signed=2026はF=3/end=2029、前年署名ならF=2/end=2028を確認。これは旧投影の保全で、新規nativeの1年延長ではない。
- [ ] `test_missing_zero_negative_and_fractional_are_distinct`、重複/型衝突、L<1/L>7、旧オフ開始済みの延期をREDで確認する。
- [ ] native/openingの投影と移管/更改/終了検証を最小限拡張する。過去の元球団/支払を作らず、読込は非書込にする。
- [ ] `npx vitest run src/engine/__tests__/economyMigration.test.js src/engine/__tests__/contractLedger.test.js src/engine/__tests__/annualRenewalTransactions.test.js src/engine/__tests__/annualFaPersonnel.test.js`をGREEN。専用PRと同一head CIを確認。

**受入:** 契約を削らず将来負担を引き継ぎ、不明な保証を事実へ変換しない。openingの途中解雇で残額が消えず、新しく記録した解除合意だけがwaiveできる。

## Task 3: A1-1c 年度許可と留保

**Files:** Create `src/engine/annualBudgetPolicy.js`, `src/engine/__tests__/annualBudgetPolicy.test.js`; modify `src/engine/annualSpending.js`, `src/engine/annualTransactions.js`, `src/engine/faCompensation.js`, `src/engine/contractEconomy.js`; extend relevant engine tests。

**Interfaces:** `quoteAnnualBudgetPolicy(world,policy) -> {authorizations,budgetPolicies,rosterRequirements}`、未更改計画`spending.renewalPlans`、年度`staffContracts`費の一意な見積。承認上限は`max(既存契約/提示の最終年, budgetSeason+7)`で、calendar seasonを代入しない。policyは必須引数、実験候補に本番既定の適正値を付けない。

- [ ] `test_plan6000_offer5000_accept5000_replaces_reserve`で計画/提示/確定が6000→5000→5000となり、二重消費0を確認。取消で6000へ戻るケースもRED。
- [ ] `test_next_year_seven_year_renewal_checks_2033`で2026期中更改が2027〜2033を審査し、2033だけ不足なら拒否、元state不変を確認する。
- [ ] `test_offseason_budget_horizon_covers_next_season_seven_year_renewal`で2026オフの`season=2026 / budgetSeason=2027`から2034年までauthorizations/budgetPolicies/rosterRequirementsを揃える。翌2027年中の2028〜2034年更改を全年度審査し、2034年だけ不足なら拒否する。最終年の承認行/人数計画行の欠損も0補完せず拒否する（C13）。実際の春越えを含む同ケースはTask 10で接続し、春のauthorizations再生成を解決策にしない。
- [ ] 年度/球団行の重複、missing/0、赤字合法取引、スタッフの年度一意費、未知FA行使歴の`legacy-conservative-max`をREDで作る。
- [ ] 既存`quoteAnnualSpendingPlan/assessAnnualSpendingChange`へ不足区分を加え、既存最低維持費/正式留保と同じ選手を重複計上しない。nativeの初回/反復率は維持する。
- [ ] `npx vitest run src/engine/__tests__/annualBudgetPolicy.test.js src/engine/__tests__/annualSpending.test.js src/engine/__tests__/annualRenewalTransactions.test.js src/engine/__tests__/faCompensationSpending.test.js`をGREEN、CI。

**受入:** 許可額・確定負担・計画・正式留保が別表示可能。budgetSeason基準で翌シーズンの最長更改年度まで準備し、全年度審査と赤字非悪化条件を保持。旧nextClubBudgetを呼ばない。

## Task 4: A1-1d 保存と移行candidate

2026-10-31追記: 第1PRを保存I/O境界へ分割。[A1-1d-1の検証・残工程](../../validation/gm-01-a1-1d1/README.md)を参照。保存/復元のvalidation、既知epochの降格拒否、Appの公開ゲートを追加。非置換commit/ack/barrier、hook hydration、移行candidate/anchor/fenceは後続であり、Task 4全体の完了ではない。

PR #521レビュー修正: revision増加でもrandomRoot・確定済み台帳・取引receiptを保持する保存境界を追加。clock更新を同revisionのまま保存すると拒否されるため、後続の進行/年度移行producerがrevisionを更新する。[採番責務・履歴保持の申し送り](../../validation/gm-01-a1-1d1/README.md#後続a1工程のrevision更新責務)をTask 4と通常/Worker/年度移行の受入条件に含める。

2026-10-31次工程: [A1-1d-2a 保存要求の置換防止](./2026-10-31-gm01-a1-1d2a-save-queue.md)へ分割。手動/自動要求のFIFOと契約envelopeの非置換化のみを扱う。公開root ack・publish→adopt barrier・hook一括採用は未実装で、queueの`ok:true`を候補採用の保証に使わない。

2026-10-31次工程: [A1-1d-2b 公開確認と状態採用](./2026-10-31-gm01-a1-1d2b-commit.md)。保存サービスのack・barrier・採用binding・公開後失敗の復旧を追加。通常Appのhook一括hydration/成功処理と移行anchor/fenceは後続。

**Files:** Create `src/engine/economyPersistence.js`, `src/engine/economyActivation.js`, `tests/economy-save-migration.test.js`, `e2e/economy-migration.spec.js`; modify `src/engine/economyMigration.js`, `src/engine/saveload.js`, `src/hooks/useGameState.js`, `src/hooks/gameStateReducer.js`, `src/App.jsx`。storage fence/activation anchorは既存`baseballManagerDb.js`を拡張したテストharnessで確認するが通常DB versionはまだ5。保存/hydrationと移行anchorが大きければ本Taskを2PRに分け、両方ゲートOFFで保つ。

**Interfaces:** `commitEconomyCandidate(candidate,expected)`、mode/schema/epoch付き保存・原子的hydration、移行`applied/deferred`。成功時の`committed`は公開root由来のsaveId/epoch/revision/rootSignature/receiptIdsを返し、候補との一致が採用条件。通常保存と共通のbarrier内でannual確定保存を置換不可とし、既存の待機payloadをまとめる経路へそのまま渡さない。dirtyScopesと既存archive/career/farmのreceiptを保存候補に残す。

- [ ] `test_failed_publish_preserves_old_world_primary_and_backups`、`test_reload_resave_then_accept_keeps_engine`、`test_annual_payload_cannot_downgrade_to_legacy`をRED。
- [ ] 既にオフ開始/境界不明/旧回答未解決/スタッフ未確定は`deferred`、進行中の旧年は旧式で完走する。移行済み同IDの2回目はno-opとするテストを作る。
- [ ] 保存中のロスター編集/新規初期化/削除の直列化、saveId/epoch/revision競合、inline/大root/バックアップ復旧をREDで固定する。
- [ ] `test_pending_economy_commit_cannot_be_replaced_by_normal_save`でA実行中→B契約候補→C旧snapshotを自動/手動保存の両方から起こし、B未公開の成功0、採用後の旧C上書き0、保存/メモリのrevision・取引receipt一致を確認する（S15）。既存の実行中/待機中保存を待ってから最新worldを再検証し、Cは採用後に破棄/再構築する。
- [ ] `test_commit_ack_requires_published_candidate_identity`でCの`ok:true`、別saveId/epoch/revision/receipt/root署名をBの成功へ流用できないことをRED。dirty解除/pendingCareerEntries/archive receiptの成功処理も公開候補との一致を必要とする。公開→採用間で通常保存を差し込み、barrierが採用/復旧まで保持されることと、冷起動で同じ契約を復元することも確認する。要求引数を写しただけの応答を公開証拠にしない。
- [ ] `test_corrupt_annual_primary_never_auto_loads_legacy_backup`、prepared anchorのpublish前/後、公開後anchor確定I/O失敗、削除/別saveIdのケースをRED。判別できない破損は非破壊で停止する。
- [ ] 読込時は候補検証だけ、境界保存成功後に一括publish/adoptする。既存の削除/競合/容量対策を利用し、保存エンジンを並立させない。
- [ ] `npx vitest run tests/economy-save-migration.test.js`と`npm run test:e2e -- economy-migration.spec.js --workers=1 --retries=0`を両browserでGREEN。既存save/career/farm回帰とCI。

**受入:** 新旧混在rootなし、未知schemaは拒否、未記録値の0補完なし、再読込/再保存/回答待ちを保持。確定保存の置換0、公開候補以外の成功採用0、採用後の旧snapshot保存0。製品での切替はまだ不可。

## Task 5: A1-2a 人の更改とFA

**Files:** Modify `src/components/tabs/ContractTab.jsx`, `src/components/hub/HubFaTab.jsx`, `src/components/hub/faMarket.js`, `src/components/screenRoutes/ContractRenewalRoute.jsx`, `src/hooks/useOffseason.js`, `src/hooks/useGameState.js`; create/extend `src/hooks/useGameState.economyContracts.test.js`, `src/engine/economyDecisions.js`。

**Interfaces:** `advanceEconomyDecisions(world,clock)`、dueDate/dueTurn付きdecision。同じproposal/command IDを再試行でも維持。legacyの旧ハンドラはmodeで分離する。新nativeのguaranteed=trueをproducer/受理双方で検証する。

- [ ] `test_2026_renewal_does_not_replace_2026_salary`で今季10000、2027年から12000×3を確認。正式提示2件の予算競合、差替え/取消、回答時最新余力/枠/期限をRED。
- [ ] `reject-renewal`の本人拒否をcancelledと区別し、現在salary/所属と未更改計画を保持したまま正式提示を解放する試験をRED。
- [ ] `test_july1_salary10000_three_year_acquisition_is_5000_10000_10000`、期中自由契約/外国人の7/31と8/1、オフの将来sign/加入待ちをRED。
- [ ] `test_august_scheduler_accepts_renewal_but_expires_acquisition`で同じ8/1のdueに、更改は翌2/1効力で受諾、FA新規獲得は期限切れとして留保解放する。11/30の更改受諾、7/31当日の登録可能も確認し、今季salary/所属は更改で変えない（S16）。既存`annualRenewalTransactions.test.js`の8/1・11/30受諾を維持する。
- [ ] `test_unsupported_clauses_cannot_improve_new_offer`、旧contractIncentivesがsave/reload後も残るケースをRED。salaryDemandの実績補正とは分離する。
- [ ] UIから共通quote/reduce/commitを使い、annualの旧salary×years控除/旧返信effect/局所Mapだけの正式提示を廃止する。交渉の見た目を全面変更しない。
- [ ] 新規対象テスト、既存contract/market/renewal回帰と対象E2EをGREEN、CI。

**受入:** 人が初期の接続済み操作をannual fixtureで完了でき、通常buildではlegacyのまま。残る新ルール未接続操作はfixtureでも旧財布へ逃がさず明示拒否。

## Task 6: A1-2b 新人・育成・移籍・発掘

**Files:** Modify `src/hooks/useOffseason.js`, `src/hooks/useGameState.js`, `src/components/Draft.jsx`, `src/engine/draftRules.js`, `src/engine/contractEconomy.js`, `src/engine/contractPayroll.js`; extend `src/hooks/useGameState.rosterCapacity.test.js`, `src/hooks/useOffseason.trade.test.js`; create `src/hooks/useOffseason.economyRookies.test.js`。

**Interfaces:** reserve/decline/join-rookie、convert-to-controlled、trade、sign-scouted。`evaluateRosterCapacity`、#515の加入待ちcontextを再利用する。これらの確定もworld/保存へまとめる。

- [ ] 69人＋支配下新人1＋未回答FA、70/71人、育成新人、FA/人的待ちと獲得競合をRED。育成は420万円や支配下枠に数えない。
- [ ] 7/16に240→420万円の当年費用322万円、元endSeason維持、将来育成契約との競合をRED。
- [ ] 金銭±500、移籍給与5484/4516、将来契約の移管、旧控除0、負担を悪化させない赤字交換をRED。
- [ ] 旧draft即加入と翌春joinの併走を止める。`育成/isIkusei`片方だけの表示/通知/集計を共通selectorへ接続する。発掘契約は明示した2年契約として当年を含め、署名なしの残数2だけを作らない。
- [ ] 新規対象＋既存annual rookie/development/trade/roster回帰と対象E2EをGREEN、CI。

**受入:** 新人は冬の留保/辞退まで、春加入はTask 10の年度候補からのみ。手動joinと旧draftAppliedによる二重加入なし。

## Task 7: A1-2c 退団・市場・海外離脱

**Files:** Create `src/engine/annualDepartures.js`, `src/engine/__tests__/annualDepartures.test.js`; modify `src/engine/annualTransactions.js`, `src/engine/contractEconomy.js`, `src/hooks/useOffseason.js`, `src/components/hub/HubContentRouter.jsx`, `src/components/screenRoutes/ContractRenewalRoute.jsx`。

**Interfaces:** `enter-market / end-contract / record-extraordinary-income`、winter `offseasonDepartures`、source contract/旧年俸/行使歴/順位根拠を伴うmarketEntry。ledgerのend/retain/waiveを再利用する。

- [ ] 冬の満了宣言と継続保証契約の解雇をRED。`expect(pastRowsAfter).toEqual(pastRowsBefore)`、未知保証の残額維持、native満了への不要なend action0を確認。
- [ ] `test_departure_does_not_fail_nov30_roster_reconciliation`と孤立departure/改変receipt拒否をRED。
- [ ] 期限後に最後の利用可能な捕手等を任意放出して試合不能となるcommandは人/CPU共通に拒否する。期中引退は年末効力へ予約する。故障による不可避の不能はTask 10の明示不戦結果と分離する。
- [ ] 海外FA離脱に国内補償なし、ポスティング収入と給与/所属終了は別、引退試合再実行で収入1回をRED。
- [ ] 満了・継続・期中で効力を区別して一括更新する。保有権と現在雇用を混同せず、旧名簿の直接削除をannualで禁止する。
- [ ] 対象テスト＋既存posting/FA/人的/年度照合回帰をGREEN、CI。

**受入:** 退団したが債務は残る状態と、自然満了を表現可能。古い支払・保証を補って通さない。

## Task 8: A1-2d コーチ・調査・投資

**Files:** Create `src/engine/annualClubCosts.js`, `src/engine/__tests__/annualClubCosts.test.js`; modify `src/hooks/useGameState.js`, `src/components/hub/HubContentRouter.jsx`, `src/components/tabs/FinanceActions.jsx`, `src/engine/contractEconomy.js`, `src/engine/player.js`のコーチ入力selector。成長式自体は変更しない。

**Interfaces:** hire/fire-coach、send/receive-scout、upgrade-stadium、staff年度契約。価格は明示policyから受け、Task 11まで候補扱い。

- [ ] 別grade含む同職種2人目の拒否、当年度確定費の返金なし、非更新年度0、採用/年次費の二重計上0をRED。
- [ ] 調査費/球場効果の失敗非変更、同mission二重受信拒否、保存/冷起動後のpending結果再開をRED。
- [ ] 旧コーチの重複/未記録条件は黙って削除/12分の1にしない。初回移行選択とlegacy延期をテストする。
- [ ] 年度担当の効果だけを既存成長/回復/戦術へ供給し、全種類を旧budget直控除から外す。3秒通知方式を維持しながら結果snapshotを永続化する。
- [ ] 対象テスト＋staff/finance/成長の既存回帰と対象E2EをGREEN、CI。

**受入:** 安い価格だけ先行公開しない。未履行の継続費、UIだけの重複禁止を残さない。

## Task 9: A1-3a CPU

**Files:** Create `src/engine/cpuEconomyCommands.js`, `src/engine/__tests__/cpuEconomyCommands.test.js`; modify `src/engine/contract.js`, `src/engine/cpuRosterCycle.js`, `src/engine/rosterPlanning.js`, `src/engine/cpuTradeExecution.js`。既存の方針・役割評価を使用。

**Interfaces:** `planCpuEconomyCommands(world,teamId,context) -> decision candidates`。proposal/command列は共通確定へ渡す。CPU関数がteams/budgetだけを更新した結果をannual worldへmergeしない。

- [ ] 同じ入力commandについて人/CPUのquote/確定/拒否が同じになる試験をRED。更改、FA/自由契約、外国人、新人、育成、トレード、人的、スタッフを含める。
- [ ] 長期契約選択候補、7年目不足、赤字球団の有限fallback、人的同率→金銭、保証を残した再建で無限ループしない試験をRED。
- [ ] 獲得価値と受諾評価を別出力にし、予算不足時は短期/代替/見送りへ進める。成功率を固定目標へ合わせるため強制受諾しない。
- [ ] 新規対象と旧legacy CPU回帰をGREEN。1seasonの短いfixtureで契約/所属/予算invariantを確認してCI。

**受入:** 任意のCPU操作の資金/登録/保証に例外なし。必要な場合に複数年を比較でき、全員単年しか表現できない状態を残さない。

## Task 10: A1-3b 日次・Worker・年度更新

**Files:** Create `src/engine/annualLifecycle.js`, `src/engine/economyRandom.js`, `src/engine/unavailableFixture.js`, `src/engine/__tests__/annualLifecycle.test.js`, `src/workers/__tests__/economyProgression.test.js`; modify `src/hooks/useOffseason.js`, `src/hooks/useSeasonFlow.js`, `src/workers/seasonBatchCore.js`, `src/workers/singleDayCore.js`, `src/workers/seasonBatchWorker.js`, `src/engine/regularGameUpdates.js`, `src/engine/clubFinance.js`, `src/engine/player.js`, `src/utils.js`。本Taskは上表の3PRへ分け、全てOFFで保つ。既存関数へ任意contextを渡す変更に留め、試合乱数全体を刷新しない。

3b-1は`annualLifecycle/economyRandom`と旧helperの任意context、open-offseason/翌春の純粋候補とuseOffseason adapter。3b-2は`unavailableFixture`と結果/順位/収支/日次経過の共通関数、各fixture/E2E。3b-3はuseSeasonFlow/Workerのprotocol、候補採用、scheduler呼出の全経路接続を所有する。後のPRに属する未実装経路は拒否し、旧財布へfallbackしない。

**Interfaces:** `prepareAnnualRollover(world,{targetSeason,transitionId}) -> candidate/blockedReasons`、`advanceEconomyDecisions`、protocolVersion/mode/saveId/epoch/baseRevisionを伴うWorker往復。

- [ ] 同じ2026オフ→2027候補を再実行して、`expect(authorizations).toEqual(originalApproved)`、salary期間/加齢/加入/収入receiptが1回のみとなる試験をRED。
- [ ] C13の実hook経路で、2026オフに2034年まで承認→2027春も承認行不変→2027期中に2028〜2034年の7年更改を確認する。2034年だけ不足する場合は最新審査で拒否し、春/通常更改の予算追加で通さない。
- [ ] 期中更改済み、未回答、FA競合/人的/新人加入の順序入替、再読込後join、保存失敗→同じ抽選結果で再試行をRED。
- [ ] `test_closing_year_growth_precedes_demands_and_excludes_new_rookies`、旧移行初年の旧コーチ/選手集合、翌年スタッフが前年成長へ影響しないケースをRED。成長/退職はopen-offseason、春に再実行しない。
- [ ] `test_failed_rollover_cold_reload_rebuilds_same_draws_and_ids`をRED。既存utilsを任意source付きで再利用するscoped乱数/UIDを注入し、グローバルMath.randomの一時差替えを使わない。
- [ ] 期限後の保有戦力不足を再配置で解消できないfixtureは、明示の不戦敗/双方不成立で日次が進み、個人成績/給与/許可を捏造しないことをRED。収支の固定額/round一回配賦、順位/履歴/保存/両browserまで検証する。不戦経路が大きければ別のゲートOFF PRとする。
- [ ] 日本シリーズ8戦目の双方負傷fixtureは0-0をseries結果へ渡さず、非試合休養tick→同じ試合再検査で回復することをRED。series試合数/実暦契約日/公式戦収支を二重に進めない。全回復後も成立不能なデータは初期化/移行/任意取引で拒否する。
- [ ] 通常/戦術/単日/まとめ/Workerで同じ取引とdueを処理し、古いrevision/未知protocol/engine欠損を拒否する試験をRED。S16の8/1境界を日次/まとめでも通し、新規獲得だけを期限切れにして更改回答を落とさない。
- [ ] 新年度builderは旧`nextClubBudget/remainingContractAfterSeason`を呼ばず、未来契約投影→clock→join→年次処理→全体検証→保存の順で組む。legacy分岐は維持する。
- [ ] 新規対象、既存offseason/save/Worker/batch回帰、年度journey E2EをGREEN、CI。通常の新規ゲームはまだlegacy。

**受入:** unresolved0で春へ進め、赤字や不可避の戦力不足で永久停止しない。予算再配布/契約残年数二重減算/二重加入/前年成長の二重実行0。まとめ中の回答予定も落ちない。

## Task 11: A1-4a UI・校正・統合証拠

A1-1aで発見した初期条件の課題: `createInitialTeams()`の支配下240/300万円seedをそのままnative契約へできない。新規annual専用の区分/最低年俸に整合する初期生成を確定し、実12球団のfactory成功・元データ非変更・予算校正を検証する。旧保存への自動切上げや勝手な育成化で解決しない。この項目はA1-4bの有効化前に必須。

**Files:** Modify `src/components/tabs/ContractTab.jsx`, `src/components/tabs/FinanceTab.jsx`, `src/components/tabs/ContractPayroll.jsx`, `src/components/OffseasonPlanningScreen.jsx`, `src/components/hub/HubFaTab.jsx`; create `scripts/a1-economy-validation.js`, `e2e/economy-annual-journey.spec.js`, `e2e/economy-save-resume.spec.js`, `docs/validation/gm-01-a1-4/README.md`。既存長期harnessは呼出経路を監査してから拡張する。

**Interfaces:** 3年主表示＋全期間展開、年俸/額面総額/今季実負担/将来負担/留保/追加余力、mode/移行状態/未解決理由。契約policy選定結果はversion付き。

- [ ] missing/0、今季と来季、保証残債、赤字、加入待ち、旧経過条項、旧コーチ移行選択が区別できる対象UI試験を作る。
- [ ] [マトリクス](../../validation/gm-01-a1-0/README.md)全件を該当単体/統合/E2Eへ割当て、未実施を合格にしない。
- [ ] 12球団の静的原資/負担表を作り、policy候補を比較。まず1seed×3年で破綻を直し、その後3seed×10年。source SHA/seed/RNG/decision trace/保存容量を残す。
- [ ] iPhone Safari実機の保存・終了・冷起動・回答/年度更新を確認し、WebKitとの差/未検証を記録する。確認できなければ公開ゲートを閉じたままにする。
- [ ] 360/390px/desktopの表示・操作と失敗時を検証。同一head CIを成功させ、未決policyの推奨値と根拠をPRに提示する。

**受入:** 合格基準は検証マトリクス。予算の適正係数や成功率を実測前に断定しない。既存長期記録を新制度合格へ流用しない。

## Task 12: A1-4b 最終有効化

**Files:** Modify the release gate in `src/engine/contractEconomy.js`, new-game initialization in `src/hooks/useGameState.js`, DB version in `src/engine/baseballManagerDb.js`; update SPEC/ROADMAP and release validation record。大きいロジック追加を混ぜない。

- [ ] Task 11の全必須受入が同じsource/policyで揃っていることを確認する。実機/長期/移行が未検証なら有効化しない。
- [ ] ゲートOFF→ONの通常新規ゲームと、旧の進行中/開始済みオフ/未開始オフの切替E2Eを作る。
- [ ] 基準のDB v5→v6 fenceを有効にし、旧v5タブの保存/削除/初期化が新rootを変更しないこと、blocked時に元セーブを維持することを両browserで確認する。
- [ ] このPRの全CIと対象release E2Eを確認し、ONの差分・互換制限・問題時の復旧を提示する。新保存を旧JSで開くことをロールバック手順にしない。
- [ ] ユーザーへマージ判断を委ねて終了する。マージ/auto-mergeは設定しない。

**受入:** 同一buildで人/CPU/Worker/年度/保存が全て揃い、新規annual、旧セーブは規定境界だけで移行する。

## 全工程の停止条件

- 再現可能な所属/費用の二重計上、source/receipt不一致、旧保存の破損/短縮、片側金銭、70人超過、進行停止が残る。
- 最終年度までの承認行や最低維持費が不足する。未知値を0や推定保証へ変換しないと通らない。
- 旧CPU/旧budget/旧年度builderの一部がannualから到達できる。
- 保存失敗でメモリだけ進む、旧タブが新形式を上書きする、unknown versionが黙って落ちる。
- 長期harnessが実際の新CPU/年度/保存を使わず、古いショートカットで成功する。
- 実iPhone/CI/長期検証の必須項目が未実行または失敗。確認待ちは失敗を隠す理由にせず、ゲートOFFの設計/基盤PRまでで止める。

各PRのコード量よりも、独立して説明/検証できることを優先する。上の変更候補に触れる必要が出たからといって、全体を一つのPRへまとめない。
