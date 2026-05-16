---
task-id: physics-sim-phase3
type: feature
commit-prefix: feat
created: 2026-05-01
roadmap-item: "物理演算打撃シミュレーション Phase 3"
---

# Task: 物理演算 Phase 3 — 走塁反映・lookup table 化・モンテカルロ検証

## 背景・目的

Phase 1（能力値先行 EV/LA 生成）と Phase 2（dragCoeff 校正・LA クランプ・フェンス距離補正）が完了した。
しかし Phase 2 には意図的に先送りにした残件がある：

> 「physResult は logEntry に記録するが、走塁・得点への反映は Phase 3 で対応」
> — TASKS/physics-batting-phase2.md §実装ガイダンス Step 3

現在 `adjustResultByPhysics` が `d→hr` や `hr→d` に結果を補正しても、
ゲーム状態（score/bases/rbi）は補正前の `result` で計算済みのため矛盾が生じている。
Phase 3 はこの矛盾の解消（SubTask A）、パフォーマンス最適化（SubTask B）、
統計的妥当性の検証（SubTask C）の 3 本柱で物理演算シムを完成させる。

---

## 機能説明

### SubTask A: physResult の走塁・得点への完全反映

`processAtBat` 内で EV/LA 生成と物理補正（`adjustResultByPhysics`）を、
bases/score 計算ブロックより**前**に移動し、物理補正済みの `physResult` で
ゲーム状態を決定する。

- `d→hr` 昇格時: 打者とランナー全員が生還し、rbi/runs/scorers を hr 扱いで計算する
- `hr→d` 降格時: 打者は 2 塁止まり、ランナーの生還確率は `d` のルールで計算する
- `k`, `bb`, `hbp`, `t`, `s`, out 系（`go`/`fo`/`out`/`sac`）は物理補正の対象外のため変更なし
- logEntry の `result` も引き続き `physResult` を使う（Phase 2 から変更なし）

### SubTask B: lookup table 化

`calcBallDist(ev, la)` が毎打席ごとに物理シム（最大数百イテレーション）を実行するのを、
事前計算済みの 2D テーブルによる O(1) 参照に置き換える。

- 生成スクリプト `scripts/gen-physics-lookup.js` を作成し、`physicsConstants.js` の設定のままテーブルを出力する
- 出力先 `src/engine/physicsLookup.js` に `DIST_TABLE` 定数と `lookupBallDist(ev, la)` を export する
- EV グリッド: 60〜115 mph、1 mph 刻み（56 値）
- LA グリッド: -10〜50°、1° 刻み（61 値）
- 合計 3,416 エントリ（整数 meters）
- グリッド外（EV<60 or EV>115 or LA<-10 or LA>50）はクランプして最近傍を使う
- `simulation.js` の `calcBallDist` インポートを `lookupBallDist` に変更する
- `calcBallDist` / `simulateFlight` は `physics.js` に残してテスト・スクリプトから引き続き使用可能にする

### SubTask C: モンテカルロ検証スクリプト

`scripts/monte-carlo-validate.js` を作成し、物理演算込みの打席シミュレーションを
大量実行して結果分布が NPB 実測値の許容範囲に収まるかを検証する。

- N = 50,000 打席（ビルド不要・Node.js で単独実行）
- 代表打者プロファイル 5 種 × 代表投手プロファイル 5 種（後述）の全 25 ペアを各 2,000 打席
- 集計: HR率・2B率・1B率・K率・BB率・GB率・FB率
- NPB 2024 許容範囲と照合し OK/NG を出力する
- 結果を `scripts/mc-results.json` に書き出す（git 追跡不要、.gitignore に追記）

