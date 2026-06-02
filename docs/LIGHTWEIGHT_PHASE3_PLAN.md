# Lightweight Phase 3 Plan

## Goal

Phase 2 で分離した構造を前提に、初期ロードと遷移時ロードの境界をさらに明確化し、実ビルドのチャンク構成に基づいて体感速度を改善する。

Phase 2 の残タスクは、この Phase 3 の前処理として吸収する。

## Scope

- `HubShell` の props 境界整理
- `AppScreenRouter` の wrapper 分離
- `Screens.jsx` / `Draft.jsx` の barrel 依存縮小
- `hub` 内の重いタブの追加分割検討
- 3D / 戦術試合まわりの依存境界整理
- build 出力の再計測とチャンク調整

## Non-Goals

- セーブデータ形式の変更
- `useGameState` / `useSeasonFlow` / `useOffseason` の全面再設計
- ゲームロジックの仕様変更

## Workstreams

### 1. Phase 2 Residual Cleanup

目的:
- Phase 3 の軽量化作業で再分解しやすい境界を先に作る

実施内容:
- `HubShell` に渡している `app` を用途別 props に整理する
- `HubContentRouter` も必要最低限の state / action に絞る
- `AppScreenRouter` 内 helper route を別 wrapper ファイルへ出す
- `hub` / non-`hub` の責務境界を明文化する

完了条件:
- `HubShell` が巨大な集約オブジェクトに依存しない
- `AppScreenRouter` が screen 判定と wrapper 呼び出し中心になる

### 2. Import Boundary Cleanup

目的:
- lazy load 対象が不要に同一チャンクへ巻き込まれるのを防ぐ

実施内容:
- `AppScreenRouter` からの `Screens.jsx` named import 依存を減らす
- `Draft.jsx` named export 依存も可能な範囲で個別ファイル import 化する
- 追加分割が難しい場合でも、少なくとも heavy route ごとの import 境界を固定する

完了条件:
- `Screens.jsx` / `Draft.jsx` 経由の import が縮小している
- deferred screen の import 元が明確になっている

### 3. Hub Weight Audit

目的:
- `hub` 表示中に同期ロードされている重い UI を洗い出す

実施内容:
- `DashboardTab`
- `RosterTab`
- `StatsTab`
- `LeaderboardTab`
- `BalanceTab`
- `FinanceTab`

上記を中心に、初回表示で不要な依存を確認する。

判断基準:
- 初回 `dashboard` に不要なら lazy 化候補
- 大量集計や worker 初期化を含むものは優先的に分離

完了条件:
- `hub` 内で同期維持するタブと遅延候補タブの一覧が確定している

### 4. Additional Deferred Loading

目的:
- `hub` 到達後も重いタブの初回読み込みを分離する

第一候補:
- `BalanceTab`
- `LeaderboardTab`
- `StatsTab`
- `FinanceTab`

方針:
- `HubContentRouter` 側でタブ単位の lazy load を導入する
- `dashboard` / `roster` / `schedule` は原則同期維持
- fallback UI は既存のデザインに寄せる

完了条件:
- 重いタブが `hub` 初期チャンクから外れている
- タブ切替時に白画面や操作不能が出ない

### 5. Tactical / 3D Boundary Cleanup

目的:
- `tactical_game` 関連の 3D 依存をさらに隔離する

実施内容:
- `TacticalGame` が引き込む補助モジュールを確認する
- 非戦術導線から 3D 依存が漏れていないか確認する
- 必要なら tactical 専用 wrapper / import 境界を追加する

完了条件:
- 戦術試合関連コードが通常導線の初期ロードに混ざらない

### 6. Measurement and Tuning

目的:
- 軽量化を推測ではなく build 出力で判断する

確認項目:
- main chunk サイズ
- lazy chunk 数
- `draft`
- `playoff`
- `tactical_game`
- `team_detail`
- `hub` heavy tabs

完了条件:
- Phase 2 時点より初期 chunk が縮小している
- 追加した deferred chunks が意図通り分離されている

## Execution Order

1. Phase 2 residual cleanup
2. import boundary cleanup
3. build 計測
4. hub weight audit
5. heavy tab lazy load
6. tactical / 3D boundary cleanup
7. build 再計測
8. regression test

## Validation

- `npm run test`
- `npm run build`
- タイトル画面から `hub`
- `1試合`
- `まとめてシム`
- `チーム詳細`
- `ドラフト`
- `戦術試合`
- `playoff`

## Exit Criteria

- `App.jsx` は Phase 2 の責務に留まっている
- `HubShell` / `HubContentRouter` の依存が軽くなっている
- heavy tab の一部が `hub` 初期ロードから外れている
- deferred screen のチャンク分離が build で確認できる
- 既存 test が通る
