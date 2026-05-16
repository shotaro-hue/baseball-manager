---
task-id: combine-pitcher-screens
type: ui
commit-prefix: feat
created: 2026-04-12
roadmap-item: "UI改善 — 投手画面統合（ROADMAP外）"
---

# Task: ロースタータブ投手画面統合

## 背景・目的

現在の RosterTab には `⚾ 投手` と `📋 継投` という2つのサブタブがあり、
投手の能力値確認と継投パターン設定を行き来する必要がある。
この2つを廃止・統合し、1画面で「先発」「継投」「2軍投手」の3セクションを
縦に並べることで、投手管理の操作ステップを削減する。

## 機能説明

- `⚾ 投手` タブを開くと3セクションが1スクロール画面に表示される
- `📋 継投` タブを廃止する（ナビゲーションボタンから削除）
- `🌿 二軍` タブは野手のみを表示する（投手は第3セクションへ移動）

### セクション 1: 先発ローテーション (x/6)

現在の `pattern` ビュー「先発ローテーション」カードと、
現在の `pitchers` ビューのテーブル列を統合したテーブルを表示する。

テーブル列（左から）:
1. ローテ順番号（1〜6）
2. 選手名（クリックでプレイヤーモーダル）＋ HandBadge ＋ 負傷表示
3. 役割 (subtype)
4. 年齢
5. 球速 (OV)
6. 制球 (OV)
7. スタミナ (OV)
8. 変化球 (OV)
9. 球種 (OV) ← variety
10. ピンチ (OV) ← clutchP
11. 状態 (CondBadge)
12. モラル (MoralBadge)
13. 防御率（色付き）
14. WHIP（色付き）
15. 勝 (W)
16. 敗 (L)
17. 強化（trainingFocus セレクト、投手用オプションのみ）
18. 操作列: `[↑][↓][✕]`（ローテ並び替え・除外）

ローテ順は `team.rotation` 配列の順序に従う。
テーブル下部に「＋ 先発追加...」セレクトを配置（非ローテ投手から選択）。
ローテが空のとき「先発投手が未設定です」メッセージを表示。

### セクション 2: 継投

**指名投手サブカード（現行 `pattern` ビューの「指名投手」カードと同一）:**

- 🔒 抑え（9回）セレクト + 現在指名選手の球速/制球/Cond 表示
- ⚙️ セットアッパー（8回）セレクト + 同上

**中継ぎ優先順サブカード:**

現在の `pattern` ビュー「中継ぎ優先順」カードに能力値を追加したテーブルを表示する。

テーブル列（左から）:
1. 優先順番号（`middleOrder` に含まれる場合は番号、含まれない場合は「—」）
2. 選手名（クリックでプレイヤーモーダル）＋ HandBadge ＋ 負傷表示
3. 役割 (subtype)
4. 年齢
5. 球速 (OV)
6. 制球 (OV)
7. スタミナ (OV)
8. 変化球 (OV)
9. 状態 (CondBadge)
10. モラル (MoralBadge)
11. 防御率（色付き）
12. WHIP（色付き）
13. 強化（trainingFocus セレクト、投手用オプションのみ）
14. 操作列:
    - 抑え/セットアッパー指名バッジ（指名済みの場合 `opacity: 0.5`）
    - 優先順の `[↑][↓][✕]` または `[＋優先]`ボタン

表示順: `middleOrder` 順 → 未登録の非ローテ投手の順（現行と同じ `orderedBullpen` ロジック）。

### セクション 3: 2軍投手

`team.farm` から `p.isPitcher === true` の選手のみを表示する。
列構成は現行 `farm` ビューのテーブルと同じ（ただし `isPitcher===false` 行は除外）:

| 選手名 | 守備 | 年齢 | 育成年 | 潜在 | 主要能力（球速） | 育成目標 | 状態 | 二軍成績（W/ERA） | 操作 |

二軍投手がゼロの場合は「二軍投手なし」を表示。

---

### `🌿 二軍` タブの変更

`view === "farm"` の表示から `p.isPitcher === true` の行を除外する。
投手が1人でも存在した場合、テーブル上部に以下の注記を表示:

