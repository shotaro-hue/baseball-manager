# Lightweight Phase 2 Requirements

## 1. 背景

フェーズ1で、重量級画面の遅延読込と `App.jsx` からの直接 import 削減を導入した。  
次段階では、初回表示の軽量化を維持したまま、`hub` 本体と画面ルーターの責務をさらに整理し、保守性とチャンク分割の再現性を高める。

対象の主な現状は以下。

- [src/App.jsx](/C:/Users/Shotaro/Documents/Codex/baseball-manager/baseball-manager-main/src/App.jsx) に `hub` 画面の大半の UI とタブ切替ロジックが残っている
- [src/components/AppScreenRouter.jsx](/C:/Users/Shotaro/Documents/Codex/baseball-manager/baseball-manager-main/src/components/AppScreenRouter.jsx) が複数画面の分岐とイベント注入を抱えている
- `Screens.jsx` / `Draft.jsx` などの集約ファイル依存が残っており、チャンク粒度が粗い
- 軽量化作業と無関係な文言・文字コードの問題が一部ファイルに混在していて、保守判断を難しくしている

## 2. 目的

- `hub` 表示の責務を `App.jsx` から切り離す
- 画面ルーターを「画面選択」に寄せ、個別画面のイベント組み立てを局所化する
- 遅延読込チャンクを画面単位で安定させる
- フェーズ3以降の state 分割や save/perf 改善に進みやすい土台を作る

## 3. スコープ

### 対象

- `hub` 本体 UI の切り出し
- `AppScreenRouter` の責務縮小
- `Screens.jsx` / `Draft.jsx` などの集約 import の分離方針整理
- 軽量化に必要な範囲での共通 props 形状の整理
- build/test での軽量化確認手順の固定

### 非対象

- `useGameState` / `useSeasonFlow` / `useOffseason` の大規模再設計
- save 形式変更
- ゲームロジック変更
- UI デザイン刷新
- 全面的な文字化け修正

## 4. 要件

### 4.1 App 責務分離

- `App.jsx` は以下に責務を限定すること
  - 主要 hook 初期化
  - アプリ全体のロード処理
  - 画面ルーターと `hub` シェルへの state 受け渡し
- `hub` 表示ロジックは専用コンポーネントへ切り出すこと
- `App.jsx` に個別タブ UI を直接並べないこと

### 4.2 Hub 構造整理

- `hub` は少なくとも以下の単位に分けること
  - 上部ステータスバー
  - シミュレーション操作エリア
  - タブナビゲーション
  - タブ内容領域
  - 下部モバイルナビ
- タブ内容切替は `HubContentRouter` 相当の薄い層に集約すること
- `dashboard` と `schedule` は同期読込維持でよいが、構造上は独立コンポーネントから描画すること

### 4.3 Screen Router 整理

- `AppScreenRouter` は「どの screen を表示するか」の判定に集中させること
- 個別 screen 専用の複雑なイベント組み立ては、必要に応じて screen wrapper へ移すこと
- `title` / `hub` / 遅延読込 screen の境界を明示すること
- `screen` 文字列セットは維持すること

### 4.4 Chunk 粒度の固定

- `Screens.jsx` 依存は段階的に解消し、個別画面 import に置き換えること
- `Draft.jsx` 依存は段階的に解消し、ドラフト画面を個別 import 可能にすること
- `TacticalGame` / `Playoff` / `TeamDetail` / `BatchResult` / `ResultScreen` は独立チャンクを維持すること
- `hub` 初回表示に不要な画面コードをメインチャンクへ戻さないこと

### 4.5 文字列と保守性

- 軽量化作業中に触る新規/更新コードは UTF-8 前提で可読な文字列に統一すること
- 既存の文字化け箇所は全面修正不要だが、今回新設するラッパー・ルーター・シェル層では持ち込まないこと

## 5. 非機能要件

- `title -> hub` の体感速度を悪化させない
- 遅延読込画面で白画面や操作不能時間を発生させない
- Vitest 全件成功を維持する
- `vite build` でメインチャンクに重量級画面が再混入していないことを確認できること

## 6. 受け入れ条件

- [src/App.jsx](/C:/Users/Shotaro/Documents/Codex/baseball-manager/baseball-manager-main/src/App.jsx) がアプリ全体 orchestration に集中している
- `hub` 本体が専用コンポーネントへ切り出されている
- `AppScreenRouter` の 1 ファイル集中が緩和されている
- `Draft` / `Playoff` / `TacticalGame` / `TeamDetail` が遅延読込のまま維持される
- `npm run test` が成功する
- `vite build` でチャンク分割結果を確認できる

## 7. 実装順の前提

1. `HubShell` と `HubContentRouter` を作る
2. `App.jsx` から `hub` 本体を移す
3. `AppScreenRouter` から個別 screen wrapper を外出しする
4. `Screens.jsx` / `Draft.jsx` の個別 import 化を進める
5. build 出力と主要導線を検証する

## 8. リスク

- 既存コードに文字化けした識別子・文言が混在しているため、移設時に構文事故が起きやすい
- `AppScreenRouter` と `App.jsx` の役割境界が曖昧なままだと、軽量化しても保守コストが下がらない
- barrel import の解消が中途半端だと、見かけ上 lazy load でもチャンク粒度が改善しない

## 9. 完了定義

- フェーズ2完了時点で、`App.jsx` は「初期化・全体状態・大分類ルーティング」のみを担当する
- `hub` と screen router は別責務として読める構造になっている
- build/test ベースで、軽量化の成果を継続的に確認できる
