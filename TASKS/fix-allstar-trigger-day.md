---
task-id: fix-allstar-trigger-day
type: bugfix
commit-prefix: fix
created: 2026-04-04
roadmap-item: "㉞ オールスターゲーム修正 (Tier 10)"
---

# Task: オールスタートリガー日の動的計算（日程タブとエンジンのズレ修正）

## バグの概要

**症状**: 日程タブでは7月（allStarSkipDates の日付）にオールスター休止が表示されるが、
実際のゲーム処理は6月中に実行される。

**根本原因**:
- `ALL_STAR_GAMEDAY = 72` は「シーズン72試合目」を意味する静的な定数
- 実際にスケジュールで7月の allStarSkipDates（例: 7/22〜7/25）が来るのは90試合目前後
- 開幕日〜交流戦終了（〜6月下旬）で約70試合が消化されるため、
  gameDay 72 はカレンダーでは6月中旬〜下旬に相当する

**修正方針**:
`ALL_STAR_GAMEDAY` の静的参照をすべてなくし、スケジュール配列から
「最初の allStar スキップ日直前の最終公式戦 gameDay」を動的に算出する。

## 機能説明

- `scheduleGen.js` に `calcAllStarTriggerDay(schedule, allStarSkipDates)` を追加する。
  この関数はスケジュール配列を走査し、allStarSkipDates の最初の日より前の最終公式戦インデックスを返す。
- `useGameState.js` で `generateSeasonSchedule` 呼び出し直後に同関数を呼んで
  `allStarTriggerDay` を state に保存する。
- `useSeasonFlow.js` の3箇所ある `ALL_STAR_GAMEDAY` 参照を `allStarTriggerDay` に差し替える。
- `ScheduleTab.jsx` の `ALL_STAR_GAMEDAY` 参照（カード表示・chip）も `allStarTriggerDay` props に差し替える。
- `constants.js` の `ALL_STAR_GAMEDAY = 72` は **削除せずコメントアウト**して
  「動的計算に移行済み」旨を記載する（既存の tests や参照が壊れないよう保護）。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/scheduleGen.js` | `buildCalendarSections()`（125〜168行目）でスキップ日がどう除外されるか確認。`generateSeasonSchedule()` 末尾（116〜118行目）に追加関数を配置 |
| `src/data/scheduleParams.js` | `allStarSkipDates` の構造確認（13〜17行目）。`SEASON_PARAMS[year]` と `getDefaultParams(year)` 両方から取得できることを確認 |
| `src/hooks/useGameState.js` | `generateSeasonSchedule` の呼び出し箇所（64行目、130行目）と state 定義（48〜49行目付近）を確認 |
| `src/hooks/useSeasonFlow.js` | `ALL_STAR_GAMEDAY` 参照3箇所（286・411・522行目）と `allStarDone`・`allStarTriggerDay` の受け取り方（50行目付近）を確認 |
| `src/App.jsx` | `generateSeasonSchedule` 呼び出し（41行目）と `ScheduleTab` への props（159行目）を確認 |
| `src/components/tabs/ScheduleTab.jsx` | `ALL_STAR_GAMEDAY` 参照箇所（4行目 import・342・343・362行目）を確認 |
| `src/constants.js` | `ALL_STAR_GAMEDAY = 72`（6行目）の扱いを確認 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/engine/scheduleGen.js` | Modify | `calcAllStarTriggerDay()` を追加してエクスポート |
| `src/data/scheduleParams.js` | 変更なし | allStarSkipDates の構造はそのまま |
| `src/hooks/useGameState.js` | Modify | `allStarTriggerDay` state を追加、schedule 生成後に計算・保存 |
| `src/hooks/useSeasonFlow.js` | Modify | `ALL_STAR_GAMEDAY` 参照3箇所を `allStarTriggerDay` に変更 |
| `src/App.jsx` | Modify | `ScheduleTab` に `allStarTriggerDay` props を追加。`generateSeasonSchedule` 呼び出し後も計算を追加 |
| `src/components/tabs/ScheduleTab.jsx` | Modify | `ALL_STAR_GAMEDAY` 参照を `allStarTriggerDay` props に変更 |
| `src/constants.js` | Modify | `ALL_STAR_GAMEDAY = 72` をコメントアウト（削除不可） |