```
💡 二軍投手は「⚾ 投手」タブで確認できます
```

ファーム全員が投手の場合は「二軍野手なし」と表示。

---

### タブナビゲーションの変更

```js
// 変更前（line 63）
[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["pattern","📋 継投"],["talk","💬 会話"]]

// 変更後
[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["talk","💬 会話"]]
```

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/tabs/RosterTab.jsx` | **全体を読む**（410行）。変更の実体はすべてここ |
| `src/engine/sabermetrics.js` | `saberPitcher()` の戻り値フィールド確認（ERA, WHIP）|
| `src/constants.js` | `MAX_FARM`, `TRAINING_OPTIONS` のフィルタ条件確認 |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/components/tabs/RosterTab.jsx` | Modify | 投手画面統合のメイン変更 |

App.jsx・hooks・engine には変更不要。

## 実装ガイダンス

### Step 1: タブナビゲーション変更（line 63 付近）

```jsx
// "pattern" エントリを削除
[["batters","🏏 野手"],["pitchers","⚾ 投手"],["farm","🌿 二軍"],["talk","💬 会話"]]
```

### Step 2: `view === "pitchers"` ブロックの置き換え（line 164〜191）

現行の `pitchers` ビュー（テーブル1本）を削除し、3セクション構成に置き換える。

**セクション 1 — 先発ローテーション:**

```jsx
{view === "pitchers" && (
  <div>
    {/* === セクション1: 先発 === */}
    <div className="card" style={{marginBottom: 8}}>
      <div className="card-h">先発ローテーション ({rotPitchers.length}/6)</div>
      <div style={{overflowX: "auto"}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>選手名</th><th>役割</th><th>年齢</th>
              <th>球速</th><th>制球</th><th>スタミナ</th>
              <th>変化球</th><th>球種</th><th>ピンチ</th>
              <th>状態</th><th>モラル</th>
              <th>防御率</th><th>WHIP</th><th>勝</th><th>敗</th>
              <th>強化</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rotPitchers.map((p, i) => {
              const sp = saberPitcher(p.stats);
              return (
                <tr key={p.id}>
                  <td style={{fontSize:10,color:"#374151",width:16,textAlign:"right"}}>{i+1}</td>
                  <td style={{fontWeight:700,fontSize:12,cursor:"pointer"}}
                      onClick={() => onPlayerClick?.(p, team.name)}>
                    <span style={{color:"#60a5fa"}}>{p.name}</span>
                    <HandBadge p={p}/>
                    {(p.injuryDaysLeft??0)>0 && <span style={{marginLeft:4,fontSize:9,color:"#f87171"}}>🤕{p.injuryDaysLeft}</span>}
                  </td>
                  <td style={{fontSize:10,color:"#374151"}}>{p.subtype}</td>
                  <td className="mono" style={{color:"#374151"}}>{p.age}</td>
                  <td><OV v={p.pitching.velocity}/></td>
                  <td><OV v={p.pitching.control}/></td>
                  <td><OV v={p.pitching.stamina}/></td>
                  <td><OV v={p.pitching.breaking}/></td>
                  <td><OV v={p.pitching.variety}/></td>
                  <td><OV v={p.pitching.clutchP}/></td>
                  <td><CondBadge p={p}/></td>
                  <td><MoralBadge v={p.morale}/></td>
                  <td className="mono" style={{color: sp.ERA>0&&sp.ERA<3?"#34d399":sp.ERA<4?"#f5c842":sp.ERA>0?"#f87171":undefined}}>
                    {sp.ERA>0 ? sp.ERA : "---"}
                  </td>
                  <td className="mono" style={{color: sp.WHIP>0&&sp.WHIP<1.0?"#34d399":sp.WHIP<1.3?"#f5c842":sp.WHIP<1.5?"#94a3b8":"#f87171"}}>
                    {sp.WHIP>0 ? sp.WHIP : "---"}
                  </td>
                  <td className="mono" style={{color:"#34d399"}}>{p.stats.W}</td>
                  <td className="mono" style={{color:"#f87171"}}>{p.stats.L}</td>
                  <td>
                    <select style={{fontSize:9,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"1px 2px"}}
                      value={p.trainingFocus||""}
                      onChange={e => onSetTrainingFocus && onSetTrainingFocus(p.id, e.target.value||null)}>
                      {TRAINING_OPTIONS.filter(([k]) => !["contact","power","eye","speed","arm","defense"].includes(k))
                        .map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <button style={btnSm} onClick={() => onMoveRotation && onMoveRotation(p.id,-1)} disabled={i===0}>↑</button>
                    <button style={btnSm} onClick={() => onMoveRotation && onMoveRotation(p.id,1)} disabled={i===rotPitchers.length-1}>↓</button>
                    <button style={{...btnSm,color:"#f87171"}} onClick={() => onRemoveFromRotation && onRemoveFromRotation(p.id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rotPitchers.length < 6 && nonRotPitchers.length > 0 && (
        <div style={{marginTop:6}}>
          <select style={{fontSize:10,background:"#0d1b2a",color:"#94a3b8",border:"1px solid #1e3a5f",borderRadius:3,padding:"3px 6px"}}
            value="" onChange={e => { if(e.target.value) onSetStarter && onSetStarter(e.target.value); }}>
            <option value="">＋ 先発追加...</option>
            {nonRotPitchers.map(p => <option key={p.id} value={p.id}>{p.name}（{p.subtype}）</option>)}
          </select>
        </div>
      )}
      {rotPitchers.length === 0 && (
        <div style={{color:"#374151",fontSize:11,padding:"8px 0"}}>先発投手が未設定です</div>
      )}
    </div>
    {/* === セクション2: 継投 === */}
    ...
    {/* === セクション3: 2軍投手 === */}
    ...
  </div>
)}
```

