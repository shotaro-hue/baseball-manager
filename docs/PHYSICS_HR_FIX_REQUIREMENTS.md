# 物理演算主導・HR過多是正 要件定義書

作成日: 2026-05-02  
対象プロジェクト: `baseball-manager`  
対象領域: 打球物理シミュレーション / HR数バランス調整  
実装担当想定: Codex  

---

## 1. 結論

本改修では、**確率テーブルでHR/二塁打/単打/アウトを直接決める方式には戻さない**。  
`BB / HBP / K / inplay` までは既存の確率モデルで決め、**インプレー後の結果は物理演算で決定する**方針を維持する。

ただし現状の実装は、以下の理由でHRが過剰発生している。

1. `generateContactEVLA()` が強いEVを出しすぎる
2. `power >= 65` でLA中心値が `8° -> 18°` に急変する
3. フェンス距離が左翼/中堅/右翼の3分割で粗く、両翼HRが出やすい
4. HR判定が「飛距離 >= フェンス距離 + 4m」のみで、フェンス通過時の高さを見ていない
5. power別HR率・チームHR/試合を監視する回帰テストが不足している

本改修の最重要ゴールは、**物理演算主導を維持しながら、HR発生率をNPB風の範囲へ収めること**である。

---

## 2. 非ゴール

以下は今回やらない。

- HR/D/S/OUT を確率テーブルで直接サンプリングする方式への全面回帰
- 投手の球種、回転数、変化量、リリース位置、コースを使った本格投球物理の導入
- 3D演出やUIの大規模変更
- 守備AIの大規模刷新
- 実在NPB Statcast相当データへの完全準拠

今回のスコープは、**野手側・打球物理側のHR過多是正**に限定する。

---

## 3. 現状コードの主要問題

### 3.1 `sampleResult()` はBB/HBP/K/inplayのみを返す

対象: `src/engine/simulation.js`

現在の `sampleResult()` は、`bb`, `hbp`, `k` だけを抽選し、それ以外は `inplay` を返す。

この設計自体は今回維持する。  
つまり、HR過多対策として `sampleResult()` を `hr/d/t/s/out` サンプリングへ戻してはいけない。

### 3.2 `generateContactEVLA()` が強すぎる

対象: `src/engine/simulation.js` / `src/constants.js`

現状の定数:

```js
EV_FLOOR: 116,
EV_POWER_SCALE: 53,
EV_STUFF_SCALE: 23,
EV_NOISE: 13,
FLY_POWER_THRESHOLD: 65,
LA_FLY_MID: 18,
LA_DEFAULT_MID: 8,
LA_NOISE: 16,
```

問題点:

- 弱い打球でもEV下限が116km/hで高すぎる
- power 65以上でLA中心値が急に18°になる
- contactQuality、詰まり、打ち損じ、ポップ、ボテボテの概念がない
- powerが高いほど「毎回HR向きの角度」になりやすい

### 3.3 `getFenceDistanceBySpray()` が3分割

対象: `src/engine/simulation.js`

現状:

```js
function getFenceDistanceBySpray(stadium, sprayAngle) {
  if (!stadium) return null;
  if (sprayAngle < 30) return stadium.lf;
  if (sprayAngle > 60) return stadium.rf;
  return stadium.cf;
}
```

問題点:

- 左翼線〜左中間、右中間〜右翼線の広さを表現できない
- 0〜30°と60〜90°がすべて両翼扱いになり、HRが出やすい
- 左中間/右中間の深さを無視している

### 3.4 HR判定が飛距離だけ

対象: `resolveBattedBallOutcomeFromPhysics()` / `adjustResultByPhysics()`

現状はおおむね以下の判定:

```js
if (distance >= fenceDistance + MIN_HR_CLEARANCE) {
  result = 'hr';
}
```

問題点:

- 低いライナーでも飛距離だけでHRになりやすい
- フェンス通過時点の高さを見ていない
- フェンス高さの概念がない

---

## 4. 改修方針

### 4.1 基本方針

