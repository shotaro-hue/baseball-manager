# 要件定義書：物理演算シミュレーション・スプレーチャート改善

## 1. 目的

Baseball Manager の打球物理演算およびスプレーチャート表示を改善する。

現在、物理演算によるホームラン判定は改善されているが、以下の問題が残っている。

- スプレーチャート上で球場ごとのフェンス距離差が見えにくい
- `windOut` の単位が曖昧で、風の影響が過大になる可能性がある
- `airDensity` / `temperatureC` / `altitudeM` が環境値として存在するが、物理計算に十分反映されていない
- HR判定ロジックの回帰テストが不足している
- UI上で「HRなのにフェンス内側に表示される」ようなデータ不整合を検出できない

本改修では、HR判定・打球飛距離・球場差・スプレーチャート表示の整合性を高める。

---

## 2. 対象ファイル

主な対象ファイルは以下。

- `src/engine/physics.js`
- `src/engine/simulation.js`
- `src/engine/postGame.js`
- `src/components/tabs/SprayChart.jsx`
- `src/engine/__tests__/physics.test.js`
- `src/engine/__tests__/simulation.test.js`

既存構成が異なる場合は、同等の責務を持つファイルを対象にする。

---

## 3. 改修優先順位

| 優先 | 改修内容 | 理由 |
|---:|---|---|
| 1 | スプレーチャートの正規化を固定最大距離方式にする | 球場差・フェンス手前/超えの見た目が正しくなる |
| 2 | `windOut` の単位を `km/h` に統一し、物理計算時に `m/s` へ変換する | 風の影響が過大になることを防ぐ |
| 3 | `airDensity` / `temperatureC` / `altitudeM` を抗力計算に反映する | 環境要素が実際の飛距離に影響するようにする |
| 4 | `checkHomeRunByTrajectory` の単体テストを追加する | HR誤判定の再発を防ぐ |
| 5 | `SprayChart` に不整合検出警告を追加する | 将来のデータ不整合をUI上で発見できるようにする |

---

## 4. 要件1：スプレーチャートの正規化を固定最大距離方式にする

### 現状の問題

現在、スプレーチャートの表示距離が以下のように打球ごとのフェンス距離に依存している。

```js
const maxDisplayDistance = Math.max(110, safeFenceDistance * 1.18);
```

この方式だと、フェンス距離が異なる球場でもチャート上のフェンス比率がほぼ固定される。

例：

- 神宮 97m
- 甲子園 CF 118m
- バンテリン CF 122m

これらの球場差が画面上で見えづらくなる。

### 改修方針

スプレーチャートの最大表示距離を固定値にする。

推奨値：

```js
const SPRAY_CHART_MAX_DISTANCE = 150;
```

### 実装要件

`src/engine/postGame.js` で、打球ごとの `maxDisplayDistance` を固定値に変更する。

修正イメージ：

```js
const SPRAY_CHART_MAX_DISTANCE = 150;

const maxDisplayDistance = SPRAY_CHART_MAX_DISTANCE;
const displayDistance = Math.min(distance, maxDisplayDistance);
const distanceRatio = displayDistance / maxDisplayDistance;
const fenceRatio = safeFenceDistance / maxDisplayDistance;
```

### 期待挙動

- 97mフェンスは、122mフェンスより内側に表示される
- 球場ごとの広さがスプレーチャート上で比較できる
- フェンス手前の打球とフェンス超えの打球が視覚的に判別しやすくなる

### 受け入れ条件

- `fenceDistance = 97` の場合、`fenceRatio = 97 / 150`
- `fenceDistance = 122` の場合、`fenceRatio = 122 / 150`
- すべての打球で `maxDisplayDistance` が原則 `150` になる
- HR打球がフェンス外側、非HR打球がフェンス内側に表示される傾向が強まる
- 既存UIが崩れない

---

## 5. 要件2：`windOut` の単位を `km/h` に統一する

