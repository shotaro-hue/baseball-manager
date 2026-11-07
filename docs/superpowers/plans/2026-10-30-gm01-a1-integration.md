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
| 6 / A1-2b | 2a | OFF | 新人/育成/トレード/旧スカウト終了 |
| 7 / A1-2c | 2b | OFF | 冬/期中の退団・市場・海外離脱・収入 |
| 8 / A1-2d | 2c | OFF | コーチ年度雇用/球場投資 |
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

2026-10-31次工程: [A1-1d-2c 読込worldの一括hydrationと再保存](./2026-10-31-gm01-a1-1d2c-hydration.md)。タイトル読込のdomain一括反映と通常payloadのengine保持を接続。取引commitのhook binding・成功処理・全操作barrierは2dへ分割し、一般公開は引き続き不可。

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

## Task 6: A1-2b 新人・育成・移籍・旧スカウト終了

2026-11-01進捗: 新人の冬の留保/辞退は#532でマージ済み。育成の支配下登録は
[A1-2b-2計画](./2026-11-01-gm01-a1-human-development.md)と
[検証記録](../../validation/gm-01-a1-human-development/README.md)の範囲で接続。
2026-11-02進捗: 育成は#533でマージ済み。人の移籍は
[A1-2b-3計画](./2026-11-02-gm01-a1-human-trade.md)と
[検証記録](../../validation/gm-01-a1-2b-3/README.md)の範囲で接続。
2026-11-02方針変更（A1-2b-4）: `sign-scouted` と発掘選手の2年契約接続は
**方針変更により不要化**（実装完了ではない）。[旧方式終了・保全仕様](../specs/2026-11-02-legacy-scout-retirement.md)へ置換。
翌春加入はTask 10、CPUはTask 9。複合項目は全体の完了まで未チェックとする。

**Files:** Modify `src/hooks/useOffseason.js`, `src/hooks/useGameState.js`, `src/components/Draft.jsx`, `src/engine/draftRules.js`, `src/engine/contractEconomy.js`, `src/engine/contractPayroll.js`; extend `src/hooks/useGameState.rosterCapacity.test.js`, `src/hooks/useOffseason.trade.test.js`; create `src/hooks/useOffseason.economyRookies.test.js`。

**Interfaces:** reserve/decline/join-rookie、convert-to-controlled、trade。`evaluateRosterCapacity`、#515の加入待ちcontextを再利用する。これらの確定もworld/保存へまとめる。

- [ ] 69人＋支配下新人1＋未回答FA、70/71人、育成新人、FA/人的待ちと獲得競合をRED。育成は420万円や支配下枠に数えない。
- [ ] 7/16に240→420万円の当年費用322万円、元endSeason維持、将来育成契約との競合をRED。
- [ ] 金銭±500、移籍給与5484/4516、将来契約の移管、旧控除0、負担を悪化させない赤字交換をRED。
- [ ] 旧draft即加入と翌春joinの併走を止める。`育成/isIkusei`片方だけの表示/通知/集計を共通selectorへ接続する。旧スカウトはlegacy/annualの両方で派遣・生成・直接獲得を停止し、候補・派遣待ち・獲得済み選手を保全する。未契約候補のドラフト等への自動転送と返金は行わない。
- [ ] 新規対象＋既存annual rookie/development/trade/roster回帰と対象E2EをGREEN、CI。

**受入:** 新人は冬の留保/辞退まで、春加入はTask 10の年度候補からのみ。手動joinと旧draftAppliedによる二重加入なし。

## Task 7: A1-2c 退団・市場・海外離脱

### 2026-11-07: #554予定 — 海外提示・本人判断から保存結果まで

基準main `4c3d8c1133f0271a0e4c8f6c89dcfc30e9550729`（#553マージ済み）。親目標は通常プレイでのポスティング完結。今回は、既存の承認済み申請→海外交渉結果の確認→成立/提示なし/本人辞退→既存の退団・収入・翌年度限定枠と結果表示までを接続する統合工程。開始は通知→受信箱の球団承認済み申請。承認操作自体の意味は#553のままとし、市場の結果確認を別操作にする。