今回の最有力案は、以下の4層構造である。

```txt
BB / HBP / K / inplay の判定
↓
inplayなら contactQuality を抽選
↓
contactQuality から EV / LA / sprayAngle を生成
↓
弾道計算 + 連続フェンス距離 + フェンス通過時高さでHR判定
↓
HRでなければ、打球種別・距離・捕球率で S/D/T/OUT を決定
```

重要なのは、HR率を直接確率で決めるのではなく、**HRになりやすい打球品質の出現頻度を制御する**ことである。

---

## 5. 必須要件

## 要件1: `contactQuality` を導入する

### 目的

すべてのインプレーが強い打球になる状態をやめ、以下の打球品質を導入する。

```txt
weak    : 詰まり、ボテボテ、ポップ、泳ぎ
normal  : 普通の打球
solid   : 良い接触
hard    : 強い打球
barrel  : HR候補の理想接触
```

### 実装要件

`src/engine/simulation.js` に以下のような関数を追加する。

```js
function sampleContactQuality(batter, pitcher, rngProvider = rngf) {
  // returns 'weak' | 'normal' | 'solid' | 'hard' | 'barrel'
}
```

### 設計ルール

- powerは `hard` / `barrel` 率を上げる
- contactは `weak` 率を下げ、`solid` 率を少し上げる
- 投手stuffは今回は軽く残してよいが、投手本格物理には踏み込まない
- 強打者でも `barrel` は最大でも10%前後に抑える
- 平均打者の `barrel` は2〜4%程度を目安にする

### 初期値目安

```txt
平均打者 power=50/contact=50 vs 平均投手:
weak    30〜40%
normal  30〜35%
solid   18〜24%
hard     8〜14%
barrel   2〜4%

強打者 power=85/contact=60 vs 平均投手:
weak    22〜32%
normal  25〜32%
solid   20〜26%
hard    14〜22%
barrel   5〜9%
```

---

## 要件2: `generateContactEVLA()` をcontactQualityベースに置換する

### 目的

現状の `EV_FLOOR + powerScale` 方式を廃止し、打球品質ごとにEV/LA分布を変える。

### 実装要件

既存の `generateContactEVLA(batter, pitcher)` は維持してよいが、内部実装を以下の責務へ変更する。

```js
function generateContactEVLA(batter, pitcher, options = {}) {
  const quality = sampleContactQuality(batter, pitcher, options.rngProvider);
  // quality に基づいて ev / la を生成する
  return { ev, la, quality };
}
```

### EV/LAレンジ目安

| quality | EV目安 km/h | LA目安 | 説明 |
|---|---:|---:|---|
| weak | 55〜115 | -20〜55 | 詰まり、ゴロ、ポップを含む |
| normal | 95〜140 | -10〜30 | 通常接触 |
| solid | 120〜155 | 0〜32 | 良い接触 |
| hard | 135〜170 | 5〜35 | 強い打球 |
| barrel | 145〜190 | 18〜34 | HR候補 |

### 重要制約

- `EV_FLOOR: 116` のような高すぎる下限は廃止する
- powerによってLA中心値を急変させない
- powerは主にEV上限と `hard/barrel` 率へ効かせる
- contactは `weak` 抑制、EV下振れ抑制へ効かせる
- `generateContactEVLA()` の戻り値に `quality` を含める

---

## 要件3: `PHYSICS_BAT` 定数を再設計する

対象: `src/constants.js`

既存の `PHYSICS_BAT` を、contactQuality方式に合わせて整理する。

### 推奨構成

```js
export const PHYSICS_BAT = {
  CONTACT_QUALITY: {
    WEAK_BASE: 0.36,
    HARD_BASE: 0.12,
    BARREL_BASE: 0.025,
    BARREL_MAX: 0.10,
  },

  EV: {
    MIN: 50,
    MAX: 190,
    POWER_TO_HARD_EV: 0.35,
    POWER_TO_BARREL_EV: 0.42,
    CONTACT_WEAK_REDUCTION: 0.18,
  },

  LA: {
    MIN: -25,
    MAX: 55,
    WEAK_OPTIONS: [-10, 3, 45],
    NORMAL_MID: 6,
    SOLID_MID: 11,
    HARD_MID: 15,
    BARREL_MID: 24,
  },

  HR: {
    MIN_CLEARANCE: 0,
    WALL_HEIGHT: 3.2,
  },
};
```

