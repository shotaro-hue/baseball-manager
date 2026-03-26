---
name: game-refactor
description: App.jsx（T3）・Tabs.jsx（T4）等の肥大化ファイルを安全に分割するリファクタリングワークフロー。動作を変えずにコード構造だけを改善したいときに使う。
---

# Game Refactor スキル

## ワークフロー

Make a todo list for all the tasks in this workflow and work on them one after another.

### 1. 対象タスクを確認

ROADMAP.md の「保守性・コード品質」セクション（T* タグ）を読み、
リファクタリング対象と分割方針を確認する:

- **T3: App.jsx 分割**（67KB）
  - `src/hooks/useGameState.js` — 選手・チーム・schedule の state
  - `src/hooks/useSeasonFlow.js` — 試合進行・gameDay 管理
  - `src/hooks/useOffseason.js` — FA・トレード・ドラフト・契約
  - `src/screens/HubScreen.jsx` / `src/screens/GameScreen.jsx` — 画面コンポーネント

- **T4: Tabs.jsx 分割**（85KB）
  - `src/components/tabs/RosterTab.jsx`
  - `src/components/tabs/TradeTab.jsx`
  - `src/components/tabs/RecordsTab.jsx`
  - …各タブを独立ファイルに

### 2. 対象ファイルを読む

分割元ファイルを読み込み、以下を把握する:
- 依存関係（props / state / callback の流れ）
- 分割境界線（どこで切れば deps が最小になるか）
- 既存の import パターン（他ファイルからどう呼ばれているか）

### 3. 分割設計

分割後のファイル一覧と各ファイルの責務を書き出す。

**リファクタリング原則**:
- 外部から見た動作を変えない（props・返り値・副作用を維持）
- 一度に分割するのは 1〜2 ファイルまで（差分を追いやすくする）
- 分割元ファイルは最後に削除（段階的移行）

### 4. 実装

新ファイルを作成し、分割元から該当コードを移動する。
import/export を正確に更新する。

### 5. ビルド確認

```bash
cd /home/user/baseball-manager && npm run build
```

リファクタリングなのでビルドエラーは必ず 0 にする。

### 6. ROADMAP.md を更新

完了した T* タスクのステータスを ✅ に更新する。

### 7. コミット・プッシュ

```bash
cd /home/user/baseball-manager
git add <変更ファイル>
git commit -m "refactor: <分割内容の簡潔な説明>"
git push -u origin <current-branch>
```

## 完了時の報告

- 分割したファイル一覧（新規作成・削除・変更）
- ビルド結果: ✅ 成功 / ‼️ 失敗（詳細）
- ROADMAP.md 更新内容
- 次に分割を推奨するファイル（あれば）
