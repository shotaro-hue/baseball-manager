# Draft Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 指名時に自球団の見立て・世間の評価・競合リスクを理解できるドラフトを実装する。

**Architecture:** 観測レポートと調査状態を版付きの単一セッションにする。既存の組織ニーズ検証を通して能力評価・公開予測・CPU選択を計算する。画面は共通候補ブラウザを使い、既存の抽選と所属反映を保持する。

**Tech Stack:** React 18、既存CSSトークン、Vitest、Playwright。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-10-15-draft-decision-design.md`

## Global Constraints

- 追加調査5ポイントを1位から通算。配分は会議開始時に確定。
- 競合／残存見込みは3段階と不明。CPUの未発表指名は参照しない。
- 既存の現在能力確認済み例外を維持。真のpotentialを表示やCPU順位へ渡さない。
- 360px・390px・デスクトップ、DES-01、候補全員へ到達可能。
- 抽選・拒否・70枠・指名順・巡数・所属反映は維持。
- mainへの直接push・マージ・自動マージは禁止。

## Review Focus

- ID 0と文字列ID、確定指名の所有者矛盾：既存所属評価と新レポートの参照を維持。
- 旧セーブの残ポイント0、途中の抽選・全自動：補完で残数や確定結果を引き直さない。
- 同時タップ・候補消失・画面往復：二重消費／二重指名を防止しフォーカスを復帰。
- 真値・配列順・他球団の私的予定：公開情報に混ざらない。
- 全候補同程度／突出候補／候補枯渇：多様性と集中の両方が成立し進行停止しない。

## Task 1: 観測と共通調査セッション

**Files:** Create `src/engine/draftReports.js`, `src/engine/__tests__/draftReports.test.js`, `src/hooks/useDraftEvaluation.js`.

**Interfaces:** `ensureDraftEvaluation({existing,teams,pool,year,myId,allocation,legacy})`, `startDraftEvaluation(session,pool,allocation)`, `scoutDraftCandidate(session,pool,id)`, `draftReport(session,id,teamId)`, `rememberDraftReport(session,id)`。JSON保存可能な公開・球団別レポート、配分、調査済みID、残ポイント、指名時所見を返す。

- [x] RED: 推定・確度・役割所見、再生成安定、入力順不変、旧残0、配分確定と二重消費の試験を書く。
- [x] `npx vitest run src/engine/__tests__/draftReports.test.js` の不足機能による失敗を確認する。
- [x] 観測は年度・候補・球団・能力キーによる安定したハッシュで固定。公開観測に共有誤差、球団観測に独自誤差を持たせる。現在能力は役割別重み、将来性は推定potential。精度低は幅18、高は配分に応じ6〜9、公開は幅10。真値と観測値を分離する。
- [x] 共通hookは直近セッションのrefで連打を検証し、保存済み値とローカル呼出にも対応する。
- [x] 同じ試験のGREENを確認し、コミットする。

## Task 2: CPU評価と公開予測

**Files:** Modify `src/engine/draftRules.js`; Create `src/engine/__tests__/draftStrategy.test.js`, `scripts/draft-balance.test.js`.

**Interfaces:** `rankDraftProspects(team,pool,round,acceptedPicks,context)` → 候補・点数・適合理由。`forecastDraft(teams,pool,teamId,context)` → 候補別予測。既存 `chooseDraftProspect` / `autoFirstRound` はcontextにevaluationを受け取る。

- [x] RED: 配列順、私的評価境界、突出／横並び、確定指名、残存予測の試験を書く。
- [x] `npx vitest run src/engine/__tests__/draftStrategy.test.js` の失敗を確認する。
- [x] 既存の確定指名検証と組織ニーズを共用。新モデルは現在／将来の推定能力と適合加点を基礎とし、公開候補評価のsoftmax（温度4）を関心の見込みにする。競合時の効用は獲得見込みと次点の価値を用い、回避コストを最大12点に抑える。同点はID順。
- [x] 既存のレポート未作成セーブの未確定判断にはモデルを一度補完し、保存済みの指名結果を維持する。旧API呼出の互換性も試験する。
- [x] 固定200条件で旧モデルと比較し、指名数・最大重複・単独指名・予測の区分別実績を保存。係数変更時は理由を記録する。
- [x] 新規と既存のdraft／organization試験のGREENを確認し、コミットする。

## Task 3: 共通の候補確認と指名・結果

**Files:** Create `src/components/DraftCandidates.jsx`, `src/components/DraftPreview.jsx`, `src/draft-decision.css`, `src/components/draftDecision.test.js`; Modify `src/components/Draft.jsx`, `src/hooks/useOffseason.js`, `src/components/AppScreenRouter.jsx` and related regression tests.

**Interfaces:** 各ドラフト画面へ `evaluation` と `onEvaluationChange` を渡す。候補ブラウザは `pool,session,onScout,rankings,forecast,onPick,canPick,savedState,onStateChange` を受け取る。保存するUI状態は選択・比較・絞込・順序・スクロール。

- [x] RED: 1位でレポート表示／5点調査、候補21人目の指名、2人比較、確認前に指名しない、戻り・旧残0・結果の当時所見を検証する。
- [x] `npx vitest run src/components/draftDecision.test.js` の不足機能による失敗を確認する。
- [x] プレビュー4分類を維持し、現在／将来・相性・世間を区別する。1位／外れ1位／後続巡に同じ候補ブラウザを接続する。2位以降は次までの球団順を予測へ渡す。
- [x] Routerとoffseasonの保存にセッションを接続。指名時の所見を保存し、結果は当時の記録を表示。真のpotentialによる採点・当たり外れ断定を除く。
- [x] 新旧のdraft回帰試験を実行する。操作が明示確認へ変わる既存試験は同じ目的を維持して操作だけ更新し、削除・skipしない。
- [x] GREENを確認し、コミットする。

## Task 4: ブラウザ・検証記録・独立PR

**Files:** Modify `e2e/draft.spec.js`, `ROADMAP.md`; Create `docs/implementation/draft-decision.md`, viewport PNGs under `docs/validation/draft-decision/`.

- [x] 新規の1位調査→比較→確定→保存再開、外れ1位、後続巡、旧セーブをPlaywrightに追加し、RED→GREENを確認する。
- [x] 360px・390px・1440pxの同状態を撮影・目視。最終sourceでビルド、関係単体、ブラウザ試験を確認する。
- [x] skillで指定された独立reviewerを全差分へ1回依頼し、重大指摘を回帰試験とともに修正する。
- [ ] 独立PRを作成し、最新headのCI全ジョブを確認する。mainへのpush／マージは行わない。
- [ ] 最終結果・実測分布・未確認環境を記録し、ユーザーへ報告する。
