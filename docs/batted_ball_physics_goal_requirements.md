# 要件定義書：打球物理演算を球場差・環境補正・選手評価・実況へ接続する

## 0. この要件定義書の前提

対象リポジトリは、最新版 ZIP `baseball-manager-main (13).zip` の構成を前提にする。

現状の主要ファイルは以下。

```txt
src/engine/physics.js
src/engine/physicsConstants.js
src/engine/simulation.js
src/engine/postGame.js
src/components/tabs/SprayChart.jsx
src/engine/__tests__/physics.test.js
src/engine/__tests__/simulation.test.js
scripts/validate-physics-hr.test.js
```

現状では、以下の実装がすでに存在する。

```txt
simulateFlight(ev, la, options)
sanitizeEnvironment(rawEnv)
checkHomeRunByTrajectory(points, fenceDistance, wallHeight)
getFenceDistanceBySpray(stadium, sprayAngle)
resolveBattedBallOutcomeFromPhysicsForBalance(...)
postGame.js の buildBattedBallEvent(e, gameDay)
SprayChart.jsx の events 表示
STADIUMS / TEAM_STADIUM は simulation.js 内に定義
```

一方、以下はまだ存在しないため、新規作成または段階的移設が必要。

```txt
src/engine/parkEffects.js
src/engine/battedBallAnalysis.js
src/engine/commentary.js
src/engine/playerEvaluation.js
src/engine/stadiums.js
```

本要件では、既存の試合進行を壊さず、現在の `physicsMeta` と `postGame.js` の `battedBallEvents` を拡張する。

---

## 1. 最終ゴール

打球物理演算を、単なる打席結果生成ではなく、以下に使える「説明可能な打球イベントデータ」へ拡張する。

1. 球場ごとにホームランかどうかを判定する
2. 「東京ドームならHR、甲子園なら非HR」のような球場差を表現する
3. 風・気温・標高・空気密度による飛距離変化を反映する
4. 「向かい風で失速した」「追い風に乗った」などの実況を生成する
5. 実際の結果だけでなく、打球内容を選手評価に反映する
6. スプレーチャート上で、打球の質・球場差・環境影響を確認できる
7. 采配画面・試合ログ・打席結果詳細で、なぜその結果になったかを説明できる

重要なのは、`isHomeRun` だけを保存することではない。

必ず以下を構造化して保存する。

```txt
どんな打球だったか
どの球場だったか
どんな環境だったか
なぜHR/非HRになったか
他球場ならどうだったか
選手評価上どう扱うべきか
実況でどう説明するか
```

---

## 2. 現状コードとの接続方針

### 2.1 現在の流れ

最新版では、概ね以下の流れになっている。

```txt
processAtBat()
↓
simAtBat()
↓
initialResult === 'inplay' の場合
↓
resolveBattedBallOutcomeFromPhysics()
↓
simulateFlight()
↓
checkHomeRunByTrajectory()
↓
logEntry.physicsMeta に保存
↓
postGame.js の buildBattedBallEvent()
↓
player.stats.battedBallEvents に保存
↓
SprayChart.jsx で表示
```

この流れは維持する。

### 2.2 今回の拡張方針

既存の `physicsMeta` を壊さず、以下を追加する。

```txt
physicsMeta.park
physicsMeta.environment
physicsMeta.crossPark
physicsMeta.evaluation
physicsMeta.commentary
physicsMeta.display
```

また、`postGame.js` の `buildBattedBallEvent()` では、`physicsMeta` からこれらを読み取り、UI用に安全な形へ変換する。

---

## 3. 実装フェーズ

一度に全部実装しないこと。

最初は Phase 1〜3 を優先する。

```txt
Phase 1：既存構造に合わせた BattedBallEvent 拡張
Phase 2：球場別HR判定の分離と横断判定
Phase 3：環境補正と environmentDeltaM の保存
Phase 4：評価タグ生成
Phase 5：実況文生成
Phase 6：スプレーチャート接続
Phase 7：選手評価集計
Phase 8：采配画面・試合ログ表示
```

---

# Phase 1：BattedBallEvent / physicsMeta の拡張

## 4. 目的

現在の `physicsMeta` と `postGame.js` の `buildBattedBallEvent()` を拡張し、後続の球場差・環境補正・選手評価・実況に使えるデータを保存する。

