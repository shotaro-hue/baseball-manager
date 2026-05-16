# Baseball Manager UI改善 要件定義書 v2

最終更新: 2026-05-03  
対象リポジトリ: `baseball-manager-main`  
対象ファイル配置先: `docs/baseball_manager_ui_requirements.md`

---

## 0. このドキュメントの目的

このドキュメントは、Baseball Manager を「ユーザーが遊びやすい野球シミュレーションゲームUI」に改善するための要件定義書である。

今回の v2 では、すでに実装済みの進捗を反映し、**次にCodexへ投げるべき作業範囲を明確化**する。

Codex は本書を読み、既存のシミュレーションロジックを破壊せず、UIレイヤーを段階的に改善すること。

---

## 1. 現在の結論

現在の進捗は、以下の状態である。

```text
Phase 0: 完了扱い
Phase 1: 部分完了
Phase 2: ほぼ完了
Phase 3: 一部実装済み。次に完成させるべきPhase
Phase 4: 未完了寄り
Phase 5: 既存スプレーチャートはあるが、新UI要件としては未完了
Phase 6: 未着手寄り
Phase 7: 一部着手
```

最優先で次にやるべきことは、**Phase 3: GameActionTab / 試合画面の完成**である。

今回Codexに依頼する範囲は、原則として以下に限定する。

```text
1. 監督ダッシュボードの「試合へ」導線修正
2. GameActionTabに簡易フィールド表示を追加
3. GameActionTabをPC/スマホで見やすいレイアウトに改善
4. npm run build が通る状態を維持
```

この作業では、PlayerModal、SprayChart、物理演算ロジック、契約・FA・ドラフト等の既存ロジックは触らない。

---

## 2. UI改善の最終目的

Baseball Manager を、単なるデータ表示アプリではなく、**監督として意思決定できる野球シミュレーションゲームUI**にする。

最終的に実現したい体験は以下である。

- 起動直後に「今日何をすればよいか」が分かる
- 試合中に「いま何を判断すべきか」が分かる
- 選手画面で「この選手をどう使うべきか」が分かる
- 物理演算・スプレーチャートの結果を、采配や選手評価に活かせる
- PCでは一覧性、スマホでは意思決定のしやすさを優先する

---

## 3. 現在確認できている実装状況

### 3.1 主要ファイル

現在のUI改善に関係する主要ファイルは以下。

```text
src/App.jsx
src/styles.css
src/components/DashboardTab.jsx
src/components/dashboard/ManagerDashboardCards.jsx
src/components/tabs/GameActionTab.jsx
src/components/tabs/SprayChart.jsx
src/components/PlayerModal.jsx
src/data/mockDashboard.js
src/data/mockGame.js
src/components/Tabs.jsx
```

### 3.2 package.json

