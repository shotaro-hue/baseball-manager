# Baseball Manager 統合要件定義書

最終更新: 2026-05-03  
対象リポジトリ: `baseball-manager-main`  
配置先: `docs/baseball_manager_integrated_requirements.md`

---

## 0. このドキュメントの目的

このドキュメントは、現在並行して進めている以下2プロジェクトを、ひとつの開発ロードマップとして統合するための要件定義書である。

1. UI進化プロジェクト
   - 監督ダッシュボード
   - 試合画面 / 重要場面采配
   - 選手詳細UI
   - スプレーチャート分析UI
   - PC / スマホ対応

2. 打球物理演算高度化プロジェクト
   - 球場別HR判定
   - 環境補正
   - 他球場比較
   - 打球評価タグ
   - 実況生成
   - 選手評価・采配画面への接続

統合後の目的は、Baseball Managerを単なる成績表示アプリではなく、**物理演算に基づいた説明可能な野球シミュレーションゲーム**に進化させることである。

---

## 1. 結論

統合は可能。

ただし、UIと物理演算を同時に大改修するのは非推奨。

最優先は、以下の順番で進めること。

```txt
Phase A: build / test / validate の現状確認
Phase B: TacticalGameScreen 復活・再接続・スマホ実用化
Phase C: 物理演算メタデータの完成
Phase D: SprayChart分析UIへの接続
Phase E: PlayerModal / 選手評価UIへの接続
Phase F: TacticalGameScreen / 試合ログ / 実況への接続
Phase G: UX / QA / レスポンシブ調整
```

短期的には、**GameActionTabを本命化するのではなく、旧来の一球速報型で情報密度が高い `TacticalGameScreen` を本命試合画面として復活させること**が最優先である。

理由は、物理演算の高度化結果を最終的に表示・体験する場所は「大ボタン中心の簡易画面」ではなく、スコア、カウント、走者、打者、投手、一球ログ、試合ログ、采配判断が一体になった実戦画面だからである。

`GameActionTab` は、下部ナビの「試合」タブ用の簡易入口、プレビュー、または将来的なサブ画面として扱う。少なくとも現時点では、本命の試合進行画面にしない。

---

## 2. 現在の進捗レビュー

## 2.1 UI進化プロジェクト

### 進捗評価

```txt
UI進化: 45〜55%程度
```

### 完了・進行中

```txt
Phase 0: 完了扱い
Phase 1: 部分完了
Phase 2: ほぼ完了
Phase 3: 一部実装済み。ただしGameActionTab中心方針は修正する
Phase 4: 未完了寄り
Phase 5: 既存スプレーチャートはあるが、新UI要件としては未完了
Phase 6: 未着手寄り
Phase 7: 一部着手
```

### 現在の強み

- React + Vite構成は維持されている
- 監督ダッシュボードは実用レベルに近い
- PCサイドバー / スマホ下部ナビの基礎がある
- カードUI、レスポンシブGrid、タップ領域の考慮が入っている
- `src/components/TacticalGame.jsx` / `TacticalGameScreen` が残っている可能性が高い
- 一球速報型の情報密度が高い旧試合画面を復活できる可能性が高い
- `GameActionTab` の基礎は存在する

### 現在の弱点

- `GameActionTab` が `mockGameState` 前提の見た目プロトタイプになっている
- `GameActionTab` は情報量が少なく、野球ゲームの試合画面としては弱い
- スマホ表示で下部ナビとコンテンツが被るなど、実用品質に達していない
- 旧来の `TacticalGameScreen` がApp導線から外れている可能性がある
- `App.jsx` に `screen === "tactical_game"` の表示分岐が存在しない可能性がある
- 試合画面が「采配判断できるゲーム画面」として一本化されていない
- `PlayerModal` は情報表示中心で、起用判断UIとしては未完成
- `SprayChart` はあるが、球場差・環境影響・実況表示との接続が弱い

---

## 2.2 打球物理演算高度化プロジェクト

### 進捗評価

```txt
物理演算高度化: 45〜60%程度
```

### 現在できていること

既存または実装済みとみなせる要素。

