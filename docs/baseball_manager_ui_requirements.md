# Baseball Manager UI改善 要件定義書

## 0. このドキュメントの目的

このドキュメントは、Baseball Manager を「ユーザーが遊びやすい野球シミュレーションゲームUI」に改善するための要件定義書である。

Codex は本書を読み、既存のシミュレーションロジックを破壊せず、まずは UI レイヤーを段階的に実装すること。

---

## 1. 結論

最有力方針は、**監督ダッシュボードを中心に、PCでは一覧性、スマホでは意思決定のしやすさを優先するレスポンシブUI**を実装することである。

このUI改善では、以下を最優先する。

- ユーザーが「今日何をすればよいか」分かる
- 試合中に「いま何を判断すべきか」分かる
- 選手画面で「この選手をどう使うべきか」分かる
- 物理演算・スプレーチャートの結果を直感的に理解できる
- PCとスマホで同じ情報設計を保ちつつ、表示順とナビゲーションを最適化する

---

## 2. 背景・課題

現在の Baseball Manager は、物理演算シミュレーション、スプレーチャート、リーグ補正、選手評価などのゲーム内部要素が増えている。

一方で、UIがデータ表示中心になると、ユーザーは以下の点で迷いやすい。

- 起動後に何をすればよいか分からない
- 試合画面でどこを見ればよいか分からない
- 数値は多いが、采配判断に直結しにくい
- スプレーチャートや物理演算結果がゲーム体験に結びつきにくい
- PC前提の画面をスマホで見ると操作しづらい

そのため、UIの中心を「データ」ではなく「監督としての意思決定」に置き換える。

---

## 3. 基本方針

### 3.1 UIコンセプト

データ一覧型UIではなく、監督ゲーム型UIにする。

```text
データを見せるUI
↓
判断を助けるUI
```

### 3.2 表示方針

- 重要情報を先に表示する
- 詳細情報は必要な時だけ掘れるようにする
- 数値だけでなく、解釈・おすすめ行動を表示する
- カードUIで情報を分割する
- 画面ごとに「ユーザーが次に取るべき行動」を明確にする

### 3.3 デザイン方針

- ダークテーマ
- スポーツ分析アプリ風
- OOTP / Football Manager 風の情報密度
- ただし初心者にも分かる階層化
- アクセントカラーは青
- 状態表示は緑・黄・赤を使う
- 文字は潰さず、折り返しを優先する

---

## 4. 対象環境

### 4.1 技術前提

- React
- Vite
- TypeScript
- CSS / CSS Modules / 既存プロジェクトのスタイル方式に準拠
- 既存の npm scripts を尊重する

### 4.2 対応画面幅

```text
mobile: 0px - 767px
tablet: 768px - 1023px
desktop: 1024px以上
```

### 4.3 レスポンシブ基本方針

Mobile First で実装する。

```text
スマホで1カラムとして成立
↓
タブレットで2カラム
↓
PCで12カラムGrid + 左サイドバー
```

---

## 5. 非対象

このUI改善では、以下は原則として対象外とする。

- 既存のシミュレーションロジックの全面改修
- 物理演算モデルの精度改善
- 選手能力算出ロジックの改修
- 年俸・契約・FAロジックの本格実装
- データベース設計の全面変更
- 実在選手データの取得・スクレイピング
- 完全な試合エンジン接続
- 全画面の一括リデザイン

まずは mock data で UI を成立させ、後続Phaseで既存ロジックに接続する。

---

## 6. ナビゲーション要件

### 6.1 PC

PCでは左サイドバー固定。

表示項目：

```text
監督室
試合
日程
一軍
選手
補強・契約
分析
設定
```

初期実装では以下のみでもよい。

```text
監督室
試合
選手
分析
設定
```

### 6.2 スマホ

スマホでは下部タブナビゲーションにする。

表示項目は最大5つまで。

```text
監督室
試合
選手
分析
その他
```

「日程」「補強・契約」「設定」などは、初期実装では「その他」にまとめてよい。

### 6.3 タブレット

タブレットでは以下のいずれかを採用する。

- 折りたたみサイドバー
- 上部ナビ
- 下部タブ

既存実装との相性が良いものを選ぶこと。

---

## 7. 画面一覧

実装対象の主要画面は以下。

