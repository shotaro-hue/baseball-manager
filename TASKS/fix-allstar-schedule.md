---
task-id: fix-allstar-schedule
type: feature
commit-prefix: feat
created: 2026-04-04
roadmap-item: "㉞ オールスターゲーム修正 (Tier 10)"
---

# Task: オールスター2試合制・休止日4日・会場持ちまわり・日程タブ表示

## 背景・目的

現行のオールスターは1試合制・休止3日・会場固定・日程タブ未表示。実際のNPBに合わせて
① 2試合制（第1戦・第2戦）、② 休止期間を「前1日休み→第1戦→第2戦→後1日休み」の計4日構成、
③ 会場を12球団本拠地の年ごと持ちまわりに変更する。
さらに④ 日程タブのカレンダーにオールスター試合日を公式戦セルと同様のスタイルで表示し、
終了後はスコアも表示する。

## 機能説明

- `scheduleParams.js` の allStarSkipDates を4日（前1休み・AS第1戦・AS第2戦・後1休み）に変更する。
- `scheduleGen.js` でオールスター試合日（第1戦・第2戦）の2エントリをスケジュール配列末尾（index 144・145）に追加する。
  各エントリは `isAllStar: true`・`allStarGame: 1 or 2`・`matchups: []` を持つ。
  これにより `ScheduleTab` の `buildMonthGrid` が7月カレンダーで自動的に拾い上げる。
- `constants.js` に各球団の本拠地球場名（`TEAM_STADIUMS`）と持ちまわり順（`ALL_STAR_VENUE_ROTATION`）を追加する。
- `constants.js` の `ALL_STAR_GAMEDAY = 72` はそのまま維持（第1戦のトリガー）し、
  `ALL_STAR_GAMEDAY_2 = 73` を追加して第2戦のトリガーとする。
- `allstar.js` の `runAllStarGame` を拡張し、2回の独立したシムを行い
  `{ game1: { score, mvp }, game2: { score, mvp }, venue }` を返すようにする。
- `useSeasonFlow.js` の発火ロジックを更新し、`ALL_STAR_GAMEDAY` 到達時に両試合をシムして
  `allStarResult` に格納、`allstar` 画面に遷移する。
- `AllStarScreen.jsx` に第1戦・第2戦の個別結果と開催球場名を表示する。
- `ScheduleTab.jsx` でオールスターエントリを専用セル（`type: 'allstar'`）として描画する。
  終了後は `allStarResult` からスコアを表示する。
- `App.jsx` の `ScheduleTab` 呼び出しに `allStarResult` props を追加する。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/constants.js` | `ALL_STAR_GAMEDAY`（6行目）・`TEAMS` 定義（48〜59行目）。球場名・定数追加場所を確認 |
| `src/data/scheduleParams.js` | `allStarSkipDates`（13〜17行目）・`getDefaultAllStarSkip()`（76〜88行目）を変更する |
| `src/engine/scheduleGen.js` | `generateSeasonSchedule()` 末尾（116〜118行目）にASエントリ追加。`buildCalendarSections()`（125〜168行目）でスキップ日数が増えても正しく動作するか確認 |
| `src/engine/allstar.js` | `runAllStarGame()`（157〜169行目）を2試合制に拡張する |
| `src/hooks/useSeasonFlow.js` | 発火ロジック（286〜294行目、411〜420行目、522〜530行目）・`publishAllStarNews`（136〜145行目）を更新 |
| `src/components/AllStarScreen.jsx` | 全体（短め・60行以下）。game1/game2 結果と venue 表示を追加 |
| `src/components/tabs/ScheduleTab.jsx` | `buildMonthGrid()`（62〜121行目）・`GridCell()`（162〜252行目）・`ScheduleTab`コンポーネント（278行目〜）を更新 |
| `src/App.jsx` | `ScheduleTab` 呼び出し（159行目）に `allStarResult` props 追加 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | `ALL_STAR_GAMEDAY_2`・`TEAM_STADIUMS`・`ALL_STAR_VENUE_ROTATION` を追加 |
| `src/data/scheduleParams.js` | Modify | 2025年の `allStarSkipDates` を4日に変更、`getDefaultAllStarSkip()` も4日返すよう修正 |
| `src/engine/scheduleGen.js` | Modify | `generateSeasonSchedule()` 末尾にASエントリ2件を追加するヘルパーと呼び出しを追加 |
| `src/engine/allstar.js` | Modify | `runAllStarGame` を2試合シム対応に変更 |
| `src/hooks/useSeasonFlow.js` | Modify | 発火ロジック・`publishAllStarNews` を2試合対応に更新 |
| `src/components/AllStarScreen.jsx` | Modify | 第1戦・第2戦の結果と球場名を表示 |
| `src/components/tabs/ScheduleTab.jsx` | Modify | `buildMonthGrid`・`GridCell`・コンポーネント props を更新 |
| `src/App.jsx` | Modify | `ScheduleTab` に `allStarResult` props を追加 |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

```js
// 既存
export const ALL_STAR_GAMEDAY = 72; // 第1戦トリガー（変更なし）
// 追加
export const ALL_STAR_GAMEDAY_2 = 73; // 第2戦トリガー

