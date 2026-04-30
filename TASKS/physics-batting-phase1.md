---
task-id: physics-batting-phase1
type: feature
commit-prefix: feat
created: 2026-04-30
roadmap-item: "物理演算先行打撃シミュレーション Phase 1"
---

# Task: EV/LA生成ロジックを能力値先行に改善（Phase 1）

## 背景・目的

現在の打席シミュレーションでは、打球速度（EV）と打球角度（LA）は「確率テーブルで結果が決まった後」に後付けで割り当てられている（HR → LA=22〜38°、凡退 → LA=-8〜35° など）。これでは同じ打者でも凡退と本塁打でEV/LAが全く独立した確率分布になり、物理的整合性がない。Phase 1 の目的は EV/LA を「選手能力値から先行生成」するよう改善し、将来の Phase 2（物理シム→結果逆算）への土台を作ること。確率テーブルによる打席結果の決定ロジックは **一切変更しない**。

## 機能説明

- `processAtBat()` 内の EV/LA 生成ブロック（simulation.js 554〜565行）を能力値先行型に書き換える
- **EV**: 打者 power + 投手 stuff（velocity+breaking の平均）の対決で決定。強い投手ほどEVを抑制する
- **LA**: 結果ではなく打者の power/contact プロファイルから「打者タイプ」を判定して先行生成する
  - フライボーラー（power≥65）: 中心LA 18°
  - ゴロ打者（power≤35）: 中心LA 5°
  - ラインドライバー（contact≥65）: 中心LA 12°
  - デフォルト: 中心LA 12°
- ゲームバランス定数は `src/constants.js` に `PHYSICS_BAT` ブロックとして切り出す
- EV/LA の生成ロジックは `simulation.js` に新関数 `generateContactEVLA(batter, pitcher)` として独立させる
- K/BB/HBP（接触なし）は変更なし（EV=0, LA=0 のまま）

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/simulation.js` | 変更対象のEV/LA生成ブロック: **554〜565行**。pitcher変数は438行で定義済み（`gs.opPitcher` or `gs.myPitcher`）。`pitStuff` はこのブロック内では未定義なので新たに取得が必要 |
| `src/constants.js` | 末尾（現在の最終行付近）に `PHYSICS_BAT` 定数ブロックを追加する |
| `src/engine/physics.js` | `calcBallDist` / `calcSprayAngle` は変更不要。import 行（simulation.js 3行目）も変更不要 |
| `src/engine/physicsConstants.js` | 参照のみ。変更不要 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | `PHYSICS_BAT` 定数ブロックを末尾に追加 |
| `src/engine/simulation.js` | Modify | ①`PHYSICS_BAT` を import に追加、② `generateContactEVLA()` 新関数を追加、③ EV/LA生成ブロック（554〜565行）を新関数呼び出しに差し替え |

## 実装ガイダンス

### Step 1: 定数追加（`src/constants.js` 末尾）

```js
// ── 物理演算打撃シミュレーション定数（Phase 1） ──────────────────────────────
export const PHYSICS_BAT = {
  EV_FLOOR:       65,   // 接触時の最低EV (mph)。power=1 + pitStuff=99 でもこれ以上
  EV_POWER_SCALE: 35,   // power=99 で EV_FLOOR に +35mph 加算（最大 100mph）
  EV_STUFF_SCALE: 10,   // pitStuff=99 で EVを最大 -10mph 抑制
  EV_NOISE:        8,   // EV の乱数ノイズ幅 ± (mph)

  LA_FLY_MID:     18,   // フライボーラーの基準LA (°)
  LA_CONTACT_MID: 12,   // ラインドライバーの基準LA (°)
  LA_GROUND_MID:   5,   // ゴロ打者の基準LA (°)
  LA_DEFAULT_MID: 12,   // 分類不能時のデフォルトLA (°)
  LA_NOISE:       12,   // LA の乱数ノイズ幅 ± (°)（片側）
  LA_MIN:        -10,   // LA の下限 (°)
  LA_MAX:         45,   // LA の上限 (°)

  FLY_POWER_THRESHOLD:    65, // power ≥ この値 → フライボーラー
  GROUND_POWER_THRESHOLD: 35, // power ≤ この値 → ゴロ打者
  CONTACT_THRESHOLD:      65, // contact ≥ この値（かつ FLY/GROUND非該当）→ ラインドライバー
};
```

### Step 2: simulation.js の import を更新

ファイル先頭の import 行（2行目）に `PHYSICS_BAT` を追加する。

```js
import { PITCH_NORM, PITCH_HARD_CAP, FATIGUE_WARNING, FATIGUE_LIMIT, PHYSICS_BAT } from '../constants';
```

### Step 3: `generateContactEVLA()` 新関数を追加

**配置場所**: `simulation.js` の SECTION 5（`sampleResult` 関数）の直後、SECTION 6 の前に追加する。

```js
// ═══════════════════════════════════════════════════════════════
//  SECTION 5.5: 能力値先行 EV/LA 生成（Phase 1）
//  打者タイプと投手stuffからEV・LAを先行決定する。
//  確率テーブルによる結果（hr/s/d/out 等）には干渉しない。
// ═══════════════════════════════════════════════════════════════