```txt
simulateFlight(ev, la, options)
sanitizeEnvironment(rawEnv)
checkHomeRunByTrajectory(points, fenceDistance, wallHeight)
getFenceDistanceBySpray(stadium, sprayAngle)
resolveBattedBallOutcomeFromPhysicsForBalance(...)
postGame.js の buildBattedBallEvent(e, gameDay)
SprayChart.jsx の events 表示
STADIUMS / TEAM_STADIUM
```

また、最新版では以下のような新規ファイルが存在する可能性が高い。

```txt
src/engine/parkEffects.js
src/engine/battedBallAnalysis.js
src/engine/stadiums.js
```

### 未完成・不足していること

```txt
src/engine/commentary.js
src/engine/playerEvaluation.js
physicsMeta.evaluation の安定保存
physicsMeta.commentary の安定保存
SprayChart tooltip への球場差・環境影響・実況表示
PlayerModal への選手評価接続
TacticalGameScreen / 試合ログへの実況接続
```

### 現在の弱点

- 物理演算の計算結果は増えているが、ゲーム体験として表示されていない
- 打球ごとの「理由」は保存されつつあるが、UIに出し切れていない
- 球場別HR判定・環境補正・評価タグ・実況が一本の導線になりきっていない
- テストが足りない場合、HR数や打球結果のバランスが壊れるリスクがある

---

## 3. 統合後の最終ゴール

統合後の最終ゴールは以下。

```txt
打球物理演算
↓
球場別HR判定
↓
環境補正
↓
他球場比較
↓
評価タグ生成
↓
実況生成
↓
スプレーチャート分析
↓
選手評価
↓
TacticalGameScreen / 試合ログ / 采配画面への接続
```

最終的に、ユーザーは以下を理解できる状態にする。

- この打球はなぜHRになったのか
- この球場なら入ったが、別球場では入らなかったのか
- 向かい風・追い風・気温・標高がどれくらい影響したのか
- 選手の打球内容は本当に良いのか
- 成績だけではなく、打球内容から見て起用すべき選手なのか
- 試合中に采配判断へ使える情報なのか

---

## 4. 統合アーキテクチャ方針

## 4.1 責務分離

物理演算・判定・表示は以下の責務で分離する。

```txt
engine層:
  物理演算、球場別判定、環境補正、評価タグ、実況文生成

postGame層:
  試合ログからUI用のBattedBallEventへ変換

UI層:
  受け取ったイベントを表示するだけ
  HR判定や評価判定を再計算しない
```

## 4.2 試合画面の責務

試合画面は以下のように整理する。

```txt
TacticalGameScreen:
  本命の試合進行画面
  一球速報型の情報密度を維持する
  実試合進行、采配、ログ、打席状況、将来の物理演算実況を扱う

GameActionTab:
  下部ナビの「試合」タブ用の簡易入口・プレビュー扱い
  本命の試合進行画面にはしない
  mockGameState依存のまま本番画面化しない
```

`TacticalGameScreen` では、最低限以下を表示する。

```txt
- スコア
- イニング
- B/S/O
- アウト
- 塁状況
- 打者
- 投手
- 疲労
- 作戦
- 一球ログ
- 試合ログ
- 自動進行
- 投手交代
- 代打
```

## 4.3 禁止事項

```txt
- UI側でHR判定を再計算しない
- SprayChart.jsx 内で球場別HR判定をしない
- 距離だけでHR判定しない
- physicsMeta の既存互換フィールドを消さない
- GameActionTab のモック画面を本命試合画面にしない
- mockGameState を TacticalGameScreen の本番導線に入れない
- TacticalGame.jsx / TacticalGameScreen を削除しない
- TacticalGameScreen 復活時に simulation.js を大改修しない
- 物理演算改修時に App.jsx を大規模分割しない
- TypeScript移行を同時に始めない
```

---

## 5. 統合データモデル

## 5.1 physicsMeta

`physicsMeta` は既存フィールドを残したまま、以下を持つ。