このPhaseでは、UIの大改修や選手評価の完成までは行わない。

---

## 5. 現在の physicsMeta

現在 `resolveBattedBallOutcomeFromPhysicsForBalance()` は以下のような `physicsMeta` を返している。

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
  isHrByTrajectory
}
```

これを後方互換を維持したまま拡張する。

---

## 6. 拡張後の physicsMeta

`physicsMeta` は既存フィールドを残したまま、以下を追加する。

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

### 6.1 後方互換

以下の既存フィールドは消さない。

```txt
ev
la
distance
sprayAngle
trajectory
ballType
quality
fenceDistance
hrCheck
isHrByTrajectory
```

既存テストや UI がこれらを参照している可能性があるため。

---

## 7. postGame.js の buildBattedBallEvent 拡張

現在 `postGame.js` の `buildBattedBallEvent(e, gameDay)` はフラットな表示用イベントを作っている。

現状の主な出力：

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
  warningReasons
}
```

これを壊さず、以下を追加する。

```js
{
  physics,
  park,
  environment,
  crossPark,
  evaluation,
  commentary,
  displayWarnings
}
```

### 7.1 受け入れ条件

- 既存の `SprayChart` が最低限表示できる
- 既存の `player.stats.battedBallEvents` が壊れない
- `NaN` / `Infinity` / `undefined` が UI に流れない
- `warningReasons` は互換用に残す
- 新形式の `displayWarnings` を追加する

---

# Phase 2：球場別HR判定

## 8. 目的

現在 `simulation.js` 内にある以下の責務を分離・再利用可能にする。

```txt
getFenceDistanceBySpray()
checkHomeRunByTrajectory()
STADIUMS
TEAM_STADIUM
```

最終的には、同じ打球を全12球場で判定できるようにする。

---

## 9. 新規ファイル

以下を新規作成する。

```txt
src/engine/stadiums.js
src/engine/parkEffects.js
```

### 9.1 stadiums.js

`simulation.js` 内の `STADIUMS` / `TEAM_STADIUM` を移設する。

ただし、移設による破壊リスクが高い場合は、最初は `simulation.js` から re-export してもよい。

推奨構造：

```js
export const STADIUMS = {
  jingu: {
    id: 'jingu',
    name: '神宮球場',
    lf: 97,
    cf: 120,
    rf: 97,
    hrMod: 1.15,
    type: 'outdoor',
    wallHeightM: 3.0,
    altitudeM: 0,
    dome: false
  },
  tokyo_dome: {
    id: 'tokyo_dome',
    name: '東京ドーム',
    lf: 100,
    cf: 122,
    rf: 100,
    hrMod: 1.05,
    type: 'dome',
    wallHeightM: 4.0,
    altitudeM: 0,
    dome: true
  }
};
```

既存互換のため、`lf/cf/rf/type/hrMod` は残す。

### 9.2 wallHeightM について

最新版では壁高が球場別ではなく、主に `PHYSICS_BAT.HR.WALL_HEIGHT * leagueEnv.wallHeightMod` で処理されている。

Phase 2 では、球場別 `wallHeightM` を導入する。

ただし、実測値が未整備の場合は仮値でよい。

```js
const wallHeightM = stadium.wallHeightM ?? PHYSICS_BAT.HR.WALL_HEIGHT * safeLeagueEnv.wallHeightMod;
```

---

## 10. parkEffects.js の必須関数

### 10.1 getFenceDistanceBySpray

現在 `simulation.js` 内にある `getFenceDistanceBySpray(stadium, sprayAngle)` を `parkEffects.js` に移設する。

既存テスト `_getFenceDistanceBySpray_TEST` が壊れないよう、`simulation.js` からもテスト用 export を維持する。

```js
export function getFenceDistanceBySpray(stadium, sprayAngle) {
  // 現行ロジックを維持
}
```

受け入れ条件：

```txt
sprayAngle = 0 で LF
sprayAngle = 45 で CF
sprayAngle = 90 で RF
中間角度は補間
```

---

### 10.2 evaluateTrajectoryAgainstPark

```js
export function evaluateTrajectoryAgainstPark({ trajectory, sprayAngleDeg, stadium, wallHeightM })
```

出力：

