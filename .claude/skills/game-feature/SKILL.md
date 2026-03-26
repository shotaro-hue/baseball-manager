---
name: game-feature
description: ROADMAP.md の未実装機能を選択し、SPEC.md を参照しながら実装・コミット・プッシュするワークフロー。新機能を追加したいとき、Tier の次のタスクを実装したいときに使う。
---

# Game Feature 実装スキル

ROADMAP.md から未実装機能を選び、SPEC.md の仕様に従って実装し、コミット・プッシュするワークフロー。

## ワークフロー

Make a todo list for all the tasks in this workflow and work on them one after another.

### 1. ROADMAP を読んで対象機能を特定

`ROADMAP.md` を読み込み、実装ステータスを確認する:
- ✅ 完了済み
- 🔶 部分実装
- 🔴 未着手（Pending）

ユーザーが実装する機能を指定していない場合は、現在進行中の Tier（🔶）の中で最も優先度が高い未着手タスクを提案する。

### 2. SPEC.md で仕様を確認

`SPEC.md` の該当セクションを読み込んで、以下を把握する:
- 機能の目的・ゲームへの影響
- 入出力・データ構造
- エッジケース・制約条件
- 他機能との依存関係

### 3. 関連コードを調査

実装に必要なファイルを特定して読み込む:

**エンジン層** (`src/engine/`):
- `simulation.js` — ゲーム内シミュレーション
- `player.js` — 選手生成・老化・引退
- `contract.js` — 契約ロジック
- `trade.js` — トレードロジック
- `draft.js` — ドラフトロジック
- `sabermetrics.js` — セイバーメトリクス計算
- `awards.js` — 表彰・記録

**UI 層** (`src/components/`):
- `Tabs.jsx` — メインハブのタブ群
- `TacticalGame.jsx` — 試合操作 UI
- `Screens.jsx` — 画面切り替え

**状態管理**:
- `src/App.jsx` — グローバル state と game flow

**定数**:
- `src/constants.js` — チーム定義・ゲームバランス定数

既存の類似実装パターンを確認し、再利用できる関数・ユーティリティを把握する。

### 4. 実装

- 既存のコードスタイル・命名規則に従う
- `src/utils.js` の既存ユーティリティ（RNG、フォーマット、uid）を活用する
- ゲームバランスに影響する数値は `src/constants.js` に定数として切り出す
- エラーが起きうる箇所には適切な guard を入れる

### 5. ビルド確認

```bash
cd /home/user/baseball-manager && npm run build
```

ビルドエラーがあれば修正する。

### 6. ROADMAP.md を更新

実装した機能のステータスを 🔴 → ✅（または 🔶）に更新する。

### 7. コミット・プッシュ

```bash
cd /home/user/baseball-manager
git add -p   # 関連ファイルのみステージ
git commit -m "feat: <機能名の簡潔な説明>"
git push -u origin <current-branch>
```

## 完了時の報告

以下の形式でユーザーに報告する:

- 実装した機能の概要
- 変更したファイル一覧
- ビルド結果: ✅ 成功 / ‼️ 失敗（詳細）
- ROADMAP.md の更新内容
- 次に実装を推奨する機能（あれば）