// 各球団の本拠地球場名（TEAMS 配列と id で対応）
export const TEAM_STADIUMS = {
  0:  '明治神宮野球場',        // ヤクルト
  1:  '横浜スタジアム',        // DeNA
  2:  'MAZDA Zoom-Zoom スタジアム広島', // 広島
  3:  '阪神甲子園球場',        // 阪神
  4:  '東京ドーム',            // 巨人
  5:  'バンテリンドーム ナゴヤ', // 中日
  6:  'みずほPayPayドーム福岡', // ソフトバンク
  7:  '楽天モバイルパーク宮城', // 楽天
  8:  'ベルーナドーム',        // 西武
  9:  'ZOZOマリンスタジアム',  // ロッテ
  10: 'エスコンフィールドHOKKAIDO', // 日本ハム
  11: '京セラドーム大阪',       // オリックス
};

// 会場持ちまわり順（team id の順番でインデックスは年で回す）
// 初年度(2025)は id=0（神宮）からスタート
export const ALL_STAR_VENUE_ROTATION = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
```

持ちまわりのヘルパー関数は `allstar.js` 内に記述する（constants にベタ書き不要）。

### Step 2: scheduleParams.js の allStarSkipDates を4日に変更

**2025年の実績値（SEASON_PARAMS[2025]）を更新:**

```js
// 変更前（3日）
allStarSkipDates: [
  { month: 7, day: 22 },
  { month: 7, day: 23 },
  { month: 7, day: 24 },
],

// 変更後（4日: 前1休み→第1戦→第2戦→後1休み）
// 2025年: 7/21(月)自動スキップ → 7/22(火)前休み → 7/23(水)第1戦 → 7/24(木)第2戦 → 7/25(金)後休み
allStarSkipDates: [
  { month: 7, day: 22 },  // 前休み
  { month: 7, day: 23 },  // AS第1戦（regular schedule外）
  { month: 7, day: 24 },  // AS第2戦（regular schedule外）
  { month: 7, day: 25 },  // 後休み
],
```

**`getDefaultAllStarSkip(year)` を4日に変更:**

```js
function getDefaultAllStarSkip(year) {
  // 7月の火曜日を探す（14〜25日の間）
  for (let day = 14; day <= 25; day++) {
    const dow = new Date(year, 6, day).getDay();
    if (dow === 2) { // 火曜日 = 前休み
      return [
        { month: 7, day },           // 火: 前休み
        { month: 7, day: day + 1 }, // 水: AS第1戦
        { month: 7, day: day + 2 }, // 木: AS第2戦
        { month: 7, day: day + 3 }, // 金: 後休み
      ];
    }
  }
  return [];
}
```

### Step 3: allstar.js の runAllStarGame を2試合制に変更

```js
/**
 * 2試合制オールスターをシムする。
 * @param {{ ce: Object[], pa: Object[] }} rosters
 * @param {number} year - 会場持ちまわりの年度計算に使用
 * @returns {{ game1: { score, mvp }, game2: { score, mvp }, venue: string }}
 */