## 実装ガイダンス

### Step 1: scheduleGen.js に calcAllStarTriggerDay を追加

ファイル末尾（`getCpuMatchups` の後）に追加:

```js
/**
 * allStarSkipDates の最初のスキップ日直前にある最終公式戦の gameDay を返す。
 * スケジュール配列（index 1〜143）を後ろから走査し、
 * 最初のスキップ日より暦日が小さい最大インデックスを返す。
 *
 * @param {Array} schedule - generateSeasonSchedule の戻り値（index 0=null, 1〜143=ScheduleDay）
 * @param {Array} allStarSkipDates - scheduleParams の allStarSkipDates（{month,day}[]）
 * @returns {number} trigger となる gameDay。判定不能なら 72（後方互換フォールバック）
 */
export function calcAllStarTriggerDay(schedule, allStarSkipDates) {
  if (!allStarSkipDates || allStarSkipDates.length === 0 || !schedule) return 72;

  // 最初のスキップ日を数値化（比較用）
  const firstSkip = allStarSkipDates[0];
  const firstSkipNum = firstSkip.month * 100 + firstSkip.day;

  // 前から走査して「最後の firstSkip 未満の試合日インデックス」を求める
  let triggerDay = 72; // フォールバック
  for (let i = 1; i < schedule.length; i++) {
    const day = schedule[i];
    if (!day || day.isAllStar) continue; // AS エントリはスキップ
    const dateNum = day.date.month * 100 + day.date.day;
    if (dateNum < firstSkipNum) {
      triggerDay = i; // 候補を更新していく
    }
  }
  return triggerDay;
}
```

### Step 2: useGameState.js に allStarTriggerDay state を追加

**インポート更新**:
```js
// 変更前
import { generateSeasonSchedule } from '../engine/scheduleGen';

// 変更後
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../engine/scheduleGen';
```

**scheduleParams インポートを追加**（ファイル先頭付近）:
```js
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
```

**state 宣言を追加**（48〜49行目の allStarDone の近く）:
```js
const [allStarTriggerDay, setAllStarTriggerDay] = useState(72);
```

**schedule 生成箇所を2箇所更新**（64行目・130行目付近）:

```js
// 変更前（64行目付近）
setSchedule(generateSeasonSchedule(year, teams));

// 変更後
const newSchedule = generateSeasonSchedule(year, teams);
setSchedule(newSchedule);
const params = SEASON_PARAMS[year] || getDefaultParams(year);
setAllStarTriggerDay(calcAllStarTriggerDay(newSchedule, params.allStarSkipDates));
```

同様に 130 行目付近の呼び出しも同パターンで更新する（2回目も同じ処理）。

**return オブジェクトに追加**（311行目付近）:
```js
allStarTriggerDay, setAllStarTriggerDay,
```

### Step 3: useSeasonFlow.js の ALL_STAR_GAMEDAY 参照を差し替え

**受け取り**（50行目付近の分割代入に追加）:
```js
// 変更前
allStarDone, setAllStarDone, allStarResult, setAllStarResult,

// 変更後
allStarDone, setAllStarDone, allStarResult, setAllStarResult,
allStarTriggerDay,
```

**インポートから ALL_STAR_GAMEDAY を削除または残す（使わなくなるため）**:
```js
// 変更前
import { SEASON_GAMES, BATCH, ALL_STAR_GAMEDAY, ... } from '../constants';

// 変更後: ALL_STAR_GAMEDAY を削除
import { SEASON_GAMES, BATCH, ... } from '../constants';
```

**3箇所の参照を差し替え**:

286行目付近（通常進行）:
```js
// 変更前
if(!allStarDone && gameDay+1===ALL_STAR_GAMEDAY){

// 変更後
if(!allStarDone && gameDay+1===allStarTriggerDay){
```

411行目付近（バッチシム内）:
```js
// 変更前
if(!allStarDoneLocal && newDay===ALL_STAR_GAMEDAY){

// 変更後
if(!allStarDoneLocal && newDay===allStarTriggerDay){
```

