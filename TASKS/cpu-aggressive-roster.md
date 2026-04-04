---
task-id: cpu-aggressive-roster
type: feature
commit-prefix: feat
created: 2026-04-04
roadmap-item: "㊲ CPU球団の積極的補強 (Tier 11)"
---

# Task: CPU球団の積極的補強

## 背景・目的

現在 `processCpuFaBids`（`src/engine/contract.js:169`）は `signedTeams` Set によって **1球団1人** しかFA契約できない制約がある。
また `analyzeTeamNeeds`（`src/engine/trade.js:23`）の戻り値が文字列配列（`string[]`）のため「投手 or 野手」の2択しか補強判断に使えず、先発不足・抑え不在・捕手穴などポジション特化の補強が不可能。
この2つを改修し、CPU球団が毎オフに予算を活かして複数選手を獲得し、チームの弱点を積極的に補うようにする。

## 機能説明

- `analyzeTeamNeeds` の戻り値を `Array<{type: string, score: number}>` に変更。スコアが高いほど緊急ニーズ。先発枚数・抑え有無・中継ぎ枚数・捕手有無・平均球速・平均ミート・平均年齢をもとに最大3件のニーズを返す。
- `processCpuFaBids` でラウンド制ループを導入し、各 CPU チームが予算（`CPU_FA_BUDGET_RESERVE_RATIO=0.15` の 15% 分は残す）とロスター枠（MAX_ROSTER=28）が許す限り複数名を獲得する。
- FA候補を「ニーズとの適合度（`calcNeedMatch`）+ evalOffer スコア」の合算でランクし、最高スコアの候補に入札する。
- 外国人枠（MAX_外国人_一軍=4）チェックは現行ロジックを維持。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/contract.js` | `processCpuFaBids`（169〜249行）全体を読んで改修。import 行（1〜3行）にも定数追加 |
| `src/engine/trade.js` | `analyzeTeamNeeds`（23〜37行）の全実装と、呼び出し2箇所（44行・61行）を修正 |
| `src/constants.js` | `MAX_ROSTER`（12行）・`MIN_SALARY_SHIHAKA`（16行）・`MAX_外国人_一軍`（14行）付近に新定数を追加 |
| `src/engine/__tests__/contract.test.js` | 既存テスト構造（`processCpuFaBids foreign roster constraint` describe）を把握してから新ケース追加 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | 定数2件を末尾の既存ブロック後に追加 |
| `src/engine/trade.js` | Modify | `analyzeTeamNeeds` 戻り値変更 + 呼び出し2箇所（`.includes(...)` → `.type.includes(...)`） |
| `src/engine/contract.js` | Modify | `processCpuFaBids` 全面改修、ヘルパー `calcNeedMatch` 追加、import 更新 |
| `src/engine/__tests__/contract.test.js` | Modify | 多重獲得テストを `describe("processCpuFaBids multi-signing")` で追加 |
| `ROADMAP.md` | Modify | ㊲ の状態を `未着手` → `✅ 完了` に更新、最終更新行も更新 |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

既存の `MIN_SALARY_SHIHAKA` / `MIN_SALARY_IKUSEI` ブロック付近（16〜20行）の後に追加する:

```js
// CPU球団 FA補強パラメータ
export const CPU_FA_BUDGET_RESERVE_RATIO = 0.15; // 補強後に残す予算割合（15%）
export const CPU_FA_MIN_SCORE = 45;              // FAに入札する最低 evalOffer スコア
```

---

### Step 2: analyzeTeamNeeds リファクタリング（src/engine/trade.js:23-37）

**旧**: `string[]` を返す（最大2件）
**新**: `Array<{type: string, score: number}>` を返す（最大3件・スコア降順）

完全な置き換え実装:

```js
export function analyzeTeamNeeds(team) {
  const pitchers  = team.players.filter(p => p.isPitcher);
  const starters  = pitchers.filter(p => p.subtype === '先発');
  const relievers = pitchers.filter(p => p.subtype === '中継ぎ');
  const closers   = pitchers.filter(p => p.subtype === '抑え');
  const batters   = team.players.filter(p => !p.isPitcher);
  const catchers  = batters.filter(p => p.pos === '捕手');

  const avgV   = pitchers.length
    ? pitchers.reduce((s, p) => s + p.pitching.velocity, 0) / pitchers.length : 50;
  const avgC   = batters.length
    ? batters.reduce((s, p) => s + p.batting.contact, 0)  / batters.length   : 50;
  const avgAge = team.players.reduce((s, p) => s + p.age, 0)
    / Math.max(team.players.length, 1);

  const needs = [];
  if (starters.length < 4)   needs.push({ type: '先発投手が不足',   score: 30 + (4 - starters.length) * 10 });
  if (closers.length  === 0) needs.push({ type: '抑え不在',         score: 25 });
  if (relievers.length < 3)  needs.push({ type: '中継ぎ不足',       score: 15 + (3 - relievers.length) * 5 });
  if (avgV < 60)             needs.push({ type: '投手陣の球威強化', score: Math.round((60 - avgV) * 0.5) });
  if (catchers.length === 0) needs.push({ type: '捕手補強が急務',   score: 28 });
  if (avgC < 60)             needs.push({ type: 'ミート力の向上',   score: Math.round((60 - avgC) * 0.5) });
  if (avgAge > 30)           needs.push({ type: '若手の補充が急務', score: Math.round((avgAge - 30) * 5) });
  if (needs.length === 0)    needs.push({ type: 'バランス型の補強', score: 10 });

  return needs.sort((a, b) => b.score - a.score).slice(0, 3);
}
```

**同ファイル内の呼び出し2箇所を修正**（`.includes(...)` → `.type.includes(...)`）:

```js
// evalTradeForCpu（旧 line 44）
const np = needs.some((n) => n.type.includes("投手"));