```js
{
  stadiumId,
  stadiumName,
  direction,
  fenceDistanceM,
  wallHeightM,
  isHomeRun,
  reason,
  yAtFenceM,
  yAtFencePlus3m,
  landingDistanceM,
  marginM,
  wallClearanceM
}
```

`checkHomeRunByTrajectory()` と同等のロジックを使う。

理由候補：

```txt
NO_DOUBTER
CLEARED_FENCE
BARELY_CLEARED
WALL_HEIGHT_FAILED
LANDED_SHORT
FENCE_DIRECT
INVALID_TRAJECTORY
```

判定例：

```txt
landingDistanceM < fenceDistanceM → LANDED_SHORT
wallClearanceM < 0 → WALL_HEIGHT_FAILED
isHomeRun true かつ wallClearanceM <= 1.0 → BARELY_CLEARED
isHomeRun true かつ wallClearanceM > 1.0 → CLEARED_FENCE
```

---

### 10.3 evaluateAcrossParks

```js
export function evaluateAcrossParks({ trajectory, sprayAngleDeg, stadiums, currentStadiumId })
```

出力：

```js
{
  hrParkIds,
  nonHrParkIds,
  parkHrCount,
  totalParkCount,
  currentParkHr,
  neutralParkHr,
  parkSuppressed,
  parkAided,
  parkResults
}
```

判定：

```txt
currentParkHr === false かつ parkHrCount / totalParkCount >= 0.5 → parkSuppressed true
currentParkHr === true かつ parkHrCount / totalParkCount < 0.5 → parkAided true
```

---

## 11. Phase 2 受け入れ条件

- 既存の `simulation.js` のHR判定結果が大きく変わらない
- `getFenceDistanceBySpray` の既存テストが通る
- 同一打球を複数球場でHR判定できる
- `TokyoDome` ではHR、`Hanshin/Koshien` では非HRになるテストケースを追加する
- `parkHrCount / totalParkCount` が正しく返る

---

# Phase 3：環境補正

## 12. 目的

風・気温・標高・空気密度を飛距離に反映し、実況・評価に使える差分を保存する。

最終的には以下を表現する。

```txt
向かい風で標準環境より5m失速
追い風に乗ってフェンスを越えた
気温が高く、打球が伸びた
空気抵抗で伸びを欠いた
```

---

## 13. 現状の問題

最新版の `physics.js` では以下のようになっている。

```js
const environment = sanitizeEnvironment(options.environment);
const windOutKmh = environment.windOut;
const windOutMs = windOutKmh / 3.6;
```

`windOut` は km/h として扱われ、内部で m/s に変換されている。これは良い。

ただし、`sanitizeEnvironment()` が常に `airDensity` を既定値込みで返すため、以下の分岐に入りにくい。

```js
let computedAirDensity = Number(environment.airDensity);
if (!Number.isFinite(computedAirDensity)) {
  const seaLevelDensityAtTemp = baseAirDensity * (288.15 / safeTemperatureK);
  const altitudeRatio = Math.exp(-environment.altitudeM / 8500);
  computedAirDensity = seaLevelDensityAtTemp * altitudeRatio;
}
```

結果として、`temperatureC` と `altitudeM` が飛距離にほぼ効かない。

---

## 14. 修正方針

`sanitizeEnvironment()` は安全化のみ担当する。

一方、`simulateFlight()` では、元の `options.environment` に `airDensity` が明示指定されたかどうかを判定する。

### 14.1 airDensity 明示指定あり

```js
const rawEnvironment = options.environment && typeof options.environment === 'object'
  ? options.environment
  : {};

const hasExplicitAirDensity = Number.isFinite(Number(rawEnvironment.airDensity));
```

明示指定ありなら、その値を優先する。

### 14.2 airDensity 明示指定なし

明示指定がなければ、`temperatureC` と `altitudeM` から簡易計算する。

```js
const baseAirDensity = 1.225;
const tempK = 273.15 + environment.temperatureC;
const safeTempK = Number.isFinite(tempK) && tempK > 0 ? tempK : 293.15;
const seaLevelDensityAtTemp = baseAirDensity * (293.15 / safeTempK);
const altitudeRatio = Math.exp(-environment.altitudeM / 8500);
computedAirDensity = seaLevelDensityAtTemp * altitudeRatio;
```

### 14.3 抗力への反映

```js
const airDensityRatio = clamp(computedAirDensity / baseAirDensity, 0.75, 1.35);
const dragAccel = config.dragCoeff * airDensityRatio * speed * speed;
```

