# 初期65人・補強人数計画 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新規ゲームの一軍・二軍を成立させ、FAと指名が70枠を奪い合わない編成計画を実現する。
**Architecture:** 初期生成の不足枠を純粋関数で配分する。人数見込みはR＋Pと未実行予定から導出し、CPUの通常67人目標・例外理由・新人予算留保をFA／ドラフトへ接続する。自球団の予定は助言として既存offseasonPlanへ後方互換で追加する。
**Tech Stack:** React18、既存エンジン、Vitest、Playwright。依存更新なし。
**Spec:** docs/superpowers/specs/2026-10-16-roster-capacity-design.md（承認済みA案、第8節の第3PR）。2026-10-17「続けて」で既選択Native方式を継続。

## Global Constraints
- 基準main122d02b7a76ed0af90b17cecb1f8a6ff488c40d8（#478マージ済み）。mainへ直接push・マージ・自動マージ禁止。
- 新規支配下65人、投手32／野手33、捕手最低6人。一軍28人・通常捕手3人、既存の2＋1運用を維持。
- 実在選手と育成を保持し、実在だけで66〜70人なら追加せず、70人超は検出。片側が32／33を超す入力は反対側で調整。
- CPUの通常補強後見込み67人。68〜70人は稼働不足／明確な更新の理由を記録。強制放出なし。自球団は70人まで手動で獲得可能。
- 新会議10人／160候補と旧会議6巡互換を維持。打撃・成長・負傷・順位係数・年俸／収益式は変更しない。
- 財務は万円。FA先払いと通常更改を区別し、新人の将来年俸留保を既所属年俸から二重控除しない。新契約金制度なし。
- 旧保存の人数・球歴・候補は移行しない。未設定の予定を0と偽らず、実行済みFA／昇格／確定指名を予定へ二重計上しない。

## Review Focus
1. 実在66〜70人・投打偏在・育成両フラグ・位置不足の入力で既存の名前／能力／履歴を保持する（Task1）。
2. 計画作成前の市場獲得、同じ年の獲得後放出、育成昇格・放出で予定を二重計上しない（Task2）。
3. CPUがFAを連続獲得しても残り指名・予算の留保を消さず、通常67と実上限70を区別する（Task2）。
4. 公開予想と私有評価、旧6巡途中保存、手動70人までの操作を新CPU規則で壊さない（Task2/3）。
5. 長期試験の旧6巡固定ハーネスを新会議検証と混同しない。実hook・143試合・保存再開・実際の会議ルールで前後を記録する（Task3）。

## Task1: 新規65人の生成
**Files:** Create src/engine/initialRoster.js, src/engine/__tests__/initialRoster.test.js。Modify playerCore.js, realplayer.js, bootstrapTeams.farm.test.js。
**Interfaces:** initialRosterSlots(players) → {pitcherRoles,batterPositions}。所属選手は変更せず、既存makePlayerで不足分だけ生成。buildTeam/buildRealTeamと同期／非同期bootstrapが使用。
- [x] 新規65人・32/33と既存100seed×12球団の実データ／代替生成、実在入力偏在・66〜70／71人、育成、同期非同期一致のテストを追加しREDを確認。
- [x] 不足側へ配分し、捕手6人と各主位置を優先。追加投手は先発／救援／抑えの層を確保。既存rng/uidを使用し、意図した乱数消費変更を記録。
- [x] 対象VitestをGREEN。初期一軍／二軍の成立と実在情報の保持を確認しcommit。

## Task2: 人数予定・CPUの通常67人と予算留保
**Files:** Create src/engine/rosterPlanning.js, src/engine/__tests__/rosterPlanning.test.js, src/components/RosterReinforcementPlan.jsx。Modify contract.js, draftContinuation.js, offseasonPlanning.js, useOffseason.js, OffseasonPlanningScreen.jsxと対象テスト。
**Interfaces:** newReinforcementPlan(team,year) → {version:1,draftGoal,faGoal,conversionIds,baselineFaIds}。reinforcementProjection(team,plan,year,teams) → 未実行予定＋projectRosterCapacity。cpuRosterPlan(team,context) → 指名留保（最大6、残枠内）と最低新人年俸留保。assessCpuAddition(team,player,context) → {eligible,reason,projectedCount}。
- [x] 放出予定≠実枠、FA／昇格／指名後の予定消化、旧未設定、ID0、67／70、予算留保、手動免除を実関数でRED。
- [x] 自球団のFA目標・指名目標・昇格候補を編集・保存。現在／予定／最終見込みと不足枠を表示。所属年俸と未確定補強費用の範囲を明記。
- [x] CPUはFA前に最大6人分（校正開始値、実指名の強制なし）の空きと最低新人年俸を留保。通常67を超える場合の稼働不足・現在／若手更新理由を返し、70を再検証する。指名候補は既存継続条件に人数・予算を追加し、私有レポートを公開予想へ混ぜない。手動球団は67目標を強制しない。
- [x] 対象Vitest・hook保存をGREEN、build、commit。

## Task3: 実操作・長期検証・独立PR
**Files:** Create scripts/roster-capacity-long-run.js と opt-inの実行entry、docs/implementation/roster-planning-65.md、docs/validation/roster-planning-65/。Modify e2eの既存CI対象spec、ROADMAP.md、SPEC.md。
**Interfaces:** 実useGameState/useOffseasonとsimulateSeasonBatchを使用。既存QA-D1のstorage adapterを踏襲し、会議は保存されたdraftRules、年間人数とCPU終了を使用。seed20261015/16/17×10年を基準mainと変更後で比較。
- [ ] 143試合／年、所属ID、70上限、球歴／年度保存、予定の保存、年俸・予算・市場・捕手／投打／年齢／出場機会／二軍未実施／終了理由を記録。乱数経路変更により勝敗の対の改善率とはしない。ポストシーズン大会の迂回は明記。
- [ ] 360/390/1440pxの同条件の変更前後画像、予定編集・FA／昇格後の予定消化・保存再開・旧予定なしを実操作。対象E2Eを既存CIグループへ追加。
- [ ] 独立全差分レビューと必要なRED→GREEN修正、検証記録、ROADMAPへ#478マージ済み／本PR未マージを反映。
- [ ] 独立PRを作成し最終headのBuild・全Unit・中核E2Eを確認。最終CIはPR本文を正本として記録し、CI完了後の文書だけのcommitで再実行しない。

## 自己レビュー
仕様第3/5/7節をTask2、第6節をTask1、第9節をTask3へ割当。CPU指名留保6は上限10とは別の校正開始値であり、質のない候補の獲得を強制しない。67超の例外と旧保存未設定を明示し、育成を65へ混ぜない。既存A案とNativeの承認に基づき、同じ要件の再承認を求めず続行する。
