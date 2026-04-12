---
task-id: roster-batting-order-swap
type: ui
commit-prefix: feat
created: 2026-04-12
roadmap-item: "UI改善 — ロースター打順スワップ＋守備配置バリデーション"
---

# Task: ロースター打順スワップ＋守備配置バリデーション（DH対応）

## 背景・目的

現在のロースタータブでは、打順セレクトや↑↓ボタンで打順番号を変えると「挿入」動作になり、
選手の見た目上の位置が変わらず直感に反する。また、守備位置の重複・未割り当てがあっても
他タブへ自由に遷移できてしまい、ゲーム整合性が保たれない。

さらに将来的には「セリーグが DH 制に移行するランダムイベント」を実装する予定があるため、
今回 DH ポジションをモデルに組み込み、`team.dhEnabled` フラグで制御できる設計とする。

## 機能説明

### 機能1: 打順スワップ動作

- 打順セレクトで選手 A（3番）を「5番」に変更すると、元5番の選手 B が 3番に移動する（スワップ）
- ↑/↓ボタンも同様にスワップ動作になる
- 打線にまだ入っていない選手を追加する場合は従来どおり「挿入」動作のまま

### 機能2: 守備配置バリデーション（DH対応）

- ロースタータブから他タブへ遷移しようとした際に守備配置を検証する
- `team.dhEnabled === false`（セリーグ等）の場合:
  - ラインナップが 8 人未満 → エラー「打線が 8 人揃っていません」
  - FIELDING_POSITIONS（8種）のいずれかに 0 人 → エラー「[ポジション名]が未割り当てです」
  - いずれかのポジションに 2 人以上 → エラー「[ポジション名]が重複しています」
- `team.dhEnabled === true`（パリーグ等）の場合:
  - ラインナップが 9 人未満 → エラー「打線が 9 人揃っていません（DH含む）」
  - FIELDING_POSITIONS + "DH" の 9 種それぞれに 0 人 → エラー「[ポジション名]が未割り当てです」
  - いずれかのポジションに 2 人以上 → エラー「[ポジション名]が重複しています」
- エラーがある場合は `notify(message, "warn")` を呼び、タブ遷移をブロックする

### 機能3: DH ポジション追加

- `POSITIONS` に "DH" を追加（末尾）し 9 種に
- `FIELDING_POSITIONS`（8種、DHを除く）を新規エクスポート
- `buildTeam` に `dhEnabled: def.league === "パ"` を追加
  - `dhEnabled === true` の初期 lineup: 最初の 9 人（先頭 8 人は各フィールドポジション、9 番目は pos = "DH"）
  - `dhEnabled === false` の初期 lineup: 最初の 8 人（各フィールドポジション）
- RosterTab の守備位置ドロップダウン: `dhEnabled` が false のときは "DH" 選択肢を非表示
- `autoSetLineup` を更新: `dhEnabled` が false なら上位 8 人・true なら上位 9 人（9 番目の `pos` を "DH" にセット）

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/hooks/useGameState.js` | `setLineupOrder()` を修正（~203〜222 行） |
| `src/App.jsx` | タブナビゲーション（~200〜204 行）に `handleTabChange()` を追加 |
| `src/components/tabs/RosterTab.jsx` | 打順 UI（~74〜101 行）・守備ドロップダウン（~104〜127 行）・autoSetLineup（~30〜38 行） |
| `src/constants.js` | `POSITIONS`（96 行）に "DH" 追加・`FIELDING_POSITIONS` 追加 |
| `src/engine/player.js` | `buildTeam()`（~124〜149 行）に `dhEnabled` と初期 lineup 修正 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | `POSITIONS` 末尾に "DH" 追加・`FIELDING_POSITIONS` 新規エクスポート |
| `src/engine/player.js` | Modify | `buildTeam()` に `dhEnabled` フラグ・初期 lineup 調整 |
| `src/hooks/useGameState.js` | Modify | `setLineupOrder()` をスワップ動作に変更 |
| `src/App.jsx` | Modify | `handleTabChange()` 関数追加・タブボタンと `onTabSwitch` に適用 |
| `src/components/tabs/RosterTab.jsx` | Modify | `dhEnabled` prop 受け取り・ドロップダウン・autoSetLineup 更新 |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

```js
// POSITIONS 末尾に "DH" を追加
export const POSITIONS = ["捕手", "一塁手", "二塁手", "三塁手", "遊撃手", "左翼手", "中堅手", "右翼手", "DH"];

// FIELDING_POSITIONS: DH を除く 8 種（バリデーションに使用）
export const FIELDING_POSITIONS = ["捕手", "一塁手", "二塁手", "三塁手", "遊撃手", "左翼手", "中堅手", "右翼手"];
```

### Step 2: buildTeam 更新（src/engine/player.js）

```js
// buildTeam() の return オブジェクトに追加
dhEnabled: def.league === "パ",

