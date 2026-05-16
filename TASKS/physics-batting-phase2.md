---
task-id: physics-batting-phase2
type: feature
commit-prefix: feat
created: 2026-04-30
roadmap-item: "物理演算打撃シミュレーション Phase 2"
---

# Task: 物理演算打撃シミュレーション Phase 2

## 背景・目的

Phase 1 で打者能力×投手 stuff から EV/LA を先行生成する基盤を実装した。
しかし、2つの問題が残っている：
1. **dragCoeff が大きすぎて飛距離を25%ほど過少評価**（EV=100mph/LA=25°→現在90m、期待値~115m）
2. **result='hr' のときでも LA が低く生成されると弾道と結果が矛盾する**

Phase 2では「EV/LA → 物理シム → フェンス距離比較 → 結果補正」のループを完成させ、
物理演算が試合結果に実際に影響する状態にする。

## 機能説明

1. `physicsConstants.js` の `dragCoeff` を再調整し、EV=100mph/LA=25°で約115mになるようにする
2. `simulation.js` の `generateContactEVLA` 後に `result` に応じた LA クランプ後処理を追加する
   - `result='hr'` → la を [22, 38] にクランプ
   - `result='d'`  → la を [10, 28] にクランプ
   - `result='t'`  → la を [5, 22] にクランプ
   - `result='s'`  → la を [3, 22] にクランプ
   - `result` が out/sf 系 → la は既存通り（クランプなし）
3. `applyStadiumFactor` 呼び出し後、`dist` と球場フェンス距離を比較して HR/D 変換を行う
   - `dist >= fenceDistance` かつ `result` が 'd' → 'hr' に昇格
   - `dist < fenceDistance` かつ `result` が 'hr' → 'd' に降格
   - `fenceDistance` は `sprayAngle < 30` → `stadium.lf`、`> 60` → `stadium.rf`、それ以外 → `stadium.cf`
   - この変換は quickSim・tactical 両方に適用する
4. 上記変換後、HR/D が変わった場合は走者進塁・得点を再計算しない（logEntry への記録のみ補正する）
   ※ 走塁への影響は Phase 3 で対応
5. `physics.test.js` に飛距離精度・LA後処理・HR↔D変換の回帰テストを追加する

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/physicsConstants.js` | `dragCoeff` の現在値（0.008）を確認して修正する |
| `src/engine/physics.js` | `simulateFlight()` の実装全体（78行）を把握する |
| `src/engine/simulation.js` | `generateContactEVLA`（165行付近）と `processAtBat` 内の EV/LA→dist 計算（598〜604行付近）を把握する |
| `src/engine/simulation.js` | `applyStadiumFactor`（238行付近）と `STADIUMS`（76行付近）の構造を確認する |
| `src/constants.js` | `PHYSICS_BAT` 定数ブロック（末尾付近）を確認する |
| `src/engine/__tests__/physics.test.js` | 既存テスト4件を確認してから追加する |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/engine/physicsConstants.js` | Modify | `dragCoeff` を調整する（下記 Step 1 参照） |
| `src/engine/simulation.js` | Modify | LA クランプ後処理と dist補正ロジックを追加する |
| `src/engine/__tests__/physics.test.js` | Modify | 飛距離精度・LA後処理・HR変換のテストを追加する |

## 実装ガイダンス

### Step 1: dragCoeff キャリブレーション（`src/engine/physicsConstants.js`）

目標値：`calcBallDist(100, 25)` が 110〜120m を返すこと。

現在 `dragCoeff: 0.008` は大きすぎる。以下のロジックで探索する。

```js
// Node.js で確認するコマンド（実装前に手元で確認すること）
// node -e "... calcDist(100, 25) が 110〜120 になる dragCoeff を二分探索"
```

目安として `dragCoeff: 0.0047` 付近が期待値に近い。
ただし以下の条件をすべて満たす値を選ぶこと：

- `calcBallDist(100, 25)` → 110〜120m
- `calcBallDist(110, 28)` → 125〜138m（典型的な HR 飛距離）
- `calcBallDist(85, 5)`   → 30〜55m（ゴロ）
- `calcBallDist(95, 12)`  → 75〜100m（ライナー）

`sampleInterval` や `maxSteps` は変更しない。

### Step 2: LA クランプ後処理（`src/engine/simulation.js`）

`generateContactEVLA` 呼び出し直後（598行付近）に `result` に応じた LA クランプを追加する。

```js
// 既存コード（変更前）
let ev = 0, la = 0;
if (!['k', 'bb', 'hbp'].includes(result)) {
  ({ ev, la } = generateContactEVLA(batter, pitcher));
}

// 変更後
let ev = 0, la = 0;
if (!['k', 'bb', 'hbp'].includes(result)) {
  ({ ev, la } = generateContactEVLA(batter, pitcher));
  // Phase 2: result に合わせて LA を後処理クランプ
  if      (result === 'hr') la = clamp(la, PHYSICS_BAT.LA_HR_MIN, PHYSICS_BAT.LA_HR_MAX);
  else if (result === 'd')  la = clamp(la, PHYSICS_BAT.LA_D_MIN,  PHYSICS_BAT.LA_D_MAX);
  else if (result === 't')  la = clamp(la, PHYSICS_BAT.LA_T_MIN,  PHYSICS_BAT.LA_T_MAX);
  else if (result === 's')  la = clamp(la, PHYSICS_BAT.LA_S_MIN,  PHYSICS_BAT.LA_S_MAX);
}
```

`PHYSICS_BAT` に以下の定数を `src/constants.js` へ追加する：

