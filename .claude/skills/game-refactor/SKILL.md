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

### 7. SPEC.md を更新

- **§12 変更履歴**（必須）: 最新エントリを先頭に追加する

  ```
  ### YYYY-MM-DD — <リファクタリング内容>（コミットハッシュ）

  **仕様本文への影響あり（§2・§14）** or **仕様本文への影響なし（構造変更のみ）**

  - 分割・移動したファイルの箇条書き
  ```

- **§2 ディレクトリ構成**: 新規ファイル・ディレクトリの追加、削除・統合を反映する（必須）
- **§14 保守性・技術的負債**: 完了した T* タスクのステータスを「計画中」→「✅ 完了」に更新する（必須）

### 8. コミット・プッシュ

```bash
cd /home/user/baseball-manager
git add <変更ファイル>
git commit -m "refactor: <分割内容の簡潔な説明>"
git push -u origin <current-branch>
```

### 9. PR 作成・マージ

以下の内容をユーザーに提示し、**承認を得てから** PR 作成・マージを実行する:

```
以下の内容で PR を作成してマージしてよいですか？

タイトル: refactor: <分割内容の簡潔な説明>
ベースブランチ: main
変更概要:
- <新規作成ファイル>
- <削除・変更ファイル>
```

承認を得たら `mcp__github__create_pull_request` で PR を作成し、
続けて `mcp__github__merge_pull_request`（squash）でマージする。

## 完了時の報告

- 分割したファイル一覧（新規作成・削除・変更）
- ビルド結果: ✅ 成功 / ‼️ 失敗（詳細）
- ROADMAP.md 更新内容
- SPEC.md の更新内容（§12 変更履歴 + §2 ディレクトリ構成 + §14 保守性セクション）
- マージ完了: PR #番号
- 次に分割を推奨するファイル（あれば）