---

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/simulation.js` | `processAtBat()` 全体（502〜644行）。特に result 決定（540行）・bases/score 計算（549〜614行）・EV/LA+physResult 計算（622〜635行）の順序関係を把握する |
| `src/engine/simulation.js` | `adjustResultByPhysics()`（320〜333行）・`getFenceDistanceBySpray()`（313〜317行）の実装を確認する |
| `src/engine/simulation.js` | `STADIUMS` 定義（76〜89行）・`TEAM_STADIUM`（91行）・`DEFAULT_LEAGUE_ENV`（93〜99行）を参照する |
| `src/engine/physics.js` | `simulateFlight()`（14〜54行）・`calcBallDist()`（56〜58行）の実装全体。SubTask B でテーブル生成の基準にする |
| `src/engine/physicsConstants.js` | `PHYSICS_PRESETS.sim` の全パラメータ（`gravity`/`dragCoeff`/`dt`/`maxSteps`等）。テーブル生成スクリプトでそのまま利用する |
| `src/constants.js` | `PHYSICS_BAT` ブロック（340〜367行）。LA クランプ定数を確認する |
| `src/engine/__tests__/physics.test.js` | 既存 7 件のテスト構成を確認してから SubTask B・C のテストを追加する |
| `src/engine/__tests__/simulation.test.js` | `processAtBat` の既存テストを確認し、SubTask A 変更後に回帰しないことを確認する |

---

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/engine/simulation.js` | Modify | SubTask A: EV/LA + 物理補正を bases/score 計算より前に移動 |
| `src/engine/physicsLookup.js` | Create | SubTask B: `DIST_TABLE` と `lookupBallDist()` を export |
| `src/engine/simulation.js` | Modify | SubTask B: `calcBallDist` import を `lookupBallDist` に変更 |
| `scripts/gen-physics-lookup.js` | Create | SubTask B: テーブル生成スクリプト（開発用・ビルドには含まない）|
| `scripts/monte-carlo-validate.js` | Create | SubTask C: 検証スクリプト |
| `.gitignore` | Modify | `scripts/mc-results.json` を追加 |
| `src/engine/__tests__/physics.test.js` | Modify | SubTask B/C の回帰テストを追加 |

---

## 実装ガイダンス

### SubTask A — processAtBat の順序変更（`src/engine/simulation.js`）

#### 変更前の処理順（現状）

```
L540: simAtBat() → result
L549-614: isOut 判定 + bases/score 計算（result を使用）
L622-631: EV/LA 生成（generateContactEVLA）
L632: dist = calcBallDist(ev, la)
L633: sprayAngle = calcSprayAngle(result)
L634: stadium 取得
L635: physResult = adjustResultByPhysics(result, dist, sprayAngle, stadium)
L636: logEntry に physResult を記録（ゲーム状態には未反映）
```

#### 変更後の処理順（Phase 3）

```
L540: simAtBat() → initialResult
L541-548: EV/LA 生成ブロックをここに移動
  - generateContactEVLA → ev, la
  - result 別 LA クランプ（hr/d/t/s）
  - dist = lookupBallDist(ev, la)
  - sprayAngle = calcSprayAngle(initialResult)
  - stadium 取得（situation.stadium は L538 で定義済み）
  - physResult = adjustResultByPhysics(initialResult, dist, sprayAngle, stadium)
L549: result = physResult  ← ここで result を物理補正済みの値に差し替え
L550-614: isOut 判定 + bases/score 計算（physResult ベース）
L622: ev/la/dist/sprayAngle/physResult は既計算のためこのブロック削除
L636: logEntry は physResult（= result）を記録
```

#### 具体的な差し替えコード

```js
// ── simAtBat 呼び出し直後（現 L540 の次）に追加 ──
let { result: initialResult, pitches, pitchType, zone, isIntentional, pitchLog } = simAtBat(batter, pitcher, strategy, pitchCount, situation, gs.leagueEnv);

// EV/LA 生成と物理補正を先行実行
let ev = 0, la = 0;
if (!['k', 'bb', 'hbp'].includes(initialResult)) {
  ({ ev, la } = generateContactEVLA(batter, pitcher));
  if      (initialResult === 'hr') la = clamp(la, PHYSICS_BAT.LA_HR_MIN, PHYSICS_BAT.LA_HR_MAX);
  else if (initialResult === 'd')  la = clamp(la, PHYSICS_BAT.LA_D_MIN,  PHYSICS_BAT.LA_D_MAX);
  else if (initialResult === 't')  la = clamp(la, PHYSICS_BAT.LA_T_MIN,  PHYSICS_BAT.LA_T_MAX);
  else if (initialResult === 's')  la = clamp(la, PHYSICS_BAT.LA_S_MIN,  PHYSICS_BAT.LA_S_MAX);
}
const dist       = ev > 0 ? lookupBallDist(ev, la) : 0;
const sprayAngle = ev > 0 ? calcSprayAngle(initialResult) : 45;
const stadium    = situation.stadium ? STADIUMS[situation.stadium] : null;
const result     = adjustResultByPhysics(initialResult, dist, sprayAngle, stadium);
// ここから下は従来通り result を使って bases/score を計算する
```

