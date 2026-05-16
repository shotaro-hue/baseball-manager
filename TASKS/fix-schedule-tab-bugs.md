---
task-id: fix-schedule-tab-bugs
type: bugfix
commit-prefix: fix
created: 2026-04-12
roadmap-item: "B15/B16 日程タブ翌年バグ（オールスター引き継ぎ・7月グリッド切断）"
---

# Task: 日程タブ 翌年移行バグ修正（2件）

## 背景・目的

2025年シーズンから2026年シーズンに進んだとき、日程タブで2つのバグが発生する。
① 2025年のオールスター結果（スコア表示）が2026年の日程タブに引き継がれる。
② 7月カレンダーグリッドが途中で切断され、7月20日以降の試合が表示されない。
どちらも翌年のスケジュール閲覧体験を完全に壊すため優先修正が必要。

## 機能説明

- **Bug①（オールスター引き継ぎ）**: `handleNextYear()` が `setAllStarDone(false)` を呼ぶが `setAllStarResult(null)` を呼ばないため、前年の allStarResult state が残存する。ScheduleTab の AS セルがこの state を参照してスコアを表示する。
- **Bug②（7月グリッド切断）**: `generateSeasonSchedule()` はオールスターエントリを schedule 配列の末尾（index 144-145）に追加する。2026年の AS は 7/15・7/16 だが、通常試合（index 1-143）より後のindex にあるため `buildMonthGrid` の末尾エントリが AS の 7/16 になる。その結果 `lastDate = {month:7, day:16}` となり、グリッドが 7/16 の週末（7/19 日曜）で終端し、7/20以降が描画されない。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/hooks/useOffseason.js` | `handleNextYear()` の冒頭 destructuring（~18-30行）と関数本体（~45-67行）を読む。`setAllStarDone` の扱いを確認 |
| `src/components/tabs/ScheduleTab.jsx` | `buildMonthGrid()` 関数（~62-127行）。`monthEntries` の収集と `firstDate`/`lastDate` の計算箇所を精読 |
| `src/engine/scheduleGen.js` | `generateSeasonSchedule()` の末尾（~116-136行）でオールスターエントリが `schedule.push` される位置を確認 |
| `src/hooks/useGameState.js` | `gs` の return オブジェクト（~350-380行）で `setAllStarResult` が公開されていることを確認 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/hooks/useOffseason.js` | Modify | `gs` destructuring に `setAllStarResult` 追加 + `handleNextYear` 内で呼び出し |
| `src/components/tabs/ScheduleTab.jsx` | Modify | `buildMonthGrid` 内で `monthEntries` を日付順ソート |

## 実装ガイダンス

### Step 1: useOffseason.js — setAllStarResult を追加

`useOffseason.js` の `gs` destructuring ブロック（`export function useOffseason(gs)` 直後の `const { ... } = gs;`）に `setAllStarResult` を追加する。

```js
// 変更前（抜粋）
const {
  ...
  setAllStarDone,
  setSchedule,
  setGameResultsMap,
  setAllStarTriggerDay,
} = gs;

// 変更後
const {
  ...
  setAllStarDone,
  setAllStarResult,   // ← 追加
  setSchedule,
  setGameResultsMap,
  setAllStarTriggerDay,
} = gs;
```

次に `handleNextYear()` の先頭付近（`setAllStarDone(false)` の直後）に1行追加する:

```js
const handleNextYear = () => {
  const foreignPool = generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
  setYear(y=>y+1); setGameDay(1); setFaPool(foreignPool); setDraftAllocation({pitcher:50,batter:50});
  setAllStarDone(false);
  setAllStarResult(null);  // ← 追加: 前年のオールスター結果をリセット
  setTeams(prev => ...);
  ...
};
```

`handleDraftComplete` → `handleNextYear()` の呼び出しチェーンを通じて自動的にリセットされる。追加変更不要。

### Step 2: ScheduleTab.jsx — buildMonthGrid でソート追加

`buildMonthGrid()` 関数内、`monthEntries` の収集ループが終わった直後・`firstDate`/`lastDate` 計算の直前に1行追加する:

```js
// 変更前（抜粋）
  if (monthEntries.length === 0) return [];

  const firstDate = monthEntries[0].date;
  const lastDate = monthEntries[monthEntries.length - 1].date;

// 変更後
  if (monthEntries.length === 0) return [];

  // オールスターエントリが schedule 末尾に追加されるため、
  // date 順に並べ直して firstDate/lastDate を正しく算出する
  monthEntries.sort((a, b) => a.date.day - b.date.day);

  const firstDate = monthEntries[0].date;
  const lastDate = monthEntries[monthEntries.length - 1].date;
```