export function runAllStarGame(rosters, year = 2025) {
  const ceTeam = buildAllStarTeam('allstar_ce', 'セ・リーグ選抜', 'セ', rosters.ce || []);
  const paTeam = buildAllStarTeam('allstar_pa', 'パ・リーグ選抜', 'パ', rosters.pa || []);

  // 第1戦
  const result1 = quickSimGame(ceTeam, paTeam);
  const pool1 = [...(rosters.ce || []), ...(rosters.pa || [])].filter(p => !p.isPitcher);
  const mvp1 = pool1.length ? pool1[rng(0, pool1.length - 1)] : null;

  // 第2戦（チームを再構築してシム）
  const ceTeam2 = buildAllStarTeam('allstar_ce', 'セ・リーグ選抜', 'セ', rosters.ce || []);
  const paTeam2 = buildAllStarTeam('allstar_pa', 'パ・リーグ選抜', 'パ', rosters.pa || []);
  const result2 = quickSimGame(ceTeam2, paTeam2);
  const pool2 = [...(rosters.ce || []), ...(rosters.pa || [])].filter(p => !p.isPitcher);
  const mvp2 = pool2.length ? pool2[rng(0, pool2.length - 1)] : null;

  // 会場: ALL_STAR_VENUE_ROTATION から year ベースで選択
  const venueTeamId = ALL_STAR_VENUE_ROTATION[(year - 2025) % ALL_STAR_VENUE_ROTATION.length];
  const venue = TEAM_STADIUMS[venueTeamId] || '未定';

  return {
    game1: { score: { ce: result1.score.my, pa: result1.score.opp }, mvp: mvp1 },
    game2: { score: { ce: result2.score.my, pa: result2.score.opp }, mvp: mvp2 },
    venue,
  };
}
```

`import { ALL_STAR_VENUE_ROTATION, TEAM_STADIUMS } from '../constants';` を冒頭に追加する。

### Step 4: useSeasonFlow.js の発火ロジック更新

`runAllStarGame(rosters)` の呼び出し箇所を `runAllStarGame(rosters, year)` に変更する（3箇所）。

`publishAllStarNews` を2試合対応に変更:

```js
const publishAllStarNews = (asResult, dayLabel) => {
  if (!asResult) return;
  addNews({
    type: 'allstar',
    headline: `【オールスター第1戦】セ${asResult.game1.score.ce} - パ${asResult.game1.score.pa}`,
    source: 'NPB公式',
    dateLabel: `${year}年 ${dayLabel}日目`,
    body: `開催球場: ${asResult.venue}\nセ・リーグ選抜 ${asResult.game1.score.ce} - ${asResult.game1.score.pa} パ・リーグ選抜。MVP: ${asResult.game1.mvp?.name || '未選出'}。`,
  });
  addNews({
    type: 'allstar',
    headline: `【オールスター第2戦】セ${asResult.game2.score.ce} - パ${asResult.game2.score.pa}`,
    source: 'NPB公式',
    dateLabel: `${year}年 ${dayLabel + 1}日目`,
    body: `セ・リーグ選抜 ${asResult.game2.score.ce} - ${asResult.game2.score.pa} パ・リーグ選抜。MVP: ${asResult.game2.mvp?.name || '未選出'}。`,
  });
};
```

### Step 5: AllStarScreen.jsx の更新

`gameResult` props の shape が変わっているので `game1`/`game2` を参照するよう修正:

```jsx
// 変更前
<div>セ {gameResult.score.ce} - {gameResult.score.pa} パ</div>
<div>MVP: {gameResult.mvp?.name}</div>