---

## 15. 標準環境

`physicsConstants.js` に追加する。

```js
export const NEUTRAL_ENVIRONMENT = {
  windOut: 0,
  airDensity: 1.225,
  temperatureC: 20,
  altitudeM: 0,
};
```

既存の `DEFAULT_ENVIRONMENT` は残す。

---

## 16. analyzeEnvironmentEffect

新規ファイル：

```txt
src/engine/battedBallAnalysis.js
```

関数：

```js
export function analyzeEnvironmentEffect({ ev, la, options, actualEnvironment, neutralEnvironment })
```

処理：

```txt
1. actualEnvironment で simulateFlight
2. neutralEnvironment で simulateFlight
3. actualDistanceM - neutralDistanceM を environmentDeltaM として保存
4. effectTags を生成
```

出力：

```js
{
  actualDistanceM,
  neutralDistanceM,
  environmentDeltaM,
  effectTags
}
```

---

## 17. 環境タグ

```txt
HEADWIND_LOSS
WIND_AIDED
HOT_AIR_BOOST
COLD_AIR_SUPPRESSED
ALTITUDE_BOOST
DENSE_AIR_SUPPRESSED
NEUTRAL_ENVIRONMENT
```

判定ルール：

```txt
HEADWIND_LOSS: environmentDeltaM <= -3 かつ windOut < -3
WIND_AIDED: environmentDeltaM >= 3 かつ windOut > 3
HOT_AIR_BOOST: temperatureC >= 30 かつ environmentDeltaM >= 1
COLD_AIR_SUPPRESSED: temperatureC <= 5 かつ environmentDeltaM <= -1
ALTITUDE_BOOST: altitudeM >= 500 かつ environmentDeltaM >= 1
DENSE_AIR_SUPPRESSED: airDensity > 1.285 かつ environmentDeltaM <= -1
NEUTRAL_ENVIRONMENT: -3 < environmentDeltaM < 3
```

---

## 18. 環境補正のバランス制約

初期実装では補正を強くしすぎない。

目安：

```txt
追い風 +10km/h → +2〜4m
向かい風 -10km/h → -2〜4m
気温 +15℃ → +1〜2m
気温 -15℃ → -1〜2m
標高 +500m → +1〜2m
空気密度高め → -1〜3m
```

テストで大きく逸脱する場合は、`dragCoeff` や airDensity のクランプを調整する。

---

## 19. Phase 3 受け入れ条件

- `windOut = 10` は `10m/s` ではなく `10km/h` として処理される
- 向かい風では飛距離が短くなる
- 追い風では飛距離が長くなる
- `temperatureC = 35` は `temperatureC = 0` より飛距離が長くなる
- `altitudeM = 1000` は `altitudeM = 0` より飛距離が長くなる
- `airDensity = 1.35` は `airDensity = 1.0` より飛距離が短くなる
- `physicsMeta.environment.environmentDeltaM` が保存される
- `physicsMeta.environment.effectTags` が保存される

---

# Phase 4：評価タグ生成

## 20. 目的

物理・球場・環境の結果から、選手評価や実況に使えるタグを生成する。

---

## 21. battedBallAnalysis.js に追加する関数

```js
export function generateBattedBallTags({ physics, park, environment, crossPark })
```

出力：

```js
{
  contactQuality,
  nearHomeRun,
  noDoubter,
  barelyHomeRun,
  parkAdjustedValue,
  tags
}
```

---

## 22. 主要タグ

初期実装では以下に絞る。

```txt
NO_DOUBTER
BARELY_HR
NEAR_HOME_RUN
PARK_SUPPRESSED_HR
PARK_AIDED_HR
HEADWIND_LOSS
WIND_AIDED
HIGH_QUALITY_CONTACT
WALL_HEIGHT_FAILED
FENCE_DIRECT
```

---

## 23. タグ判定ルール