| 優先度 | 画面 | 目的 |
|---:|---|---|
| 1 | ManagerDashboardPage | 起動直後に今日やることが分かる |
| 2 | GamePage | 重要場面だけ采配できる |
| 3 | PlayerDetailPage | 選手の使い方が分かる |
| 4 | SprayChartAnalysisPage | 打球結果と球場別判定が分かる |

---

## 8. 推奨ディレクトリ構成

既存構成がある場合は、既存ルールを優先すること。
新規追加する場合は以下を目安にする。

```text
src/
  app/
    App.tsx
    routes.tsx

  components/
    layout/
      AppShell.tsx
      SidebarNav.tsx
      BottomTabNav.tsx
      TopBar.tsx

    ui/
      Card.tsx
      StatCard.tsx
      StatusChip.tsx
      ActionButton.tsx
      SectionHeader.tsx
      ProgressBar.tsx

    baseball/
      FieldView.tsx
      Scoreboard.tsx
      CountDisplay.tsx
      PlayerAvatar.tsx
      AbilityBars.tsx
      BallparkFitTable.tsx
      SprayChart.tsx
      BattedBallDetail.tsx

  features/
    dashboard/
      ManagerDashboardPage.tsx
      TodayGameCard.tsx
      TeamConditionCard.tsx
      RecommendationCard.tsx
      DashboardKpiGrid.tsx
      FeaturedPlayersCard.tsx

    game/
      GamePage.tsx
      GameSituationPanel.tsx
      MatchupCard.tsx
      TacticalActionPanel.tsx
      GameLogPanel.tsx

    players/
      PlayerDetailPage.tsx
      PlayerProfileCard.tsx
      PlayerUsageAdvice.tsx
      PlayerAbilityPanel.tsx

    analysis/
      SprayChartAnalysisPage.tsx
      BallparkResultComparison.tsx

  data/
    mockDashboard.ts
    mockGame.ts
    mockPlayers.ts
    mockSprayChart.ts

  types/
    baseball.ts
    ui.ts

  styles/
    theme.css
```

---

## 9. 型定義要件

まず TypeScript の型を定義すること。

### 9.1 `src/types/baseball.ts`

```ts
export type TeamId = string;
export type PlayerId = string;
export type BallparkId = string;

export type GameStatus =
  | "scheduled"
  | "live"
  | "final";

export type BatterHand = "L" | "R" | "S";
export type ThrowHand = "L" | "R";

export type Tone =
  | "good"
  | "warning"
  | "danger"
  | "neutral";

export type BattedBallResult =
  | "home_run"
  | "wall_hit"
  | "fly_out"
  | "line_drive"
  | "ground_ball"
  | "single"
  | "double"
  | "triple"
  | "out";

export type BallparkResult = {
  ballparkId: BallparkId;
  ballparkName: string;
  result: BattedBallResult;
  label: string;
};

export type TodayGame = {
  id: string;
  dateLabel: string;
  ballparkName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeStarterName: string;
  awayStarterName: string;
  winProbability?: number;
  keyNote?: string;
};

export type TeamCondition = {
  label: string;
  tone: Tone;
  description?: string;
};

export type Recommendation = {
  id: string;
  priority: number;
  title: string;
  reason: string;
};

export type DashboardKpi = {
  label: string;
  value: string | number;
  subLabel?: string;
  trend?: "up" | "down" | "flat";
};

export type GameSituation = {
  inningLabel: string;
  half: "top" | "bottom";
  outs: number;
  balls: number;
  strikes: number;
  homeScore: number;
  awayScore: number;
  homeTeamName: string;
  awayTeamName: string;
  runners: {
    first: boolean;
    second: boolean;
    third: boolean;
  };
};

export type Matchup = {
  batterId: PlayerId;
  batterName: string;
  pitcherId: PlayerId;
  pitcherName: string;
  riskLevel: "low" | "medium" | "high";
  advice: string;
};

export type TacticalAction =
  | "pitch"
  | "intentional_walk"
  | "change_pitcher"
  | "defensive_shift"
  | "steal"
  | "bunt"
  | "auto";

export type PlayerAbility = {
  contact: number;
  power: number;
  discipline: number;
  defense: number;
  speed: number;
  vsLeft: number;
  vsRight: number;
};

export type BallparkFit = {
  ballparkId: BallparkId;
  ballparkName: string;
  rank: "S" | "A" | "B" | "C" | "D";
  reason?: string;
};

export type PlayerSummary = {
  id: PlayerId;
  name: string;
  position: string;
  batterHand: BatterHand;
  throwHand: ThrowHand;
  typeLabel: string;
  abilities: PlayerAbility;
  usageAdvice: string[];
  ballparkFits: BallparkFit[];
};

export type BattedBall = {
  id: string;
  playerId?: PlayerId;
  x: number;
  y: number;
  exitVelocityKmh: number;
  launchAngleDeg: number;
  estimatedDistanceM: number;
  directionLabel: string;
  result: BattedBallResult;
  ballparkResults: BallparkResult[];
};
```