- 元の `simAtBat` の返り値の変数名を `initialResult` に変える。最終的に `result` は物理補正済み値となる
- 旧 L622〜635（EV/LA 生成ブロック）は丸ごと削除する
- L636 の logEntry は変更不要（`result` が既に physResult の値を持つ）
- `situation` は L538 で定義済み、`stadium` は L634 でも取得していたが今回は L541 付近に移動する

#### 注意: 走塁再計算は hr ↔ d の 2 ケースのみ

`adjustResultByPhysics` が変更しうる組み合わせは:
1. `hr → d`（dist がフェンス未達）
2. `d → hr`（dist がフェンス+8m 以上）

`t`、`s`、out 系、`bb`、`k`、`hbp` は変更されない（`adjustResultByPhysics` の実装より）。
よって既存の `t`/`s`/out 系の走塁処理は修正不要。

---

### SubTask B — lookup table 生成（`scripts/gen-physics-lookup.js`）

```js
// scripts/gen-physics-lookup.js
// 実行: node scripts/gen-physics-lookup.js
// → src/engine/physicsLookup.js を上書き生成する

import { calcBallDist } from '../src/engine/physics.js';
import { writeFileSync } from 'fs';

const EV_MIN = 60, EV_MAX = 115;  // mph
const LA_MIN = -10, LA_MAX = 50;  // degrees

const rows = [];
for (let ev = EV_MIN; ev <= EV_MAX; ev++) {
  const row = [];
  for (let la = LA_MIN; la <= LA_MAX; la++) {
    row.push(calcBallDist(ev, la));
  }
  rows.push(row);
}

const tableJson = JSON.stringify(rows);
const output = `// Auto-generated by scripts/gen-physics-lookup.js — do not edit manually.
// Regenerate when physicsConstants.js changes: node scripts/gen-physics-lookup.js

const EV_MIN = ${EV_MIN};
const LA_MIN = ${LA_MIN};
const EV_MAX = ${EV_MAX};
const LA_MAX = ${LA_MAX};

const DIST_TABLE = ${tableJson};

export function lookupBallDist(ev, la) {
  const evIdx = Math.round(Math.min(Math.max(ev, EV_MIN), EV_MAX)) - EV_MIN;
  const laIdx = Math.round(Math.min(Math.max(la, LA_MIN), LA_MAX)) - LA_MIN;
  return DIST_TABLE[evIdx][laIdx];
}
`;

writeFileSync(new URL('../src/engine/physicsLookup.js', import.meta.url), output, 'utf8');
console.log(`Generated physicsLookup.js (${(EV_MAX - EV_MIN + 1) * (LA_MAX - LA_MIN + 1)} entries)`);
```

- スクリプト実行後に生成される `src/engine/physicsLookup.js` は git に追跡する（ビルド成果物ではなくソースとして扱う）
- `physicsConstants.js` の `dragCoeff`/`gravity`/`dt` を変更した場合は必ずスクリプトを再実行する
- `simulation.js` の import を変更する:

```js
// 変更前
import { calcBallDist, calcSprayAngle } from './physics';

// 変更後
import { calcSprayAngle } from './physics';
import { lookupBallDist } from './physicsLookup';
```

---

### SubTask C — モンテカルロ検証（`scripts/monte-carlo-validate.js`）

#### 代表プロファイル（打者 5 種）

```js
const BATTER_PROFILES = [
  { name: 'スラッガー',   batting: { contact: 55, power: 85, speed: 45, eye: 60, defense: 50, baseRunning: 45, stealSkill: 30 } },
  { name: '巧打者',       batting: { contact: 82, power: 45, speed: 65, eye: 72, defense: 55, baseRunning: 60, stealSkill: 55 } },
  { name: 'バランス型',   batting: { contact: 65, power: 65, speed: 60, eye: 62, defense: 60, baseRunning: 55, stealSkill: 45 } },
  { name: '俊足好守型',   batting: { contact: 58, power: 38, speed: 82, eye: 55, defense: 72, baseRunning: 78, stealSkill: 75 } },
  { name: '四球選手',     batting: { contact: 50, power: 55, speed: 50, eye: 88, defense: 50, baseRunning: 50, stealSkill: 40 } },
];
```

#### 代表プロファイル（投手 5 種）

