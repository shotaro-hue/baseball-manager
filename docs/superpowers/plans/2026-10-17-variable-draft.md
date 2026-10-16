# 可変ドラフト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Native実行は既に選択済み。最後に独立した全差分レビューを行う。

**Goal:** 新しく作る会議を160候補・最大10人とし、手動とCPUの選択終了、拒否を含む当年指名上限、旧6巡の保存再開を一貫させる第2PR。

**Architecture:** 固定ルールと当年の参加資格を純粋関数へ分離する。人数は第1PRの共通基盤を使用。指名履歴から年間指名数を導出し、終了球団と理由を既存の会議viewへ追加保存する。順位付けの係数・観測レポートは保持し、CPU継続条件だけ別関数へ置く。

**Tech Stack:** React、JavaScript、Vitest、Playwright、既存保存、GitHub Actions。依存追加なし。

**Spec:** [承認済み仕様](../specs/2026-10-16-roster-capacity-design.md) 第4・5・7節と第2PR。

**Baseline:** `17fa9c063cdc00959287b728ee39dfbba5ef90c4`（#477マージ済み）。Native方式と次工程への実行指示を継続し、同じ要件の承認を繰り返さない。

## Global Constraints

- 新規会議のみルール版2／10人。版のない既存会議は6巡・既存候補・手番のまま。ロードで候補を再生成しない。
- 新候補160人＝投手80（先発32／中継ぎ27／抑え21）＋野手80、既存スカウト候補を追加。既存の生成方式・指名順・抽選・拒否確率を維持。
- 単独／当選で指名確定した人数を数える。落選は0、拒否は年間指名1・予約0。終了は当年取消不可。ID 0を有効に扱う。
- 現在所属R＋受諾予約Pで70人。初期65人・CPU67人目標・FAの計画・財務式・10年統合検証は第3PRへ残す。
- CPUの候補順位と継続可否を分離し、候補が残っただけで10人取らせない。手動プレイヤーは評価にかかわらず参加資格の範囲で指名可能。
- mainへの直接push、マージ、自動マージ、テスト削除／skip／不当な緩和、破壊的な保存移行は禁止。

## Review Focus

1. 旧6巡会議の途中保存（Task 1/3/4）：候補・手番・確定指名・調査ポイントを保持し、新方式へ途中変更しない。
2. 拒否・落選・ID 0（Task 1/3）：拒否で上限を延長しない。落選で人数を消費せず、確定指名を二重計上しない。
3. 終了済み球団・全自動・予想（Task 2/3）：終了後の再参加を防ぎ、予想へ私有レポートを漏らさない。
4. 捕手充足後・役割不足・既存の確定新人（Task 2）：6人をハード上限にせず、更新可能な上位候補は許し、確定新人で同じ不足を重複計上しない。
5. 連打・保存復帰・全球団終了・候補枯渇（Task 3/4）：二重指名／再抽選／停止／所属消失を防ぐ。360/390/1440pxで確認と戻りの操作を維持。

## 原因の再現と継続条件の校正値

#475マージ時`cd02b45`を隔離してseed20261016の実3年進行へ読み取り専用の指名記録を追加した。製品の候補生成・乱数・順位を変更しない。2026年の第3/4指名は捕手55/91・62/72（現在/将来）、score70.7/69.9、野手共通fit4.9。最上位の非捕手は68.7。2027年は捕手76/92（第1、86.4）、65/95（第2、78.9）、49/80（第5、63.2）。各々の非捕手上位は86.2・76.6・61.7。捕手不足加点は0で、順位1位を必ず取る構造が継続の原因。個々の捕手指名すべてを不当とは断定しない。生記録は`docs/validation/variable-draft/catcher-trace-2026/2027.json.gz`。

新方式のCPU継続は次を初期校正値とする。候補は球団の観測current/futureだけを使い、未観測の真の候補能力を読まない。

- 既存の組織不足（捕手6、投手と内野の既存minimum）または未充足の主位置1人を補い、current>=50またはfuture>=60なら候補に残す。
- 充足した役割では、currentが既存の稼働最低人数ぶんを現在能力で並べた末尾より10点以上高ければ現在戦力更新として残す。末尾人数は組織レポートのactiveMinimum、未定義位置は1。育成は支配下深度へ混ぜない。
- 年齢24歳以下でfuture>=60かつ同役割の既存24歳以下の最大将来性より10点以上なら世代更新として残す。若手不在は比較値0。確定新人は真の能力ではなく当球団レポートを既存層へ加える。
- 10点は既存の表示評価帯（50/60/70/80）の1段階を基にした保守的な開始値。数点の順位差や野手共通fitだけで充足済み役割を反復指名しない。長期最適値の実証ではない。各候補の理由と比較値を返し、回帰テストと複数seedの会議で分布を記録する。
- 上記に合う候補がなければ「戦力更新候補なし」で選択終了。登録枠・指名上限・候補枯渇・手動終了は別理由。既存順位関数は有効候補から選び、抽選・公開予想にも同じ参加資格を使う。