```txt
NO_DOUBTER:
  parkHrCount / totalParkCount >= 0.85

BARELY_HR:
  currentParkHr === true かつ wallClearanceM <= 1.0

NEAR_HOME_RUN:
  currentParkHr === false かつ abs(marginM) <= 3

PARK_SUPPRESSED_HR:
  currentParkHr === false かつ parkHrCount / totalParkCount >= 0.5

PARK_AIDED_HR:
  currentParkHr === true かつ parkHrCount / totalParkCount < 0.5

HIGH_QUALITY_CONTACT:
  exitVelocityKmh >= 158 かつ launchAngleDeg >= 18 かつ launchAngleDeg <= 35

WALL_HEIGHT_FAILED:
  park.reason === 'WALL_HEIGHT_FAILED'

FENCE_DIRECT:
  park.reason === 'FENCE_DIRECT' または abs(marginM) <= 1.5 かつ currentParkHr === false
```

環境タグは `environment.effectTags` から評価タグにも取り込む。

---

# Phase 5：実況文生成

## 24. 新規ファイル

```txt
src/engine/commentary.js
```

## 25. 必須関数

```js
export function generateBattedBallCommentary(eventLike)
```

入力は `physicsMeta` または `BattedBallEvent` のどちらでも扱えるようにする。

出力：

```js
{
  short,
  detail,
  tags
}
```

---

## 26. 実況テンプレート

```txt
NO_DOUBTER:
  どの球場でも文句なしの一発です。

PARK_SUPPRESSED_HR:
  他球場なら入っていた可能性の高い打球です。

PARK_AIDED_HR:
  この球場の条件も味方した一発です。

HEADWIND_LOSS:
  大きな当たりでしたが、向かい風に押し戻されました。

WIND_AIDED:
  追い風にも乗って、打球がよく伸びました。

WALL_HEIGHT_FAILED:
  フェンス上部に阻まれました。

FENCE_DIRECT:
  フェンス直撃の大きな当たりです。

BARELY_HR:
  フェンスぎりぎりで入りました。

HIGH_QUALITY_CONTACT:
  打球速度・角度ともに申し分ない打球です。
```

---

## 27. 実況優先順位

複数タグがある場合、`short` は以下の優先順位で決める。

```txt
1. NO_DOUBTER
2. PARK_SUPPRESSED_HR
3. PARK_AIDED_HR
4. HEADWIND_LOSS
5. WIND_AIDED
6. WALL_HEIGHT_FAILED
7. FENCE_DIRECT
8. BARELY_HR
9. NEAR_HOME_RUN
10. HIGH_QUALITY_CONTACT
```

`detail` には複数要素を含めてよい。

---

# Phase 6：スプレーチャート接続

## 28. 現状の問題

最新版の `SprayChart.jsx` は以下を使って平均フェンス円を描いている。

```js
const avgFenceRatio = safeEvents.reduce(...) / safeEvents.length;
```

これは打球イベントの平均に依存するため、球場形状の表示として不適切。

---

## 29. 修正方針

`SprayChart` に `stadium` を渡せるようにする。

```jsx
<SprayChart events={events} stadium={stadium} />
```

ただし、既存呼び出しが壊れないよう `stadium` は optional にする。

```js
export function SprayChart({ events, stadium })
```

### 29.1 stadium がある場合

球場データからフェンスを描画する。

```js
const lfRatio = stadium.lf / 150;
const cfRatio = stadium.cf / 150;
const rfRatio = stadium.rf / 150;
```

### 29.2 stadium がない場合

互換用に現在の `avgFenceRatio` fallback を使ってよい。

ただし、最終的にはイベント平均依存を廃止する。

---

## 30. Tooltip 拡張

打球点の `<title>` に以下を含める。

```txt
結果
打球速度
打球角度
飛距離
現在球場判定
12球場中何球場でHRか
環境影響
実況 short
```

例：

```txt
結果: 二塁打
打球速度: 166km/h
角度: 28°
飛距離: 121m
現在球場: 非HR
12球場中7球場でHR
環境: 向かい風で標準より5m失速
実況: 他球場なら入っていた可能性の高い打球です。
```

---

## 31. displayWarnings の分類

現在は `warningReasons` が文字列配列。

新形式では以下も追加する。

```js
displayWarnings: [
  {
    level: 'error' | 'warn' | 'info',
    reason: string
  }
]
```

分類：

```txt
HRなのにフェンス内側 → error
非HRなのにフェンス外側 → warn
fenceDistance 不正 → info または warn
```

注意：

非HRなのにフェンス外側は、壁高不足やフェンス直撃であり得るため、error ではなく warn とする。

---

# Phase 7：選手評価への接続

## 32. 目的