```js
const PITCHER_PROFILES = [
  { name: 'エース',       pitching: { velocity: 82, breaking: 80, control: 82, stamina: 78, movement: 75 } },
  { name: '速球派',       pitching: { velocity: 92, breaking: 60, control: 65, stamina: 65, movement: 55 } },
  { name: '技巧派',       pitching: { velocity: 62, breaking: 82, control: 88, stamina: 72, movement: 80 } },
  { name: 'バランス型',   pitching: { velocity: 72, breaking: 70, control: 72, stamina: 70, movement: 68 } },
  { name: '敗戦処理',     pitching: { velocity: 55, breaking: 52, control: 58, stamina: 60, movement: 50 } },
];
```

#### NPB 2024 許容範囲

| 指標 | 下限 | 上限 | 備考 |
|---|---|---|---|
| HR/PA | 1.5% | 4.0% | NPB 2024 リーグ平均 ~2.5% |
| 2B/PA | 3.5% | 7.0% | |
| 1B/PA | 12.0% | 22.0% | |
| K/PA | 16.0% | 28.0% | |
| BB/PA | 6.0% | 14.0% | |
| 物理補正 HR昇格率 | 0.1% | 3.0% | `d→hr` に昇格した打席の割合 |
| 物理補正 HR降格率 | 0.1% | 3.0% | `hr→d` に降格した打席の割合 |

#### スクリプト骨格

```js
// scripts/monte-carlo-validate.js
// 実行: node scripts/monte-carlo-validate.js
import { simAtBat, processAtBat, initGameState, STADIUMS } from '../src/engine/simulation.js';
import { writeFileSync } from 'fs';

// ★ processAtBat を直接呼ぶか、simAtBat + 物理補正を自前で組む
// 推奨: processAtBat をラップして集計する

const N_PER_PAIR = 2000;
const results = [];

for (const batter of BATTER_PROFILES) {
  for (const pitcher of PITCHER_PROFILES) {
    const counts = { hr:0, d:0, s:0, t:0, k:0, bb:0, hbp:0, out:0,
                     physPromoted:0, physDemoted:0, total:0 };
    // N_PER_PAIR 回シミュレート（initGameState でダミーゲームを作って processAtBat を呼ぶ）
    // ...
    results.push({ batter: batter.name, pitcher: pitcher.name, counts, checks: validateCounts(counts) });
  }
}

writeFileSync('scripts/mc-results.json', JSON.stringify(results, null, 2));
printReport(results);
```

- `processAtBat` はゲーム状態全体を必要とするため、`initGameState` でダミー状態を作って呼ぶ
  - `initGameState` の引数 `myTeam`/`opTeam` に最小限のフィールドを渡す（lineup に該当打者 1 名、pitcher に該当投手）
  - 1 打席ごとに gs をリセットする（累積状態を引き継がない）
- `simAtBat` を直接呼んで自前で物理補正する方が簡便な場合はそちらでも可

---

### テスト追加（`src/engine/__tests__/physics.test.js`）

既存 7 件の末尾に以下を追加する:

```js
import { lookupBallDist } from '../physicsLookup';

describe('lookupBallDist', () => {
  it('matches calcBallDist within ±3m for mid-range inputs', () => {
    const pairs = [[100, 25], [85, 10], [110, 30], [72, 5], [95, 0]];
    for (const [ev, la] of pairs) {
      expect(Math.abs(lookupBallDist(ev, la) - calcBallDist(ev, la))).toBeLessThanOrEqual(3);
    }
  });

  it('clamps out-of-range EV/LA gracefully', () => {
    expect(() => lookupBallDist(50, 25)).not.toThrow();   // EV 下限以下
    expect(() => lookupBallDist(120, 25)).not.toThrow();  // EV 上限以上
    expect(() => lookupBallDist(100, -20)).not.toThrow(); // LA 下限以下
    expect(() => lookupBallDist(100, 60)).not.toThrow();  // LA 上限以上
  });

  it('HR-range returns ≥ typical NPB CF fence (122m)', () => {
    expect(lookupBallDist(108, 30)).toBeGreaterThanOrEqual(122);
  });
});
```

---

## データモデル変更

なし。`logEntry` の構造は Phase 2 のまま変更しない。
SubTask A では `result` の値（ゲーム状態に使われる値）が物理補正済みになるだけ。

---

## 受け入れ条件