既存テスト互換の都合で完全な入れ替えが難しい場合は、旧定数を残してもよい。  
ただし、実際のEV/LA生成では新方式を使うこと。

---

## 要件4: フェンス距離を連続補間にする

### 目的

左中間・右中間の深さを反映し、両翼扱いによるHR過多を抑える。

### 実装要件

`getFenceDistanceBySpray(stadium, sprayAngle)` を3分割から連続補間へ変更する。

推奨仕様:

```txt
sprayAngle = 0   -> LF
sprayAngle = 45  -> CF
sprayAngle = 90  -> RF
0〜45 は LF から CF へ滑らかに補間
45〜90 は CF から RF へ滑らかに補間
```

実装例:

```js
function getFenceDistanceBySpray(stadium, sprayAngle) {
  if (!stadium) return null;

  const angle = clamp(Number(sprayAngle), 0, 90);
  const lf = Number(stadium.lf);
  const cf = Number(stadium.cf);
  const rf = Number(stadium.rf);

  if (![lf, cf, rf].every(Number.isFinite)) return null;

  if (angle <= 45) {
    const t = angle / 45;
    return lf + (cf - lf) * Math.sin(t * Math.PI / 2);
  }

  const t = (angle - 45) / 45;
  return cf + (rf - cf) * (1 - Math.cos(t * Math.PI / 2));
}
```

### テスト要件

- `angle=0` で `lf`
- `angle=45` で `cf`
- `angle=90` で `rf`
- `angle=22.5` は `lf` より大きく `cf` より小さい
- `angle=67.5` は `rf` より大きく `cf` より小さい

---

## 要件5: HR判定を「フェンス通過時の高さ」に変更する

### 目的

低いライナーや、地面到達後の飛距離だけでHR扱いになる問題を防ぐ。

### 実装要件

`simulateFlight()` の `trajectory.points` を使い、フェンス地点での高さを判定する関数を追加する。

```js
function isHomeRunByTrajectory(points, fenceDistance, wallHeight = PHYSICS_BAT.HR.WALL_HEIGHT) {
  // points の形式に合わせて実装する
  // フェンス距離に到達する前後の2点を線形補間し、yAtFence >= wallHeight なら true
}
```

### 注意

`points` の形式は既存の `simulateFlight()` の戻り値に合わせること。  
配列形式が `[x, y]` でない場合は、既存構造を確認してから実装する。

### 判定ルール

HR条件は以下。

```txt
1. 打球がフェンス距離まで到達している
2. フェンス距離地点の高さが wallHeight 以上
```

`distance >= fenceDistance + 4` のような距離だけの判定は廃止する。

---

## 要件6: `resolveBattedBallOutcomeFromPhysics()` を新仕様へ接続する

対象: `src/engine/simulation.js`

### 変更前

```txt
generateContactEVLA()
↓
simulateFlight()
↓
distance >= fenceDistance + MIN_HR_CLEARANCE ならHR
```

### 変更後

```txt
generateContactEVLA() -> { ev, la, quality }
↓
simulateFlight(ev, la)
↓
continuous getFenceDistanceBySpray()
↓
isHomeRunByTrajectory()
↓
HRでなければ estimateFielderIntercept() で S/D/T/OUT
```

### physicsMeta要件

`physicsMeta` には最低限以下を含める。

```js
physicsMeta: {
  ev,
  la,
  distance,
  sprayAngle,
  trajectory,
  ballType,
  quality,
  fenceDistance,
  isHrByTrajectory,
}
```

これにより、後からHR過多の原因をログで追えるようにする。

---

