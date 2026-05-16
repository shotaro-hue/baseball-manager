---
task-id: combine-batter-screens
type: ui
commit-prefix: feat
created: 2026-04-12
roadmap-item: "UI改善 — 野手画面統合（ROADMAP外）"
---

# Task: ロースタータブ野手画面統合

## 背景・目的

現在の RosterTab には `🏏 野手`（スタメン・控えが混在したテーブル）と
`🌿 二軍`（二軍野手、ただし投手統合タスク `combine-pitcher-screens` 適用後は野手のみ）
という2つのサブタブが分断されている。
この2つを `🏏 野手` タブに統合し、「スタメン」「控え野手」「二軍野手」の
3セクションを1画面で管理できるようにする。

**前提**: このタスクは `TASKS/combine-pitcher-screens.md` が先に実装されていることを前提とする。
投手統合後の RosterTab に対して変更を加える。投手統合後の状態:
- タブナビゲーション: `[🏏 野手] [⚾ 投手] [🌿 二軍] [💬 会話]`
- `🌿 二軍` ビューは `team.farm.filter(p => !p.isPitcher)` の野手のみを表示

## 機能説明

- `🏏 野手` タブを開くと「スタメン」「控え野手」「二軍野手」の3カードが縦に並んで表示される
- `🌿 二軍` タブボタンを廃止する（ナビゲーションから削除）
- `view === "farm"` ブロックを削除する

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/tabs/RosterTab.jsx` | **全体を読む**。combine-pitcher-screens 適用後の状態を前提に変更する |
| `src/engine/sabermetrics.js` | `saberBatter()` の戻り値フィールド確認（OPS）|
| `src/constants.js` | `MAX_ROSTER`, `MAX_FARM`, `POSITIONS`, `FIELDING_POSITIONS`, `TRAINING_OPTIONS` の確認 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/components/tabs/RosterTab.jsx` | Modify | 野手画面統合のメイン変更 |

App.jsx・hooks・engine には変更不要。

## 実装ガイダンス

### Step 1: タブナビゲーション変更

combine-pitcher-screens 適用後のナビゲーション:
```jsx
[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["talk","💬 会話"]]
```

`"farm"` エントリを削除:
```jsx
[["batters","🏏 野手"],["pitchers","⚾ 投手"],["talk","💬 会話"]]
```

### Step 2: 既存変数の整理

現行（combine-pitcher-screens 適用後）の `view === "batters"` ブロック直前に
以下の変数が宣言されている（コンポーネント本体、return の前）:

```js
const batters = team.players.filter(p => !p.isPitcher);
const liMap = {};  team.lineup.forEach((id, i) => liMap[id] = i+1);
const batterOriginalIndex = {};
batters.forEach((p, i) => { batterOriginalIndex[p.id] = i; });
const orderedBatters = [...batters].sort(...);  // lineup順 → 元インデックス順
const lineupPlayers = team.lineup.map(id => batters.find(p => p.id===id)).filter(Boolean);
const posCountInLineup = lineupPlayers.reduce(...);
const rosterDhMode = team.rosterDhMode ?? team.dhEnabled;
const lineupLimit = rosterDhMode ? 9 : 8;
const lineupSlots = Array.from({ length: lineupLimit }, (_, i) => i+1);
```

これらはそのまま利用する。以下2つの派生変数を追加で宣言する（return の前）:

```js
// スタメン: lineup に含まれる野手を打順昇順で
const starterBatters = lineupPlayers;  // すでに lineup 順

// 控え: lineup に含まれない野手（OPS 降順でソート）
const benchBatters = batters
  .filter(p => !team.lineup.includes(p.id))
  .sort((a, b) => {
    const sa = saberBatter(a.stats), sb = saberBatter(b.stats);
    return (sb.OPS || 0) - (sa.OPS || 0);
  });

// 二軍野手
const farmBatters = team.farm.filter(p => !p.isPitcher);
```

### Step 3: `view === "batters"` ブロックの置き換え

既存の1カード構成を3カード構成に置き換える。

---

#### セクション 1 — スタメン

カードヘッダー: `打線設定 ({team.lineup.length}/{lineupLimit})`
ヘッダー右側に現行の守備配置サマリー・DH有無トグル・自動編成ボタンをそのまま配置。

