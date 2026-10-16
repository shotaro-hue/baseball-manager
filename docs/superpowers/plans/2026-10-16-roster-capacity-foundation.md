# 支配下人数・残枠の共通基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支配下・育成・確定指名を共通集計し、獲得の70人制限と画面の残枠・放出見込みを一致させる第1PRを実装する。

**Architecture:** 所有と確定指名から導く純粋関数を`rosterCapacity.js`へ置く。既存の各獲得処理と表示へ接続し、所属変更は既存の確定処理に残す。指名の10人化・初期65人化へ渡す契約を先に固定し、今回のPRでは候補・初期人数・CPU評価を変更しない。

**Tech Stack:** JavaScript/React、Vitest、Playwright、既存IndexedDB/localStorage保存、GitHub Actions。新規依存なし。

**Spec:** [承認済み仕様](../specs/2026-10-16-roster-capacity-design.md)の第3節と第7節の人数表示を本計画で実装。残りは後述の接続工程へ分離する。

**Baseline:** `17c7cc206dfa44cec9a8f43b7719bc53d381f05b`（#476マージ後）。開始時に最新main・AGENTS・既存PRを再照合する。計画作成時の製品コード変更・製品テスト実行はない。

## Global Constraints

- 支配下上限70人、一軍28人、通常捕手3人／最低2人、組織主捕手6人を維持する。
- `育成`または`isIkusei`が真なら育成。一軍・二軍の非育成を支配下へ数え、負傷・登録待機・外国人で所有人数を減らさない。
- 現在所属Rと受諾済み未所属指名Pは別計上し、実残枠は`max(0, 70 - R - P)`。予定放出は実残枠を増やさない。
- 候補80人・旧6巡・現在の初期人数・順位・拒否確率・CPU得点・財務式・保存スキーマを本PRで変更しない。
- 入力stateを変更せず、計数・表示で乱数を消費しない。保存へ派生人数を重複格納しない。
- 360px・390px・1440px、選手詳細／比較への往復、保存再開を守る。文言・小さな概要表示以外のUI刷新なし。
- mainへの直接push、マージ、自動マージ、破壊的な保存移行、テスト削除・skip追加・根拠のない緩和は禁止。

## Review Focus

1. `isIkusei`だけ真の旧選手：FA・育成登録・一軍昇格・表示が同じ育成判定を使う（Task 1/2）。
2. ID 0と所有重複・指名競合：0を欠測扱いせず、曖昧な所有から空き枠を作らない（Task 1）。
3. 所属へ反映済みの新人・拒否・他球団指名：予約枠へ二重計上せず、自球団へ混ぜない（Task 1/2）。
4. 放出予定の取り消し・古い画面からの確定：見込みだけを変え、確定時の最新所属で再検証する（Task 2/3）。
5. 旧オフシーズンの途中保存：未記録の予定を確定扱いせず、候補・手番・所属・履歴を保持する（Task 3/4）。

## 共通インターフェースとファイル境界