---

## 10. 共通コンポーネント要件

### 10.1 AppShell

役割：

- 全画面共通レイアウト
- PCでは SidebarNav を表示
- スマホでは BottomTabNav を表示
- メインコンテンツ領域を持つ

要件：

- 1024px以上では左サイドバー固定
- 767px以下では下部タブ固定
- 下部タブがコンテンツに被らないよう、スマホでは下paddingを確保する

### 10.2 SidebarNav

役割：

- PC向けナビゲーション

要件：

- 現在ページをハイライト
- アイコンまたは短いラベルを表示
- 横幅は固定
- メインコンテンツを圧迫しすぎない

### 10.3 BottomTabNav

役割：

- スマホ向けナビゲーション

要件：

- 画面下部に固定
- 最大5項目
- タップ領域は44px以上
- 現在ページをハイライト
- safe-area-inset-bottom を考慮する

### 10.4 Card

役割：

- 全画面共通の情報表示カード

要件：

- title は任意
- children を受け取る
- className を受け取れる
- 角丸・余白・背景色を統一する

### 10.5 StatCard

役割：

- KPIを短く表示

props:

```ts
type StatCardProps = {
  label: string;
  value: string | number;
  subLabel?: string;
  trend?: "up" | "down" | "flat";
};
```

### 10.6 StatusChip

役割：

- チーム状態・危険度・適性を色付きで表示

tone:

```ts
"good" | "warning" | "danger" | "neutral"
```

### 10.7 ActionButton

役割：

- 試合中の采配アクションボタン

要件：

- スマホで高さ44px以上
- disabled状態を持てる
- 押下時の視認性を持つ

---

## 11. 画面別要件

# 11.1 ManagerDashboardPage

## 目的

ゲーム起動直後に、ユーザーが以下を判断できるようにする。

- 今日の試合は何か
- チーム状態はどうか
- 何を変更すべきか
- 誰に注目すべきか

## 表示要素

- 今日の日付
- 今日の試合カード
- 現在順位
- 勝敗
- 得点力 R/G
- 失点 RA/G
- 直近成績
- チーム状態チップ
- 今日のおすすめ采配
- 注目選手
- 「試合へ」ボタン

## PCレイアウト

```text
[今日の試合カード] [おすすめ采配]
[KPI] [KPI] [KPI] [KPI]
[チーム状態] [注目選手]
```

## スマホレイアウト

```text
1. 今日の試合
2. 今日のおすすめ采配
3. チーム状態
4. KPI
5. 注目選手
```

スマホでは、KPIよりも「今日のおすすめ采配」を先に出すこと。

## コンポーネント

```text
ManagerDashboardPage
  AppShell
  TodayGameCard
  RecommendationCard
  DashboardKpiGrid
    StatCard
  TeamConditionCard
    StatusChip
  FeaturedPlayersCard
```

## 受け入れ条件

- 監督室ページを開くと、今日の試合とおすすめ采配が最上部に表示される
- 「試合へ」ボタンで GamePage へ遷移できる
- KPIカードが4つ以上表示される
- チーム状態が色付きチップで表示される
- スマホでは1カラムで崩れない
- PCでは複数カラムで一覧性がある

---

# 11.2 GamePage

## 目的

試合中、ユーザーがすべてを操作しなくても、勝敗に関わる場面だけ采配できるようにする。

## 表示要素

- スコア
- イニング
- アウトカウント
- ボール・ストライク
- ランナー状況
- 簡易フィールド
- 打者 vs 投手
- 危険度
- 采配ボタン
- 直近ログ

## 操作ボタン

- 勝負する
- 申告敬遠
- 投手交代
- 守備位置変更
- 盗塁
- バント
- 自動判断

初期実装では、ボタン押下時にログへ追加するだけでよい。
ゲームロジック接続は後続Phaseで実施する。