テーブル列（現行 batters テーブルと同一）:

| 列 | 内容 |
|---|---|
| `#` | `select` (1〜lineupLimit番 / —) + `↑↓` ボタン（lineup 参加時のみ表示） |
| 選手名 | name + 外国人バッジ + 負傷表示（クリックでプレイヤーモーダル） |
| 守備 | position `select` + 重複警告 |
| 年齢 | mono |
| ミート | `OV v={p.batting.contact}` |
| 長打 | `OV v={p.batting.power}` |
| 走力 | `OV v={p.batting.speed}` |
| 選球 | `OV v={p.batting.eye}` |
| クラッチ | `OV v={p.batting.clutch}` |
| 変化球 | `OV v={p.batting.breakingBall}` |
| 状態 | `CondBadge` |
| モラル | `MoralBadge` |
| 打率 | `fmtAvg(p.stats.H, p.stats.AB)` |
| HR | `p.stats.HR`（20本以上で金色） |
| OPS | `sb.OPS`（色付き） |
| 強化 | `trainingFocus` セレクト（野手用オプション） |
| 操作 | `↓` ボタン（二軍降格 `onDemo`） |

表示対象: `starterBatters`（打順昇順）。
負傷選手は `opacity: 0.55`。

スタメンが0人のとき「打線が設定されていません」を表示。

---

#### セクション 2 — 控え野手

カードヘッダー: `控え野手 ({benchBatters.length}人)`

テーブル列はスタメンセクションと同一（`#` 列の `select` も維持 → 番号を選ぶとスタメン追加）。
`↑↓` ボタンは `team.lineup.includes(p.id)` が false のため表示されない（既存条件のまま）。

表示対象: `benchBatters`（OPS 降順）。
controlBatters が0人のとき「控え野手なし」を表示。

> **注意**: 現行コードでは `orderedBatters` にスタメン・控えが混在し、
> 同一 JSX で行を描画している。
> 統合後は `starterBatters` と `benchBatters` を**別テーブル**として分けて描画する。
> テーブルの JSX は共通化せず単純にコピーして構わない（DRY より可読性優先）。

---

#### セクション 3 — 二軍野手

カードヘッダー: `二軍野手 ({farmBatters.length}/{MAX_FARM})`

テーブル列は現行 `farm` ビューのテーブルと同一（投手行を除外済み）:

| 選手名 | 守備 | 年齢 | 育成年 | 潜在 | 主要能力（ミート） | 育成目標 | 状態 | 二軍成績 | 操作 |

`farmStat` の計算:
```js
const farmStat = s2 && !p.isPitcher && s2.PA > 0
  ? `${fmtAvg(s2.H, s2.PA)} ${s2.HR}HR`
  : "—";
```
（投手分岐は不要）

昇格ボタン・支配下登録ボタンは現行 `farm` ビューから JSX をそのままコピーする。
`justConverted` state と `handleConvertIkusei` ハンドラはコンポーネント上部に既に宣言されているためそのまま利用可能。

farmBatters が0人のとき「二軍野手なし」を表示。

> 一軍枠に空きがある場合の昇格推薦バナー（現行 `farm` ビュー先頭の緑バナー）も
> 二軍野手セクションの上部に移植する。ただし野手のみを対象とするため
> `eligible = team.farm.filter(p => !p.育成 && !p.isPitcher && ...)` に変更する。

---

### Step 4: `view === "farm"` ブロックの削除

combine-pitcher-screens 適用後の `farm` ビューブロック全体を削除する。

---

### 全体の JSX 骨格

