---
task-id: roster-dropdown-lineup
type: ui
commit-prefix: feat
created: 2026-04-11
roadmap-item: "U7 ラインナップ操作改善 (UI改善 P2)"
---

# Task: ロースター画面 — 打順・守備位置プルダウン化

## 背景・目的

現在のロースタータブ（野手ビュー）では、選手の打順は「入れる/外す」ボタンで末尾追加するしかなく、任意の打順番号に直接配置できない。守備位置（`p.pos`）も変更できない。プルダウン式に変更することで、監督目線の直感的な打線編成が可能になり、操作ステップを大幅に削減する。

## 機能説明

- 野手一覧の打順列（`#` 列）を「—/1〜9」の `<select>` に変更する。選択時に `team.lineup` 配列の該当位置へ選手を挿入する。選択済みスロットには別の選手がいる場合はスワップする。「—」選択で打線から除外（最低4名制約維持）。
- 野手一覧の守備位置列（`守備` 列）を `POSITIONS` 定数の選択肢を持つ `<select>` に変更する。選択時に `player.pos` を更新する。
- 怪我中の選手（`injuryDaysLeft > 0`）は打順プルダウンを disabled にする。
- 既存の「入れる/外す」ボタンは打順プルダウンに統合して削除する（`↓ 二軍降格` ボタンは維持）。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/tabs/RosterTab.jsx` | 野手ビュー（48〜75行）。打順列・守備列・ボタン列の実装箇所。`liMap` の構築と `onToggle` 呼び出しを置き換える |
| `src/hooks/useGameState.js` | `toggleLineup`（192〜201行）。新関数 `setLineupOrder` / `setPlayerPosition` をこの直後に追加する |
| `src/App.jsx` | 214行。`RosterTab` に渡す props に `onSetLineupOrder` / `onSetPlayerPosition` を追加する |
| `src/constants.js` | 96行。`POSITIONS` 配列（8要素）を守備位置プルダウンの選択肢として使う |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/hooks/useGameState.js` | Modify | `setLineupOrder` / `setPlayerPosition` を追加。return オブジェクトにも追加 |
| `src/components/tabs/RosterTab.jsx` | Modify | 打順列を select に変更、守備列を select に変更、`onToggle` を `onSetLineupOrder` に変更 |
| `src/App.jsx` | Modify | RosterTab の props に `onSetLineupOrder` / `onSetPlayerPosition` を追加 |

## 実装ガイダンス

### Step 1: `setLineupOrder` を useGameState.js に追加

`toggleLineup`（useGameState.js ~192行）の直後に追加する。

```js
const setLineupOrder = useCallback((pid, order) => {
  if (!myTeam) return;
  const p = myTeam.players.find(x => x.id === pid);
  if (p?.isPitcher) { notify("投手は打線に入れられません", "warn"); return; }
  if (p?.injuryDaysLeft > 0) { notify("故障中は出場不可", "warn"); return; }

  upd(myId, t => {
    let lineup = [...t.lineup];

    if (order === 0) {
      // 打線から除外
      if (lineup.length <= 4) { notify("最低4人必要です", "warn"); return t; }
      return { ...t, lineup: lineup.filter(id => id !== pid) };
    }

    const targetIdx = order - 1; // 0-indexed
    const currentIdx = lineup.indexOf(pid);

    if (currentIdx === targetIdx) return t; // 変化なし

    // 対象スロットに別選手がいる場合はスワップ
    const occupantId = lineup[targetIdx] ?? null;

    // 選手を現在位置から除去
    if (currentIdx >= 0) {
      lineup.splice(currentIdx, 1);
      // 除去後に targetIdx がずれる場合を補正
      const adjustedTarget = occupantId === null
        ? Math.min(targetIdx, lineup.length)
        : lineup.indexOf(occupantId);
      lineup.splice(adjustedTarget, 0, pid);
    } else {
      // まだ打線に入っていない場合
      if (lineup.length >= 9) {
        notify("打線は最大9人です", "warn");
        return t;
      }
      if (occupantId !== null) {
        // スロット占有あり → 末尾に追加してから指定位置へ移動
        lineup.push(pid);
        // 単純アプローチ: 対象インデックスに挿入（既存選手は後ろへ押し出し）
        lineup.splice(lineup.lastIndexOf(pid), 1);
        lineup.splice(targetIdx, 0, pid);
      } else {
        lineup.splice(targetIdx, 0, pid);
      }
    }

    return { ...t, lineup: lineup.slice(0, 9) };
  });
}, [myTeam, upd, myId, notify]);
```