522行目付近（TacticalGame終了後）:
```js
// 変更前
if(!allStarDone && gameDay+1===ALL_STAR_GAMEDAY){

// 変更後
if(!allStarDone && gameDay+1===allStarTriggerDay){
```

### Step 4: App.jsx の対応

`generateSeasonSchedule` を使っている41行目（セーブロード時）も同様に更新:

```js
// 変更前（41行目付近）
gs.setSchedule(generateSeasonSchedule(saved.year, saved.teams));

// 変更後
const loadedSchedule = generateSeasonSchedule(saved.year, saved.teams);
gs.setSchedule(loadedSchedule);
const loadedParams = SEASON_PARAMS[saved.year] || getDefaultParams(saved.year);
gs.setAllStarTriggerDay(calcAllStarTriggerDay(loadedSchedule, loadedParams.allStarSkipDates));
```

**必要な import 追加**（App.jsx 先頭付近）:
```js
import { generateSeasonSchedule, calcAllStarTriggerDay } from './engine/scheduleGen';
import { SEASON_PARAMS, getDefaultParams } from './data/scheduleParams.js';
```

**ScheduleTab への props 追加**（159行目）:
```jsx
// 変更前
{tab==="schedule"&&<ScheduleTab ... allStarDone={gs.allStarDone} allStarResult={gs.allStarResult}/>}

// 変更後
{tab==="schedule"&&<ScheduleTab ... allStarDone={gs.allStarDone} allStarResult={gs.allStarResult} allStarTriggerDay={gs.allStarTriggerDay}/>}
```

### Step 5: ScheduleTab.jsx の ALL_STAR_GAMEDAY 参照を props に変更

**インポート変更**（ファイル先頭の import で `ALL_STAR_GAMEDAY` を除去）:
```js
// 変更前
import { SEASON_GAMES, ALL_STAR_GAMEDAY, ALL_STAR_GAMEDAY_2 } from '../../constants';

// 変更後: ALL_STAR_GAMEDAY を除去（ALL_STAR_GAMEDAY_2 も props で受け取る場合は除去）
import { SEASON_GAMES } from '../../constants';
```

**コンポーネント props に追加**（278行目付近）:
```js
// 変更前
export function ScheduleTab({ schedule, gameDay, myTeam, teams, year, gameResultsMap = {}, allStarDone = false, allStarResult = null }) {

// 変更後
export function ScheduleTab({ schedule, gameDay, myTeam, teams, year, gameResultsMap = {}, allStarDone = false, allStarResult = null, allStarTriggerDay = 72 }) {
```

**ALL_STAR_GAMEDAY を allStarTriggerDay で置き換え**（ファイル内の全参照）:

342行目付近（オールスターカード表示）:
```jsx
// 変更前
第{ALL_STAR_GAMEDAY}・{ALL_STAR_GAMEDAY_2}戦 ({formatDate(gameDayToDate(ALL_STAR_GAMEDAY, schedule))}) に開催（2試合制）

// 変更後
第{allStarTriggerDay}・{allStarTriggerDay + 1}戦 ({formatDate(gameDayToDate(allStarTriggerDay, schedule))}) に開催（2試合制）
```

362行目付近（today chip）:
```jsx
// 変更前
{(gameDay===ALL_STAR_GAMEDAY||gameDay===ALL_STAR_GAMEDAY_2) && <span ...>⭐ オールスター開催日</span>}

// 変更後
{(gameDay===allStarTriggerDay||gameDay===allStarTriggerDay+1) && <span ...>⭐ オールスター開催日</span>}
```

buildMonthGrid の `isAllStar` 判定（104・108行目付近）: ここは引き続き `schedule[i].isAllStar` フラグを使うため **変更不要**。

### Step 6: constants.js の ALL_STAR_GAMEDAY をコメントアウト

```js
// 変更前
export const ALL_STAR_GAMEDAY = 72; // シーズン中盤オールスター発火 gameDay

// 変更後
// export const ALL_STAR_GAMEDAY = 72; // 動的計算に移行（calcAllStarTriggerDay を使用）。テスト参照のため削除せずコメントアウト。
```