```js
{
  ev,
  la,
  distance,
  sprayAngle,
  trajectory,
  ballType,
  quality,
  fenceDistance,
  hrCheck,
  isHrByTrajectory,

  physics: {
    exitVelocityKmh,
    launchAngleDeg,
    sprayAngleDeg,
    landingDistanceM,
    hangTimeSec,
    apexHeightM,
    trajectoryPoints,
    yAtFenceM,
    yAtFencePlus3m
  },

  park: {
    stadiumId,
    stadiumName,
    direction,
    fenceDistanceM,
    wallHeightM,
    isHomeRun,
    reason,
    marginM,
    wallClearanceM
  },

  environment: {
    windOutKmh,
    temperatureC,
    altitudeM,
    airDensity,
    actualDistanceM,
    neutralDistanceM,
    environmentDeltaM,
    effectTags
  },

  crossPark: {
    hrParkIds,
    nonHrParkIds,
    parkHrCount,
    totalParkCount,
    currentParkHr,
    neutralParkHr,
    parkSuppressed,
    parkAided,
    parkResults
  },

  evaluation: {
    contactQuality,
    nearHomeRun,
    noDoubter,
    barelyHomeRun,
    parkAdjustedValue,
    tags
  },

  commentary: {
    short,
    detail,
    tags
  },

  display: {
    distanceRatio,
    fenceRatio,
    warnings
  }
}
```

## 5.2 BattedBallEvent

`postGame.js` の `buildBattedBallEvent(e, gameDay)` は、既存フィールドを残したまま以下を追加する。

```js
{
  playerId,
  gameDay,
  x,
  y,
  hitType,
  exitVelo,
  launchAngle,
  distance,
  sprayAngle,
  fenceDistance,
  fenceRatio,
  isHrByTrajectory,
  hrClearance,
  isDisplayInconsistent,
  warningReasons,

  physics,
  park,
  environment,
  crossPark,
  evaluation,
  commentary,
  displayWarnings
}
```

## 5.3 UI側の原則

UI側は以下を表示する。

```txt
SprayChart:
  打球位置、結果、EV、LA、飛距離、球場別HR数、環境影響、実況

PlayerModal:
  実HR、球場補正HR、惜しいHR、風で損した打球、球場に助けられたHR

TacticalGameScreen:
  スコア、カウント、走者、打者、投手、一球ログ、試合ログ、采配、直近の打球理由、実況

GameActionTab:
  TacticalGameScreenへの入口、試合プレビュー、簡易情報表示
```

UI側で以下はしない。

```txt
- HR判定の再計算
- 球場別判定の再計算
- 環境補正の再計算
- 評価タグ生成
```

---

# 6. 統合ロードマップ

---

## Phase A: build / test / validate の現状確認

### 目的

改修前に、現在のビルド・テスト状態を確定する。

### 作業内容

```bash
npm install
npm run build
npm run test
npm run validate:physics-hr
```

### 受け入れ条件

```txt
- 現在のbuild成否を記録する
- test失敗がある場合、失敗理由を分類する
- validate:physics-hr失敗がある場合、タイムアウトかロジック破綻かを分類する
- UI起因か、物理演算起因か、依存関係起因かを切り分ける
```

### 注意

このPhaseではコードを大きく変更しない。

---

## Phase B: TacticalGameScreen 復活・再接続・スマホ実用化

### 目的

旧来の一球速報型で情報密度が高い `TacticalGameScreen` を、本命の試合画面として復活させる。

今回のPhase Bでは、`GameActionTab` の大ボタン中心UIを磨くことを主目的にしない。  
本当に必要なのは、**試合状況を読み、采配判断し、試合進行できる画面**である。

### 対象ファイル

```txt
src/App.jsx
src/components/TacticalGame.jsx
src/components/tabs/GameActionTab.jsx
src/styles.css
```

必要に応じて、ただし大規模化しない範囲で以下を追加してよい。

```txt
src/components/game/PhysicsInsightPanel.jsx
```

### 作業内容

#### B-1. TacticalGameScreen の導線復活

`src/components/TacticalGame.jsx` に存在する `TacticalGameScreen` を本命の試合画面として復活させる。

必須対応。

```txt
- App.jsx に TacticalGameScreen を import する
- screen === "tactical_game" の表示分岐を復元する
- ModeSelectScreen → handleModeSelect("tactical") → setScreen("tactical_game") の導線を確認する
- 必要な props を渡す
  - myTeam
  - oppTeam または currentOpp
  - onGameEnd
```

#### B-2. GameActionTab の位置づけ変更

`GameActionTab` は本命の試合画面にしない。