現在の技術構成は以下。

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:mobile": "vite --host",
    "build": "vite build",
    "test": "vitest run",
    "validate:physics-hr": "vitest run scripts/validate-physics-hr.test.js"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.12.7",
    "three": "^0.176.0",
    "@react-three/fiber": "^8.17.10",
    "@react-three/drei": "^9.122.0"
  }
}
```

TypeScript前提で要件定義していたが、現状は `jsx` ベースで実装が進んでいる。  
したがって、短期的には **既存のJSX構成を優先**する。

---

## 4. Phase別進捗

## Phase 0: 事前調査・破壊防止

### 判定

完了扱いでよい。

### 確認済み

- React + Vite 構成
- `src/App.jsx` 中心の既存構成
- `src/styles.css` にグローバルCSSを集約
- `components/tabs/` にタブ画面が集約
- `docs/baseball_manager_ui_requirements.md` が存在
- `npm run build` スクリプトあり

### 注意

Codexは、既存の巨大な `App.jsx` をいきなり分解しないこと。  
現時点では、既存構成に沿って小さく改善する方が安全。

---

## Phase 1: 共通レイアウト・UI基盤

### 判定

部分完了。

### 実装済み

- PC用の主要ナビゲーション構造
- スマホ用の下部ナビゲーション
- `PRIMARY_SECTIONS`
- `primary-sidebar`
- `primary-bottom-nav`
- `primary-nav-cta`
- 1024px以上でPC向け表示
- スマホでは下部タブ表示
- `.card`, `.card2`, `.chip`, `.sim-btn` などの既存UI部品
- Mobile First寄りのCSS

### 未完了

当初想定していた以下のようなコンポーネント分割は未実施。

```text
src/components/layout/AppShell.tsx
src/components/layout/SidebarNav.tsx
src/components/layout/BottomTabNav.tsx
src/components/ui/Card.tsx
src/components/ui/StatCard.tsx
src/components/ui/StatusChip.tsx
src/components/ui/ActionButton.tsx
```

ただし、現時点で無理に分割すると既存画面を壊す可能性がある。

### 方針

短期では既存構成を維持。  
中期で必要になったら `components/layout/` や `components/ui/` へ切り出す。

---

## Phase 2: 監督ダッシュボード

### 判定

ほぼ完了。

### 実装済み

対象ファイル:

```text
src/components/DashboardTab.jsx
src/components/dashboard/ManagerDashboardCards.jsx
src/data/mockDashboard.js
src/styles.css
```

実装済み要素:

- `TodayGameCard`
- `RecommendationCard`
- `TeamConditionCard`
- `DashboardKpiGrid`
- `FeaturedPlayersCard`
- `manager-dashboard-grid`
- スマホ1カラム
- タブレット2カラム
- PC 12カラムGrid
- チーム状態表示
- おすすめ采配表示
- KPI表示
- 注目選手表示

### 残タスク

`TodayGameCard` の「試合へ」ボタン遷移先が `schedule` になっている。

現在:

```jsx
<TodayGameCard todayGame={todayGame} gameDay={gameDay} onGoGame={() => onTabSwitch('schedule')} />
```

修正後:

```jsx
<TodayGameCard todayGame={todayGame} gameDay={gameDay} onGoGame={() => onTabSwitch('game_action')} />
```

### 完了条件

- 「試合へ」ボタンで `game_action` タブへ移動できる
- 既存の `schedule` タブへの導線は壊さない
- `npm run build` が通る

---

## Phase 3: 試合画面 / 重要場面采配

### 判定

一部実装済み。次に完成させるべきPhase。

### 実装済み

対象ファイル:

```text
src/components/tabs/GameActionTab.jsx
src/data/mockGame.js
src/components/Tabs.jsx
src/App.jsx
```

実装済み要素:

- `GameActionTab`
- `mockGameState`
- スコア表示
- イニング表示
- B/S/O表示
- 一塁・二塁・三塁のランナー表示
- 打者 vs 投手表示
- 危険度表示
- 采配ボタン表示
- ボタン押下時にログ追加
- 操作IDの簡易サニタイズ
- `sim-btn` による44px以上のタップ領域

### 不足しているもの

- 簡易フィールド表示
- PCで「状況・フィールド・采配・ログ」を見やすく分けるレイアウト
- スマホで「スコア → 状況 → 采配ボタン → 対戦情報 → フィールド → ログ」の順に並ぶ構成
- GameActionTab専用CSSクラス
- 現在はインラインstyleが多く、拡張しにくい

### 次に実装する内容

#### 3.1 Dashboardからの導線修正

`DashboardTab.jsx` の `onGoGame` を `game_action` に変更する。

#### 3.2 簡易フィールド表示を追加

`GameActionTab.jsx` 内に、ランナー状況が視覚的に分かる簡易フィールドを追加する。

最低限の表示:

```text
- ホームベース
- 一塁
- 二塁
- 三塁
- マウンド
- ランナーがいる塁は強調表示
```

新規コンポーネントに切り出す場合は、同一ファイル内の小コンポーネントでよい。

```jsx
function MiniField({ runners }) {
  // GameActionTab.jsx 内で定義してよい
}
```

このPhaseでは `components/baseball/FieldView.jsx` へ切り出さなくてもよい。

#### 3.3 PC/スマホのレイアウト改善

GameActionTabに以下のCSSクラスを追加する。

```text
game-action-layout
game-score-card
game-count-card
game-field-card
game-matchup-card
game-actions-card
game-log-card
mini-field
mini-field-base
mini-field-base.active
```

スマホ:

```text
1カラム縦積み
表示順:
1. スコア
2. カウント・ランナー
3. 采配ボタン
4. 打者vs投手
5. 簡易フィールド
6. 試合ログ
```

PC:

```text
1024px以上で2カラム以上
左: スコア・状況・簡易フィールド
右: 打者vs投手・采配ボタン・ログ
```

#### 3.4 采配ボタン

既存のボタン仕様を維持する。

必須:

- ボタン高さ44px以上
- 押下時にログ追加
- 不正IDは無視して警告ログ
- 既存 `mockGameState.actions` を使用

### Phase 3 完了条件

- Dashboardの「試合へ」ボタンで `game_action` に移動できる
- GameActionTabに簡易フィールドが表示される
- ランナー状況がフィールド上で視覚的に分かる
- スマホでは1カラムで横スクロールしない
- PCでは状況・フィールド・采配・ログが見やすく分かれる
- 采配ボタン押下でログが追加される
- `npm run build` が成功する

---

## Phase 4: 選手詳細UI

### 判定

未完了寄り。

### 既存実装

対象ファイル:

```text
src/components/PlayerModal.jsx
```

既存で確認できる要素:

- 選手能力バー
- 成績
- 契約
- 守備適性
- 打球傾向分析
- スプレーチャート表示

### 不足

要件定義上の新UIとしては以下が不足。

- おすすめ起用
- 球場適性
- 選手タイプの明示
- 「この選手をどう使うべきか」が分かるカード

### 今回は触らない

Phase 3完了までは、PlayerModalの大改修は禁止。  
次回以降に別Phaseとして対応する。

---

## Phase 5: スプレーチャート分析UI

### 判定

既存スプレーチャートはあるが、新UI要件としては未完了。

### 既存実装

対象ファイル:

```text
src/components/tabs/SprayChart.jsx
```

実装済み:

- SVGフィールド
- 打球点表示
- フェンス表示
- ウォーニングトラック
- HR判定補正
- StatsTab / PlayerModal から利用

### 不足

- 打球点クリックで詳細カード更新
- EV km/h 表示
- LA deg 表示
- 推定飛距離 m 表示
- 球場別判定
- スマホ向けタップサイズ改善

### 今回は触らない

Phase 3完了までは、SprayChartの仕様変更は禁止。  
物理演算・HR判定に波及するため、別Phaseで扱う。

---

## Phase 6: 既存ロジック接続

### 判定

未着手寄り。

現状、Dashboardは既存の `myTeam`, `schedule`, `teams`, `mailbox` などと一部接続されている。  
ただし、adapter層は未整備。

将来的には以下を検討する。

```text
src/adapters/dashboardAdapter.js
src/adapters/gameAdapter.js
src/adapters/playerAdapter.js
src/adapters/sprayChartAdapter.js
```

### 今回は触らない

Phase 3ではmock data中心でよい。  
試合エンジンへの本格接続はしない。

---

## Phase 7: 品質改善・UX調整

### 判定

一部着手。

実装済み寄り:

- スマホ下部ナビ
- safe-area-inset-bottom 対応
- タップ領域44px以上
- カードUI
- レスポンシブGrid

不足:

- 空データ状態
- ローディング状態
- エラー状態
- アクセシビリティ確認
- 実機スマホ確認
- E2E追加

Phase 3完了後に対応する。

---

## 5. レスポンシブ要件

### 基本方針

PCとスマホで完全に別UIにするのではなく、**同じ情報設計を保ち、表示順とナビゲーションだけ変える**。

### ブレークポイント

```text
mobile: 0px - 767px
tablet: 768px - 1023px
desktop: 1024px以上
```

### PC

- 左サイドバー固定
- 複数カラム
- 状況、詳細、ログを同時表示
- 一覧性を優先

### スマホ

- 下部タブナビ
- 1カラム縦積み
- 操作ボタンを優先
- 詳細情報は下に回す
- 横スクロール禁止

### GameActionTabでの表示順

スマホ:

```text
1. スコア
2. カウント・ランナー
3. 采配ボタン
4. 打者vs投手
5. 簡易フィールド
6. 試合ログ
```

PC:

```text
左カラム:
- スコア
- カウント・ランナー
- 簡易フィールド