function generateContactEVLA(batter, pitcher) {
  const power   = batter?.batting?.power   || 50;
  const contact = batter?.batting?.contact || 50;
  const pitVel  = pitcher?.pitching?.velocity || 50;
  const pitBrk  = pitcher?.pitching?.breaking || 50;
  const pitStuff = (pitVel + pitBrk) / 2;

  // EV: 打者power UP・投手stuff DOWN
  const evBase = PHYSICS_BAT.EV_FLOOR
    + (power / 99) * PHYSICS_BAT.EV_POWER_SCALE
    - ((pitStuff - 50) / 49) * PHYSICS_BAT.EV_STUFF_SCALE;
  const ev = Math.round(
    clamp(evBase + rngf(-PHYSICS_BAT.EV_NOISE, PHYSICS_BAT.EV_NOISE),
          PHYSICS_BAT.EV_FLOOR,
          PHYSICS_BAT.EV_FLOOR + PHYSICS_BAT.EV_POWER_SCALE + PHYSICS_BAT.EV_NOISE) * 10
  ) / 10;

  // LA: 打者タイプで基準LAを決定してノイズを乗せる
  const laMid = power   >= PHYSICS_BAT.FLY_POWER_THRESHOLD    ? PHYSICS_BAT.LA_FLY_MID
              : power   <= PHYSICS_BAT.GROUND_POWER_THRESHOLD  ? PHYSICS_BAT.LA_GROUND_MID
              : contact >= PHYSICS_BAT.CONTACT_THRESHOLD        ? PHYSICS_BAT.LA_CONTACT_MID
              : PHYSICS_BAT.LA_DEFAULT_MID;
  const la = Math.round(
    clamp(rngf(laMid - PHYSICS_BAT.LA_NOISE, laMid + PHYSICS_BAT.LA_NOISE),
          PHYSICS_BAT.LA_MIN,
          PHYSICS_BAT.LA_MAX) * 10
  ) / 10;

  return { ev, la };
}
```

### Step 4: EV/LA生成ブロックを差し替え（simulation.js 554〜565行）

**変更前（554〜565行）:**
```js
  // 打球指標 (EV / 打球角度) — インプレー結果のみ計算
  let ev = 0, la = 0;
  if (!['k', 'bb', 'hbp'].includes(result)) {
    const power = batter?.batting?.power || 50;
    const evBase = 65 + (power / 99) * 45;
    ev = Math.round((evBase + rngf(-8, 8)) * 10) / 10;
    if      (result === 'hr') la = Math.round(rngf(22, 38) * 10) / 10;
    else if (result === 'd')  la = Math.round(rngf(10, 28) * 10) / 10;
    else if (result === 't')  la = Math.round(rngf(5, 22)  * 10) / 10;
    else if (result === 's')  la = Math.round(rngf(3, 22)  * 10) / 10;
    else                      la = Math.round(rngf(-8, 35)  * 10) / 10; // out/sf/sac
  }
```

**変更後:**
```js
  // 打球指標 (EV / 打球角度) — インプレー結果のみ計算
  // Phase 1: 結果ではなく打者タイプ×投手stuffから先行生成
  let ev = 0, la = 0;
  if (!['k', 'bb', 'hbp'].includes(result)) {
    ({ ev, la } = generateContactEVLA(batter, pitcher));
  }
