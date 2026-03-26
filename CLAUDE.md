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

### 最優先: Tier 8（二軍シミュレーション基盤）🔴

- **㉔** 二軍シミュレーション（farm simulation）
- **㉕** 育成→支配下昇格パイプライン（ikusei → shihaka）
- **㉖** オプション制度
- **㉗** 選手育成目標・指示システム

### 並行整備

- **T5**: セーブデータバリデーション（ロード時 null チェック・ローリングバックアップ 2世代）
- **T6**: JSDoc 型注釈（player.js / simulation.js の主要関数から順次）
- **T7**: Vitest 拡充 → `resolveAtBat` / `calcEffectiveFatigue` 等（3ファイル実装済み、追加カバレッジ）

詳細は `ROADMAP.md` を参照。

---

## コーディング規約

- **RNG**: `src/utils.js` の `rng(min, max)` / `rngf(min, max)` を使う。`Math.random()` 直接使用禁止
- **フォーマッタ**: `fmtAvg` / `fmtOBP` / `fmtM` / `fmtSal` / `fmtIP` 等を活用
- **UID**: 選手・イベント等の ID は `uid()` で生成
- **定数**: ゲームバランスに関わる数値は `src/constants.js` に名前付き定数として切り出す
- **state 更新**: `useState` + `useCallback`（`useReducer` 移行は T8 で予定）
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
| `/game-refactor` | 肥大化ファイルを安全に分割・リファクタリング |

---

## ブランチ・コミット規約

- **現ブランチ**: `claude/create-game-dev-skills-zOghf`
- **コミットプレフィックス**: `feat:` / `fix:` / `chore:` / `balance:` / `refactor:`