```txt
GameActionTabの役割:
- 下部ナビ「試合」タブ用の簡易入口
- TacticalGameScreenへの導線
- 試合プレビュー
- 重要場面へのショートカット
```

禁止。

```txt
- GameActionTabをmockGameState依存の本番試合画面にする
- GameActionTabの大ボタンUIを本命化する
- GameActionTabをさらに作り込んでTacticalGameScreenと競合させる
```

#### B-3. 旧画面の情報密度を維持

`TacticalGameScreen` では、以下の情報を削らない。

```txt
- スコア
- イニング
- イニング別スコア
- 攻撃/守備状況
- B/S/O
- アウト
- 塁状況
- 打者
- 投手
- 投手疲労
- 作戦選択
- 采配停止条件
- 自動進行
- 投手交代
- 代打
- 一球ログ
- 試合ログ
- 3Dリプレイ連携が既存である場合は維持
```

#### B-4. スマホUIの最低品質改善

スマホでは一球速報型の情報順に並べる。

```txt
1. スコア・イニング
2. B/S/O・アウト・走者
3. 打者 vs 投手
4. 一球ログ
5. 危険度・おすすめ采配がある場合は表示
6. 采配ボタン
7. グラウンド図または塁状況補助表示
8. 詳細ログ
```

必須対応。

```txt
- iPhone幅390px前後で横スクロールしない
- 下部ナビとコンテンツが被らない
- safe-area-inset-top / safe-area-inset-bottom を考慮する
- 下部ナビがfixed/stickyの場合、メイン側に十分なpadding-bottomを入れる
- ボタンタップ領域44px以上を維持する
```

#### B-5. 将来の物理演算表示の受け口を追加

本実装はPhase Fでよいが、受け口だけはPhase Bで用意する。

`lastPlay.physicsMeta` または同等のデータが存在する場合だけ、補助表示する。

```js
lastPlay: {
  result: "flyout",
  text: "ライトフライ",
  physicsMeta: {
    physics: {
      exitVelocityKmh: 164.2,
      launchAngleDeg: 29.5,
      landingDistanceM: 112.4
    },
    park: {
      currentParkHr: false,
      stadiumName: "甲子園",
      reason: "フェンス手前"
    },
    crossPark: {
      parkHrCount: 2,
      totalParkCount: 12
    },
    environment: {
      environmentDeltaM: -4.2,
      effectTags: ["向かい風"]
    },
    commentary: {
      short: "向かい風に押し戻された大飛球",
      detail: "東京ドームなら本塁打性。現在の球場ではフェンス手前。"
    }
  }
}
```

表示ルール。

```txt
- physicsMetaがない場合は何も表示しない
- undefined / NaN / Infinity を表示しない
- UI側で再計算しない
- あくまで受け取った値を表示する
```

推奨コンポーネント。

```txt
PhysicsInsightPanel
```

ただし、Phase Bではコンポーネントを増やしすぎない。最低限の切り出しでよい。

### 完了条件

```txt
- 戦術試合モードに遷移できる
- TacticalGameScreen が表示される
- 一球速報型の情報密度が維持されている
- スコア、イニング、アウト、塁状況、打者、投手、ログが見える
- 采配操作が実試合進行に反映される
- GameActionTab が本命画面として扱われていない
- スマホで下部ナビとコンテンツが被らない
- PC表示が崩れていない
- npm run build が成功する
- npm run test が成功する
- npm run validate:physics-hr が成功する
```

### このPhaseでやらないこと

```txt
- 物理演算ロジック変更
- SprayChart大改修
- PlayerModal大改修
- 試合エンジン大改修
- App.jsx大規模分割
- TypeScript化
- GameActionTabの大ボタンUI本命化
- TacticalGameScreenを削除して作り直すこと
```

---

## Phase C: 物理演算メタデータの完成

### 目的

打球イベントに「結果」だけでなく「理由」を保存する。

### 対象ファイル

```txt
src/engine/physics.js
src/engine/physicsConstants.js
src/engine/simulation.js
src/engine/postGame.js
src/engine/stadiums.js
src/engine/parkEffects.js
src/engine/battedBallAnalysis.js
src/engine/commentary.js
src/engine/playerEvaluation.js
```

### 作業内容

#### C-1. stadiums.js の整備

