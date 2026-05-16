# TASKS/

このディレクトリは Claude × Codex 分業ワークフローのハンドオフ置き場です。

## 使い方

### Step 1（Claude セッション）— 仕様書を生成する

```
/plan-for-codex
```

- ROADMAP から未実装機能を選び、Codex が実装できる詳細仕様書を `TASKS/<name>.md` に書き出す
- Claude はコード精読をしないため、トークン消費を最小に抑えられる

### Step 2（Codex セッション）— 仕様書を読んで実装する

```
/implement-from-task TASKS/<name>.md
```

- TASK ファイルを読み、関連コードを精読し、実装・テスト・コミット・プッシュまで自動で完走する
- ユーザーへの確認はビルド失敗時のみ

## ファイル命名規則

`<機能名の kebab-case>.md`

例:
- `farm-simulation.md`
- `allstar-game.md`
- `waiver-system.md`

## 実装済みタスクの扱い

実装完了後は `TASKS/` から削除して構いません。
コミット履歴と CHANGELOG.md に記録が残ります。