`player.stats.battedBallEvents` に蓄積されたイベントから、選手ごとの打球評価を算出する。

初期実装では新規 UI を作り込まず、集計関数だけ追加してよい。

---

## 33. 新規ファイル

```txt
src/engine/playerEvaluation.js
```

## 34. 必須関数

```js
export function summarizeBattedBallEvaluation(events)
```

出力：

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

算出ルール：

```txt
actualHr: hitType === 'homeRun' の数
parkAdjustedHr: parkHrCount / totalParkCount の合計
nearHr: NEAR_HOME_RUN タグ数
noDoubterHr: NO_DOUBTER タグ数
parkSuppressedHr: PARK_SUPPRESSED_HR タグ数
parkAidedHr: PARK_AIDED_HR タグ数
windSuppressedHr: HEADWIND_LOSS かつ NEAR_HOME_RUN の数
windAidedHr: WIND_AIDED かつ homeRun の数
avgParkHrRate: 平均 parkHrCount / totalParkCount
```

---

# Phase 8：采配画面・試合ログ接続

## 35. 初期接続先

最初は以下だけでよい。

```txt
logEntry.physicsMeta.commentary.short
SprayChart tooltip
打席結果詳細がある場合の詳細表示
```

`TacticalGame.jsx` や `GameActionTab.jsx` への本格反映は後続でよい。

---

# Phase 9：テスト要件

## 36. 追加テストファイル

```txt
src/engine/__tests__/parkEffects.test.js
src/engine/__tests__/battedBallAnalysis.test.js
src/engine/__tests__/commentary.test.js
```

既存の以下も更新する。

```txt
src/engine/__tests__/physics.test.js
src/engine/__tests__/simulation.test.js
```

---

## 37. physics.test.js

追加すること。

```txt
windOut = 10 は無風より飛距離が長い
windOut = -10 は無風より飛距離が短い
temperatureC = 35 は temperatureC = 0 より飛距離が長い
altitudeM = 1000 は altitudeM = 0 より飛距離が長い
airDensity = 1.35 は airDensity = 1.0 より飛距離が短い
```

---

## 38. parkEffects.test.js

追加すること。

```txt
sprayAngle 0/45/90 で LF/CF/RF の距離を返す
同じ打球で東京ドームではHR、甲子園では非HRになる
フェンス距離を超えても壁高未満なら非HR
低い壁ならHR、高い壁なら非HR
parkHrCount / totalParkCount が正しい
```

---

## 39. battedBallAnalysis.test.js

追加すること。

```txt
向かい風で3m以上失速なら HEADWIND_LOSS
追い風で3m以上伸びたら WIND_AIDED
12球場中10球場以上でHRなら NO_DOUBTER
現在球場では非HRだが半数以上でHRなら PARK_SUPPRESSED_HR
現在球場ではHRだが半数未満でHRなら PARK_AIDED_HR
EV158km/h以上かつLA18〜35度なら HIGH_QUALITY_CONTACT
```

---

## 40. commentary.test.js

追加すること。

```txt
HEADWIND_LOSS の実況に向かい風表現が含まれる
PARK_SUPPRESSED_HR の実況に他球場ならHR相当の表現が含まれる
NO_DOUBTER の実況に文句なしHRの表現が含まれる
commentary.short が空にならない
NaN が実況文に出ない
```

---

# Phase 10：実装順序

## 41. Codex は以下の順で実装すること

```txt
1. physics.js / simulation.js / postGame.js / SprayChart.jsx の現状を読む
2. simulation.js 内の STADIUMS / TEAM_STADIUM / getFenceDistanceBySpray を確認する
3. stadiums.js を作成し、STADIUMS / TEAM_STADIUM を移設または re-export する
4. parkEffects.js を作成し、getFenceDistanceBySpray を移設する
5. evaluateTrajectoryAgainstPark を実装する
6. evaluateAcrossParks を実装する
7. simulation.js の resolveBattedBallOutcomeFromPhysicsForBalance から parkEffects を呼ぶ
8. physicsMeta.park / crossPark を保存する
9. physics.js の airDensity 明示指定判定を修正する
10. battedBallAnalysis.js を作成し、analyzeEnvironmentEffect を実装する
11. physicsMeta.environment を保存する
12. generateBattedBallTags を実装する
13. commentary.js を作成し、generateBattedBallCommentary を実装する
14. physicsMeta.evaluation / commentary を保存する
15. postGame.js の buildBattedBallEvent を新構造に対応させる
16. SprayChart.jsx の tooltip と警告分類を拡張する
17. テストを追加する
18. npm test / validate / build を実行する
19. 変更内容と残課題を報告する
```