## PCレイアウト

```text
[スコア・状況] [打者vs投手]
[フィールド]   [采配ボタン]
[フィールド]   [ログ]
```

## スマホレイアウト

```text
1. スコア
2. 状況
3. 采配ボタン
4. 打者vs投手
5. 簡易フィールド
6. ログ
```

スマホではフィールドよりも采配ボタンを優先する。

## コンポーネント

```text
GamePage
  Scoreboard
  CountDisplay
  FieldView
  GameSituationPanel
  MatchupCard
  TacticalActionPanel
    ActionButton
  GameLogPanel
```

## 受け入れ条件

- スコア、カウント、ランナー状況が一目で分かる
- フィールド上に一塁・二塁・三塁のランナー有無が表示される
- 打者vs投手カードに危険度が表示される
- 采配ボタンを押すと選択内容がログに追加される
- スマホの采配ボタンは高さ44px以上
- UIはゲーム進行ロジックが未接続でも動作する

---

# 11.3 PlayerDetailPage

## 目的

選手画面を「能力値一覧」ではなく、「どう起用すべきか分かる画面」にする。

## 表示要素

- 選手名
- 守備位置
- 利き腕
- 選手タイプ
- 能力値バー
- おすすめ起用
- 球場適性

## PCレイアウト

```text
[プロフィール] [おすすめ起用]
[能力値]       [球場適性]
[成績詳細]     [最近の調子]
```

## スマホレイアウト

```text
1. プロフィール
2. おすすめ起用
3. 能力値
4. 球場適性
5. 成績詳細
```

スマホでは、能力値よりも「おすすめ起用」を先に表示する。

## コンポーネント

```text
PlayerDetailPage
  PlayerProfileCard
  PlayerAbilityPanel
    AbilityBars
  PlayerUsageAdvice
  BallparkFitTable
```

## 受け入れ条件

- 能力値は0〜100のバーで表示される
- おすすめ起用が箇条書きで表示される
- 球場適性がS/A/B/C/Dで表示される
- 球場適性ランクに応じて色が変わる
- スマホでは1選手の判断に必要な順で表示される

---

# 11.4 SprayChartAnalysisPage

## 目的

物理演算の結果を、ユーザーが直感的に理解できるようにする。

特に以下を表現する。

```text
同じ打球でも、球場によってHR・フェンス直撃・外野フライが変わる
```

## 表示要素

- フィールド図
- 打球点
- 打球結果の色分け
- 選択中の打球詳細
- 打球速度 km/h
- 打球角度 deg
- 推定飛距離 m
- 球場別判定

## 色分け

- HR: 赤
- フェンス直撃: 黄
- 安打・インプレー: 青または白
- アウト: グレー

## PCレイアウト

```text
[大きなスプレーチャート] [選択中の打球詳細]
[大きなスプレーチャート] [球場別判定]
```

## スマホレイアウト

```text
1. スプレーチャート
2. 選択中の打球詳細
3. 球場別判定
4. 凡例
```

## スマホ注意点

- 打球点が小さすぎると押せない
- フィールドが横長だと見づらい
- 凡例を常時表示すると邪魔

## スマホ対策

- 打球点は最低12px
- 選択中の打球点は16px以上
- 凡例は折りたたみ
- 詳細カードは下部カード風にしてもよい

## コンポーネント

```text
SprayChartAnalysisPage
  SprayChart
  BattedBallDetail
  BallparkResultComparison
```

## 受け入れ条件

- 打球点がフィールド上に表示される
- 打球点をクリックすると詳細カードが更新される
- EVはkm/hで表示される
- LAはdegで表示される
- 飛距離はmで表示される
- 球場別判定が一覧表示される
- スマホでは横スクロールが発生しない

---

## 12. レスポンシブ実装要件

### 12.1 CSS方針

Mobile First で実装する。

例：

```css
.responsive-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 768px) {
  .responsive-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .responsive-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }
}
```

### 12.2 情報順序

画面幅ごとに重要情報の表示順を変えてよい。

- CSS order
- コンポーネント分岐
- レイアウト専用wrapper

いずれかを使用してよい。

### 12.3 禁止事項

- スマホで横スクロールを発生させない
- 小さいボタンを密集させない
- PCの3カラムをそのままスマホに押し込まない
- スマホ下部タブに6項目以上置かない
- 文字を極端に小さくしない
- 情報を省略しすぎて判断不能にしない