価格方針は2026-11-07のユーザー回答「実相場で」により、**実際のMLB契約相場を基準にし、球団経済への影響を校正する**を採用。能力・実績・年齢の市場評価と、海外志向/残留条件を比較する本人判断を接続する。固定円係数の旧入札額や、NPB年俸への一律倍率を提示価格の根拠にしない。実名選手を名指しで価格付けせず、同じ役割/入力には共通のversion付きモデルを使う。

価格方針の比較用試算（係数の採用ではない）。既存quotePostingIncomeのJPY150/USD・100%翌年限定配分で、[鈴木誠也の5年$85M](https://www.mlb.com/news/seiya-suzuki-signs-5-year-deal-with-cubs)相当の保証額は追加枠219,375万円、[今永昇太の4年$53M](https://www.mlb.com/news/cubs-introduce-free-agent-pitcher-shota-imanaga)相当は147,375万円。比較用NPB年俸をそれぞれ3億/2億円、MLB年俸をその2倍と仮置きすると、追加枠は60,000/31,999万円となる。NPB年俸は架空の比較条件で、両実選手の年俸という主張ではない。MLB実例は保証額の尺度を比較する参考であり、特定選手を名指しで価格付けする実装は行わない。

**正本と制約:** createInitialTeamsの実12球団1,059選手を確認。既存tradeValueの野手/投手・年齢補正をそのまま金額尺度へしない。実名簿のpersonalityにはoverseas未記録があり、未記録を0という実測値にしない。能力・直近実績と元契約/債務は保存時点の正本から取得し、ゲーム内推定は事実と分ける。保証retainでは既存負担が残留/海外移籍の両方に残るため、本人評価で残留側だけへ二重加算しない。自動waive/旧保証unknownのtrue化は行わない。

先行作業では共通入力/抽選26件と既存の契約・トレード・posting回帰を確認。入力は実名簿ID、資格snapshotの年齢、台帳の年俸/将来負担、実測0/未記録、旧保証unknownを保持する。以下の統合受入を満たすまで工程全体の完了にしない。

**Files/Interfaces:** 共通乱数は予定済み`src/engine/economyRandom.js`と既存`utils.rng/rngf`の任意contextを使い、save/epoch/season/request/purpose別に再現する。入力snapshotは`postingMarketInputs`で実能力/実績/元契約/資格/記録有無を組み立てる。後続の市場model→共通annual transaction→fromAnnualStateで一つのworld候補へ戻し、一操作一revisionで保存する。資格＋市場結果を別world revisionで合成し、commitのbaseRevision+1制約を回避する実装は行わない。

`postingMarketModel.evaluatePostingMarket(inputs,randomRoot,scope)`は野手/先発/救援の能力と直近実績、年齢から提示を作り、MLB保証総額/minor契約金を区別する。`run-posting-market {id,type,requestId}`は金額や結果を受け取らず、必要なv2資格・評価snapshot・既存resolve-postingの結果と親receiptを同一native候補へ入れる。`generatedPostingMarket`の追記receiptを復元時もversion別に再計算し、孤立・改変・旧結果への後付けを拒否する。人/CPU共通の市場処理と、人のsession/自球団を検査するrequest adapterを分ける。

モデルv1は実例の金額尺度を参考にした簡略化。MLB30球団や各球団の国際bonus pool残高は再現しない。minor上限はゲーム内校正値で制度上の普遍的上限とは主張しない。未記録の海外志向はsave/epoch/season/player別のゲーム内推定として明示し、元データへ書き戻さない。生成結果は原則retainのみ。予算/保存拒否を市場の提示なしや本人辞退へ書き換えない。

- [x] 共通入力と乱数: 実名簿と欠測/実測0、元契約と保証、数値ID0、purpose独立、再読込/再試行、既存rng呼出互換を検証する。
- [x] 価格方針: ユーザー選択を受けて候補を比較/校正し、major/minor、提示なし/受諾/辞退と理由をversion付きで具体化する。実例の契約額は参考事実であり、現実の制度全体/将来相場を再現したと主張しない。
- [x] 統合: 人が任意の金額/結果を注入する入口を作らず、保存済み申請・資格・固定入力/評価根拠を既存resolve-postingへ渡す。一回限りの保存・receipt・履歴を保持し、失敗で退団/収入を先行させない。
- [x] 受入: 実名簿の正常/拒否、三結果、minor実測0、retained負担、stale identity/revision/session、二重操作、保存失敗→cold load→同じ結果、過年度履歴を技術検証。360/390/1440pxの結果確認と再開を両ブラウザで確認する。
- [ ] 独立レビュー、指摘検証/修正、対象検証、専用PRとexact HEAD必須CI。公開OFF/schema1/DB5を維持し、main push/マージ/自動マージはしない。

関連17ファイル合計363テスト、受信箱経路の両ブラウザ36ケースを確認。独立レビューで実証された未公開資格のまとめ保存の過剰拒否と、承認済み案件が要対応から消える問題を修正し、回帰を追加。再現用入力・実相場参照・経済影響・画面比較は[検証記録](../../validation/gm-01-posting-market-model/README.md)。

**残工程:** 通常プレイの自動希望発生・CPU判断・年度Worker、A1全体の統合プレイ/長期経済/実機/公開判断。今回もannual保存fixtureの統合と機能全体の通常プレイ完成を分け、Task7/A1全体は未完了とする。次優先はこの申請→結果の経路を通常の年度進行へ接続すること。

### 2026-11-07: ポスティングの球団判断・結果確認を受信箱へ統合

基準main `e15c57d5f2f813e2223b777129f74027052c0b33`（#551・#552マージ済み）。PR種別は統合。親目標は、プレイヤーが申請から球団判断・海外交渉・成立/不成立・翌年度反映まで完結できること。今回は通知→受信箱から、保存済みの自球団申請の承認/拒否と結果確認を可能にする。承認で退団・入金せず、拒否でも契約・財務を維持する。市場結果は#551の保存証跡を表示し、画面で金額や結果を生成しない。

**正本/接続:** `bootstrapTeams.createInitialTeams` → 共通request-posting → engine.postingApplications/transactions → 球団判断 → 共通commitEconomyOperation → 既存saveGame/commitEconomyCandidate → cold load/受信箱。結果はpostingMarketResults・postingDepartures・incomeReceiptsを参照する。受信箱のメール本文を判断権限に使わず、保存済み申請から表示を導出する。自動希望producerが未接続のため、一般公開の通常プレイから発生する機能の完成ではない。公開OFF、schema1/DB5を維持する。

**Files/Interfaces:** `src/engine/humanPosting.js` に `postingDecisionRequest(world,requestId,decision)`、`reducePostingDecisionRequest(world,request)`、`postingMailbox(world,mailbox)`。`useGameState.commitPostingDecisionRequest(request,sessionToken)` は自球団/保存identity/revision/日付を再検査し、既存の保存・採用・復旧barrierを使う。`MailboxTab`・`AnnualPostingDecision`・HubShell/HubContentRouterで既存通知/確認部品へ接続する。

- [x] RED: 自球団の承認/拒否、他球団/旧通知/古いrevision・sessionの拒否、二重操作の一度限り確定、旧方式の互換性。対応するcore/hook/UIテストを先に失敗確認する。
- [x] 実装: 判断待ち/市場結果待ち/成立/提示なし/本人辞退を区別。成立の譲渡金と翌年度限定追加枠を表示し、実測0を未記録と区別。公開済み取引をメールの表示だけで再実行しない。
- [x] GREEN: 実createInitialTeamsの支配下正常/育成拒否を含め、実保存失敗→同じ判断で再試行→cold load、公開済み判断の採用復旧、状態更新後の確認拒否、再表示/再操作を検証する。
- [x] 実画面: 既存受信箱と実hook/保存を通すfixtureで360/390/1440pxの変更前後・保存失敗・再開・三市場結果を確認する。通常プレイでの自動申請・市場交渉・年度Worker成功と混同しない。CSS境界は変更しない。
- [ ] 独立レビュー、指摘の実証/修正、対象検証、専用PRのexact HEAD必須CI。main push/マージ/自動マージなし。

**残作業/次優先:** 価格・本人受諾・希望発生policyの具体化と校正→再現可能な市場producer→CPU/年度Worker→A1全体の統合プレイと公開判断。UI後に別の基盤を無制限に追加せず、この依存を解消する。年度移行の保存・旧セーブ互換は今回の判断/表示範囲だけを検証し、Task7/A1やポスティング全体を完成扱いにしない。

2026-11-05 #547後: [明示認定事実producerと保存snapshot](../specs/2026-11-05-gm01-posting-qualification-snapshots-design.md)を独立前提に追加。確認日/rule出典のある根拠だけを承認済み申請・固定ID・元契約・save/epochに結合する。自動認定のリーグ/育成条件、架空出生生成、MLB価格/本人受諾/契約区分、署名日、市場成立receiptは未決/未実装。Task10の年度確定producerは合意済み条件に基づく一度限りの確定事実を供給し、保存済みsnapshotを更新しない。市場側は実際の署名日で再判定し、新申請から旧complete-postingへ直接流さない。Task7/A1未完了・公開OFF・schemaVersion1/DB5。

2026-11-04 #546マージ後の資格前提: [出典付きevidence/純粋判定設計](../specs/2026-11-04-gm01-posting-qualification-design.md)／[計画](./2026-11-04-gm01-posting-qualification.md)。bonus-pool免除の年齢・認定年数条件をexempt/restricted/unknownへ分け、出生日は実名簿の固定ID/profileから取得する。現行データに認定年数の完全な正本はなく、履歴掲載年を数えて補完しない。市場価格/本人受諾policyの基本方針、認定年数producer、保存済み市場receiptへのidentity紐付けは次工程。申請承認後の進行拒否・一般公開OFF・schema/DB versionを維持し、Task7/A1を完了扱いにしない。

2026-11-04 #545後: [申請・GM判断の設計](../specs/2026-11-04-gm01-posting-applications-design.md)と[残工程監査](../../validation/gm-01-posting-applications/README.md)。承認を成立扱いしない申請event/一回の判断を共通保存へ追加。MLB資格の根拠・市場policy・受諾/辞退/不成立を次の依存工程として整理。人UI/CPU/年度Worker/引退試合producerは未接続、Task7/A1未完了・公開OFF。最終SHA/レビュー/CIは対象PRを参照。


2026-11-04 #544マージ後: 引退試合の共通`record-extraordinary-income`を[設計](../specs/2026-11-04-gm01-retirement-income-design.md)／[計画](./2026-11-04-gm01-retirement-income.md)へ分離。未確定引退予約とworld日程を根拠に明示収入を一回だけ保存し、当年支出枠/通常収支/給与/保証を変えない。後続Task10は保持した証跡を翌年度審査へ接続し、postingの年度限定追加枠と二重配分しない。開催/価格producer・人UI/CPU・年度Workerは未接続。Task7/A1未完了・公開OFFを維持。最終HEAD/レビュー/CIは対象PRを正本とする。

2026-11-04 posting収入の方針変更: Yオフに成立した譲渡金をY+1の補強へ使えるよう、通常予算とは別の年度限定追加承認を採用。#543に依存する共通`complete-posting`で退団/収入/追加枠を原子的に扱う。[改訂設計](../specs/2026-11-04-gm01-posting-income-budget-design.md)／[実装計画](./2026-11-04-gm01-posting-income-budget.md)。この工程は明示済み海外契約金額を入力とする基盤のみ。申請/MLB資格根拠/市場抽選/人の承認UI/CPU判断/年度・Worker接続は未実装。Task7/A1未完了、公開OFFを維持する。Task9は同じ追加許可でCPU審査、Task10はincome履歴・対象年許可を保持し、通常予算へ再配分しないことを受入に追加する。

2026-11-04 A1-2c-4b: #542マージ済みmain `3b6192e`から、ポスティング退団と明示解除合意を共通end-contractへ接続。[設計](../specs/2026-11-04-gm01-a1-posting-departure-design.md)／[計画](./2026-11-04-gm01-a1-posting-departure.md)／[検証](../../validation/gm-01-a1-posting-departure/README.md)。12月1日の通知/合意と翌2月1日の終了効力を分け、原則retain・明示合意のみwaiveとし、旧保証不明・過去給与・現在負担者・最低維持費を維持。元契約/名簿/履歴/action/receiptを一括保存する。posting/引退試合収入、人のUI・CPU・年度/Worker自動接続は後続。Task7/A1未完了・公開OFF・schemaVersion1/DB5を維持する。最終HEAD/独立レビュー/CI/マージ状況は対象PR本文を正本とする。

2026-11-04 A1-2c-4a: #541マージ済みmain `b14aaf9`から、海外FA宣言済み選手のNPB市場退出を共通commandへ接続。[設計](../specs/2026-11-04-gm01-a1-overseas-fa-departure-design.md)／[計画](./2026-11-04-gm01-a1-overseas-fa-departure.md)／[検証](../../validation/gm-01-a1-overseas-fa-departure/README.md)。資格/自然満了/元球団履歴/行使証跡は既存宣言が所有し、退出参照とreceiptを同時保存する。給与・保証・国内FA補償・臨時収入は変更しない。継続契約の海外移籍/解除合意、posting/引退試合収入、人の操作、CPU/年度進行/Workerは後続。Task7/A1未完了、公開ゲートOFF、schemaVersion1/DB5を維持。提出HEAD・独立レビュー・CI・マージ状況は対象PR本文を正本とする。

2026-11-04 A1-2c-3: #540マージ済みmain `ea27ee4970234cdbb0d78374aa046b18d463fed8`から、明示FA宣言→資格/旧年俸順位/行使歴根拠→国内NPB市場の共通commandを実装。[計画](./2026-11-04-gm01-a1-fa-declarations.md)／[検証](../../validation/gm-01-a1-fa-declarations/README.md)。国内/海外FA権の市場区分を扱い、海外球団への実離脱・posting/引退試合収入・人の操作・CPU・年度進行/Workerは後続。Task7/A1全体未完了・公開ゲートOFFを維持。過去の未マージ/未実装記述は記録時点の情報であり、現在のPR状況/最終CIは対象PRを正本とする。


2026-11-03 A1-2c-2c: #539後、期中引退予約と12月1日の独立した確定候補commandを追加。[計画](./2026-11-03-gm01-a1-retirement.md)／[検証](../../validation/gm-01-a1-retirement/README.md)／[#540](https://github.com/shotaro-hue/baseball-manager/pull/540)。予約中は雇用・配置・給与を維持し、確定時に名簿整理・保証retain・career世代/引退履歴/receiptを原子的に保存する。年度更新への自動接続はTask 10、UI/CPU/Workerと公開は未接続。Task 7/A1全体未完了・公開ゲートOFFを維持する。最新HEAD/CI/マージ状況はPRを参照。


2026-11-03 A1-2c-2a: #537後、期中退団の前提となる共通 `assessPostTransactionPlayability` を分離。[計画](./2026-11-03-gm01-a1-playability.md)／[検証](../../validation/gm-01-a1-playability/README.md)。最小成立配置の純粋判定のみで、期中command・引退予約・台帳/履歴更新・人/CPU接続は未実装。証明用配置を保存候補として採用しない。Task 7/A1未完了、公開ゲートOFFを維持する。マージ状況・最新HEADのCIは対象PRを参照。

2026-11-03 Codex引継ぎ: #535と#536はマージ済み。確認したmainは`4c6b0f02b3ddafcfccec6eab5a2359061bcdcd41`（以後の着手時には最新mainを再確認）。#536の冬の退団共通処理・市場整合性検証・退団検証の重複/同日再計算削減まで完了。[計画](./2026-11-02-gm01-a1-winter-departures.md)と[検証記録](../../validation/gm-01-a1-2c-1/README.md)を参照。Task 7全体・A1全体の完了ではない。

次の開発依頼ではA1-2c-2以降の期中退団・契約満了・市場接続の残工程を現行コードと照合し、独立して検証できる範囲を選ぶ。人のhook/UI、CPU、年度更新、移行/公開への接続を実装済みと推定しない。本追記は引継ぎであり、後続実装の開始許可ではない。

旧スカウトの派遣生成・直接獲得は終了方針を維持し、sign-scouted等を再接続しない。annual一般公開ゲートはOFF、schema/DB versionは現状を維持する。CodexはルートAGENTS.mdに従い、依頼された工程の実装・独立レビュー・修正・検証・最新HEADのCI確認・PR提示まで担当し、ユーザーのマージ判断で止める。

2026-11-02: #535マージ後、[A1-2c-1](./2026-11-02-gm01-a1-winter-departures.md)で冬の満了/解雇/自由契約市場の共通処理を分離。期中・FA宣言・海外/収入・人のhook/UI接続は残工程。Task 7全体は未完了。

**Files:** Create `src/engine/annualDepartures.js`, `src/engine/__tests__/annualDepartures.test.js`; modify `src/engine/annualTransactions.js`, `src/engine/contractEconomy.js`, `src/hooks/useOffseason.js`, `src/components/hub/HubContentRouter.jsx`, `src/components/screenRoutes/ContractRenewalRoute.jsx`。

**Interfaces:** `enter-market / end-contract / record-extraordinary-income`、winter `offseasonDepartures`、source contract/旧年俸/行使歴/順位根拠を伴うmarketEntry。ledgerのend/retain/waiveを再利用する。

- [ ] 冬の満了宣言と継続保証契約の解雇をRED。`expect(pastRowsAfter).toEqual(pastRowsBefore)`、未知保証の残額維持、native満了への不要なend action0を確認。
- [ ] `test_departure_does_not_fail_nov30_roster_reconciliation`と孤立departure/改変receipt拒否をRED。
- [ ] 期限後に最後の利用可能な捕手等を任意放出して試合不能となるcommandは人/CPU共通に拒否する。期中引退は年末効力へ予約する。故障による不可避の不能はTask 10の明示不戦結果と分離する。
- [ ] 海外FA離脱に国内補償なし、ポスティング収入と給与/所属終了は別、引退試合再実行で収入1回をRED。
- [ ] 満了・継続・期中で効力を区別して一括更新する。保有権と現在雇用を混同せず、旧名簿の直接削除をannualで禁止する。
- [ ] 対象テスト＋既存posting/FA/人的/年度照合回帰をGREEN、CI。

**受入:** 退団したが債務は残る状態と、自然満了を表現可能。古い支払・保証を補って通さない。

## Task 8: A1-2d コーチ・球場投資

**Files:** Create `src/engine/annualClubCosts.js`, `src/engine/__tests__/annualClubCosts.test.js`; modify `src/hooks/useGameState.js`, `src/components/hub/HubContentRouter.jsx`, `src/components/tabs/FinanceActions.jsx`, `src/engine/contractEconomy.js`, `src/engine/player.js`のコーチ入力selector。成長式自体は変更しない。

**Interfaces:** hire/fire-coach、upgrade-stadium、staff年度契約。価格は明示policyから受け、Task 11まで候補扱い。

- [ ] 別grade含む同職種2人目の拒否、当年度確定費の返金なし、非更新年度0、採用/年次費の二重計上0をRED。
- [ ] 球場投資の費用/効果の失敗非変更・二重計上拒否をRED。旧send-scout / receive-scoutの再接続・pending結果再開は方針変更により不要化。
- [ ] 旧コーチの重複/未記録条件は黙って削除/12分の1にしない。初回移行選択とlegacy延期をテストする。
- [ ] 年度担当の効果だけを既存成長/回復/戦術へ供給し、全種類を旧budget直控除から外す。旧3秒通知方式の維持・永続化はA1完了条件から撤回。新しい調査・評価は別工程とし、旧方式の復活を既定にしない。
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