### 現状の問題

`physics.js` で、EVは `km/h` から `m/s` に変換されている一方、`windOut` はそのまま速度に加算されている可能性がある。

現状例：

```js
const windOut = environment.windOut;
let vx = evMs * Math.cos(laRad) + windOut;
```

この場合、`windOut = 10` が `10m/s` として扱われる。  
これは `36km/h` に相当し、ゲーム内の風としては強すぎる。

### 改修方針

外部入力・UI・設定値としての `windOut` は `km/h` に統一する。  
物理計算内部では `m/s` に変換して使用する。

### 実装要件

`src/engine/physics.js` で以下のように変換する。

```js
const windOutKmh = environment.windOut ?? 0;
const windOutMs = windOutKmh / 3.6;
```

使用箇所：

```js
let vx = evMs * Math.cos(laRad) + windOutMs;
```

### 命名ルール

可能であれば、変数名を明確化する。

推奨：

```js
windOutKmh
windOutMs
```

避ける：

```js
windOut
wind
```

### 受け入れ条件

- `windOut = 10` は `10km/h` として扱われる
- 物理計算内部では `2.777...m/s` として使用される
- `windOut = 10` で飛距離が極端に伸びすぎない
- 既存の `sanitizeEnvironment` の範囲チェックと矛盾しない

---

## 6. 要件3：環境パラメータを抗力計算に反映する

### 現状の問題

以下の環境パラメータが存在するが、飛距離計算への影響が弱い、または未使用の可能性がある。

- `airDensity`
- `temperatureC`
- `altitudeM`

このままだと、以下の表現ができない。

- 高地では打球が伸びる
- 気温が高い日は打球が伸びやすい
- 空気密度が高い日は打球が伸びにくい

### 改修方針

抗力係数、または抗力計算に使う空気密度補正として環境値を反映する。

優先度は以下。

1. `airDensity` を直接反映
2. `temperatureC` から簡易的に空気密度補正
3. `altitudeM` から簡易的に空気密度補正

### 実装方針

既存の `dragCoeff` または抗力計算部分に、環境補正係数を追加する。

例：

```js
const baseAirDensity = 1.225; // kg/m^3 at sea level, 15C
const airDensityRatio = environment.airDensity
  ? environment.airDensity / baseAirDensity
  : 1;

const temperatureRatio = 288.15 / (273.15 + environment.temperatureC);
const altitudeRatio = Math.exp(-environment.altitudeM / 8500);

const environmentDragMultiplier =
  airDensityRatio * temperatureRatio * altitudeRatio;
```

ただし、二重補正にならないように注意する。  
`airDensity` を直接指定している場合は、`temperatureC` と `altitudeM` の補正を重ねすぎないこと。

### 推奨仕様

以下のどちらかを採用する。

#### A案：`airDensity` 優先方式

```js
const baseAirDensity = 1.225;

let airDensity = environment.airDensity;

if (!Number.isFinite(airDensity)) {
  const tempK = 273.15 + environment.temperatureC;
  const seaLevelDensityAtTemp = baseAirDensity * (288.15 / tempK);
  const altitudeMultiplier = Math.exp(-environment.altitudeM / 8500);
  airDensity = seaLevelDensityAtTemp * altitudeMultiplier;
}

const airDensityRatio = airDensity / baseAirDensity;
```

この `airDensityRatio` を抗力計算に反映する。

#### B案：簡易ゲーム補正方式

```js
const tempBonus = (environment.temperatureC - 15) * -0.003;
const altitudeBonus = environment.altitudeM * -0.00004;
const densityBonus = environment.airDensity
  ? (environment.airDensity / 1.225 - 1)
  : 0;

const dragEnvironmentMultiplier = clamp(
  1 + tempBonus + altitudeBonus + densityBonus,
  0.85,
  1.15
);
```

ゲームバランス重視ならB案でもよい。

### 推奨