## Task 1: 会議ルール・年間指名数・160候補

**Files:** Create `src/engine/draftConference.js`, `src/engine/__tests__/draftConference.test.js`。Modify `src/constants.js`, `src/engine/draft.js`, `src/hooks/useOffseason.js`。

**Interfaces:** `newDraftRules()`→`{version:2,maxPicks:10}`、`draftRulesFor(rules)`→新10／旧6、`draftNominationCount(teamId,pool,drafted,log)`→確定IDの重複なし年間指名数、`draftParticipation(team,pool,drafted,context)`→`{eligible,reason,count,maxPicks}`。contextは`rules,endedTeams,log,teams`。指名数は保存済み履歴から導出、複製stateへ保存しない。

- [x] 候補160／投80野80／投手役割32/27/21、旧ルール既定6、拒否10・予約9、ID0・落選・重複を先にテストしRED。
- [x] 最小実装、新会議作成時だけdraftRulesを固定。既存候補は触らない。
- [x] 対象VitestでGREEN、Task 1をcommit。

## Task 2: CPU継続判定と公開予想

**Files:** Create `src/engine/draftContinuation.js`, `src/engine/__tests__/draftContinuation.test.js`。Modify `src/engine/draftRules.js`, `src/engine/draftReports.js`。

**Interfaces:** `evaluateDraftContinuation(team,pool,round,acceptedPicks,context)`→`{continue,reason,candidates,decisions}`。各decisionに候補ID・理由・比較値。`ownedDraftCurrent(player)`は既存レポートと同じ役割重みの既知所属能力。rankの重みは変更しない。新rules指定のCPU選択だけ可否を適用。公開予想はpublicEvaluationを使い、終了球団・上限・空き枠を共通確認。

- [x] 充足捕手の同等候補は終了、明確な更新候補と不足は継続、確定新人で不足・将来比較を更新、公開予想の私有情報独立をRED。
- [x] 上記校正値を実装。旧会議は従来動作を保持し、新resolveFirstRoundはnull指名を終了として処理する。
- [x] 記録fixtureで当時の選択理由・新基準の対比を実行し、既存ドラフト戦略・人数のテストとGREEN、commit。

## Task 3: 手動終了・上限・保存再開を実描画へ接続

**Files:** Modify `src/engine/draftRules.js`, `src/engine/offseasonResume.js`, `src/hooks/useOffseason.js`, `src/components/Draft.jsx`, `src/components/DraftPreview.jsx`, `src/components/AppScreenRouter.jsx`。Create `src/components/DraftEndSelection.jsx`, `src/components/variableDraft.test.js`。

**Interfaces:** 各画面へ`rules`を追加。lotteryのonDone第3引数に終了球団mapを追加し、routerがdraftの初期viewへ引き継ぐ。各viewの`endedTeams`を既存保存経路へ追加。log＋1位のpoolにより年間指名数を導出。終了確認は既存useResultDialogでフォーカス・Escapeを維持。

- [x] 0/1/6/10指名で終了、拒否後10、連打、終了後全自動、旧6巡保存、候補枯渇・全終了をRED。
- [x] 当年指名数／上限と終了状態を表示し、操作と自動進行・予想に共通参加資格を適用。既存の詳細・比較・調査通算・抽選記録を保持。
- [x] 対象コンポーネント・hook保存テストでGREEN、commit。

## Task 4: 実操作・検証記録・独立PR

**Files:** Modify `e2e/draft.spec.js`と必要な既存CI対象spec、`ROADMAP.md`, `SPEC.md`。Create `docs/implementation/variable-draft.md`, `docs/validation/variable-draft/`。

- [x] 新旧会議を実save/loadし、所属・候補・手番・終了を照合。160候補の調査・比較・一覧復帰と選択終了を360/390/1440pxで実操作し同条件の前後画像を残す。
- [x] 複数seedの新会議で指名分布・終了理由・70上限・性能を記録。10年検証や実機成功とは報告しない。
- [x] Buildと関連試験を実行。全差分を独立レビューし重要指摘を修正。#477マージ済みと第2PR未マージの進捗をROADMAPへ反映する。
- [ ] 独立PRを作成し、最終headのBuild・全Unit・中核E2Eを確認（公開後の最終ゲートとして継続）。成功済み全セットの無意味な重複なし。最終SHA・CI・未検証事項と第3PRを報告。

## 自己レビュー

仕様第4・7節→Task 1/3/4、第5節の継続→Task 2、既存人数基盤→全Task。5つのReview Focusに所有Taskを割り当てた。初期65人・CPU67人・補強予定・10年統合は後続と明記。既に選択されたNative方式で続行する。

公開後の最終CIゲートの成否・head SHAはPR本文で確定する。この計画ファイルのチェックはソース確定時点の記録であり、CI未実行を成功扱いにしない。