- [ ] **A-1**: `d→hr` 昇格時に、塁上ランナー全員と打者がスコアに加算される
- [ ] **A-2**: `hr→d` 降格時に、打者は 2 塁止まり・ランナーは `d` の進塁ルールで処理される
- [ ] **A-3**: `t`, `s`, out 系, `bb`, `k`, `hbp` の走塁処理は変化しない（既存テスト通過）
- [ ] **B-1**: `lookupBallDist(100, 25)` の値が `calcBallDist(100, 25)` と ±3m 以内で一致する
- [ ] **B-2**: `lookupBallDist` が範囲外 EV/LA を受け取っても throw しない
- [ ] **B-3**: `npm run build` が通る（`physicsLookup.js` が正しく import される）
- [ ] **C-1**: `node scripts/monte-carlo-validate.js` が完走し `mc-results.json` を出力する
- [ ] **C-2**: 全 25 ペアの合算 HR率が 1.5〜4.0%、K率が 16〜28% の範囲に収まる
- [ ] **C-3**: 物理補正による HR 昇格・降格がそれぞれ 0.1% 以上発生している（補正が機能している確認）
- [ ] ビルド・全 vitest テスト通過

---

## テストケース

`src/engine/__tests__/simulation.test.js` の既存テストで `processAtBat` の HR/2B 結果を検証しているものが
SubTask A 変更後も通ることを確認する。特に以下を目視確認する:

- HR 時の `score.my`/`score.opp` への加算
- 塁上ランナー状態（`gs.bases`）のリセット

物理補正の走塁反映を単体で検証するテストを `simulation.test.js` に追加する:

```js
// 物理補正により d→hr に昇格するケースで得点が正しく加算されることを確認
// setup: EV/LA が必ずフェンスを越える値になる mock 環境で processAtBat を実行
// assertion: score に HR 分の得点が加算されている
```

（mock 方法: `vi.mock('../physics', ...)` で `calcSprayAngle` を固定値返しにして制御）

---

## NPB 協約上の制約

なし（内部演算変更のみ）

---

## 過去バグからの教訓

- **B1パターン**: `processAtBat` は quickSim・tactical 両方から呼ばれる。SubTask A の変更は `processAtBat` 内で完結するため両方に自動適用される。片方だけ修正しないこと
- **B2パターン**: SubTask C のスクリプトはゲームループ（`handleAutoSimEnd`等）に一切接続しない。単独実行で完結させる
- **SubTask B 注意**: `physicsLookup.js` を `import` で静的に読み込むため、`physicsConstants.js` 変更後にスクリプト再実行を忘れると本番コードとテーブルが乖離する。`physicsConstants.js` の先頭コメントに再生成の手順を記載すること

---

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（新定数が生じた場合）
- 選手 ID は `uid()` で生成（`src/utils.js`）
- SubTask C の検証スクリプトは Node.js ESM（`import`）で書く。`package.json` の `"type": "module"` を確認すること

---

## ROADMAP.md 更新指示

以下の行を更新する:
```
- [ ] Phase 3: lookup table 化 + モンテカルロ検証
```
↓
```
- [x] Phase 3: lookup table 化 + モンテカルロ検証（YYYY-MM-DD）
```

「最終更新」ヘッダー行を `YYYY-MM-DD（物理演算 Phase 3 完了）` に更新する。

---

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — 物理演算打撃シミュレーション Phase 3（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- physResult の走塁・得点への完全反映（Phase 2 残件）
  - d→hr 昇格時にランナー全員生還・rbi 正確加算
  - hr→d 降格時に打者 2 塁止まり・d の進塁ルールを適用
- lookup table 化（EV 60〜115 × LA -10〜50°、3416 エントリ）
  - scripts/gen-physics-lookup.js で事前生成
  - simulation.js の calcBallDist を O(1) の lookupBallDist に置換
- モンテカルロ検証スクリプト（scripts/monte-carlo-validate.js）
  - 25 打者×投手ペア × 2000 打席 = 50000 打席を検証
  - HR率・K率・BB率が NPB 2024 許容範囲に収まることを確認
```

---

## SPEC.md 更新箇所

なし（内部実装変更のみ。打席結果の物理的整合性向上は §4.4 球場補正の延長として扱う）

---

## コミットメッセージ

`feat: 物理演算 Phase 3 — 走塁反映完結・lookup table・モンテカルロ検証`

## PR タイトル

`feat: 物理演算 Phase 3 — 走塁反映完結・lookup table・モンテカルロ検証`