- Create `src/engine/rosterCapacity.js`：`isIkuseiPlayer(player)`、`controlledRosterCounts(team)`、`evaluateRosterCapacity(team, options={})`、`projectRosterCapacity(team, intent={}, options={})`、`draftCapacityContext(plan, year, teams=[])`。
- `controlledRosterCounts(team)` → `{controlledCount, developmentCount}`。一軍・二軍を両方数える。
- `evaluateRosterCapacity(team, {teams=[team], draftPool=[], drafted={}, confirmedPicks={}}={})` → 成功時`{ok:true, controlledCount, developmentCount, acceptedPickCount, acceptedPickIds, ignoredPickIds, remainingSlots, overBy}`。失敗時`{ok:false, reason}`。人数不足をデータ異常としない。
- `projectRosterCapacity(team, {releaseIds=[], draftRemaining=0, faRemaining=0, conversionIds=[]}={}, options={})` → 上記の成功結果に`releaseControlledCount, projectedControlledCount, projectedRemainingSlots, projectedOverBy`を追加。予定は未実行分のみ。育成の放出は支配下見込みを減らさず、既に支配下のIDを昇格予定へ重ねない。負数・非整数の予定は`invalid-plan`。
- `draftCapacityContext(plan, year, teams=[])` → `{teams,draftPool,drafted,confirmedPicks}`。同年度の`draftResult.pool`→`draftPool`、`draftResult.drafted`→`draftViews.draft.drafted`の順で実在する状態を採用し、途中1位の`draftViews.lottery.confirmedPicks`も渡す。別年度・未記録は空の候補／割当。推測で指名を作らない。
- `src/engine/rosterAutomation.js`は新しい`isIkuseiPlayer`を再exportし、既存importを壊さない。新モジュールから同ファイルをimportしない。`renewalRules.ownedPlayers`と`offseasonResume.draftPicksForTeam`を再利用し、循環依存を作らない。
- 所有ID欠測／重複は失敗として返す。候補の拒否・既所有・当選球団競合は現行organizationNeedsと同じく予約から除き、`ignoredPickIds`へ理由とともに記録する。他の有効な指名まで無効にしない。同一候補の重複レコードは有効性を確認してから1回だけ計上する。実際の一括入団時の重複候補拒否は別途維持する。ID 0は有効、数値0と文字列'0'の同居など割当キーが衝突する入力は拒否する。球団IDの数値／文字列比較は既存互換を維持する。
- 不正結果の表示は「未確認」、変更操作は理由を出して停止する。`undefined`や異常を残枠0・空き70へ変換しない。`registeredDraftCount(team)`の数値APIは`controlledRosterCounts`の薄い互換ラッパーとして残す。

## Task 1: 共通集計と指名予約

**Files:** Create `src/engine/rosterCapacity.js`, `src/engine/__tests__/rosterCapacity.test.js`; Modify `src/engine/rosterAutomation.js`, `src/engine/organizationNeeds.js`, `src/engine/draftRules.js`; Test 既存のorganizationNeeds・draftNeedsConfirmedPicks・catcherDepthPolicy・初期同等性。

**Interfaces:** 上記5関数を提供する。`organizationNeeds`の既存出力名と`registeredDraftCount`／`remainingDraftSlots`の既存呼び出しを維持する。

- [ ] 次の実データ集計テストを追加する。片側フラグ、負傷、待機、外国人でも定義が変わらず、deep freezeした入力と乱数呼出回数が不変であることもassertする。

```js
const team = { id: 0, players: [{id: 0}, {id: 'inj', injuryDaysLeft: 20}],
  farm: [{id: 'dev', isIkusei: true}, {id: 'reg', registrationCooldownDays: 10}] };
expect(controlledRosterCounts(team)).toEqual({controlledCount: 3, developmentCount: 1});
expect(evaluateRosterCapacity(team)).toMatchObject({ok:true, remainingSlots:67, acceptedPickCount:0});
```

- [ ] 69人＋候補ID 0の当選で残枠0、入団反映後も残枠0、拒否なら残枠1を追加する。他球団・所有済み・重複・1位途中の確定・所有競合も個別にassertする。拒否・競合のある候補と有効候補が同居しても有効な予約を失わないことを検証する。予定放出と実枠の分離を追加する。

```js
expect(projectRosterCapacity(team, {releaseIds:['inj','dev'], draftRemaining:2}))
  .toMatchObject({remainingSlots:67, releaseControlledCount:1, projectedControlledCount:4});
```

- [ ] `npx vitest run src/engine/__tests__/rosterCapacity.test.js`でREDを確認し、関数と予約検証を実装する。現行organizationNeedsの拒否・既所有・競合排除を共通関数へ移し、元の評価を弱めない。
- [ ] `npx vitest run src/engine/__tests__/rosterCapacity.test.js src/engine/__tests__/organizationNeeds.test.js src/engine/__tests__/draftNeedsConfirmedPicks.test.js src/engine/__tests__/catcherDepthPolicy.test.js tests/initialization-equivalence.test.js`でGREEN。初期snapshot・乱数回数は変更不要であることを確認する。
- [ ] `feat: unify controlled roster and accepted draft capacity`として対象ファイルを明示してcommitする。

## Task 2: 確定処理と説明を同じ70枠へ接続