## 要件7: `adjustResultByPhysics()` の扱いを整理する

現状の `adjustResultByPhysics()` は、確率テーブルで出た `hr/d/s/out` を物理補正する前提の関数である。  
今回の方針では、インプレー結果は `resolveBattedBallOutcomeFromPhysics()` が決めるため、`adjustResultByPhysics()` は主役ではなくなる。

### 要件

- 既存テストやログ互換のために関数を残してよい
- ただし新しい本線ロジックでは、HR判定に `adjustResultByPhysics()` を使わない
- 残す場合も、内部で `getFenceDistanceBySpray()` の連続補間を使う
- `dist >= fence + 4` だけでHRに昇格する仕様は避ける

---

## 要件8: Monte Carlo検証を追加/更新する

対象候補:

- `scripts/monte-carlo-validate.js`
- 新規 `scripts/validate-physics-hr.js`
- `src/engine/__tests__/simulation.test.js`

### 必須KPI

以下を出力する。

```txt
PA数
インプレー数
HR/PA
HR/BIP
team HR/game換算
power別 HR/BIP
quality別 出現率
quality別 HR率
平均EV
平均LA
平均飛距離
```

### 目標レンジ

初期の合格目安:

| 指標 | 目標 |
|---|---:|
| 平均打者 HR/BIP | 1〜3% |
| power 70 HR/BIP | 3〜6% |
| power 80 HR/BIP | 5〜9% |
| power 90 HR/BIP | 7〜12% |
| team HR/game | 0.6〜1.2本 |
| 上位打者 年間HRペース | 25〜45本 |
| 異常上振れ上限 | 55本前後 |

### NGレンジ

以下なら失敗扱い。

```txt
power 70 HR/BIP > 10%
power 80 HR/BIP > 14%
power 90 HR/BIP > 18%
team HR/game > 1.5
平均打者 HR/BIP < 0.5%
power 90 HR/BIP < 4%
```

### 推奨コマンド

```bash
npm test
node scripts/validate-physics-hr.js
npm run build
```

---

## 6. 受け入れ条件

Codexは以下を満たしたら完了とする。

### 機能条件

- [ ] `sampleResult()` は `bb/hbp/k/inplay` 方式を維持している
- [ ] `generateContactEVLA()` が `quality` を返す
- [ ] `contactQuality` に `weak/normal/solid/hard/barrel` がある
- [ ] power 65でLAが急上昇する仕様が消えている
- [ ] EV下限が116km/h固定ではなくなっている
- [ ] フェンス距離が連続補間になっている
- [ ] HR判定がフェンス通過時の高さを使っている
- [ ] `physicsMeta` に `quality`, `fenceDistance`, `isHrByTrajectory` が含まれる

### テスト条件

- [ ] `npm test` が通る
- [ ] `npm run build` が通る
- [ ] power別HR/BIPのMonte Carlo検証スクリプトがある
- [ ] power 70/80/90 のHR/BIPがNGレンジに入っていない
- [ ] `getFenceDistanceBySpray()` の連続補間テストがある
- [ ] `isHomeRunByTrajectory()` の単体テストがある

### バランス条件

- [ ] 平均打者がHRを打たなすぎない
- [ ] 強打者の優位性が残っている
- [ ] power 65付近でHR率が不連続に跳ねない
- [ ] HR以外の二塁打・単打・アウトが極端に崩れていない

---

## 7. 実装順序

Codexは以下の順に作業すること。

### Step 1: 現状確認

- `src/engine/simulation.js` の以下を確認
  - `sampleResult()`
  - `generateContactEVLA()`
  - `getFenceDistanceBySpray()`
  - `resolveBattedBallOutcomeFromPhysics()`
  - `adjustResultByPhysics()`
- `src/constants.js` の `PHYSICS_BAT` を確認
- `src/engine/physics.js` の `simulateFlight()` の戻り値構造を確認

### Step 2: contactQuality導入