`STADIUMS` / `TEAM_STADIUM` を `src/engine/stadiums.js` に整理する。

既存互換のため、以下は残す。

```txt
lf
cf
rf
hrMod
type
```

追加推奨。

```txt
id
name
wallHeightM
altitudeM
dome
```

#### C-2. parkEffects.js の整備

必須関数。

```js
export function getFenceDistanceBySpray(stadium, sprayAngle) {}

export function evaluateTrajectoryAgainstPark({
  trajectory,
  sprayAngleDeg,
  stadium,
  wallHeightM
}) {}

export function evaluateAcrossParks({
  trajectory,
  sprayAngleDeg,
  stadiums,
  currentStadiumId
}) {}
```

#### C-3. 環境補正の整理

`physicsConstants.js` に追加する。

```js
export const NEUTRAL_ENVIRONMENT = {
  windOut: 0,
  airDensity: 1.225,
  temperatureC: 20,
  altitudeM: 0,
};
```

`simulateFlight()` では、`airDensity` が明示指定された場合だけ優先する。

明示指定がない場合は `temperatureC` と `altitudeM` から簡易計算する。

#### C-4. battedBallAnalysis.js の整備

必須関数。

```js
export function analyzeEnvironmentEffect({
  ev,
  la,
  options,
  actualEnvironment,
  neutralEnvironment
}) {}

export function generateBattedBallTags({
  physics,
  park,
  environment,
  crossPark
}) {}
```

#### C-5. commentary.js の作成

必須関数。

```js
export function generateBattedBallCommentary(eventLike) {}
```

戻り値。

```js
{
  short,
  detail,
  tags
}
```

#### C-6. playerEvaluation.js の作成

必須関数。

```js
export function summarizeBattedBallEvaluation(events) {}
```

戻り値。

```js
{
  actualHr,
  parkAdjustedHr,
  nearHr,
  noDoubterHr,
  barelyHr,
  parkSuppressedHr,
  parkAidedHr,
  windSuppressedHr,
  windAidedHr,
  highQualityContact,
  weakContact,
  avgExitVelocityKmh,
  avgLaunchAngleDeg,
  avgParkHrRate
}
```

### 完了条件

```txt
- physicsMeta.park が保存される
- physicsMeta.crossPark が保存される
- physicsMeta.environment.environmentDeltaM が保存される
- physicsMeta.environment.effectTags が保存される
- physicsMeta.evaluation.tags が保存される
- physicsMeta.commentary.short が保存される
- postGame.js の battedBallEvents に新情報が入る
- 既存互換フィールドが消えていない
- npm run test が成功する
- npm run validate:physics-hr が成功する
- npm run build が成功する
```

---

## Phase D: SprayChart分析UIへの接続

### 目的

スプレーチャートを、単なる打球点表示から「球場差・環境影響・打球理由が分かる分析UI」にする。

### 対象ファイル

```txt
src/components/tabs/SprayChart.jsx
src/styles.css
```

### 作業内容

#### D-1. stadium optional props対応

```jsx
<SprayChart events={events} stadium={stadium} />
```

`stadium` がある場合は球場データからフェンスを表示する。

`stadium` がない場合は既存fallbackを使う。

#### D-2. Tooltip拡張

打球点の `<title>` に以下を含める。

```txt
結果
打球速度 km/h
打球角度 deg
飛距離 m
現在球場でHRか
全12球場中何球場でHRか
環境影響
実況 short
```

#### D-3. 警告分類

```js
displayWarnings: [
  {
    level: 'error' | 'warn' | 'info',
    reason: string
  }
]
```

分類。

```txt
HRなのにフェンス内側 → error
非HRなのにフェンス外側 → warn
fenceDistance不正 → infoまたはwarn
```

### 完了条件

```txt
- 既存のSprayChart呼び出しが壊れない
- 打球点tooltipに球場差・環境影響・実況が出る
- HR/非HRの表示不整合が警告分類される
- スマホでタップしやすい
- npm run build が成功する
```

---

## Phase E: PlayerModal / 選手評価UIへの接続

### 目的

選手詳細画面を「成績を見る画面」から「起用判断ができる画面」にする。

### 対象ファイル

```txt
src/components/PlayerModal.jsx
src/engine/playerEvaluation.js
src/styles.css
```

### 表示する指標