---

## 13. Mock Data 要件

初期実装では mock data を使用する。

### 13.1 `mockDashboard.ts`

含めるもの：

- todayGame
- teamConditions
- recommendations
- dashboardKpis
- featuredPlayers

### 13.2 `mockGame.ts`

含めるもの：

- gameSituation
- matchup
- initialGameLogs
- tacticalActions

### 13.3 `mockPlayers.ts`

含めるもの：

- playerSummary
- abilities
- usageAdvice
- ballparkFits

### 13.4 `mockSprayChart.ts`

含めるもの：

- battedBalls
- ballparkResults

---

## 14. Phase分け

# Phase 0: 事前調査・破壊防止

## 目的

既存構成を把握し、壊さず追加する準備をする。

## 作業

- package.json を確認
- src構成を確認
- 既存ルーティングを確認
- 既存スタイル方式を確認
- 既存のUIコンポーネントがあれば再利用する
- 既存のテスト・buildコマンドを確認する

## 完了条件

- 既存構成を把握したメモを残す
- 追加予定ファイル一覧を出す
- 既存ファイルを大きく壊す変更をしない

---

# Phase 1: 共通レイアウト・UI基盤

## 目的

全画面で使うUI土台を作る。

## 実装対象

```text
types/baseball.ts
components/layout/AppShell.tsx
components/layout/SidebarNav.tsx
components/layout/BottomTabNav.tsx
components/ui/Card.tsx
components/ui/StatCard.tsx
components/ui/StatusChip.tsx
components/ui/ActionButton.tsx
components/ui/SectionHeader.tsx
components/ui/ProgressBar.tsx
styles/theme.css または既存スタイルへの追記
```

## 要件

- PCでは左サイドバー
- スマホでは下部タブ
- Mobile First
- ダークテーマ
- 既存Appに影響が少ない構造

## 完了条件

- AppShell上に仮コンテンツを表示できる
- PCとスマホでナビが切り替わる
- npm run build が通る

---

# Phase 2: 監督ダッシュボード

## 目的

ゲーム起動直後に、今日やることが分かる画面を作る。

## 実装対象

```text
features/dashboard/ManagerDashboardPage.tsx
features/dashboard/TodayGameCard.tsx
features/dashboard/TeamConditionCard.tsx
features/dashboard/RecommendationCard.tsx
features/dashboard/DashboardKpiGrid.tsx
features/dashboard/FeaturedPlayersCard.tsx
data/mockDashboard.ts
```

## 要件

- 今日の試合カード
- おすすめ采配
- KPIカード
- チーム状態
- 注目選手
- 「試合へ」ボタン
- レスポンシブ対応

## 完了条件

- `/dashboard` または既存ルートから表示できる
- スマホでは1カラム
- PCでは複数カラム
- npm run build が通る

---

# Phase 3: 試合画面

## 目的

重要場面だけ采配する試合UIを作る。

## 実装対象

```text
features/game/GamePage.tsx
features/game/GameSituationPanel.tsx
features/game/MatchupCard.tsx
features/game/TacticalActionPanel.tsx
features/game/GameLogPanel.tsx
components/baseball/Scoreboard.tsx
components/baseball/CountDisplay.tsx
components/baseball/FieldView.tsx
data/mockGame.ts
```

## 要件

- スコア表示
- イニング・カウント・アウト表示
- ランナー状況表示
- 簡易フィールド
- 打者vs投手
- 危険度
- 采配ボタン
- ボタン押下でログ追加

## 完了条件

- 采配ボタンが機能する
- スマホで操作ボタンが押しやすい
- PCでフィールド・操作・ログを同時に見られる
- npm run build が通る

---

# Phase 4: 選手詳細

## 目的

選手の能力と起用判断を表示する画面を作る。

## 実装対象

```text
features/players/PlayerDetailPage.tsx
features/players/PlayerProfileCard.tsx
features/players/PlayerUsageAdvice.tsx
features/players/PlayerAbilityPanel.tsx
components/baseball/PlayerAvatar.tsx
components/baseball/AbilityBars.tsx
components/baseball/BallparkFitTable.tsx
data/mockPlayers.ts
```

## 要件

- 選手プロフィール
- 能力値バー
- おすすめ起用
- 球場適性
- レスポンシブ対応

## 完了条件