右カラム:
- 打者vs投手
- 采配ボタン
- 試合ログ
```

---

## 6. 次にCodexへ投げるプロンプト

以下をそのままCodexに渡す。

```text
baseball_manager_ui_requirements.md の v2 に沿って、Phase 3 の試合画面改善だけを実装してください。

現在の進捗:
- Phase 2 の監督ダッシュボードはほぼ完了しています。
- Phase 3 の GameActionTab は一部実装済みです。
- 次は Phase 3 を完成させます。

今回やること:
1. src/components/DashboardTab.jsx の TodayGameCard の「試合へ」導線を修正する
   - 現在 onTabSwitch('schedule') になっている場合は onTabSwitch('game_action') に変更する

2. src/components/tabs/GameActionTab.jsx に簡易フィールド表示を追加する
   - ホーム、一塁、二塁、三塁、マウンドが分かる簡易フィールド
   - mockGameState.runners.first / second / third に応じてランナーがいる塁を強調表示
   - 既存のmockGameState構造を壊さない

3. GameActionTabのレイアウトをレスポンシブ改善する
   - スマホでは1カラム縦積み
   - PCでは状況・フィールド・采配・ログが見やすい2カラム構成
   - 采配ボタンは44px以上を維持
   - 横スクロールを発生させない

4. CSSは src/styles.css に追記する
   - 既存classを大きく壊さない
   - 可能なら以下のclassを使う
     - game-action-layout
     - game-score-card
     - game-count-card
     - game-field-card
     - game-matchup-card
     - game-actions-card
     - game-log-card
     - mini-field
     - mini-field-base
     - mini-field-base.active