// lineup 初期化を dhEnabled で分岐
const nonPitchers = players.filter(p => !p.isPitcher);
let lineup;
if (def.league === "パ") {
  // 先頭 8 人 + 9 番目（pos を "DH" にセット）
  const fielders = nonPitchers.slice(0, 8);
  const dh = { ...nonPitchers[8] ?? nonPitchers[0], pos: "DH" };
  // 実際には players 配列内の選手オブジェクトも更新が必要
  // players 内の 9 番目バッターの pos を "DH" に変更してから lineup に追加
  lineup = [...fielders, nonPitchers[8] ?? nonPitchers[0]].map(p => p.id);
} else {
  lineup = nonPitchers.slice(0, 8).map(p => p.id);
}
```

> 注意: `players` 配列内の 9 番目バッターの `pos` フィールドも `"DH"` に変更すること。
> `buildTeam` の `players` ミューテーションは既存パターン（`p.subtype` への代入等）を参照。

### Step 3: setLineupOrder をスワップ動作に変更（src/hooks/useGameState.js）

現在のロジック（~203〜222 行）を以下に差し替える：

```js
const setLineupOrder = useCallback((pid, order) => {
  if (!myTeam) return;
  const p = myTeam.players.find(x => x.id === pid);
  if (p?.isPitcher) { notify("投手は打線に入れられません", "warn"); return; }
  if ((p?.injuryDaysLeft ?? 0) > 0) { notify("故障中は出場不可", "warn"); return; }

  upd(myId, t => {
    // order === 0: 打線から外す
    if (order === 0) {
      if (t.lineup.length <= 4) { notify("最低4人必要です", "warn"); return t; }
      return { ...t, lineup: t.lineup.filter(id => id !== pid) };
    }

    const targetIdx = order - 1;
    const lineup = [...t.lineup];
    const currentIdx = lineup.indexOf(pid);
    const isInLineup = currentIdx !== -1;

    if (!isInLineup) {
      // 打線未登録 → 挿入（従来動作）
      if (lineup.length >= 9) { notify("打線は最大9人です", "warn"); return t; }
      lineup.splice(targetIdx, 0, pid);
      return { ...t, lineup: lineup.slice(0, 9) };
    }

    // 打線登録済み → スワップ
    if (targetIdx === currentIdx) return t; // 同じ位置なら何もしない
    if (targetIdx >= lineup.length) return t; // 範囲外なら何もしない
    const occupantId = lineup[targetIdx];
    lineup[currentIdx] = occupantId; // 相手を自分の元の位置へ
    lineup[targetIdx] = pid;         // 自分をターゲット位置へ
    return { ...t, lineup };
  });
}, [myTeam, upd, myId, notify]);
```

### Step 4: App.jsx にタブ切り替えバリデーションを追加

`hub` 画面のレンダリング部分（タブボタンより前）に以下を追加：

```js
// ロースタータブ離脱時の守備配置バリデーション
const handleTabChange = useCallback((newTab) => {
  if (tab === "roster" && newTab !== "roster" && myTeam) {
    const lineupPlayers = myTeam.lineup
      .map(id => myTeam.players.find(p => p.id === id))
      .filter(Boolean);
    const required = myTeam.dhEnabled ? POSITIONS : FIELDING_POSITIONS;
    const requiredCount = required.length; // 9 or 8

    if (lineupPlayers.length < requiredCount) {
      notify(`打線が${requiredCount}人揃っていません（現在${lineupPlayers.length}人）`, "warn");
      return;
    }

    const posCount = {};
    lineupPlayers.forEach(p => { posCount[p.pos] = (posCount[p.pos] ?? 0) + 1; });

    for (const pos of required) {
      if (!posCount[pos]) {
        notify(`守備配置エラー: ${pos}が未割り当てです`, "warn");
        return;
      }
      if (posCount[pos] > 1) {
        notify(`守備配置エラー: ${pos}が重複しています`, "warn");
        return;
      }
    }
  }
  setTab(newTab);
}, [tab, myTeam, setTab, notify]);
```

- タブナビゲーションのボタン（~203 行）: `onClick={()=>setTab(id)}` → `onClick={()=>handleTabChange(id)}`
- DashboardTab への prop（~213 行）: `onTabSwitch={setTab}` → `onTabSwitch={handleTabChange}`
- `POSITIONS` と `FIELDING_POSITIONS` を `src/constants.js` から import に追加

### Step 5: RosterTab 更新（src/components/tabs/RosterTab.jsx）

#### prop 追加

```js
export function RosterTab({ team, ..., dhEnabled }) {
// または team.dhEnabled を直接使う（team prop から参照）
```

`team.dhEnabled` を直接参照する形が最もシンプル（props 追加不要）。

#### 守備ドロップダウンの "DH" 制御

```js
// 現在:
{POSITIONS.map(pos => { ... })}

// 変更後（dhEnabled が false のときは "DH" を非表示）:
{POSITIONS.filter(pos => pos !== "DH" || team.dhEnabled).map(pos => { ... })}
```

#### autoSetLineup の更新

```js
const autoSetLineup = () => {
  const available = batters
    .filter(p => (p.injuryDaysLeft ?? 0) === 0)
    .slice()
    .sort((a, b) => { /* 既存スコアロジックそのまま */ });

  const limit = team.dhEnabled ? 9 : 8;
  const selected = available.slice(0, limit);
  selected.forEach((p, idx) => onSetLineupOrder && onSetLineupOrder(p.id, idx + 1));
};
```

#### カード見出しの守備配置サマリー更新

```js
// 現在の POSITIONS.map(...) → FIELDING_POSITIONS を参照するよう変更
// FIELDING_POSITIONS も import に追加
import { ..., FIELDING_POSITIONS } from '../../constants';

// 見出し行の守備配置表示
<span style={{...}}>
  守備配置: {FIELDING_POSITIONS.map(pos => `${pos.replace("手","")}:${posCountInLineup[pos]??0}`).join(" / ")}
  {team.dhEnabled && ` / DH:${posCountInLineup["DH"]??0}`}
</span>
```

#### 重複警告メッセージの更新

```js
// 現在: "⚠ 同守備が重複"
// 変更後: posが "DH" の場合は別メッセージ
{posCountInLineup[p.pos] > 1 && team.lineup.includes(p.id)
  ? (p.pos === "DH" ? "⚠ DHは1人まで" : "⚠ 同守備が重複")
  : " "}
```

## データモデル変更

```js
// src/engine/player.js の buildTeam() が返すチームオブジェクトに追加
dhEnabled: boolean,  // パリーグ: true / セリーグ: false（将来イベントで変更可能）
```

> **将来の DH 制移行イベント実装時**: `upd(teamId, t => ({ ...t, dhEnabled: true }))` を呼ぶだけでよい。

## 受け入れ条件

- [ ] 打線登録済み選手の打順を変更すると、元のスロットにいた選手と入れ替わる（スワップ）
- [ ] 打線未登録の選手を追加する場合は従来どおり指定スロットに挿入される
- [ ] ↑/↓ボタンも隣のスロットの選手とスワップする動作になる
- [ ] パリーグチームは `dhEnabled: true`、セリーグは `dhEnabled: false` で初期化される
- [ ] セリーグチームのポジションドロップダウンに "DH" が表示されない
- [ ] パリーグチームのポジションドロップダウンに "DH" が表示される
- [ ] 守備配置が有効（全ポジション1人ずつ）の場合はロースタータブから遷移できる
- [ ] 守備ポジション重複がある状態でタブ切り替えしようとするとエラー通知が出て遷移がブロックされる
- [ ] 未割り当てポジションがある状態でタブ切り替えしようとするとエラー通知が出て遷移がブロックされる
- [ ] `autoSetLineup` がセリーグは 8 人・パリーグは 9 人を自動選択する
- [ ] ビルド・全テスト通過

## テストケース

- `src/engine/__tests__/useGameState.test.js`（新規 or 追記）
  - `setLineupOrder` スワップ: pid=A (order=3), pid=B (order=5) の状態で A を 5 番に変更 → A が 5 番・B が 3 番になる
  - `setLineupOrder` 挿入: 打線未登録の C を 2 番に追加 → 2 番以降が後ろにシフト
  - `setLineupOrder` 範囲外: targetIdx >= lineup.length のとき lineup が変わらない

## NPB 協約上の制約

- パリーグは DH 制あり（指名打者）、セリーグは 2023 年現在なし（ゲーム内イベントで将来変更可）
- DH 選手はフィールドに出ないため、8 つの守備ポジションと重複してよい（本タスクでは DH を独立ポジションとして扱うため重複は生じない設計）

## 過去バグからの教訓

- 既存の `setLineupOrder` の `slice(0, 9)` による誤切り捨てに注意。スワップ後は `splice` や `slice` を使わない（配列長が変わらないため不要）
- `upd` コールバック内で `notify` を呼ぶと React の状態更新と非同期で噛み合わない場合がある。`notify` は `upd` の外で呼ぶこと（既存パターンを踏襲）

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

- このタスクは ROADMAP に未登録のため、Tier 6 相当の UI 改善として末尾のバグ修正セクションに追記する:
  ```
  | U1 | **[P1] ロースター打順スワップ＋守備配置バリデーション（DH対応）** | ... | TBD |
  ```

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-12 — ロースター打順スワップ＋守備配置バリデーション（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- 打順変更を「挿入」から「スワップ」に変更し、選手の位置が直感的に入れ替わるよう修正
- DH ポジションを POSITIONS に追加、FIELDING_POSITIONS を新規エクスポート
- buildTeam() に dhEnabled フラグ追加（パリーグ: true、セリーグ: false）
- ロースタータブ離脱時に守備配置バリデーションを実行、不正状態では遷移をブロック
```

## SPEC.md 更新箇所

なし（内部実装のみ）

## コミットメッセージ

`feat: ロースター打順スワップ＋DH対応守備配置バリデーションを追加`

## PR タイトル

`feat: ロースター打順スワップ＋DH対応守備配置バリデーションを追加`