---

## 42. 今回やらなくてよいこと

以下は後回しでよい。

```txt
3D描画の高度化
全球場の完全な実測壁高データ
年俸査定への反映
AIによる自由文実況
リアルタイム風向き変化
選手能力値への本格反映
スプレーチャートの高度なフィルタUI
```

---

# Phase 11：実行コマンド

実装後、以下を実行する。

```bash
npm install
npm run test -- --run src/engine/__tests__/physics.test.js
npm run test -- --run src/engine/__tests__/simulation.test.js
npm run test -- --run src/engine/__tests__/parkEffects.test.js
npm run test -- --run src/engine/__tests__/battedBallAnalysis.test.js
npm run test -- --run src/engine/__tests__/commentary.test.js
npm run validate:physics-hr
npm run build
```

存在しないテストファイルは新規作成する。

---

# Phase 12：完了条件

## 43. 初期完了条件

以下を満たしたら初期完成とする。

```txt
既存の試合進行が壊れない
既存の physicsMeta 互換フィールドが残っている
physicsMeta.park が保存される
physicsMeta.crossPark が保存される
physicsMeta.environment.environmentDeltaM が保存される
physicsMeta.environment.effectTags が保存される
physicsMeta.evaluation.tags が保存される
physicsMeta.commentary.short が保存される
postGame.js の battedBallEvents に新情報が入る
SprayChart tooltip に球場差・環境影響・実況が表示される
テストと build が通る
```

---

## 44. 理想完了条件

以下までできたら最終ゴールに近い。

```txt
選手詳細画面で球場補正HRを表示できる
本拠地で損したHR・得したHRを表示できる
向かい風で失速したHR級打球を集計できる
試合ログに自然な実況が出る
采配画面で打球理由を確認できる
スプレーチャートで他球場ならHRの打球を視覚的に確認できる
```

---

# Phase 13：実装上の注意

## 45. HR判定を距離だけに戻さない

禁止：

```js
isHomeRun = distance >= fenceDistance;
```

必ず以下を使う。

```txt
フェンス距離
壁高
フェンス地点の打球高さ
フェンス奥での打球状態
```

---

## 46. UI側で判定しない

禁止：

```txt
SprayChart.jsx 内でHR判定を再計算する
```

正しい責務：

```txt
engine 側で判定
postGame 側で表示用に整形
UI 側は表示のみ
```

---

## 47. 環境補正を強くしすぎない

避けること。

```txt
風だけでHRが大量発生する
高温だけで飛距離が極端に伸びる
高地補正でNPB全体のHR数が大きく壊れる
```

---

## 48. 既存テスト互換を維持する

現在 `simulation.test.js` は以下のテスト用 export を参照している。

```txt
_getFenceDistanceBySpray_TEST
_adjustResultByPhysics_TEST
_resolveBattedBallOutcomeFromPhysics_TEST
_checkHomeRunByTrajectory_TEST
```

関数を移設しても、これらの export は維持すること。

---

# Phase 14：Codex の報告フォーマット

作業完了後、以下の形式で報告すること。

```md
## 変更概要

-

## 変更ファイル

-

## 実装内容

### 1. 既存構造との接続

### 2. 球場別HR判定

### 3. 環境補正

### 4. 評価タグ生成

### 5. 実況文生成

### 6. postGame / SprayChart 接続

## テスト結果

```bash
実行したコマンドと結果を貼る
```

## 確認できたこと

-

## 残課題

-

## 次にやるべきこと

-
```

---

# 49. 最重要制約

今回の目的は、単にHR判定を少し正しくすることではない。

最終目的は以下。

```txt
打球物理演算
↓
球場別HR判定
↓
環境影響分析
↓
評価タグ生成
↓
実況文生成
↓
選手評価・采配画面・スプレーチャートへ接続
```

この流れを壊さず、段階的に実装すること。

特に重要なのは、1打球ごとの `physicsMeta` と `BattedBallEvent` に「結果」だけでなく「理由」を残すこと。

理由が残らない実装は不採用とする。
