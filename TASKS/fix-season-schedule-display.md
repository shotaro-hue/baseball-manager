---
task-id: fix-season-schedule-display
type: bugfix
commit-prefix: fix
created: 2026-04-11
roadmap-item: "B5 翌年開幕時に日程タブが旧年スケジュール表示"
---

# Task: 翌年開幕時に日程タブが旧年スケジュールを表示するバグ修正

## 背景・目的

`handleNextYear`（`useOffseason.js`）がシーズンを次年に進める際、
`setSchedule` を呼び出さないため、ハブ画面の初期レンダリング時点でスケジュール state が
前シーズンのままになる。`useGameState.js` には `year` 変更を検知して
スケジュールを再生成する `useEffect` があるが、effect の発火は最初のレンダリングより遅れるため、
日程タブが旧年スケジュールを一時的に（または恒久的に）表示し続けるバグが起きる。
さらに `gameResultsMap`（前シーズン試合結果）もリセットされず、
新シーズンの日程タブに古い勝敗結果が混在する副作用がある。

## 機能説明

- `handleNextYear` が呼ばれたとき、新シーズンのスケジュールを **即座に** `setSchedule` で更新する
- 同時に `gameResultsMap` を空オブジェクトにリセットし、古い試合結果が新シーズンに残らないようにする
- `allStarTriggerDay` も新スケジュールに合わせて再計算・更新する

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/hooks/useOffseason.js` | `handleNextYear`（40行目〜）を修正する主対象 |
| `src/hooks/useGameState.js` | `setSchedule`・`setGameResultsMap`・`setAllStarTriggerDay` が `gs` オブジェクト経由で渡されること、および `useEffect([year, teams.length])` との二重実行が無害であることを確認（65〜74行目） |
| `src/engine/scheduleGen.js` | `generateSeasonSchedule(year, teams)` と `calcAllStarTriggerDay(schedule, skipDates)` のシグネチャ確認 |
| `src/data/scheduleParams.js` | `SEASON_PARAMS` と `getDefaultParams` のエクスポートを確認 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/hooks/useOffseason.js` | Modify | インポート追加 + `gs` デストラクト拡張 + `handleNextYear` に3行追加 |

## 実装ガイダンス

### Step 1: インポートを追加（useOffseason.js 冒頭）

現在のインポートに以下を追加する。

```js
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../engine/scheduleGen';
import { SEASON_PARAMS, getDefaultParams } from '../data/scheduleParams.js';
```

### Step 2: gs デストラクトに3つのセッターを追加（useOffseason.js 15〜25行目付近）

```js
export function useOffseason(gs) {
  const {
    teams, setTeams, myId, myTeam,
    year, setYear, gameDay, setGameDay,
    faPool, setFaPool, setFaYears,
    seasonHistory, setSeasonHistory,
    setMailbox, setScreen,
    notify, upd, addNews, addToHistory,
    setRetireModal, setRetireGamePlayer, retireRole,
    setAllStarDone,
    setSchedule,          // ← 追加
    setGameResultsMap,    // ← 追加
    setAllStarTriggerDay, // ← 追加
  } = gs;
```

### Step 3: handleNextYear に3行追加（useOffseason.js 40〜56行目）

```js
const handleNextYear = () => {
  const foreignPool = generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
  setYear(y=>y+1);
  setGameDay(1);
  setFaPool(foreignPool);
  setDraftAllocation({pitcher:50,batter:50});
  setAllStarDone(false);
  setTeams(prev=>prev.map(t=>{
    // ... 既存のマッピング処理（変更不要）
  }));
  // ↓ ここから3行追加
  const nextYear = year + 1;
  const newSchedule = generateSeasonSchedule(nextYear, teams);
  setSchedule(newSchedule);
  setGameResultsMap({});
  const params = SEASON_PARAMS[nextYear] || getDefaultParams(nextYear);
  setAllStarTriggerDay(calcAllStarTriggerDay(newSchedule, params.allStarSkipDates));
  // ↑ ここまで
  setScreen("new_season");
};
```

**注意点**:
- `teams` は `handleNextYear` 呼び出し時点の値（`setTeams` 適用前）を渡して構わない。`generateSeasonSchedule` はチームID・リーグ構成のみ使用し、選手データを参照しないため問題ない
- `year + 1` を `nextYear` に束縛することで、クロージャの `year` 値（関数呼び出し時の現在年）を使っていることを明示する
- `useGameState.js` の `useEffect([year, teams.length])` も引き続き発火するが、同一スケジュールを2回生成するだけで副作用はない

## データモデル変更

なし（既存の `schedule` / `gameResultsMap` / `allStarTriggerDay` state をリセット・更新するのみ）

## 受け入れ条件

- [ ] ドラフト完了後に新シーズンのハブ画面へ進んだとき、日程タブに **新年** のスケジュールが表示される（前年のチーム名・日付が出ない）
- [ ] 新シーズンの日程タブに前シーズンの勝敗結果（○/●バッジ）が残っていない
- [ ] `npm run build` が警告・エラーなしで完了する
- [ ] 既存テスト（`npm test` / `npx vitest run`）が通過する

## テストケース

新規テストファイルは不要（ロジックの追加がなく、関数呼び出しの追加のみのため）。
既存の `src/engine/__tests__/scheduleGen.test.js` が引き続き通過することを確認する。

## NPB 協約上の制約

なし

## 過去バグからの教訓

- **B4 パターン**: `useEffect` の依存配列だけに頼ると「同 year・同 teams.length でセーブロードした場合」など条件によって effect が発火しない。state を確実に更新したい場合はイベントハンドラ内で明示的に `set*` を呼ぶ
- **B6 パターン**: `src/main.jsx` の import 先が旧ファイルのままで修正が未反映になったケースあり。本タスクは `useOffseason.js` のみ変更するが、動作確認は `npm run dev` で実際に画面を確認すること

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（本タスクでは該当なし）

## ROADMAP.md 更新指示

- `B5` 行の「実装コミット」列の `—` を実際のコミットハッシュに更新する
- 「最終更新」ヘッダー行を `YYYY-MM-DD（翌年日程タブ表示バグ修正 完了）` に更新する

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — 翌年開幕時の日程タブ旧スケジュール表示バグ修正（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- `handleNextYear` に `setSchedule` / `setGameResultsMap` / `setAllStarTriggerDay` の即時更新を追加
- 新シーズン開幕時に前シーズンの試合結果が日程タブに残る問題を解消
```

## SPEC.md 更新箇所

なし

## コミットメッセージ

`fix: 翌年開幕時に日程タブが旧年スケジュールを表示するバグを修正 (B5)`

## PR タイトル

`fix: 翌年開幕時に日程タブが旧年スケジュールを表示するバグを修正 (B5)`