**注**: スワップのロジックはシンプルさを優先し、「対象スロットの選手を押し出す」方式でよい。複雑な場合は下記の代替実装を使うこと：

```js
// シンプル代替: 常に配列を再構築
upd(myId, t => {
  if (order === 0) {
    if (t.lineup.length <= 4) return t;
    return { ...t, lineup: t.lineup.filter(id => id !== pid) };
  }
  const targetIdx = order - 1;
  let arr = t.lineup.filter(id => id !== pid); // pidを除去
  if (arr.length >= 9 && !t.lineup.includes(pid)) return t; // 満員
  arr.splice(targetIdx, 0, pid); // 指定位置に挿入（後続は押し出し）
  return { ...t, lineup: arr.slice(0, 9) };
});
```

### Step 2: `setPlayerPosition` を useGameState.js に追加

`setLineupOrder` の直後に追加する。

```js
const setPlayerPosition = useCallback((pid, pos) => {
  upd(myId, t => ({
    ...t,
    players: t.players.map(p => p.id === pid ? { ...p, pos } : p),
  }));
}, [upd, myId]);
```

### Step 3: return オブジェクトに追加

`useGameState.js` の return オブジェクト（`toggleLineup` などが列挙されている箇所）に追加する：

```js
setLineupOrder,
setPlayerPosition,
```

### Step 4: App.jsx の RosterTab props を更新

`src/App.jsx` の 214行付近：

```jsx
{tab==="roster" && <RosterTab
  team={myTeam}
  onToggle={gs.toggleLineup}          // ← 互換のため残してもよいが不要になる
  onSetLineupOrder={gs.setLineupOrder} // ← 追加
  onSetPlayerPosition={gs.setPlayerPosition} // ← 追加
  onSetStarter={gs.setStarter}
  onPromo={gs.promote}
  onDemo={gs.demote}
  onSetTrainingFocus={gs.setTrainingFocus}
  onConvertIkusei={gs.convertIkusei}
  onMoveRotation={gs.moveRotation}
  onRemoveFromRotation={gs.removeFromRotation}
  onSetPitchingPattern={gs.setPitchingPattern}
  onPlayerClick={gs.handlePlayerClick}
  onSetDevGoal={gs.setDevGoal}
  onPlayerTalk={gs.handlePlayerTalk}
  gameDay={gameDay}
/>}
```

### Step 5: RosterTab.jsx — 打順列を select に変更

`RosterTab.jsx` の野手ビュー（48〜75行）を修正する。

**変更前の関数シグネチャ**（18行）:
```js
export function RosterTab({team, onToggle, ...})
```

**変更後**:
```js
export function RosterTab({team, onToggle, onSetLineupOrder, onSetPlayerPosition, ...})
```

`liMap` の構築（25行）はそのまま使用してよい。

**打順列（`<td>` の #列）** — 変更前:
```jsx
<td>{inL ? <span className="lnb">{liMap[p.id]}</span> : <span style={{color:"#1e2d3d"}}>—</span>}</td>
```

**変更後**（打順セレクト）:
```jsx
<td>
  <select
    value={inL ? liMap[p.id] : 0}
    disabled={isInj}
    style={{
      fontSize: 11,
      background: "#0d1b2a",
      color: inL ? "#93c5fd" : "#374151",
      border: "1px solid #1e3a5f",
      borderRadius: 3,
      padding: "1px 3px",
      width: 46,
    }}
    onChange={e => {
      const order = parseInt(e.target.value, 10);
      if (onSetLineupOrder) onSetLineupOrder(p.id, order);
    }}
  >
    <option value={0}>—</option>
    {[1,2,3,4,5,6,7,8,9].map(n => (
      <option key={n} value={n}>{n}番</option>
    ))}
  </select>
</td>
```

**守備位置列（`<td>` の守備列）** — 変更前:
```jsx
<td style={{fontSize:10,color:"#374151"}}>{p.pos}</td>
```