今回やらないこと:
- PlayerModalの大改修
- SprayChartの大改修
- 物理演算ロジックの修正
- 試合エンジン接続
- TypeScript化
- App.jsxの大規模分割
- components/layout や components/ui への大規模リファクタ

完了条件:
- npm run build が成功する
- Dashboardの「試合へ」から game_action に移動できる
- GameActionTabに簡易フィールドが表示される
- ランナー状況が視覚的に分かる
- スマホで横スクロールしない
- PCで情報が見やすく分かれる
- 采配ボタンを押すとログが追加される

作業後に報告してほしいこと:
- 変更したファイル一覧
- 変更内容の要約
- build結果
- 未対応事項
```

---

## 7. Codex実装時の禁止事項

今回のPhase 3では、以下を禁止する。

```text
- 物理演算ロジックを変更しない
- SprayChart.jsx を変更しない
- PlayerModal.jsx を大改修しない
- TacticalGame.jsx を変更しない
- useSeasonFlow / useGameState など状態管理の中核を変更しない
- App.jsxを全面分割しない
- TypeScript移行を始めない
- UI改善以外の仕様追加をしない
```

理由:

```text
Phase 3の目的は、試合画面のUI完成であり、ゲームロジック改修ではないため。
```

---

## 8. 検証コマンド

Codex作業後、最低限以下を確認する。

```bash
npm install
npm run build
```

可能であれば以下も確認する。

```bash
npm run test
npm run validate:physics-hr
```

ブラウザ確認:

```bash
npm run dev
```

確認観点:

```text
- PC幅 1024px以上でGameActionTabが見やすいか
- スマホ幅 390px程度で横スクロールしないか
- 下部ナビで「試合」に移動できるか
- Dashboardの「試合へ」ボタンで采配画面に移動できるか
- 采配ボタン押下でログが増えるか
- 一塁・二塁・三塁のランナー表示がフィールド上で分かるか
```

---

## 9. 次回以降の予定

Phase 3完了後、次は以下の順番で進める。

### 次回候補A: Phase 4 選手詳細UI

目的:

```text
PlayerModalを「成績を見る画面」から「起用判断ができる画面」に改善する。
```

追加候補:

- おすすめ起用カード
- 球場適性
- 選手タイプ
- 代打/守備固め/スタメン適性

### 次回候補B: Phase 5 スプレーチャート分析UI

目的:

```text
スプレーチャートを、球場別HR判定や打球詳細が分かる分析UIにする。
```

追加候補:

- 打球点クリック
- 打球詳細カード
- EV km/h
- LA deg
- 飛距離 m
- 球場別判定

推奨順:

```text
Phase 3完成
↓
Phase 4 選手詳細
↓
Phase 5 スプレーチャート分析
↓
Phase 6 既存ロジック接続
↓
Phase 7 UX/QA
```

---

## 10. 現在の進捗を一言で表す

```text
監督ダッシュボードは実用レベルに近い。
次は試合画面を「重要場面で采配できるゲーム画面」として完成させる段階。
```

以上。