// 変更後
<div style={{ marginBottom: 16 }}>
  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>開催球場: {gameResult.venue}</div>
  <div>第1戦 セ {gameResult.game1.score.ce} - {gameResult.game1.score.pa} パ
    　MVP: {gameResult.game1.mvp?.name || '未選出'}</div>
  <div>第2戦 セ {gameResult.game2.score.ce} - {gameResult.game2.score.pa} パ
    　MVP: {gameResult.game2.mvp?.name || '未選出'}</div>
</div>
```

### Step 6: scheduleGen.js にオールスターエントリを追加

`generateSeasonSchedule()` の末尾（`return schedule;` の直前）に以下を追加:

```js
// オールスター試合日を schedule 末尾に追加（ScheduleTab カレンダー表示用）
// allStarSkipDates は [前休み, 第1戦, 第2戦, 後休み] の4要素想定
const asDates = params.allStarSkipDates || [];
if (asDates.length >= 3) {
  // index 1 = 第1戦, index 2 = 第2戦
  schedule.push({
    gameNo: null,          // 通常シーズンの gameNo ではない
    date: asDates[1],      // 第1戦の暦日
    isAllStar: true,
    allStarGame: 1,
    matchups: [],
  });
  schedule.push({
    gameNo: null,
    date: asDates[2],      // 第2戦の暦日
    isAllStar: true,
    allStarGame: 2,
    matchups: [],
  });
}

// schedule[1..143] = 公式戦, schedule[144..145] = オールスター（存在する場合）
return schedule;
```

**注意**: `buildCalendarSections` で `allStarSkipDates` が4日になってもスキップ処理は単純な Set 比較なので影響なし。確認のみ。

### Step 7: ScheduleTab.jsx の更新

**7-1. インポート変更**
```js
// 変更前
import { SEASON_GAMES, ALL_STAR_GAMEDAY } from '../../constants';

// 変更後
import { SEASON_GAMES, ALL_STAR_GAMEDAY, ALL_STAR_GAMEDAY_2 } from '../../constants';
```

**7-2. `buildMonthGrid` の更新**（62〜121行目付近）

monthEntries 収集ループでオールスターエントリを専用 type で格納:

```js
// 変更前
for (let idx = 1; idx < schedule.length; idx++) {
  const day = schedule[idx];
  if (!day) continue;
  if (day.date.month !== month) continue;
  const matchup = getMyMatchup(schedule, idx, myId);
  monthEntries.push({ dayNo: idx, date: day.date, matchup });
}