**変更後**（守備位置セレクト）:
```jsx
<td>
  <select
    value={p.pos || ""}
    style={{
      fontSize: 10,
      background: "#0d1b2a",
      color: "#94a3b8",
      border: "1px solid #1e3a5f",
      borderRadius: 3,
      padding: "1px 2px",
    }}
    onChange={e => {
      if (onSetPlayerPosition) onSetPlayerPosition(p.id, e.target.value);
    }}
  >
    {POSITIONS.map(pos => (
      <option key={pos} value={pos}>{pos}</option>
    ))}
  </select>
</td>
```

**ボタン列** — 末尾の「入れる/外す」ボタンを削除し、二軍降格ボタンのみ残す：

変更前:
```jsx
<td>
  <button className={`bsm ${inL?"bgr":"bga"}`} onClick={()=>!isInj&&onToggle(p.id)} disabled={isInj}>{inL?"外す":"入れる"}</button>
  {' '}
  <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button>
</td>
```

変更後:
```jsx
<td>
  <button className="bsm bgr" onClick={()=>onDemo(p.id)}>↓</button>
</td>
```

**import に `POSITIONS` を追加**（RosterTab.jsx の冒頭）:
```js
import { MAX_ROSTER, MAX_FARM, MAX_外国人_一軍, MAX_SHIHAKA_TOTAL, DEV_GOALS_BATTER, DEV_GOALS_PITCHER, TALK_COOLDOWN_DAYS, POSITIONS } from '../../constants';
```

## データモデル変更

なし。`team.lineup`（順序付き配列）と `player.pos`（文字列）の既存フィールドを更新するのみ。

## 受け入れ条件

- [ ] 野手ビューの `#` 列が「—/1番〜9番」のプルダウンになっている
- [ ] 打順を選択すると `team.lineup` の該当インデックスに反映され、他の選手が押し出される（9名上限維持）
- [ ] 「—」を選択すると打線から除外される（最低4名制約を満たす場合のみ）
- [ ] 怪我中の選手の打順プルダウンは disabled になっている
- [ ] 守備位置列がプルダウンになっており、変更が `player.pos` に反映される
- [ ] 「入れる/外す」ボタンが削除されている（「↓」降格ボタンは残っている）
- [ ] `npm run build` でエラーなし

## テストケース

既存テストへの追加は不要（UIのみの変更）。手動確認で以下を検証すること：

- 正常系: 1番に選手を設定 → lineup[0] が当該選手IDになる
- スワップ: 1番に別の選手を設定 → 元の1番選手が押し出されて2番以降になる
- 除外: "—" を選択 → lineup から除外される（lineup.length が 1 減る）
- 制約: lineup が4名の状態で "—" を選択 → 除外されず警告が出る
- 怪我: 怪我中の選手の打順セレクトは disabled で操作できない
- 守備位置: 「一塁手」→「三塁手」に変更 → `player.pos` が更新される

## NPB 協約上の制約

なし

## 過去バグからの教訓

特に関連するものはないが、`upd` 内の state 更新は純粋関数にすること（副作用禁止）。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）— 今回は使用なし
- ゲームバランス数値は `src/constants.js` に定数として切り出す — 今回は使用なし
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）— 今回は使用なし

## ROADMAP.md 更新指示

- `U7 ラインナップD&D` の概要を「打順・守備位置プルダウン選択（✅ 完了）」に書き換え、状態を「未着手」→「✅ 完了」に変更
- 「最終更新」ヘッダー行を `YYYY-MM-DD（ロースター打順・守備位置プルダウン 完了）` に更新

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — ロースター打順・守備位置プルダウン化（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- 野手ビューの打順列を "—/1〜9番" プルダウンに変更
- 指定スロット占有時は既存選手を押し出し方式で再配置
- 守備位置列を POSITIONS 定数ベースのプルダウンに変更
- 「入れる/外す」ボタンを削除し打順プルダウンに統合
- useGameState に setLineupOrder / setPlayerPosition を追加
```

## SPEC.md 更新箇所

なし（内部 UI 実装のみ）

## コミットメッセージ

`feat: ロースター野手ビューの打順・守備位置をプルダウン選択に変更`

## PR タイトル

`feat: ロースター野手ビューの打順・守備位置をプルダウン選択に変更`
