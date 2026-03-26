# 共通: コミット・プッシュ・PR ワークフロー

呼び出し元スキルで指定されたコミットプレフィックス（`feat:` / `fix:` / `balance:` / `refactor:`）と説明を使って実行する。

## コミット・プッシュ

```bash
cd /home/user/baseball-manager
git add -p   # 関連ファイルのみステージ
git commit -m "<PREFIX>: <変更内容の簡潔な説明>"
git push -u origin <current-branch>
```

## PR 作成・マージ

以下の内容をユーザーに提示し、**承認を得てから** PR 作成・マージを実行する:

```
以下の内容で PR を作成してマージしてよいですか？

タイトル: <PREFIX>: <変更内容の簡潔な説明>
ベースブランチ: main
変更概要:
- <変更点1>
- <変更点2>
```

承認を得たら `mcp__github__create_pull_request` で PR を作成し、
続けて `mcp__github__merge_pull_request`（squash）でマージする。