同一月内のエントリのみ対象なので `a.date.day - b.date.day` だけで十分（月をまたぐエントリはフィルタ済み）。

`byDate` Map の構築はソート後も変わらず正しく動く（日付キーで引くため順序不問）。

## データモデル変更

なし（allStarResult の既存 state 型は変わらない）

## 受け入れ条件

- [ ] 2026年に進んだ際、日程タブ7月のオールスターセル（AS第1戦・AS第2戦）にスコアが表示されない（または当年の正しいスコアのみ表示）
- [ ] 2026年7月カレンダーグリッドに 7/20 以降の試合（7/21, 7/22, ..., 7/31 等）が表示される
- [ ] 2025年に実施した AS 結果が 2026年 UI に漏れない
- [ ] 8月・9月・10月グリッドに変化なし
- [ ] `npm run build` が通る

## テストケース

既存テスト `src/engine/__tests__/scheduleGen.test.js` と `src/engine/__tests__/allstar.test.js` を確認し、以下を追加:

`src/engine/__tests__/scheduleGen.test.js` に追記:
```js
describe("buildMonthGrid (via ScheduleTab.buildMonthGrid)", () => {
  // ScheduleTab は React コンポーネントなので直接テストしにくい場合は
  // scheduleGen の generateSeasonSchedule の出力構造を確認するテストで代替
  it("2026年7月のオールスターエントリが schedule 末尾にある", () => {
    const schedule = generateSeasonSchedule(2026, mockTeams);
    const asEntries = schedule.filter(d => d?.isAllStar);
    expect(asEntries.length).toBe(2);
    // AS エントリが index 144-145 付近にある（末尾追加）
    expect(schedule.indexOf(asEntries[0])).toBeGreaterThan(143);
    // AS の日付が 7 月
    expect(asEntries[0].date.month).toBe(7);
    expect(asEntries[1].date.month).toBe(7);
  });
});
```

手動確認手順:
1. 新規ゲームを開始（2025年）
2. オールスターを実施してスコアを確認
3. シーズン終了まで進めて翌年（2026年）へ移行
4. 日程タブを開いて7月を確認: AS セルにスコアなし・7/21以降の試合が表示される

## NPB 協約上の制約

なし

## 過去バグからの教訓

- **B4/B5 パターン**: 年次移行時の state リセット漏れ。`handleNextYear` に `setGameResultsMap({})` を追加した際と同様のパターン。必ず「翌年に不要な state はまとめてリセットする」こと。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（今回の修正では RNG 不使用）
- 選手・イベント ID は `uid()` で生成（今回不要）

## ROADMAP.md 更新指示

ROADMAP.md の「バグ修正 / インフラ改善」テーブルに以下2行を追記する（B14の直後）:

```
| B15 | **[P1] 翌年移行時に前年オールスター結果が引き継がれる** | `handleNextYear()` が `setAllStarResult(null)` を呼ばないため前年スコアが AS セルに残存。`setAllStarResult` を useOffseason の destructuring に追加し null リセットを追加 | TBD |
| B16 | **[P1] 翌年7月グリッドが途中切断（7/20以降不表示）** | オールスターエントリが schedule 末尾（index 144-145）に追加されるため `buildMonthGrid` の `lastDate` が AS 日付（7/16等）になりグリッドが週末で終端。`monthEntries.sort()` で日付順ソートして修正 | TBD |
```

「最終更新」行も更新:
```
> 最終更新: 2026-04-12（B15/B16 日程タブ翌年バグ修正 完了）
```

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-12 — 日程タブ翌年バグ修正 B15/B16（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- `handleNextYear()` に `setAllStarResult(null)` を追加し、前年オールスター結果が翌年に引き継がれないよう修正
- `buildMonthGrid()` で `monthEntries` を日付昇順ソートし、7月グリッドの終端が AS エントリ日付（7/16等）に引きずられて7/20以降が消えるバグを修正
```

## SPEC.md 更新箇所

なし

## コミットメッセージ

`fix: 翌年移行時のオールスター結果引き継ぎ・7月グリッド切断バグを修正`

## PR タイトル

`fix: 翌年移行時のオールスター結果引き継ぎ・7月グリッド切断バグを修正`