```txt
実HR
球場補正HR
惜しいHR
文句なしHR
ギリギリHR
球場に損したHR級打球
球場に助けられたHR
向かい風で損した打球
追い風に乗ったHR
高品質コンタクト数
平均打球速度
平均打球角度
平均球場HR率
```

### 表示カード案

```txt
- 打球評価サマリー
- 球場適性カード
- 起用判断カード
- 注意タグカード
```

### 完了条件

```txt
- PlayerModalで打球内容ベースの評価が見える
- 実成績だけではなく、球場補正・環境影響が分かる
- 起用判断に使える文言が表示される
- 既存の成績・契約・守備適性表示を壊さない
- npm run build が成功する
```

---

## Phase F: TacticalGameScreen / 試合ログ / 実況への接続

### 目的

物理演算の結果を、試合中の体験に接続する。

対象は `GameActionTab` ではなく、**本命試合画面である `TacticalGameScreen`** とする。

### 対象ファイル

```txt
src/components/TacticalGame.jsx
src/components/game/PhysicsInsightPanel.jsx
src/engine/commentary.js
src/styles.css
```

必要に応じて参照。

```txt
src/components/tabs/GameActionTab.jsx
```

### 作業内容

#### F-1. 直近打球理由カード

`TacticalGameScreen` に、直近の打球結果を説明するカードを追加する。

表示例。

```txt
大きな当たりでしたが、向かい風に押し戻されました。
東京ドームならHR、甲子園ではフェンス手前の打球です。
12球場中7球場でHRになる打球です。
```

#### F-2. 試合ログへの実況接続

`physicsMeta.commentary.short` がある場合、試合ログまたは一球ログに表示する。

#### F-3. 采配判断との接続

短期では表示だけでよい。

将来的には以下に使う。

```txt
- 代打判断
- 守備固め判断
- 球場相性判断
- 風向きによる作戦判断
- 投手交代判断
```

### 完了条件

```txt
- TacticalGameScreenで直近打球の理由が読める
- 物理演算の結果が実況として表示される
- 一球速報型の情報密度を壊さない
- 采配画面のUXを壊さない
- スマホで読みやすい
- npm run build が成功する
```

---

## Phase G: UX / QA / レスポンシブ調整

### 目的

実際に遊べる品質へ整える。

### 作業内容

```txt
- スマホ幅390pxで横スクロールしない確認
- 下部ナビとTacticalGameScreenのコンテンツが被らない確認
- PC幅1024px以上で情報が読みやすい確認
- 空データ状態
- NaN / undefined / Infinity の表示防止
- ボタンタップ領域44px以上
- build / test / validate の安定化
- 物理演算バランス確認
```

### 確認コマンド

```bash
npm install
npm run build
npm run test
npm run validate:physics-hr
```

### ブラウザ確認

```bash
npm run dev
```

確認観点。

```txt
- 戦術試合モードで TacticalGameScreen に遷移できる
- TacticalGameScreenでスコア、カウント、走者、打者、投手、一球ログ、試合ログが見やすい
- GameActionTabが本命画面として誤用されていない
- SprayChartで打球理由が分かる
- PlayerModalで起用判断がしやすい
- スマホで横スクロールしない
- 下部ナビにコンテンツが隠れない
- 物理演算によりHR数が極端に増減していない
```

---

# 7. 実装優先順位

## 最優先

```txt
Phase A → Phase B
```

理由。

```txt
まず本命の試合画面である TacticalGameScreen を復活させないと、物理演算の成果をゲーム体験として表示できないため。
GameActionTabを磨いても、情報密度の低いモック画面が本命化してしまうリスクが高い。
```

## 次点

```txt
Phase C
```

理由。

```txt
物理演算の理由データが保存されなければ、SprayChart・PlayerModal・実況に接続できないため。
```

## その後

```txt
Phase D → Phase E → Phase F → Phase G
```

理由。

```txt
まず分析UI、次に選手評価、最後にTacticalGameScreenの試合ログ・采配体験へ接続する方が破壊リスクが低い。
```

---

# 8. Codexへ渡すプロンプト

以下をそのままCodexに渡す。