- `sampleContactQuality()` を追加
- `generateContactEVLA()` をqualityベースに変更
- 戻り値に `quality` を追加
- 既存テストの期待値を新仕様に合わせて修正

### Step 3: フェンス距離補間

- `getFenceDistanceBySpray()` を連続補間へ変更
- 単体テストを更新

### Step 4: HR判定変更

- `isHomeRunByTrajectory()` を追加
- `resolveBattedBallOutcomeFromPhysics()` に接続
- `physicsMeta` を拡張

### Step 5: Monte Carlo検証

- `scripts/validate-physics-hr.js` を追加または `scripts/monte-carlo-validate.js` を更新
- power別HR/BIPとquality別HR率を出力

### Step 6: 調整

- HRが多い場合は、以下の順で調整
  1. `barrel` 率を下げる
  2. `hard` のLA中心を下げる
  3. `barrel` のLA範囲を狭める
  4. EV上限ではなく、quality出現率を調整する
- HRが少ない場合は、以下の順で調整
  1. `barrel` 率を少し上げる
  2. `barrel` のEV中心を少し上げる
  3. `hard` からのHR余地を少し増やす

---

## 8. 実装時の注意点

### 8.1 乱数注入を可能にする

テストの再現性確保のため、以下の関数は `rngProvider` を受け取れる形が望ましい。

```js
sampleContactQuality(batter, pitcher, rngProvider)
generateContactEVLA(batter, pitcher, options)
resolveBattedBallOutcomeFromPhysics(batter, pitcher, stadium, environment, options)
```

既存の `rngf` を使ってよいが、テスト時は固定乱数を注入できるようにする。

### 8.2 既存UIを壊さない

`processAtBat()` やUI側が `ev`, `la`, `dist` を参照している可能性がある。  
戻り値の既存プロパティ名は維持する。

```js
ev
la
dist
physicsMeta
```

### 8.3 `quality` は表示に使えるが、今回UI実装は不要

`quality` はログ・デバッグ用に返すだけでよい。  
UI表示は今回の必須範囲ではない。

### 8.4 投手側の大改修はしない

投手能力は既存の `velocity/breaking/control` を軽く使ってよい。  
ただし、球種物理・コース物理・回転数・変化量の導入は今回しない。

---

## 9. Codex向け実装プロンプト

以下をCodexに渡す。

```txt
このリポジトリの docs/PHYSICS_HR_FIX_REQUIREMENTS.md を読んで、物理演算主導のままHR過多を是正してください。

重要方針:
- sampleResult() を HR/D/S/OUT サンプリングへ戻さないでください。
- BB/HBP/K/inplay までは既存の確率モデルでよいです。
- inplay後の結果は resolveBattedBallOutcomeFromPhysics() が物理演算で決める方針を維持してください。
- 最優先は generateContactEVLA() を contactQuality ベースへ置換することです。
- 次に getFenceDistanceBySpray() を連続補間へ変更してください。
- 次に HR判定を distance >= fence + clearance から、フェンス通過時高さ判定へ変更してください。
- physicsMeta に quality, fenceDistance, isHrByTrajectory を追加してください。
- power別HR/BIPを検証できる Monte Carlo スクリプトを追加してください。

完了条件:
- npm test が通る
- npm run build が通る
- power 70 HR/BIP が 10%を超えない
- power 80 HR/BIP が 14%を超えない
- power 90 HR/BIP が 18%を超えない
- 強打者のHR優位性は残す

作業後、変更ファイル、テスト結果、Monte Carlo結果、未解決リスクを簡潔に報告してください。
```

---

## 10. 最終判断

今回の改修で最も重要なのは、**HRを直接減らすことではなく、HRになり得る打球の発生頻度を現実的にすること**である。

したがって、最優先修正は以下。

```txt
1. contactQuality導入
2. EV/LA生成の全面改修
3. フェンス距離の連続補間
4. フェンス通過時高さによるHR判定
5. power別HR/BIPの回帰テスト
```

この順番を守れば、物理演算主導の思想を維持したまま、異常なHR数を抑制できる可能性が高い。