**Files:** Modify `src/engine/marketRoster.js`, `src/engine/tradeTransaction.js`, `src/engine/draftRules.js`, `src/components/hub/faMarket.js`, `src/components/farmDevelopmentDisplay.js`, `src/hooks/useGameState.js`, `src/hooks/useOffseason.js`。Test `src/engine/__tests__/rosterCapacity.test.js`, `src/engine/__tests__/tradeTransaction.test.js`, `src/engine/__tests__/contract.test.js`, `src/components/farmDevelopmentDesign.test.js`, `src/hooks/useOffseason.market.test.js`。追加hook試験は`src/hooks/useGameState.rosterCapacity.test.js`へ置く。

**Interfaces:** `marketRosterError(team,player,teams=[team],draftContext={})`と`applyTradeTransaction(teams,offer,draftContext={})`に省略可能な文脈を追加。旧2〜3引数のAPIは維持する。呼び出し側はTask 1の`draftCapacityContext`へ既存の年・plan・最新teamsを渡す。

- [ ] 69支配下＋育成ありで支配下1人獲得可能、70人では育成だけ獲得可能、69人＋未所属の確定指名1人では追加支配下不可の実確定試験を先に書く。FA・トレード・育成登録・指名反映のいずれも同じ残枠をassertする。
- [ ] `isIkusei`だけ真の選手は市場で二軍配置、一軍へ直接昇格不可、支配下登録では両フラグをfalseへ更新する試験を追加する。70枠と28枠・外国人枠を混同しない。現在の育成登録handlerが一軍空きを要求する動作は本PRでは維持し、二軍に残したまま支配下登録する変更は後続の別判断とする。
- [ ] 最新所属が変わった後の確定、同じ指名反映を2回、同じIDの二重獲得、支払不足時を再現し、失敗時に予算・所属・履歴が一切変わらないことをassertしてREDを確認する。
- [ ] 最新の相手・自チームを用いて共通集計へ接続する。トレードは両球団の交換後状態と未所属予約を確認し、所属を移す前に成否を確定する。給与・契約期間・FA先払い・選手評価の式は変更しない。
- [ ] `npx vitest run src/engine/__tests__/rosterCapacity.test.js src/engine/__tests__/tradeTransaction.test.js src/engine/__tests__/contract.test.js src/hooks/useGameState.rosterCapacity.test.js src/hooks/useOffseason.market.test.js src/components/farmDevelopmentDesign.test.js`でGREEN、`fix: enforce shared roster capacity at acquisition boundaries`としてcommitする。

## Task 3: 実数・確定予約・予定放出の表示と旧保存

**Files:** Modify `src/engine/offseasonPlanning.js`, `src/components/OffseasonPlanningScreen.jsx`, `src/components/FarmDevelopmentPanel.jsx`, `src/components/tabs/RosterTab.jsx`, `src/components/MobileRoster.jsx`と、検索で確認した同じ表示の実ルート。Test `src/components/offseasonPlanning.test.js`, `src/components/farmDevelopmentDesign.test.js`, `src/hooks/useOffseason.resume.test.js`, `src/components/draftResume.test.js`。Styleは既存`src/components/offseason-planning.css`の局所調整のみ。

**Interfaces:** `planningSummary(team,plan,year,teams=[team])`の既存出力を維持し、`capacity`と`projectedCapacity`を追加する。`projectedCapacity`は既存releaseCandidatesだけを見込みへ反映する。ドラフト・FA・昇格の編集可能な人数予定は第3工程で追加する。

- [ ] 放出候補を付け外ししても`capacity.remainingSlots`は不変、`projectedCapacity.projectedControlledCount`だけ変わる試験を追加する。実放出・獲得後は実数を更新し、同じ選手を予定にも残して二重計上しない。
- [ ] 「支配下 R/70」「育成 N人」「確定指名 P人」「実際の残枠」「放出候補反映後の支配下見込み」を既存概要へ表示する試験でREDを確認する。未記録の補強予定を0人の確定計画として表示しない。現行の総保有人数・年俸表示は別の意味として保持する。
- [ ] 実描画ルートを確認してTask 1の値へ接続する。70枠の説明は`isIkusei`／`育成`の両方へ一致させ、詳細／比較・確認ダイアログ・一覧復帰を維持する。
- [ ] 旧保存を`saveGame`／`loadGame`で往復し、実支配下・確定指名の導出一致、選手ID・所属・球歴・候補・手番の保持、別年度のplanを枠予約へ混ぜないことをassertする。
- [ ] `npx vitest run src/components/offseasonPlanning.test.js src/components/farmDevelopmentDesign.test.js src/hooks/useOffseason.resume.test.js src/components/draftResume.test.js src/hooks/useGameState.offseasonSave.test.js`でGREEN、`feat: explain actual and projected controlled roster slots`としてcommitする。