```txt
baseball_manager_integrated_requirements.md に沿って、まず Phase A と Phase B だけを実装してください。

方針変更:
GameActionTab の大ボタン中心UIを本命の試合画面にするのはやめます。
以前の一球速報型の情報密度が高い TacticalGameScreen を本命の試合画面として復活・再接続してください。

今回の目的:
- TacticalGameScreen を本命の試合画面として復活させる
- 以前の一球速報型の情報密度を維持する
- GameActionTab は簡易入口またはプレビュー扱いにする
- 将来の Phase C〜F で physicsMeta / 実況 / 選手評価を接続しやすくする
- 物理演算ロジックには触らない

今回やること:
1. 現在の build / test / validate 状態を確認する
   - npm install
   - npm run build
   - npm run test
   - npm run validate:physics-hr

2. src/components/TacticalGame.jsx の TacticalGameScreen を確認する
   - 既存の情報量、試合進行、采配操作、ログ表示を把握する
   - 削除せずに復活させる

3. App.jsx に TacticalGameScreen を再接続する
   - TacticalGameScreen を import する
   - screen === "tactical_game" の表示分岐を復元する
   - myTeam / oppTeam または currentOpp / onGameEnd を正しく渡す

4. ModeSelectScreen → handleModeSelect("tactical") → setScreen("tactical_game") の導線を確認・修正する

5. GameActionTab の扱いを変更する
   - GameActionTab は下部ナビの「試合」タブ用の簡易入口、プレビュー、または TacticalGameScreen への導線にする
   - GameActionTab を mockGameState 依存の本命試合画面にしない
   - GameActionTab の大ボタンUIをさらに本命化しない

6. TacticalGameScreen の情報密度を維持する
   - スコア
   - イニング
   - B/S/O
   - アウト
   - 塁状況
   - 打者
   - 投手
   - 疲労
   - 作戦
   - 一球ログ
   - 試合ログ
   - 自動進行
   - 投手交代
   - 代打

7. TacticalGameScreen に将来の物理演算表示用の受け口を作る
   - lastPlay.physicsMeta が存在する場合だけ表示
   - 存在しない場合は何も表示しない
   - undefined / NaN / Infinity を表示しない
   - UI側でHR判定や環境補正を再計算しない
   - 可能なら PhysicsInsightPanel のような小さなコンポーネントに分ける

8. スマホUIを一球速報型の情報順に調整する
   - スコア
   - 状況
   - 打者/投手
   - 一球ログ
   - 危険度
   - 采配ボタン
   - グラウンドまたは塁状況補助
   - 詳細ログ

9. 下部ナビと被らないように safe-area / padding-bottom を調整する

今回やらないこと:
- 物理演算ロジックの修正
- SprayChart.jsx の大改修
- PlayerModal.jsx の大改修
- 試合エンジンの大改修
- TypeScript化
- App.jsxの大規模分割
- TacticalGame.jsx の削除
- GameActionTab のモック画面本命化
- components/layout や components/ui への大規模リファクタ

完了条件:
- npm run build が成功する
- npm run test が成功する
- npm run validate:physics-hr が成功する
- 戦術試合モードに遷移できる
- TacticalGameScreen が表示される
- 一球速報型の情報密度が維持されている
- スコア、イニング、アウト、塁状況、打者、投手、ログが見える
- 采配操作が実試合進行に反映される
- GameActionTab が本命画面として扱われていない
- スマホで下部ナビにコンテンツが被らない
- PC表示が崩れていない

作業後に報告してほしいこと:
- 変更したファイル一覧
- 変更内容の要約
- build結果
- test結果
- validate:physics-hr結果
- TacticalGameScreen復活状況
- GameActionTabの扱い
- 未対応事項
- 次にやるべきPhase
```

---

# 9. 次にやるべきこと

次にやるべきことは、**このファイルを `docs/baseball_manager_integrated_requirements.md` として保存し、Codexに Phase A / Phase B だけを実装させること**。

いきなり Phase C 以降の物理演算接続に進むのは非推奨。

理由は、本命試合画面である `TacticalGameScreen` が未接続のまま物理演算だけ高度化しても、ユーザー体験として価値が見えにくいためである。

まずは以下をグリーンにする。

```bash
npm run build
npm run test
npm run validate:physics-hr
```

そのうえで、`TacticalGameScreen` を本命試合画面として復活・再接続する。