```js
// src/constants.js の PHYSICS_BAT ブロックに追記
LA_HR_MIN: 22, LA_HR_MAX: 38,   // ホームラン帯
LA_D_MIN:  10, LA_D_MAX:  28,   // 二塁打帯
LA_T_MIN:   5, LA_T_MAX:  22,   // 三塁打帯
LA_S_MIN:   3, LA_S_MAX:  22,   // 単打帯
```

### Step 3: dist vs フェンス距離による HR/D 補正（`src/engine/simulation.js`）

LA クランプ後に `dist` を計算し、球場フェンス距離と比較して `result` を補正する。
**この補正は `applyStadiumFactor` 呼び出し後に行う。**

```js
// 変更前（604行付近）
const dist = ev > 0 ? calcBallDist(ev, la) : 0;
const sprayAngle = ev > 0 ? calcSprayAngle(result) : 45;
const logEntry = { ..., result, ... };

// 変更後
const dist = ev > 0 ? calcBallDist(ev, la) : 0;
const sprayAngle = ev > 0 ? calcSprayAngle(result) : 45;

// 物理補正: dist と球場フェンスを比較して HR/D を補正
let physResult = result;
if (stadium && dist > 0 && (result === 'hr' || result === 'd')) {
  const fenceDist = sprayAngle < 30 ? stadium.lf : sprayAngle > 60 ? stadium.rf : stadium.cf;
  if (result === 'hr' && dist < fenceDist) physResult = 'd';
  if (result === 'd'  && dist >= fenceDist + 8) physResult = 'hr';
}

const logEntry = { ..., result: physResult, ... };
```

**注意点：**
- `stadium` 変数は `situation.stadium ? STADIUMS[situation.stadium] : null` で既に `processAtBat` 内にある（261行付近）。`situation` が `physResult` の計算箇所よりも前で定義されていることを確認してから使う。
- `physResult` が 'hr' → 'd' に変わっても走塁処理（`handleHit` 等）はすでに `result` で実行済みのため、logEntry の記録のみを補正する（走塁の遡及訂正は Phase 3 スコープ）。
- `result` が 'hr' → 'd' に変わった場合は `rbi` も遡及変更しない（同上）。

### Step 4: テスト追加（`src/engine/__tests__/physics.test.js`）

既存 4 件の `describe` ブロックの末尾に以下を追加する：

```js
it('dragCoeff calibration: EV=100mph LA=25° lands 110-120m', () => {
  const d = calcBallDist(100, 25);
  expect(d).toBeGreaterThanOrEqual(110);
  expect(d).toBeLessThanOrEqual(120);
});

it('HR-range EV/LA clears typical NPB CF fence', () => {
  // 平均的な CF フェンス 122m に対して HRになるEV/LAであること
  const d = calcBallDist(108, 30);
  expect(d).toBeGreaterThanOrEqual(122);
});

it('groundball LA does not clear fence', () => {
  const d = calcBallDist(95, 5);
  expect(d).toBeLessThan(90);
});
```

## データモデル変更

なし（logEntry の `result` フィールドは既存のまま。Phase 2 では値が補正されるだけ）。

## 受け入れ条件

- [ ] `calcBallDist(100, 25)` が 110〜120m を返す
- [ ] `result='hr'` のとき生成される `la` が必ず 22〜38° に収まる（`clamp` 済み）
- [ ] `dist < fenceDistance` かつ `result='hr'` のとき logEntry の `result` が `'d'` になる
- [ ] `dist >= fenceDistance + 8` かつ `result='d'` のとき logEntry の `result` が `'hr'` になる
- [ ] quickSim・tactical の両方で上記補正が適用される（`processAtBat` 内で処理するため自動的に両対応）
- [ ] ビルド・全テスト通過（`npm run build` および `npx vitest run`）

## テストケース

`src/engine/__tests__/physics.test.js` に Step 4 の 3 件を追加する。

シミュレーション統合テストは `src/engine/__tests__/simulation.test.js` を確認し、
既存テストが `dist` / `la` の値に依存して壊れていないことを確認する。

## NPB 協約上の制約

なし

## 過去バグからの教訓

- **B1パターン**: `processAtBat` は quickSim・tactical 両方から呼ばれるため、
  `processAtBat` 内で補正すれば両対応になる。片方だけ修正しないこと。
- **B2パターン**: `handleAutoSimEnd` / `handleTacticalGameEnd` の二重カウントに注意。
  今回は `processAtBat` 内で完結するため影響なし。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- `clamp` は `src/utils.js` にある

## ROADMAP.md 更新指示

以下の行を更新する：
```
- [ ] Phase 2: EV/LA → 物理シム → 着弾ゾーンで結果逆算
```
↓
```
- [x] Phase 2: EV/LA → 物理シム → 着弾ゾーンで結果逆算（YYYY-MM-DD）
```

「最終更新」ヘッダー行を `YYYY-MM-DD（物理演算 Phase 2 完了）` に更新する。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — 物理演算打撃シミュレーション Phase 2（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- dragCoeff を再調整し飛距離の過少評価を修正（EV=100mph/LA=25°: 90m → ~115m）
- HR/安打別の LA クランプ後処理を追加（result='hr' → la ∈ [22,38]° 等）
- dist とフェンス距離比較による HR↔D 物理補正を processAtBat に導入
- physics.test.js に飛距離精度・HR変換の回帰テストを追加
```

## SPEC.md 更新箇所

なし（内部実装変更のみ。フェンス距離比較ロジックは SPEC §4.4 の「球場補正」の延長として扱う）

## コミットメッセージ

`feat: 物理演算 Phase 2 — dragCoeff 校正・LA クランプ・フェンス距離による HR 補正`

## PR タイトル

`feat: 物理演算 Phase 2 — dragCoeff 校正・LA クランプ・フェンス距離による HR 補正`
