# Baseball Manager 2025 — Claude 開発ガイド

## プロジェクト概要

NPB（日本プロ野球）球団経営シミュレーションゲーム。OOTP / Football Manager レベルの深いフランチャイズ経営体験を目標とする。
React 18 + Vite 5 + Recharts で動作するシングルページアプリ。localStorage で永続化（IndexedDB 移行は Tier 8 着手前に再評価予定）。

詳細仕様は `SPEC.md`（80KB）、開発状況は `ROADMAP.md` を参照。

---

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動 (http://localhost:5173)
npm run build    # 本番ビルド → dist/
npm run preview  # ビルド結果をローカルプレビュー
node scripts/fetch-spaia.js  # NPB 2025 実選手データ取得 → src/data/npb2025.js
```

---

## アーキテクチャ（主要ファイル）

| パス | 役割 | サイズ |
|---|---|---|
| `src/App.jsx` | render coordinator・画面ルーティング | 198行 |
| `src/hooks/useGameState.js` | チーム・選手・ゲーム state 管理 | 258行 |
| `src/hooks/useSeasonFlow.js` | 試合シミュ・プレーオフ進行 | 402行 |
| `src/hooks/useOffseason.js` | オフシーズン・ドラフト・引退処理 | 259行 |
| `src/constants.js` | チーム定義・ゲームバランス定数・能力値テーブル | — |
| `src/utils.js` | RNG・フォーマッタ・uid 生成・日付ユーティリティ | — |
| `src/styles.css` | CSS 変数によるチームカラーテーマ | — |
| `src/engine/simulation.js` | ピッチ解決・打席結果・イニング進行（最重要エンジン） | 34KB |
| `src/engine/player.js` | 選手生成・老化・引退・怪我 | 12KB |
| `src/engine/contract.js` | 契約オファースコア・CPU 自動署名 | 9KB |
| `src/engine/trade.js` | トレード価値計算・CPU トレード生成 | — |
| `src/engine/sabermetrics.js` | OPS・OBP・SLG・ERA+ 等の高度指標計算 | — |
| `src/engine/awards.js` | MVP・沢村賞・殿堂入りロジック | — |
| `src/engine/saveload.js` | localStorage 読み書き | — |
| `src/engine/scheduleGen.js` | 143試合の NPB シーズン日程生成 | 14KB |
| `src/engine/postGame.js` | 試合後の成績集計・W/L 判定 | — |
| `src/components/Tabs.jsx` | バレルファイル（tabs/ の re-export） | 13行 |
| `src/components/tabs/` | 各タブ独立コンポーネント（12ファイル） | — |
| `src/components/TacticalGame.jsx` | イニング別試合操作 UI | 27KB |
| `src/components/Draft.jsx` | ドラフト UI（抽選・選択・確認） | 41KB |
| `src/components/Screens.jsx` | モード選択・試合結果・プレーオフ画面 | — |
| `src/data/npb2025.js` | NPB 2025 実選手ロスター | — |

---

## 現在の開発フォーカス

> Tier 1〜10 + Tier 11 3/4 完了（完成度 約87%）。詳細は `ROADMAP.md` の「現在のフォーカス」セクション参照。

### 🔴 即対応: TBD バグ修正

- **B14** `src/hooks/useOffseason.js` — ドラフト指名選手ゼロバグ（全12球団・全巡目への反映）
- **B13** `src/engine/postGame.js` — 投手成績集計バグ（CareerTable フィールド名・BF 計算）
- **B19** `src/engine/contract.js` — 外国人960日枠免除フラグ（`isForeign: false` 切替）

### 🔶 近期: UI 改善 + Tier 11 残件

- **U1** `src/components/tabs/RosterTab.jsx` — 打順スワップ + DH バリデーション
- **U2** `src/components/tabs/RosterTab.jsx` — 投手/継投サブタブ統合（5→4）
- **㊴** スプリングトレーニング（Tier 11 最後の未着手機能）

詳細は `ROADMAP.md` を参照。

---

## コーディング規約

- **RNG**: `src/utils.js` の `rng(min, max)` / `rngf(min, max)` を使う。`Math.random()` 直接使用禁止
- **フォーマッタ**: `fmtAvg` / `fmtOBP` / `fmtM` / `fmtSal` / `fmtIP` 等を活用
- **UID**: 選手・イベント等の ID は `uid()` で生成
- **定数**: ゲームバランスに関わる数値は `src/constants.js` に名前付き定数として切り出す
- **state 更新**: `useReducer` + `useCallback`（`gameStateReducer.js` に移行済み）
- **エラー境界**: `ErrorBoundary.jsx` で主要コンポーネントをラップ済み

---

## 過去バグから学んだ教訓（繰り返さないこと）

| バグ | 教訓 |
|---|---|
| B1: CPU 個人成績未更新 | 試合結果は **両チーム（自チーム・相手チーム）** に適用する。片方だけ処理しない |
| B2: handleStartGame 二重カウント | CPU シムはモード選択後（`handleAutoSimEnd` / `handleTacticalGameEnd`）に実行する |
| B6: エントリーポイント誤設定 | `src/main.jsx` の import 先は `'./App'` のみ。旧ファイルへの参照を混入させない |
| B7/B8: 中継ぎ起用されない | `checkStopCondition` の `isTop` 方向に注意。相手投手の自動交代は `opBullpen` 経由 |
| S2: 交流戦対戦相手重複 | リーグをまたぐ日程生成は offset-based rotation を使い、重複チェックを必ず行う |

---

## 利用可能なカスタムスキル（`.claude/skills/`）

| スキル | 用途 |
|---|---|
| `/game-feature` | ROADMAP の未実装機能を選んで実装・コミット・プッシュ |
| `/game-bugfix` | バグの調査・修正・コミット・プッシュ |
| `/game-balance` | `constants.js` のパラメータ分析・調整 |
| `/game-review` | SPEC.md × ROADMAP.md × コードを照合して乖離を評価・次アクション提案 |
| `/game-sprint` | ROADMAP から次タスクを選定し実装まで完結（`--review` でフルレビューモード） |
| `/game-refactor` | 肥大化ファイルを安全に分割・リファクタリング |
| `/plan-for-codex` | **【Claude 用】** ROADMAP から機能を選び `TASKS/<name>.md` に仕様書を生成（実装しない・トークン節約） |
| `/implement-from-task` | **【Codex 用】** `TASKS/<name>.md` を読んで実装・テスト・コミットまで完全自動実行 |

### Claude × Codex 分業フロー

```
Claude セッション: /plan-for-codex   → TASKS/<name>.md を生成（2〜3往復で完了）
Codex  セッション: /implement-from-task TASKS/<name>.md → 全自動で実装・コミット
```

Claude のコンテキストを企画・要求定義に集中させ、大型ファイルの精読・実装は Codex に委任することでトークン消費を削減する。

---

## ブランチ・コミット規約

- **現ブランチ**: `claude/create-game-dev-skills-zOghf`
- **コミットプレフィックス**: `feat:` / `fix:` / `chore:` / `balance:` / `refactor:`