**注意**: `__tests__/allstar.test.js` や `__tests__/scheduleGen.test.js` が `ALL_STAR_GAMEDAY` を import している場合はテストコードも修正が必要。インポートエラーになるので `npm run build` と `npm test` で確認すること。

## データモデル変更

```js
// useGameState.js に追加される state
allStarTriggerDay: number,  // calcAllStarTriggerDay() で計算されるAS発火 gameDay（例: 2025年なら約93）
```

## 受け入れ条件

- [ ] 2025年の `calcAllStarTriggerDay` が 7/22 より前の最終公式戦インデックスを返す（90前後になるはず）
- [ ] 返り値が `72` にならない（フォールバックが発動していないことを確認）
- [ ] `useSeasonFlow.js` の `ALL_STAR_GAMEDAY` 参照がゼロ件になる
- [ ] オールスター処理がゲーム内の7月カレンダーで発火する（6月中に発火しない）
- [ ] 日程タブのオールスター表示日とエンジン発火日が一致する
- [ ] バッチシム・通常進行・TacticalGame 終了後の3経路すべてで正しく発火する
- [ ] ビルド通過（`npm run build` エラーなし）・既存テスト通過

## テストケース

`src/engine/__tests__/scheduleGen.test.js` に追加:

```js
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../scheduleGen';
import { SEASON_PARAMS } from '../../data/scheduleParams';
// （teams は既存の test fixture を使用）

describe('calcAllStarTriggerDay', () => {
  it('2025年のトリガー日がスキップ日7/22より前の最終試合になる', () => {
    const schedule = generateSeasonSchedule(2025, teams);
    const triggerDay = calcAllStarTriggerDay(schedule, SEASON_PARAMS[2025].allStarSkipDates);
    // triggerDay の暦日が 7/22 より前であること
    const triggerDate = schedule[triggerDay]?.date;
    expect(triggerDate).toBeDefined();
    const triggerNum = triggerDate.month * 100 + triggerDate.day;
    expect(triggerNum).toBeLessThan(7 * 100 + 22); // 722
  });
  it('72 ではなく実際の試合日が返る', () => {
    const schedule = generateSeasonSchedule(2025, teams);
    const triggerDay = calcAllStarTriggerDay(schedule, SEASON_PARAMS[2025].allStarSkipDates);
    expect(triggerDay).not.toBe(72);
    expect(triggerDay).toBeGreaterThan(80); // 7月前には80試合以上消化
  });
  it('allStarSkipDates が空なら 72 を返す（フォールバック）', () => {
    const schedule = generateSeasonSchedule(2025, teams);
    expect(calcAllStarTriggerDay(schedule, [])).toBe(72);
  });
});
```

## NPB 協約上の制約

なし。

## 過去バグからの教訓

- B6 パターン: 定数を「見た目の正しさ」で設定しない。`ALL_STAR_GAMEDAY = 72` は試合番号であり暦日ではない。暦日依存のロジックには必ず計算ベースの値を使う。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

特になし（このタスクは既存 ㉞ の bugfix 修正のため）。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-04 — オールスタートリガー日の動的計算（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- ALL_STAR_GAMEDAY=72 の静的定数を廃止し、スケジュールから動的算出するよう修正
- calcAllStarTriggerDay() を scheduleGen.js に追加
- useGameState.js に allStarTriggerDay state を追加
- useSeasonFlow.js の発火ロジック3箇所を allStarTriggerDay 参照に統一
```

## SPEC.md 更新箇所

- §13.4 — 「発火タイミング: `ALL_STAR_GAMEDAY = 72` 到達時」を
  「発火タイミング: `calcAllStarTriggerDay(schedule, allStarSkipDates)` が返す gameDay 到達時（allStarSkipDates の最初の日直前の最終公式戦）」に変更

## コミットメッセージ

`fix: オールスタートリガー日を動的計算に変更（ALL_STAR_GAMEDAY=72 の静的定数を廃止）`

## PR タイトル

`fix: オールスタートリガー日を動的計算に変更`