## Task 4: 実操作・レビュー・独立PR

**Files:** Create `docs/implementation/roster-capacity-1.md`, `docs/validation/roster-capacity-1/`。Modify `ROADMAP.md`, `e2e/farm-development.spec.js`, `e2e/draft.spec.js`, `e2e/trade.spec.js`。既に通常CIに入る3本へ、それぞれ育成登録・人数計画と指名予約・両球団の残枠のケースを追加し、CI設定は変更しない。

**Interfaces:** 成果物は第1PRだけの検証記録・変更前後画像・最終headとCI。承認済み設計とこの計画をPRから参照できるようにする。

- [ ] 同一fixtureの69/70人・育成両フラグ・放出候補取り消し・契約確定・保存再開を360/390/1440pxで実操作する。前後画像、実表示の一致、横スクロール・フォーカス復帰を記録する。
- [ ] 開発中の関連Vitestと対象E2Eだけを実行し、失敗は原因を絞る。`npm run build`を確認して独立レビューを実施し、重大・重要な指摘は修正する。
- [ ] 最新mainから第1PRを作り、原因、共通定義、対象画面、旧保存互換、テスト結果、後続で未実装の項目を書く。CIは最終headでBuild・全Unit・中核E2Eを確認し、同じ全セットをローカルで重複実行しない。
- [ ] ROADMAPへ第1PRは未マージとして反映する。65人生成・10人指名・160候補・CPU67人目標・10年検証を完了扱いにしない。
- [ ] 検証記録・PR URL・head SHA・CI・残課題を報告する。マージ判断はユーザーに残す。

## 後続計画へ渡す条件

本計画は承認仕様全体を一度に実装するものではなく、第1PRで独立して検証できる共通基盤を対象とする。以下は依存する次工程であり、本計画の完了条件には数えない。

| 工程 | 共通基盤から使うもの | 計画で確定する事項と検証 |
|---|---|---|
| 第2PR：可変ドラフト | `evaluateRosterCapacity`、`draftCapacityContext`、共通育成判定 | 新会議10人・160候補（投手80＝先発32/中継ぎ27/抑え21）、選択終了、拒否後も年10人上限、途中保存。旧6巡会議は維持。#475の6→8→11人を各指名の観測評価・代替候補で追跡し、CPU継続判定の項目・閾値を実装前に計画へ記録する。人数観測だけから原因や係数を捏造しない |
| 第3PR：初期65人・人数計画 | `projectRosterCapacity`と第2PRの会議上限・終了状態 | 新規65人（投手32/野手33）、捕手6人、CPUの通常67人目標、残り指名・FA・育成昇格を含む人数予定。実在選手・旧保存は強制変更しない。既存財務・人数・市場への影響と3seed×10年を検証する |

既存の3年計測を10年成功へ読み替えない。先行PRが未マージなら、後続を最新mainからの独立PRとして実装済みと報告しない。先行マージ後に最新mainを再確認して、それぞれの実装計画を具体化する。

## 自己レビューと実行方法

- 仕様第3節→Task 1/2、人数表示・旧保存→Task 3、画面・CI→Task 4へ対応付けた。他の仕様は上表で明示している。
- 共通関数の名前・引数・出力をTask 1と後続で一致させ、Review Focusの5項目を所有Taskへ割り当てた。
- 推奨は**Native：このWork内で順に実装し、最後に独立レビュー**。各Taskが同じ計数インターフェースへ強く依存し、旧保存・画面・確定処理を一人が通して確認する方が引き継ぎコストを抑えられる。
- 代案は**Subagent-driven：Taskごとに別担当が実装・レビュー**。より細かい独立確認ができる一方、各Taskで別コンテキストとレビューを要する。
- 計画と実行方式の確認後に、選択した方式の実装スキルへ進む。本書作成時点では製品テストを実行済みとしない。