**セクション 2 — 継投:**

指名投手カードは現行 `pattern` ビューの「指名投手」カード（line 308〜332）をそのまま移植する。

中継ぎ優先順は現行の `orderedBullpen` ロジック（line 265〜268）を流用し、
各行に `OV` 能力値（球速/制球/スタミナ/変化球）と saberPitcher 成績（ERA/WHIP）を追加する。

> **注意**: セクション2の変数（`pattern`, `rotPitchers`, `nonRotPitchers`, `closerP`, `setupP`, `middleOrder`, `orderedBullpen`, `moveMiddle`, `addToMiddle`, `removeFromMiddle`, `cardStyle`, `rowStyle`, `btnSm`）は
> 現行 `view === "pattern"` の即時実行関数（`{view==="pattern"&&(()=>{...})()}`）内で定義されている。
> 統合後は `view === "pitchers"` ブロックの先頭で変数を宣言し、3セクション全体で共有する。

**セクション 3 — 2軍投手:**

`team.farm.filter(p => p.isPitcher)` で投手のみを抽出し、
現行 `farm` ビューのテーブル行 JSX（line 222〜248）をそのまま流用する。
`farmStat` は `isPitcher === true` なので `s2&&p.isPitcher&&s2.IP>0` 分岐のみ使用される。

昇格ボタン（`onPromo`）・支配下登録ボタン（`handleConvertIkusei`）は同一ハンドラを呼ぶためそのまま動作する。

### Step 3: `view === "pattern"` ブロックの削除（line 258〜366）

Step 2 で内容を移植したあと、`view === "pattern"` ブロック全体を削除する。

### Step 4: `view === "farm"` ブロックの変更（line 192〜257）

以下2点を変更する:

1. `team.farm.map(...)` を `team.farm.filter(p => !p.isPitcher).map(...)` に変更
2. テーブル上部に投手注記を追加:
   ```jsx
   {team.farm.some(p => p.isPitcher) && (
     <div style={{marginBottom:8,fontSize:11,color:"#94a3b8",padding:"6px 10px",
       background:"rgba(96,165,250,.06)",border:"1px solid rgba(96,165,250,.2)",borderRadius:6}}>
       💡 二軍投手は「⚾ 投手」タブで確認できます
     </div>
   )}
   ```
3. 「二軍選手なし」メッセージを `colspan={10}` のまま維持（野手0人のケース）

### 変数宣言の移動

現行 `view === "pattern"` の即時実行関数内にあるすべての変数を、
コンポーネント本体（`return` の前）に移動する:

```js
// return の直前に追加
const pattern = team.pitchingPattern ?? {closerId:null, setupId:null, middleOrder:[]};
const rotPitchers = team.rotation.map(id => team.players.find(p => p.id===id)).filter(Boolean);
const nonRotPitchers = pitchers.filter(p => !team.rotation.includes(p.id));
const closerP = pitchers.find(p => p.id===pattern.closerId);
const setupP  = pitchers.find(p => p.id===pattern.setupId);
const middleOrder = pattern.middleOrder ?? [];
const orderedBullpen = [
  ...middleOrder.map(id => pitchers.find(p => p.id===id)).filter(Boolean),
  ...nonRotPitchers.filter(p => !middleOrder.includes(p.id)),
];
const moveMiddle = (pid, dir) => {
  const arr = [...middleOrder];
  const i = arr.indexOf(pid);
  if(i<0){onSetPitchingPattern&&onSetPitchingPattern({middleOrder:[...arr,pid]});return;}
  const j = i+dir; if(j<0||j>=arr.length) return;
  [arr[i],arr[j]] = [arr[j],arr[i]];
  onSetPitchingPattern && onSetPitchingPattern({middleOrder:arr});
};
const addToMiddle    = pid => { if(!middleOrder.includes(pid)) onSetPitchingPattern&&onSetPitchingPattern({middleOrder:[...middleOrder,pid]}); };
const removeFromMiddle = pid => onSetPitchingPattern&&onSetPitchingPattern({middleOrder:middleOrder.filter(id=>id!==pid)});
const cardStyle = {background:"rgba(14,27,46,.6)",border:"1px solid #1e3a5f",borderRadius:6,padding:"10px 12px",flex:1,minWidth:140};
const rowStyle  = {display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid rgba(30,58,95,.4)"};
const btnSm     = {fontSize:10,padding:"1px 6px",borderRadius:3,cursor:"pointer",background:"rgba(30,58,95,.6)",border:"1px solid #1e3a5f",color:"#94a3b8"};
```

## データモデル変更

なし（既存 `team.pitchingPattern`, `team.rotation`, `team.farm` をそのまま使用）

## 受け入れ条件

- [ ] `⚾ 投手` タブを開くと「先発ローテーション」「継投」「2軍投手」の3カードが縦に並んで表示される
- [ ] 先発カードのテーブルに球速/制球/スタミナ/変化球/球種/ピンチ/状態/モラル/防御率/WHIP/勝/敗/強化列がすべて表示される
- [ ] ローテ並び替え（↑↓）・除外（✕）・先発追加セレクトが正常に動作する
- [ ] 継投カードで抑え/セットアッパー指名が正常に動作する
- [ ] 中継ぎ優先順の `[↑][↓][✕][＋優先]` が正常に動作する
- [ ] `📋 継投` タブボタンがナビゲーションから消えている
- [ ] `🌿 二軍` タブに投手行が表示されず、「⚾ 投手タブへ」注記が表示される
- [ ] `npm run build` が警告なしで通過する

## テストケース

既存テストファイルへの追加は不要（純粋な UI リファクタリングのため）。
手動確認: ローカルで `npm run dev` を起動し、ロースタータブ→投手タブの表示と各操作を目視確認する。

## NPB 協約上の制約

なし

## 過去バグからの教訓

特になし（state 変更なし・両チーム処理なし）

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（今回は RNG 不使用）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（今回は定数追加なし）

## ROADMAP.md 更新指示

ROADMAP 外の UI 改善タスクのため、ROADMAP.md の更新は不要。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-12 — 投手画面統合（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- RosterTab の `⚾ 投手` タブに先発ローテーション・継投・2軍投手の3セクションを統合
- `📋 継投` サブタブを廃止
- `🌿 二軍` タブから投手行を除外し「⚾ 投手タブへ」注記を追加
```

## SPEC.md 更新箇所

なし

## コミットメッセージ

`feat: ロースタータブの投手画面を先発・継投・2軍投手の1画面に統合`

## PR タイトル

`feat: ロースタータブの投手画面を先発・継投・2軍投手の1画面に統合`