// generateCpuOffer（旧 line 61）
const np = needs.some((n) => n.type.includes("投手"));
```

---

### Step 3: processCpuFaBids 改修（src/engine/contract.js:169-249）

#### 3-1. import 更新（1行目）

```js
import { clamp } from '../utils';
import {
  ACCEPT_THRESHOLD, MIN_SALARY_SHIHAKA, MIN_SALARY_IKUSEI,
  ACTIVE_ROSTER_FA_DAYS_PER_YEAR, MAX_外国人_一軍,
  MAX_ROSTER, CPU_FA_BUDGET_RESERVE_RATIO, CPU_FA_MIN_SCORE,  // ← 追加
} from '../constants';
import { tradeValue, analyzeTeamNeeds } from './trade';
```

#### 3-2. ヘルパー関数追加（processCpuFaBids の直前に挿入）

```js
/**
 * 選手がチームのニーズリストにどれだけ適合するかをスコアで返す。
 * @param {object} player - 選手オブジェクト（isPitcher, subtype, pos, age を参照）
 * @param {Array<{type: string, score: number}>} needs - analyzeTeamNeeds の戻り値
 * @returns {number} ニーズマッチボーナス（0〜）
 */
function calcNeedMatch(player, needs) {
  let bonus = 0;
  for (const n of needs) {
    if (n.type.includes('先発') && player.isPitcher && player.subtype === '先発') bonus += n.score;
    else if (n.type.includes('抑え') && player.isPitcher && player.subtype === '抑え') bonus += n.score;
    else if (n.type.includes('中継ぎ') && player.isPitcher && player.subtype === '中継ぎ') bonus += n.score;
    else if (n.type.includes('球威') && player.isPitcher) bonus += n.score * 0.5;
    else if (n.type.includes('捕手') && !player.isPitcher && player.pos === '捕手') bonus += n.score;
    else if (n.type.includes('ミート') && !player.isPitcher) bonus += n.score * 0.5;
    else if (n.type.includes('若手') && (player.age || 25) <= 26) bonus += n.score * 0.5;
    else if (n.type.includes('バランス')) bonus += 5;
  }
  return bonus;
}
```

#### 3-3. processCpuFaBids 全面書き換え

```js
export function processCpuFaBids(teams, myId, faPool, allTeams) {
  if (!faPool.length) return { updatedTeams: teams, remainingFaPool: faPool, news: [] };

  const news = [];
  let remainingPool = [...faPool];
  const teamMap = new Map(
    teams.map(t => [t.id, { ...t, players: [...t.players], farm: [...(t.farm || [])] }])
  );
  const claimed = [];
  const signedPlayers = new Set();

  // CPU チームを budget 降順に並べて処理（資金力のあるチームが先に入札）
  const cpuTeams = teams
    .filter(t => t.id !== myId)
    .sort((a, b) => b.budget - a.budget);

  // ラウンド制: 各ラウンドで各チームが1人入札し、誰も獲得できなくなったら終了
  let changed = true;
  while (changed && remainingPool.length > 0) {
    changed = false;

    for (const origTeam of cpuTeams) {
      const team = teamMap.get(origTeam.id);
      if (!team) continue;

      // ロスター枠チェック
      if (team.players.length >= MAX_ROSTER) continue;

      // 予算チェック（15% リザーブを除いた残高）
      const reserve = team.budget * CPU_FA_BUDGET_RESERVE_RATIO;
      if (team.budget - reserve < MIN_SALARY_SHIHAKA) continue;

      const needs = analyzeTeamNeeds(team);

      // 全 FA 候補をスコアリング
      const candidates = remainingPool
        .filter(p => !signedPlayers.has(p.id))
        .map(p => {
          const salary = Math.max(MIN_SALARY_SHIHAKA, p.salary);
          if (team.budget - reserve < salary) return null;
          const r = evalOffer(p, { salary, years: 1 }, team, allTeams);
          const needBonus = calcNeedMatch(p, needs);
          return { pid: p.id, score: r.total + needBonus * 0.3, salary, isForeign: !!p.isForeign };
        })
        .filter(c => c && c.score >= CPU_FA_MIN_SCORE)
        .sort((a, b) => b.score - a.score);

      if (!candidates.length) continue;

      const best = candidates[0];
      const player = remainingPool.find(p => p.id === best.pid);
      if (!player) continue;

      // 外国人枠チェック（現行ロジック維持）
      const foreignPlayers = team.players.filter(p => p.isForeign);
      const foreignActiveOnTeam = foreignPlayers.length;
      const foreignPitchers = foreignPlayers.filter(p => p.isPitcher).length;
      const foreignBatters = foreignPlayers.length - foreignPitchers;
      const wouldBeAllPitchers = player.isPitcher && foreignPitchers === MAX_外国人_一軍 - 1;
      const wouldBeAllBatters = !player.isPitcher && foreignBatters === MAX_外国人_一軍 - 1;
      const balanceViolation =
        foreignActiveOnTeam === MAX_外国人_一軍 - 1 && (wouldBeAllPitchers || wouldBeAllBatters);
      const goToFarm = player.isForeign && (foreignActiveOnTeam >= MAX_外国人_一軍 || balanceViolation);

      const newPlayerEntry = { ...player, isFA: false, contractYearsLeft: 1, salary: best.salary };

      if (goToFarm) {
        teamMap.set(team.id, {
          ...team,
          farm: [...(team.farm || []), newPlayerEntry],
          budget: team.budget - best.salary,
        });
      } else {
        teamMap.set(team.id, {
          ...team,
          players: [...team.players, newPlayerEntry],
          budget: team.budget - best.salary,
        });
      }

      remainingPool = remainingPool.filter(p => p.id !== best.pid);
      signedPlayers.add(best.pid);
      claimed.push({ player, teamName: team.name, teamEmoji: team.emoji });
      changed = true;

      news.push({
        type: 'season',
        headline: `【入団】${player.name}が${team.name}と契約`,
        source: '野球速報',
        dateLabel: '',
        body: `${player.name}選手（${player.age}歳）が${team.name}と契約した。`,
      });
    }
  }

  return {
    updatedTeams: teams.map(t => teamMap.get(t.id) || t),
    remainingFaPool: remainingPool,
    news,
    claimed,
  };
}
```

---

### Step 4: テスト追加（src/engine/__tests__/contract.test.js）

既存の `describe('processCpuFaBids foreign roster constraint', ...)` の後に追記:

```js
describe('processCpuFaBids multi-signing', () => {
  const mkBatter = (id, salary = 4200000, age = 25) => ({
    id, name: `B-${id}`, age, pos: '左翼手', isPitcher: false, isForeign: false, salary,
    batting: { contact: 65, power: 60, eye: 55, speed: 50, arm: 50, defense: 50,
               catching: 0, stealSkill: 0, baseRunning: 0, clutch: 50, vsLeft: 50, breakingBall: 50, stamina: 50, recovery: 50 },
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
  });
  const mkStarter = (id, salary = 4200000) => ({
    id, name: `P-${id}`, age: 28, pos: '先発', isPitcher: true, subtype: '先発', isForeign: false, salary,
    pitching: { velocity: 65, control: 60, stamina: 60, breaking: 55, variety: 50,
                sharpness: 50, tempo: 50, clutchP: 50, recovery: 50, durability: 50 },
    personality: { money: 50, winning: 50, playing: 50, hometown: 30, loyalty: 50, stability: 50, future: 50 },
  });

  it('CPU チームが予算内で2名を獲得できる', () => {
    const cpu = {
      id: 1, name: 'CPU', league: 'セ', wins: 70, losses: 70, city: '東京',
      budget: 20000000, lineup: [], farm: [],
      players: [mkStarter('s1'), mkStarter('s2'), mkStarter('s3')], // 先発3人 → 先発不足ニーズ
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 0, lineup: [], farm: [], players: [] };
    const fa1 = mkStarter('fa1', 4200000);
    const fa2 = mkBatter('fa2', 4200000);
    const res = processCpuFaBids([my, cpu], 0, [fa1, fa2], [my, cpu]);
    const updatedCpu = res.updatedTeams.find(t => t.id === 1);
    expect(updatedCpu.players.length).toBeGreaterThanOrEqual(5); // 既存3 + 2人獲得
    expect(res.news.length).toBeGreaterThanOrEqual(2);
  });

  it('ロスター MAX_ROSTER(28) 到達で獲得を停止する', () => {
    const players = Array.from({ length: 28 }, (_, i) => mkBatter(`p${i}`));
    const cpu = {
      id: 1, name: 'CPU', league: 'セ', wins: 70, losses: 70, city: '東京',
      budget: 99999999, lineup: [], farm: [], players,
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 0, lineup: [], farm: [], players: [] };
    const res = processCpuFaBids([my, cpu], 0, [mkBatter('faX')], [my, cpu]);
    const updatedCpu = res.updatedTeams.find(t => t.id === 1);
    expect(updatedCpu.players.length).toBe(28); // 満員で獲得せず
  });

  it('先発不足チームが先発投手を野手より優先して獲得する', () => {
    const cpu = {
      id: 1, name: 'CPU', league: 'セ', wins: 50, losses: 50, city: '東京',
      budget: 10000000, lineup: [], farm: [],
      players: [mkStarter('s1'), mkStarter('s2')], // 先発2人 → 先発不足（スコア高）
    };
    const my = { id: 0, name: 'ME', league: 'セ', wins: 60, losses: 60, city: '大阪', budget: 0, lineup: [], farm: [], players: [] };
    const starter = mkStarter('faS', 5000000);
    const batter  = mkBatter('faB', 4200000); // 年俸は batter の方が安い
    const res = processCpuFaBids([my, cpu], 0, [batter, starter], [my, cpu]);
    const updatedCpu = res.updatedTeams.find(t => t.id === 1);
    const signedIds = updatedCpu.players.map(p => p.id);
    // 先発ニーズが高いため starter が優先獲得される
    expect(signedIds).toContain('faS');
  });
});
```

## データモデル変更

`analyzeTeamNeeds` の戻り値型が変わる:

```js
// Before
analyzeTeamNeeds(team) → string[]
// After
analyzeTeamNeeds(team) → Array<{ type: string, score: number }>
```

新フィールドの追加はなし。既存選手・チームデータ構造への変更はなし。

## 受け入れ条件

- [ ] CPU球団が1オフシーズンに複数名の FA 選手を獲得できる（予算が続く限り）
- [ ] 先発4人未満のチームは先発投手を優先的に獲得する
- [ ] 抑え不在のチームは抑え投手を優先的に獲得する
- [ ] ロスター28人満員のチームは獲得を停止する
- [ ] 外国人枠（4名・バランス）制約が維持されている
- [ ] `evalTradeForCpu` / `generateCpuOffer` が正常に動作する（既存テスト通過）
- [ ] ビルド（`npm run build`）が通過する
- [ ] 全テスト（`npm test` 相当）が通過する

## テストケース

`src/engine/__tests__/contract.test.js` に `describe("processCpuFaBids multi-signing")` を追加（Step 4 参照）。

既存の `describe('processCpuFaBids foreign roster constraint')` は変更後も通過すること（外国人ロジック変更なし）。

## NPB 協約上の制約

- 支配下登録上限 70 名（`MAX_SHIHAKA_TOTAL`）: 各チームの `players.length + farm.length` が70を超えないこと。CPU チームのロスター判定は `team.players.length >= MAX_ROSTER (28)` で行い、farm への流入は既存外国人ロジックに準ずる。通常の国内選手はロスター28人上限で制御されるため追加チェック不要。
- 外国人選手一軍登録上限 4 名（`MAX_外国人_一軍`）・投手野手バランス制約: 現行ロジックを維持。

## 過去バグからの教訓

- **B1 パターン**: `processCpuFaBids` の変更は CPU 球団のみに適用するため両チームへの重複適用は不要。ただし `myId !== t.id` のフィルタリングを必ず維持すること。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値（`CPU_FA_BUDGET_RESERVE_RATIO` / `CPU_FA_MIN_SCORE`）は `src/constants.js` に定数として切り出す（Step 1 参照）
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

- `㊲` の状態列を `未着手` → `✅ 完了` に変更し、実装コミットハッシュを記入
- `最終更新` ヘッダー行を `YYYY-MM-DD（㊲ CPU球団の積極的補強 完了）` に更新

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — CPU球団の積極的補強（<コミットハッシュ>）

**仕様本文への影響なし（内部実装のみ）**

- `analyzeTeamNeeds` 戻り値を `{type, score}` オブジェクト配列に変更（ニーズスコア導入）
- `processCpuFaBids` を多重獲得対応に改修（ラウンド制ループ・予算15%リザーブ）
- ヘルパー `calcNeedMatch` 追加（先発/抑え/中継ぎ/捕手/若手ニーズ対応）
- 定数 `CPU_FA_BUDGET_RESERVE_RATIO`・`CPU_FA_MIN_SCORE` を `constants.js` に追加
```

## SPEC.md 更新箇所

なし（内部 AI 強化のみ。ゲームルール変更なし）

## コミットメッセージ

`feat: CPU球団のFA多重獲得を解禁しポジション特化補強を実装`

## PR タイトル

`feat: CPU球団のFA多重獲得を解禁しポジション特化補強を実装`