今回は **A案：airDensity優先方式** を採用する。  
理由は、物理演算シミュレーションとしての説明可能性が高いから。

### 受け入れ条件

- `temperatureC` が高いほど、同じEV/LAでも飛距離がわずかに伸びる
- `altitudeM` が高いほど、同じEV/LAでも飛距離がわずかに伸びる
- `airDensity` が高いほど、同じEV/LAでも飛距離が短くなる
- 補正幅が極端にならない
- 既存の打高・打低バランスが大きく壊れない

---

## 7. 要件4：HR判定の単体テストを追加する

### 対象関数

主に以下。

```js
checkHomeRunByTrajectory()
```

または同等のHR判定関数。

### テスト観点

最低限、以下をテストする。

#### ケース1：飛距離はフェンス距離を超えるが、高さ不足で非HR

条件例：

- `distanceM`: 126
- `fenceDistanceM`: 122
- `wallHeightM`: 3.5
- `yAtFence`: wallHeight未満

期待：

```js
isHomeRun === false
```

#### ケース2：フェンス地点で壁高を超え、フェンス奥でも浮いているのでHR

条件例：

- `distanceM`: 132
- `fenceDistanceM`: 122
- `wallHeightM`: 3.5
- `yAtFence`: wallHeight以上
- `yAtFencePlus3m`: 0.5以上

期待：

```js
isHomeRun === true
```

#### ケース3：フェンス手前で着地している打球は非HR

条件例：

- `distanceM`: 118
- `fenceDistanceM`: 122

期待：

```js
isHomeRun === false
```

#### ケース4：壁高が高い球場ではHRになりにくい

条件例：

- 同じ打球条件
- `wallHeightM = 1.0` ではHR
- `wallHeightM = 5.0` では非HR

期待：

```js
lowWallResult.isHomeRun === true
highWallResult.isHomeRun === false
```

### 受け入れ条件

- `npm run test -- --run src/engine/__tests__/simulation.test.js` が通る
- HR判定が単純な `distance >= fenceDistance` に戻っていない
- フェンス距離、壁高、軌道高さを使った判定になっている

---

## 8. 要件5：スプレーチャートに不整合検出警告を追加する

### 目的

以下のような矛盾をUIまたは開発用ログで検出する。

- HRなのにフェンス内側に表示されている
- 非HRなのにフェンス外側に表示されている
- `distanceRatio` が異常
- `fenceRatio` が異常
- `fenceDistance` が未定義または不正

### 実装方針

`SprayChart.jsx` 側、または `postGame.js` の整形処理で警告フラグを付与する。

例：

```js
const isDisplayInconsistent =
  result === 'HR' && distanceRatio < fenceRatio;
```

または：

```js
const isLikelyInconsistent =
  isHomeRun === true && landingDistanceM < fenceDistanceM;
```

ただし、HR判定は弾道高さを加味するため、単純な距離比較だけでエラー扱いしないこと。  
表示上の検出はあくまで「警告」とする。

### 推奨データ項目

各打球に以下を持たせる。

```js
{
  distanceM,
  fenceDistanceM,
  wallHeightM,
  distanceRatio,
  fenceRatio,
  isHomeRun,
  isDisplayInconsistent,
  warningReason
}
```

### UI表示案

開発中は、チャート下部に警告件数を表示する。

例：

```txt
表示警告: 3件
- HR打球がフェンス内側に表示されています
- fenceDistanceM が不正です
```

本番UIで邪魔になる場合は、開発モードのみ表示でもよい。

### 受け入れ条件

- 不整合がある場合、警告件数が表示される
- 正常な打球では警告が出ない
- 警告はゲーム進行を止めない
- UI崩れが起きない

---

## 9. 非機能要件

### 9.1 既存挙動の維持

以下は壊さないこと。

- 試合進行
- 打席結果生成
- 既存のスプレーチャート表示
- box score / game log / post game summary
- 既存テスト