- 能力値が0〜100バーで表示される
- 球場適性がランク色付きで表示される
- スマホでおすすめ起用が上位に表示される
- npm run build が通る

---

# Phase 5: スプレーチャート分析

## 目的

物理演算結果を分かりやすく表示する画面を作る。

## 実装対象

```text
features/analysis/SprayChartAnalysisPage.tsx
features/analysis/BallparkResultComparison.tsx
components/baseball/SprayChart.tsx
components/baseball/BattedBallDetail.tsx
data/mockSprayChart.ts
```

## 要件

- フィールド上に打球点を表示
- 打球結果を色分け
- 打球点クリックで詳細更新
- EVはkm/h
- LAはdeg
- 飛距離はm
- 球場別判定を表示

## 完了条件

- 打球点をクリックできる
- 選択中打球の詳細が更新される
- スマホでもタップしやすい
- 横スクロールが発生しない
- npm run build が通る

---

# Phase 6: 既存ロジック接続

## 目的

mock data を既存のゲームデータ・シミュレーション結果に段階的に置き換える。

## 作業

- 既存の試合データから TodayGame を生成
- 既存の選手データから PlayerSummary を生成
- 既存の物理演算結果から BattedBall を生成
- 既存の試合状況から GameSituation を生成
- データ変換用 adapter を作る

## 推奨構成

```text
src/adapters/
  dashboardAdapter.ts
  gameAdapter.ts
  playerAdapter.ts
  sprayChartAdapter.ts
```

## 完了条件

- UIコンポーネントは既存ロジックに直接依存しない
- adapter経由でデータを渡せる
- mock data と real data を切り替えられる
- npm run build が通る

---

# Phase 7: 品質改善・UX調整

## 目的

見た目、操作性、読みやすさを改善する。

## 作業

- 文字量調整
- カード余白調整
- スマホタップ領域確認
- PC一覧性確認
- ローディング状態
- 空データ状態
- エラー状態
- アクセシビリティ確認

## 完了条件

- スマホで主要導線が操作しやすい
- PCで情報比較しやすい
- 空データでも画面が壊れない
- npm run build が通る

---

## 15. Codex実行プロンプト

以下をCodexに渡す。

```text
Baseball Manager のUIを、ユーザーが遊びやすい監督ゲームUIに改善してください。

この要件定義書に従い、段階的に実装してください。

最重要方針：
- 既存のシミュレーションロジックを壊さない
- まずは mock data でUIを完成させる
- Mobile Firstでレスポンシブ対応する
- PCでは一覧性、スマホでは意思決定のしやすさを優先する
- TypeScriptの型を先に定義する
- コンポーネントを過度に巨大化させない
- 1ファイルに全部書かない
- npm run build が通ることを最優先する

今回実装する範囲：
Phase 0〜Phase 2まで。

Phase 0:
- 既存構成を確認
- package.json、src構成、既存ルーティング、既存スタイル方式を把握
- 追加予定ファイル一覧を整理

Phase 1:
- types/baseball.ts
- AppShell
- SidebarNav
- BottomTabNav
- Card
- StatCard
- StatusChip
- ActionButton
- SectionHeader
- ProgressBar
- ダークテーマの基本スタイル

Phase 2:
- ManagerDashboardPage
- TodayGameCard
- RecommendationCard
- TeamConditionCard
- DashboardKpiGrid
- FeaturedPlayersCard
- mockDashboard.ts

レスポンシブ要件：
- 767px以下はスマホUI
- 768px〜1023pxはタブレットUI
- 1024px以上はPC UI
- PCでは左サイドバー固定
- スマホでは下部タブナビゲーション
- スマホでは1カラム縦積み
- PCでは複数カラムGrid
- スマホ下部タブは最大5項目
- スマホのタップ領域は44px以上
- 横スクロールを発生させない

ManagerDashboardPage要件：
- 今日の試合カードを表示
- 現在順位、勝敗、R/G、RA/G、直近成績を表示
- チーム状態をチップで表示
- 今日のおすすめ采配を表示
- 注目選手を表示
- 「試合へ」ボタンを設置
- スマホでは「今日の試合」「おすすめ采配」「チーム状態」「KPI」「注目選手」の順に縦積み
- PCでは今日の試合とおすすめ采配を横並びにする

禁止事項：
- 既存ロジックを大きく書き換えない
- 既存画面を壊さない
- mock data段階で無理に実データ接続しない
- 1ファイルに大量のUIを詰め込まない
- スマホで横スクロールを出さない
- 下部タブに6項目以上入れない

完了後に報告すること：
- 実装したPhase
- 追加・変更したファイル一覧
- ルーティング方法
- レスポンシブ対応内容
- npm run build の結果
- 残課題
```