// 変更後
for (let idx = 1; idx < schedule.length; idx++) {
  const day = schedule[idx];
  if (!day) continue;
  if (day.date.month !== month) continue;
  if (day.isAllStar) {
    // オールスター試合日: 専用フラグを付与して追加
    monthEntries.push({ dayNo: idx, date: day.date, matchup: null, isAllStar: true, allStarGame: day.allStarGame });
  } else {
    const matchup = getMyMatchup(schedule, idx, myId);
    monthEntries.push({ dayNo: idx, date: day.date, matchup });
  }
}
```

カレンダーループでのセル構築（94〜113行目付近）を更新:

```js
// entry が存在する場合
if (entry) {
  if (entry.isAllStar) {
    // オールスター試合日セル
    cells.push({ type: 'allstar', date: { month: m, day: d }, dayNo: entry.dayNo, allStarGame: entry.allStarGame });
  } else {
    const result = gameResultsMap?.[entry.dayNo] ?? null;
    const isAllStar = false; // 通常ゲームセルには isAllStar 不要
    cells.push({ type: 'game', date: { month: m, day: d }, dayNo: entry.dayNo, matchup: entry.matchup, result, isAllStar });
  }
} else {
  // 休み・オールスター休止日
  const dayNo = schedule.findIndex(sd => sd?.date?.month === m && sd?.date?.day === d);
  cells.push({ type: 'off', date: { month: m, day: d }, dayNo, isAllStar: false });
}
```

**7-3. `GridCell` にオールスターセル描画を追加**（162行目付近）

既存の `if (cell.type === 'off')` の前に挿入:

```jsx
// オールスター試合セル
if (cell.type === 'allstar') {
  const asResult = cell.allStarGame === 1
    ? allStarResult?.gameResult?.game1
    : allStarResult?.gameResult?.game2;
  return (
    <div
      style={{
        minHeight: 54,
        background: 'rgba(245,200,66,.16)',
        border: '1px solid rgba(245,200,66,.45)',
        borderRadius: 6,
        padding: '4px 6px',
        cursor: 'default',
      }}
    >
      <div style={{ fontSize: 10, color: '#f5c842', fontWeight: 700 }}>{cell.date.day}</div>
      <div style={{ fontSize: 9, color: '#f5c842', marginTop: 2, fontWeight: 700 }}>
        ⭐ AS第{cell.allStarGame}戦
      </div>
      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>セ vs パ</div>
      {asResult && (
        <div style={{ fontSize: 9, color: '#f5c842', marginTop: 2, fontWeight: 700 }}>
          {asResult.score.ce}-{asResult.score.pa}
        </div>
      )}
    </div>
  );
}
```

`GridCell` の関数シグネチャに `allStarResult` を追加:
```js
// 変更前
function GridCell({ cell, year, teamMap, isToday, isSelected, onSelect, onResultClick }) {

// 変更後
function GridCell({ cell, year, teamMap, isToday, isSelected, onSelect, onResultClick, allStarResult }) {
```

**7-4. `ScheduleTab` コンポーネント props 更新**（278行目付近）

```js
// 変更前
export function ScheduleTab({ schedule, gameDay, myTeam, teams, year, gameResultsMap = {}, allStarDone = false }) {

// 変更後
export function ScheduleTab({ schedule, gameDay, myTeam, teams, year, gameResultsMap = {}, allStarDone = false, allStarResult = null }) {
```

`GridCell` 呼び出し箇所に `allStarResult` を渡す（週グリッドレンダリング部分を検索して追加）:
```jsx
<GridCell
  key={...}
  cell={cell}
  year={year}
  teamMap={teamMap}
  isToday={...}
  isSelected={...}
  onSelect={setSelectedDay}
  onResultClick={setResultModal}
  allStarResult={allStarResult}  // ← 追加
/>
```

**7-5. オールスターカード表示文言の更新**（342〜343行目付近）

```jsx
// 変更前
第{ALL_STAR_GAMEDAY}戦 ({formatDate(gameDayToDate(ALL_STAR_GAMEDAY, schedule))}) に開催

// 変更後
第{ALL_STAR_GAMEDAY}・{ALL_STAR_GAMEDAY_2}戦
({formatDate(gameDayToDate(ALL_STAR_GAMEDAY, schedule))}) に開催（2試合制）
```

`362行目`の chip 表示:
```jsx
// 変更前
{gameDay===ALL_STAR_GAMEDAY && <span ...>⭐ オールスター開催日</span>}

// 変更後
{(gameDay===ALL_STAR_GAMEDAY||gameDay===ALL_STAR_GAMEDAY_2) && <span ...>⭐ オールスター開催日</span>}
```

### Step 8: App.jsx の ScheduleTab 呼び出しに allStarResult 追加

`159行目`付近:

```jsx
// 変更前
{tab==="schedule"&&<ScheduleTab schedule={schedule} gameDay={gameDay} myTeam={myTeam} teams={teams} year={year} gameResultsMap={gs.gameResultsMap} allStarDone={gs.allStarDone}/>}

// 変更後
{tab==="schedule"&&<ScheduleTab schedule={schedule} gameDay={gameDay} myTeam={myTeam} teams={teams} year={year} gameResultsMap={gs.gameResultsMap} allStarDone={gs.allStarDone} allStarResult={gs.allStarResult}/>}
```

`gs.allStarResult` は `useGameState.js:320` で既にエクスポートされているので追加変更不要。

## データモデル変更

`allStarResult` の shape が変わる:

```js
// 変更前
{ rosters, gameResult: { score: { ce, pa }, mvp } }

// 変更後
{ rosters, gameResult: { game1: { score: { ce, pa }, mvp }, game2: { score: { ce, pa }, mvp }, venue } }
```

## 受け入れ条件

- [ ] 2025年の allStarSkipDates が 7/22・7/23・7/24・7/25 の4日になっている
- [ ] `getDefaultAllStarSkip` が4日（前1休み＋第1戦＋第2戦＋後1休み）を返す
- [ ] `generateSeasonSchedule` の戻り値配列の末尾2要素が `isAllStar: true`・`allStarGame: 1/2` を持つ
- [ ] `runAllStarGame` が `{ game1, game2, venue }` を返す
- [ ] `AllStarScreen` に第1戦・第2戦のスコア・MVP・球場名が表示される
- [ ] `ScheduleTab` の7月カレンダーに「⭐ AS第1戦」「⭐ AS第2戦」セルが2日分表示される
- [ ] オールスター終了後、カレンダーセルにスコアが表示される（例: セ3-パ2）
- [ ] `type: 'off'` の休み日は引き続き「休」として表示される（オールスター試合日と混在しない）
- [ ] ビルド通過（`npm run build` エラーなし）

## テストケース

`src/engine/__tests__/allstar.test.js` に追加:

```js
describe('runAllStarGame 2試合制', () => {
  it('game1・game2・venue を返す', () => {
    const result = runAllStarGame(rosters, 2025);
    expect(result).toHaveProperty('game1.score.ce');
    expect(result).toHaveProperty('game1.score.pa');
    expect(result).toHaveProperty('game2.score.ce');
    expect(result).toHaveProperty('game2.score.pa');
    expect(typeof result.venue).toBe('string');
  });
  it('2026年は持ちまわりで次の球場になる', () => {
    const r2025 = runAllStarGame(rosters, 2025);
    const r2026 = runAllStarGame(rosters, 2026);
    expect(r2025.venue).not.toBe(r2026.venue);
  });
});
```

## NPB 協約上の制約

実際のNPBは2試合制が基本。2試合の勝敗はシリーズ形式ではなく個別勝負として扱う（連勝/分け/連敗のいずれもあり得る）。

## 過去バグからの教訓

- B1 パターン: 両チームに適用すること（`applyAllStarSelections` は変更不要。ce/pa ロスターは変わらない）
- B6 パターン: 新定数（`ALL_STAR_GAMEDAY_2`・`TEAM_STADIUMS`・`ALL_STAR_VENUE_ROTATION`）は `constants.js` のみに定義し、他ファイルは import で取得すること

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

- 「オールスターゲーム」タスクの付記として「2試合制・4日休止・会場持ちまわり実装済み」を追記

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-04 — オールスター2試合制・休止日4日・会場持ちまわり（コミットハッシュ）

**仕様本文への影響あり（§13.4）**

- オールスターを2試合制に変更（第1戦・第2戦を個別シム）
- 休止期間を計4日構成（前1日休み→第1戦→第2戦→後1日休み）に変更
- 12球団本拠地の年ごと持ちまわり会場システムを実装
- AllStarScreen に第1戦・第2戦の結果と球場名を表示
```

## SPEC.md 更新箇所

- §13.4 オールスターゲーム — 以下を変更:
  - 「3日間休止」→「計4日（前1日休み・第1戦・第2戦・後1日休み）」
  - 「試合結果: 簡易シム（1試合）」→「試合結果: 2試合を個別にシム（第1戦・第2戦それぞれスコア・MVP）」
  - 「発火タイミング: `ALL_STAR_GAMEDAY = 72` 到達時」→「`ALL_STAR_GAMEDAY = 72`（第1戦）・`ALL_STAR_GAMEDAY_2 = 73`（第2戦）」
  - 「会場: 12球団本拠地の年ごと持ちまわり（`ALL_STAR_VENUE_ROTATION`）」を追記

## コミットメッセージ

`feat: オールスター2試合制・休止4日・会場持ちまわり`

## PR タイトル

`feat: オールスター2試合制・休止4日・会場持ちまわり`