```

`pitcher` 変数は `processAtBat()` の438行目で既に定義されているので追加の変数宣言は不要。

## データモデル変更

なし。logEntry の `{ev, la, dist, sprayAngle}` 構造は変わらない。

## 受け入れ条件

- [ ] power=99 の打者は凡退時のEVも power=30 の打者より平均的に高い（`generateContactEVLA` を手動実行で確認）
- [ ] power=80 の打者の平均LAは power=20 の打者より高い
- [ ] K/BB/HBP の logEntry では ev=0, la=0 のまま
- [ ] `npm run build` がエラーなく通過する
- [ ] EV の最小値が `EV_FLOOR`（65mph）以上になっている

## テストケース

`src/engine/__tests__/simulation.test.js` に以下の `describe` ブロックを追加:

```js
describe('generateContactEVLA', () => {
  // ※ generateContactEVLA は simulation.js 内のローカル関数なので
  //    テスト用に export するか、processAtBat の logEntry を通じて間接検証する

  test('パワー打者(power=99)は平均EV > コンタクト打者(power=30)', () => {
    // 複数回呼び出して平均値を比較
    const powerBat = { batting: { power: 99, contact: 50 } };
    const contBat  = { batting: { power: 30, contact: 80 } };
    const pit = { pitching: { velocity: 50, breaking: 50 } };
    // generateContactEVLA をモジュールから呼び出すか、
    // processAtBat を通じて logEntry.ev を100回サンプルして平均比較
  });

  test('投手stuff=99 は stuff=1 よりEVを下げる', () => {
    // 同じ打者で投手stuffが違う場合の平均EV差を検証
  });

  test('power=70 の打者は平均LA > power=30 の打者', () => {
    // LAのタイプ分類検証
  });
});
```

`generateContactEVLA` をテストしやすくするため、`simulation.js` のファイル末尾にテスト環境向け export を追加してもよい:
```js
export { generateContactEVLA as _generateContactEVLA_TEST };
```

## NPB 協約上の制約

なし。

## 過去バグからの教訓

- **B1 パターン（両チームへの適用）**: `generateContactEVLA` は `batter` と `pitcher` を引数で受け取るため、自チーム打席・相手チーム打席どちらにも同じ関数が適用される。`processAtBat` 内で `isMyAtBat` によって batter/pitcher が切り替わる設計（438〜439行）をそのまま活かせるので問題なし。
- **B6（エントリーポイント誤設定）**: import 先を変えないこと。`simulation.js` の1〜3行目の import を正確に更新すること。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rngf()` を使う（`src/utils.js`）
- `clamp()` は simulation.js 冒頭で `utils.js` から import 済み（追加 import 不要）
- ゲームバランス数値は `src/constants.js` の `PHYSICS_BAT` ブロックに定義済みのものを使う
- `generateContactEVLA` は純粋関数（副作用なし）として実装すること

## ROADMAP.md 更新指示

このタスクは ROADMAP.md の既存エントリには対応していない。実装完了後に以下を追記:

```
### 物理演算打撃シミュレーション
- [x] Phase 1: EV/LA生成を能力値先行型に改善（YYYY-MM-DD）
- [ ] Phase 2: EV/LA → 物理シム → 着弾ゾーンで結果逆算
- [ ] Phase 3: lookup table 化 + モンテカルロ検証
```

「最終更新」ヘッダー行を `YYYY-MM-DD（physics-batting-phase1 完了）` に更新。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — EV/LA生成ロジック改善 Phase 1（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- EV生成に投手stuff（velocity+breaking平均）の対決要素を追加
- LA生成を「結果ありき」から「打者の power/contact プロファイル先行」に変更
- `PHYSICS_BAT` 定数ブロックを src/constants.js に追加
- `generateContactEVLA(batter, pitcher)` を simulation.js に新設
```

## SPEC.md 更新箇所

§4.4「打席解決フロー」の末尾に以下を追記:

```
#### 打球指標（EV / LA）生成（Phase 1）

K/BB/HBP 以外のインプレー結果に対して `generateContactEVLA(batter, pitcher)` を呼び出し:
- **EV（打球速度）**: 打者 `power` と投手 `stuff`（velocity + breaking の平均）の対決で決定
- **LA（打球角度）**: 打者の power/contact プロファイルから「打者タイプ」を判定して先行生成
  - power ≥ 65 → フライボーラー（基準 18°）
  - power ≤ 35 → ゴロ打者（基準 5°）
  - contact ≥ 65（上記以外）→ ラインドライバー（基準 12°）
  - それ以外 → デフォルト（12°）
- 確率テーブルによる打席結果（hr/d/t/s/out）の決定ロジックは変更しない
```

## コミットメッセージ

```
feat: EV/LA生成を能力値先行型に改善（物理演算打撃シミュレーション Phase 1）
```

## PR タイトル

```
feat: EV/LA生成を能力値先行型に改善（物理演算打撃シミュレーション Phase 1）
```