### 9.2 パフォーマンス

物理演算は大量の打球で実行されるため、重すぎる処理を追加しない。

目安：

- 1打球あたりの追加計算は軽量な算術処理に留める
- UI側で毎フレーム大量再計算しない
- 必要なら `postGame.js` 側で事前整形する

### 9.3 数値の安全性

以下を徹底する。

- `NaN` を出さない
- `Infinity` を出さない
- `null` / `undefined` に耐える
- 極端な入力値は `clamp` する

---

## 10. 実装後に実行するコマンド

以下を順番に実行する。

```bash
npm install
npm run test -- --run src/engine/__tests__/physics.test.js
npm run test -- --run src/engine/__tests__/simulation.test.js
npm run build
```

プロジェクトに以下のスクリプトが存在する場合は追加で実行する。

```bash
npm run validate:physics-hr
npm run qa
npm run lint
```

存在しないスクリプトは無理に追加しなくてよい。  
ただし、HR判定の検証スクリプトが既にある場合は必ず実行する。

---

## 11. 完了条件

以下をすべて満たしたら完了とする。

- スプレーチャートの最大表示距離が固定値ベースになっている
- 球場ごとのフェンス距離差がチャート上で表現される
- `windOut` が `km/h` 入力、`m/s` 内部計算に統一されている
- `airDensity` / `temperatureC` / `altitudeM` が飛距離に反映されている
- HR判定の単体テストが追加されている
- 「フェンス手前なのにHR表示」系の不整合を検出できる
- `npm run build` が成功する
- 既存テストが失敗しない

---

## 12. 注意点

### 12.1 HR判定を距離だけに戻さないこと

以下のような単純判定に戻してはいけない。

```js
isHomeRun = distance >= fenceDistance;
```

HR判定には最低限、以下を使う。

- フェンス距離
- フェンス地点の打球高さ
- 壁高
- フェンス奥での打球状態

### 12.2 スプレーチャート表示とHR判定を混同しないこと

スプレーチャートは可視化であり、最終HR判定の根拠ではない。

正しい責務分担：

- `physics.js`: 打球軌道・飛距離計算
- `simulation.js`: HR判定
- `postGame.js`: 表示用データ整形
- `SprayChart.jsx`: 表示

### 12.3 物理補正を強くしすぎないこと

環境補正はゲームバランスを壊しやすい。

特に以下は注意。

- 追い風でHRが増えすぎる
- 高地補正で打高になりすぎる
- 気温補正で夏場だけ極端にHRが増える

初期実装では、補正幅を控えめにすること。

---

## 13. Codexへの作業指示

以下の順で作業すること。

1. 現在の `physics.js` / `simulation.js` / `postGame.js` / `SprayChart.jsx` を読み、関連関数を特定する
2. スプレーチャートの距離正規化を固定最大距離方式へ変更する
3. `windOut` の単位を `km/h` に統一し、内部計算では `m/s` に変換する
4. 環境パラメータを抗力計算へ反映する
5. HR判定の単体テストを追加する
6. スプレーチャート不整合警告を追加する
7. テストとビルドを実行する
8. 変更内容、影響範囲、テスト結果を報告する

---

## 14. Codexへの出力要求

作業完了後、以下の形式で報告すること。

````md
## 変更概要

- 

## 変更ファイル

- 

## 実装内容

### 1. スプレーチャート正規化

### 2. windOut単位統一

### 3. 環境パラメータ反映

### 4. HR判定テスト

### 5. 不整合警告

## テスト結果

```bash
実行したコマンドと結果を貼る
```

## 残課題

- 
````

---

## 15. 最重要制約

今回の目的は「見た目だけの修正」ではない。

必ず以下の整合性を取ること。

```txt
物理演算の打球軌道
↓
HR判定
↓
postGame用データ整形
↓
スプレーチャート表示
↓
UI上の警告・検証
```

この流れが一貫していない修正は不採用とする。