---

## 16. 検証コマンド

既存プロジェクトの package.json を確認したうえで、存在するコマンドを実行する。

基本：

```bash
npm install
npm run build
```

存在する場合：

```bash
npm run lint
npm run test
npm run typecheck
```

---

## 17. レビュー観点

Codex実装後は以下を確認する。

### 17.1 破壊防止

- 既存画面が消えていないか
- 既存ロジックが変更されすぎていないか
- 不要な依存ライブラリを追加していないか

### 17.2 UI

- 監督室で今日やることが分かるか
- カードの情報量が多すぎないか
- ボタンが押しやすいか
- スマホで横スクロールがないか
- PCで情報が間延びしていないか

### 17.3 実装

- 型が定義されているか
- mock data と UI が分離されているか
- コンポーネントが適切に分割されているか
- npm run build が通るか

---

## 18. 重要な判断

一気に全Phaseを実装しないこと。

最初は以下に絞る。

```text
Phase 0
Phase 1
Phase 2
```

理由：

- 既存ロジック破壊リスクを抑えられる
- UI方針を先に固められる
- スマホ/PCのレスポンシブ基盤を先に検証できる
- 監督ダッシュボードが完成すれば、他画面の設計基準になる

---

## 19. 次の実装順

1. Phase 0〜2をCodexで実装
2. build結果を確認
3. スマホ幅・PC幅のスクリーンショット確認
4. UIレビュー
5. Phase 3以降へ進む

## 20. UI実装レビュー（2026-05-02）

### 20.1 レビュー方針

本レビューでは、現行実装を「要件への適合性【＝決めた仕様に沿っているか】」「導線の分かりやすさ【＝ユーザーが迷わないか】」「今後の接続容易性【＝既存ロジックに安全に繋げられるか】」の3観点で評価した。

### 20.2 現状サマリー

- ダッシュボード系UI（`DashboardTab` / `ManagerDashboardCards`）は、起動直後に判断材料を提示する構成として有効。
- 試合導線は、モード分岐を減らして既存フローに統一したことで、選択負荷【＝どれを押すか迷う負担】が減少。
- 一方で、要件書の TypeScript 前提と現実装の JavaScript 中心には乖離【＝差分】があるため、段階的移行計画が必要。

### 20.3 反映済み方針（重要）

ユーザー要望「モックUIの采配画面は不要。既存画面で事足りる」を正式要件として反映する。

#### 反映内容

- 試合開始時のモード選択は、初期実装では **オートシムのみ** を基本導線とする。
- モック用途の独立采配画面（例: `TacticalGameScreen`）は、標準導線から外す。
- 将来再導入する場合は、A/B テスト【＝比較検証】または明確な要件再定義を前提にする。

#### 期待効果

- ユーザーが「どちらのモードを使うべきか」で迷わない。
- 既存の試合進行・結果確認フローに学習コスト【＝覚える負担】を集中できる。

### 20.4 追加の改善タスク（優先順）

1. **導線整合**: 「試合へ」操作時の遷移先を、常に既存オート進行導線へ統一する。  
2. **文言統一**: 画面内の「采配」「戦術」表現を、実際の操作範囲に合わせて整理する。  
3. **レスポンシブ検証**: 767px 以下での主要操作ボタン高さ 44px 以上を再点検する。  
4. **空状態対策**: 対戦相手未確定・日程未生成時の表示を明示する。  
5. **移行計画**: TypeScript 化対象（型定義→共通UI→画面）を小分けで計画する。  

### 20.5 リスクと対策

- ⚠️ **リスク: 旧導線への参照残り**  
  対策: 画面遷移定数を1箇所に集約し、未使用ルートを定期点検する。

- ⚠️ **リスク: ドキュメントと実装のズレ再発**  
  対策: このレビュー節を更新起点として、変更時に「要件書更新」をDefinition of Done【＝完了条件】へ含める。

- ⚠️ **セキュリティ注意**  
  UI文言更新時も、外部入力【＝保存データやAPI応答】の描画は型検証・無害化【＝不正値の除去】を維持する。