```jsx
{view === "batters" && (
  <div>
    {/* 昇格推薦バナー */}
    {(()=>{
      const eligible = team.farm.filter(p => !p.isPitcher && !p.育成 && (p.injuryDaysLeft??0)===0 && (p.registrationCooldownDays??0)===0);
      if (team.players.length < MAX_ROSTER && eligible.length > 0) {
        const top = eligible.slice().sort((a,b) => (b.potential??50)-(a.potential??50)).slice(0,3);
        return (
          <div style={{marginBottom:8,padding:"8px 12px",background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",borderRadius:6,fontSize:11,color:"#34d399"}}>
            💡 一軍枠に空き（{MAX_ROSTER - team.players.length}枠）- 昇格推薦: {top.map(p => p.name).join('、')}
          </div>
        );
      }
      return null;
    })()}

    {/* セクション1: スタメン */}
    <div className="card" style={{marginBottom:8}}>
      <div className="card-h" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span>スタメン ({team.lineup.length}/{lineupLimit})</span>
        {/* 守備配置サマリー・DH トグル・自動編成ボタン（現行と同一） */}
        ...
      </div>
      <div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead>...</thead>
          <tbody>
            {starterBatters.map(p => { /* 現行 orderedBatters.map の JSX と同一 */ })}
            {starterBatters.length === 0 && (
              <tr><td colSpan={17} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>打線が設定されていません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* セクション2: 控え野手 */}
    <div className="card" style={{marginBottom:8}}>
      <div className="card-h">控え野手 ({benchBatters.length}人)</div>
      <div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead>...</thead>
          <tbody>
            {benchBatters.map(p => { /* starterBatters と同一 JSX */ })}
            {benchBatters.length === 0 && (
              <tr><td colSpan={17} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>控え野手なし</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* セクション3: 二軍野手 */}
    <div className="card">
      <div className="card-h">二軍野手 ({farmBatters.length}/{MAX_FARM})</div>
      <div style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead>
            <tr><th>選手名</th><th>守備</th><th>年齢</th><th>育成年</th><th>潜在</th><th>主要能力</th><th>育成目標</th><th>状態</th><th>二軍成績</th><th></th></tr>
          </thead>
          <tbody>
            {farmBatters.map(p => { /* farm ビューの行 JSX（isPitcher 分岐除去済み） */ })}
            {farmBatters.length === 0 && (
              <tr><td colSpan={10} style={{color:"#1e2d3d",padding:"16px",textAlign:"center"}}>二軍野手なし</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
)}
```

## データモデル変更

なし（既存 `team.players`, `team.lineup`, `team.farm` をそのまま使用）

## 受け入れ条件

- [ ] `🏏 野手` タブを開くと「スタメン」「控え野手」「二軍野手」の3カードが縦に並んで表示される
- [ ] スタメンカードに打順 `select` + `↑↓` ボタンが表示され、打順変更が正常に動作する
- [ ] 控え野手カードにも `select` ドロップダウンが表示され、番号を選ぶとスタメンに追加される
- [ ] 二軍野手カードに `↑一軍` ボタンと `支配下登録` ボタンが表示され、昇格が正常に動作する
- [ ] `🌿 二軍` タブボタンがナビゲーションから消えている
- [ ] `view === "farm"` の残骸コードが存在しない
- [ ] 投手は野手セクションに表示されない
- [ ] `npm run build` が警告なしで通過する

## テストケース

既存テストファイルへの追加は不要（純粋な UI リファクタリングのため）。
手動確認: ローカルで `npm run dev` を起動し、
- 打順変更（select + ↑↓）
- 控えからスタメン追加（select で番号指定）
- 二軍からの一軍昇格
- 育成→支配下登録
の各操作を目視確認する。

## NPB 協約上の制約

なし

## 過去バグからの教訓

- **U1**: 打順変更は「スワップ」方式（挿入ではなく）で実装済み。`onSetLineupOrder` ハンドラの動作を変えないこと。

## コーディング規約リマインダー

- `Math.random()` 禁止（今回は RNG 不使用）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（今回は定数追加なし）

## 実装順序の注意

**必ず `combine-pitcher-screens` タスクを先に実装・コミットしてから本タスクに着手すること。**
本タスクは combine-pitcher-screens 適用後の RosterTab（`view === "farm"` が野手のみを表示する状態）を前提にしている。

## ROADMAP.md 更新指示

ROADMAP 外の UI 改善タスクのため、ROADMAP.md の更新は不要。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-12 — 野手画面統合（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- RosterTab の `🏏 野手` タブにスタメン・控え野手・二軍野手の3セクションを統合
- `🌿 二軍` サブタブを廃止
- `view === "farm"` ブロックを削除
```

## SPEC.md 更新箇所

なし

## コミットメッセージ

`feat: ロースタータブの野手画面をスタメン・控え・二軍野手の1画面に統合`

## PR タイトル

`feat: ロースタータブの野手画面をスタメン・控え・二軍野手の1画面に統合`
