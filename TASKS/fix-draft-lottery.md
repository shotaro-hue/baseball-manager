---
task-id: fix-draft-lottery
type: bugfix
commit-prefix: fix
created: 2026-04-11
roadmap-item: "バグ修正（B-A/B-B/B-C）＋ドラフト1位くじ引きループ演出"
---

# Task: ドラフト指名結果の全球団反映バグ修正 ＋ くじ引きループ演出

## 背景・目的

現行ドラフト実装には 3 つの致命的バグがある。
① `handleDraftComplete` が自チーム（myId）の2巡目以降しか `farm[]` に加えない（CPUは0人、自チームも1位分漏れる）。
② `DraftScreen.cpuPick()` の `avail` が 1 巡目で `_drafted` になった選手を除外せず、2 巡目以降に再指名できてしまう。
③ `DraftLotteryScreen.buildCpuPicks()` が CPU 間の選択を重複排除するため、くじ引き（NPBルール準拠の醍醐味）が事実上発生しない。

上記を修正しつつ、ユーザー要望の「複数球団競合時のくじ引きループ演出」を追加する。

## 機能説明

### バグ修正

- `handleDraftComplete(pl, dr)` で「1巡目 `_r1winner===teamId`」と「2〜6巡目 `dr[p.id]===teamId`」の両方を結合し、全 12 球団の `farm[]` に反映する。
- `cpuPick()` の `avail` フィルタに `&&!p._drafted` を追加して 1 巡目既指名選手を除外する。

### くじ引きループ演出

- `buildCpuPicks()` から `used` セットによる CPU 間重複排除を削除。各 CPU 球団が独立して 1 位を選ぶ → 実際に複数球団が同一選手を選べる。
- 一斉発表（announce フェーズ）後、**全競合ケースを順番にくじ引き解決**するループを実装する。
  - 「競合している選手Xに対して N 球団が競合」→ くじを引く → 当選球団確定 → 外れ球団はその選手を除いた pool から即座に再指名
  - 外れ球団の再指名でさらに競合が発生した場合は、再度くじ引きを実施
  - 無限ループ防止のため **最大3回ループ**（3回目以降は rng() で自動解決）
- 現行の `phase` ステートマシン（`"select"→"announce"→"lottery"→"hazure"→"done"`）を拡張して、複数競合・複数ループに対応させる。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/Draft.jsx` | バグの主戦場。関数位置: `buildCpuPicks` ~117行、`processLottery` ~160行、`drawLottery` ~183行、`confirmHazure` ~209行、`finalizeRound1` ~220行、`DraftScreen.cpuPick` ~423行、`DraftScreen.myPicks` ~397行 |
| `src/hooks/useOffseason.js` | `handleDraftComplete` 69〜74行。ここを修正すればCPUゼロ指名バグは解消 |
| `src/App.jsx` | `draft_lottery` 画面の `onDone` コールバック 163行目付近。`setDraftPool` で `_drafted`/`_r1winner` を埋め込む処理を確認 |
| `src/utils.js` | `rng(min, max)` の仕様確認（`Math.random()` 禁止のため） |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/components/Draft.jsx` | Modify | `DraftLotteryScreen` 全体の改修 + `DraftScreen.cpuPick`/`myPicks` 修正 |
| `src/hooks/useOffseason.js` | Modify | `handleDraftComplete` のみ修正 |

## 実装ガイダンス

### Step 1: useOffseason.js — handleDraftComplete 修正（最優先）

**場所**: `src/hooks/useOffseason.js` 69〜74行

**変更前**:
```js
const handleDraftComplete = (pl, dr) => {
  const myPicks=pl.filter(p=>dr[p.id]===myId);
  setTeams(prev=>prev.map(t=>{if(t.id!==myId) return t;return{...t,farm:[...t.farm,...myPicks.map(p=>({...p,育成:true}))]};}));
  setNewSeasonInfo(prev=>({...(prev||{}),draftCount:myPicks.length,draftNames:myPicks.slice(0,3).map(p=>p.name)}));
  handleNextYear();
};
```

**変更後**:
```js
const handleDraftComplete = (pl, dr) => {
  // チームIDに対応する全指名選手（1巡目 _r1winner + 2〜6巡目 dr[]）を返す
  const picksFor = (teamId) => [
    ...pl.filter(p => p._drafted && p._r1winner === teamId),
    ...pl.filter(p => dr[p.id] === teamId),
  ];
  const myPicks = picksFor(myId);
  setTeams(prev => prev.map(t => {
    const picks = picksFor(t.id);
    if (!picks.length) return t;
    return { ...t, farm: [...t.farm, ...picks.map(p => ({ ...p, 育成: true }))] };
  }));
  setNewSeasonInfo(prev => ({
    ...(prev || {}),
    draftCount: myPicks.length,
    draftNames: myPicks.slice(0, 3).map(p => p.name),
  }));
  handleNextYear();
};
```

---

### Step 2: Draft.jsx — DraftScreen.cpuPick の avail フィルタ修正

**場所**: `src/components/Draft.jsx` ~425行 `cpuPick` 関数内

**変更前**:
```js
const avail=pool.filter(p=>!drafted[p.id]);
```

**変更後**:
```js
const avail=pool.filter(p=>!drafted[p.id]&&!p._drafted);
```

これにより 2 巡目以降の CPU が 1 巡目既指名選手を重複指名しなくなる。

---

### Step 3: Draft.jsx — DraftScreen.myPicks に 1 巡目を含める

**場所**: `src/components/Draft.jsx` ~397行

**変更前**:
```js
const myPicks=pool.filter(p=>drafted[p.id]===myId);
```

**変更後**:
```js
const myPicks=[
  ...pool.filter(p=>p._drafted&&p._r1winner===myId),
  ...pool.filter(p=>drafted[p.id]===myId),
];
```

---

### Step 4: Draft.jsx — DraftLotteryScreen の全面改修

#### 4-1. buildCpuPicks — CPU 間重複排除を撤廃

**変更前**（~117〜138行）: `used` セットが CPU 間重複を防いでいた  
**変更後**: `used` セットをユーザーの pick のみに使い、CPU 間は重複排除しない

```js
const buildCpuPicks = () => {
  const picks = {};
  allSorted.forEach(t => {
    if (t.id === myId) return;
    const avail = availPool.filter(p => !p._drafted); // _drafted 除外のみ
    if (!avail.length) return;
    const needs = analyzeTeamNeeds(t);
    const needsPitcher = needs.some(n => n.type.includes("投手"));
    const scored = avail.map((p, i) => {
      let s = 100 - i * 3;
      if (needsPitcher && p.isPitcher) s += 30;
      if (!needsPitcher && !p.isPitcher) s += 20;
      return { p, s };
    }).sort((a, b) => b.s - a.s);
    // 30%で2位以下から指名（個性を演出）
    const pick = rng(0, 9) < 3 && scored.length > 1
      ? scored[rng(1, Math.min(3, scored.length - 1))].p
      : scored[0].p;
    picks[t.id] = pick;
    // 重複排除しない → 複数球団が同一選手を選べる
  });
  return picks;
};
```

#### 4-2. 状態拡張

`DraftLotteryScreen` に以下の state を追加（既存の state に加える）:
```js
const [lotteryRound, setLotteryRound] = React.useState(0); // くじ引きループ回数
const [pendingConflicts, setPendingConflicts] = React.useState([]); // 未解決競合キュー [{pid, tids}]
const [currentConflictIdx, setCurrentConflictIdx] = React.useState(0); // 現在処理中の競合インデックス
const [resolvedPicks, setResolvedPicks] = React.useState({}); // {teamId: player} 解決済み
```

#### 4-3. processLottery — 全競合を検出してキューに積む

```js
const processLottery = (cpu, existingResolved = {}) => {
  const allPicks = { ...cpu, [myId]: myPick, ...existingResolved };
  // 競合チェック: 全選手について何球団が指名しているか
  const byPlayer = {};
  Object.entries(allPicks).forEach(([tid, p]) => {
    if (!p) return;
    if (!byPlayer[p.id]) byPlayer[p.id] = [];
    byPlayer[p.id].push(tid);
  });
  const conflicts = Object.entries(byPlayer)
    .filter(([, tids]) => tids.length > 1)
    .map(([pid, tids]) => ({ pid, tids }));

  if (conflicts.length > 0) {
    setPendingConflicts(conflicts);
    setCurrentConflictIdx(0);
    // 最初の競合を lottery フェーズへ
    const first = conflicts[0];
    setLotteryTarget(pool.find(p => p.id === first.pid));
    setLotteryTeams(first.tids.map(tid => teams.find(t => t.id === tid)).filter(Boolean));
    setResolvedPicks(existingResolved);
    setPhase("lottery");
  } else {
    // 競合なし → 確定
    finalizeRound1({ ...cpu, [myId]: myPick, ...existingResolved }, {});
  }
};
```

#### 4-4. drawLottery — 外れ球団の再指名後に次の競合を処理

```js
const drawLottery = () => {
  const winner = lotteryTeams[rng(0, lotteryTeams.length - 1)];
  setLotteryResult(winner);

  setTimeout(() => {
    const losers = lotteryTeams.filter(t => t.id !== winner.id);
    const newResolved = { ...resolvedPicks, [winner.id]: lotteryTarget };

    if (losers.length > 0) {
      // 外れ球団の自動再指名（ユーザーが外れ球団の場合は hazure フェーズへ）
      const hPicks = {};
      const usedIds = new Set([
        lotteryTarget.id,
        ...Object.values(cpuPicks).filter(Boolean).map(p => p.id),
        ...Object.values(newResolved).filter(Boolean).map(p => p.id),
      ]);
      losers.forEach(t => {
        if (t.id === myId) return; // ユーザーは hazure フェーズで選択
        const avail = availPool.filter(p => !usedIds.has(p.id));
        if (avail.length) {
          const pick = avail[rng(0, Math.min(2, avail.length - 1))];
          hPicks[t.id] = pick;
          usedIds.add(pick.id);
        }
      });
      setHazurePicks(hPicks);
      setHazureTeams(losers);
      setMyHazure(losers.some(t => t.id === myId));
      setResolvedPicks(newResolved);
      setPhase("hazure");
    } else {
      // 外れ球団なし（2球団競合で片方当選）→ 次の競合へ
      advanceToNextConflict(newResolved, cpuPicks);
    }
  }, 1500);
};
```

#### 4-5. confirmHazure — 外れ1位確定後に次の競合へ

```js
const confirmHazure = (myHazurePick) => {
  const allHazure = { ...hazurePicks };
  if (myHazurePick) allHazure[myId] = myHazurePick;

  // 外れ球団の再指名を resolvedPicks に追加
  const newResolved = { ...resolvedPicks };
  hazureTeams.forEach(t => {
    if (allHazure[t.id]) newResolved[t.id] = allHazure[t.id];
  });

  advanceToNextConflict(newResolved, cpuPicks);
};
```

#### 4-6. advanceToNextConflict — 次の競合へ進む or 完了

```js
const advanceToNextConflict = (resolved, cpu) => {
  const nextIdx = currentConflictIdx + 1;
  const newRound = lotteryRound + 1;

  if (nextIdx < pendingConflicts.length && newRound <= 3) {
    // 次の競合を処理
    setCurrentConflictIdx(nextIdx);
    setLotteryRound(newRound);
    const next = pendingConflicts[nextIdx];
    setLotteryTarget(pool.find(p => p.id === next.pid));
    setLotteryTeams(next.tids.map(tid => teams.find(t => t.id === tid)).filter(Boolean));
    setLotteryResult(null);
    setResolvedPicks(resolved);
    setPhase("lottery");
  } else {
    // 全競合解決 or ループ上限 → 外れ球団で未解決のものを rng 自動解決
    const finalResolved = autoResolveRemaining(resolved, cpu);
    finalizeRound1({ ...cpu, [myId]: myPick, ...finalResolved }, {});
  }
};

// ループ上限到達時の自動解決
const autoResolveRemaining = (resolved, cpu) => {
  const result = { ...resolved };
  const usedIds = new Set(Object.values(result).filter(Boolean).map(p => p.id));
  // resolved に含まれないチームで、競合中だったチームに未解決分を割り当て
  pendingConflicts.slice(currentConflictIdx + 1).forEach(({ pid, tids }) => {
    tids.forEach(tid => {
      if (result[tid]) return;
      const avail = availPool.filter(p => !usedIds.has(p.id) && p.id !== pid);
      if (avail.length) {
        result[tid] = avail[0];
        usedIds.add(avail[0].id);
      }
    });
  });
  return result;
};
```

#### 4-7. lottery フェーズ UI に「第N回戦」インジケーターを追加

`phase==="lottery"` のレンダリング内で、競合が複数ある場合に表示:
```jsx
{pendingConflicts.length > 1 && (
  <div style={{fontSize:10,color:"#94a3b8",textAlign:"center",marginBottom:8}}>
    競合 {currentConflictIdx + 1} / {pendingConflicts.length} 件目
  </div>
)}
```

---

## データモデル変更

追加フィールドなし。既存の `pool[].`_drafted`（boolean）と `pool[]._r1winner`（teamId string）を正しく読み込むだけ。

---

## 受け入れ条件

- [ ] `handleDraftComplete` 実行後、全 12 球団の `farm` に1巡目を含む指名選手が存在する（CPUチームの farm も増加する）
- [ ] 自チームの1巡目指名選手が `DraftScreen` の「自チーム指名済み」リストに表示される
- [ ] 2巡目以降のCPUが1巡目で他球団に指名された選手（`_drafted=true`）を重複指名しない
- [ ] 複数球団が同一選手を1位指名した場合、くじ引き画面が起動し当選球団が表示される
- [ ] 外れ球団が再指名し、再度競合した場合にもくじ引きが行われる（最大3ループ）
- [ ] ループ上限（3回）到達後は残り未解決をrng自動解決して2巡目へ進む
- [ ] ビルド・全テスト通過（`npm run build`）

---

## テストケース

- `src/engine/__tests__/draft.test.js`（存在する場合）または新規 `src/components/__tests__/draftLottery.test.js` に追加
  - 正常系: `handleDraftComplete` が `_r1winner` の選手も各チームの farm に加えること
  - 正常系: `cpuPick` で `_drafted` 選手が avail から除外されること
  - エッジケース: 全チームが同一選手を指名した場合に最大3ループで収束すること

---

## NPB 協約上の制約

NPB選手契約規則（競合時くじ引き）に準拠。1位指名で複数球団が同一選手を指名した場合、くじ引きで交渉権を決定し、外れた球団は「外れ1位」として別の選手を指名。さらに外れ1位同士が被った場合も再度くじ引きを実施（実際のドラフトでも発生実績あり）。上限3ループは ゲームバランス上の簡略化。

---

## 過去バグからの教訓

- **B1 パターン**: 試合結果は両チームに適用する → ドラフト結果も「自チームだけ」でなく「全12球団」に適用する（同じ思想）
- **B10**: `analyzeTeamNeeds()` 戻り値は `{type, score}[]` であり `n.type.includes(...)` と書く（`n.includes(...)` は TypeError。`buildCpuPicks` も同様に注意）

---

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng(min, max)` / `rngf(min, max)` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（今回追加する数値: ループ上限3→`DRAFT_LOTTERY_MAX_ROUNDS`）
- 選手・イベント ID は `uid()` で生成（新規ID生成が必要な場合のみ）

---

## ROADMAP.md 更新指示

- バグ修正テーブル（「バグ修正 / インフラ改善」セクション）に以下を追記:

```
| B14 | **[P0] ドラフト指名選手ゼロバグ（全球団未反映・1位漏れ・重複指名）** | `handleDraftComplete` が myId のみ・2巡目以降のみを farm に追加 → 全12球団に1〜6巡目全指名を反映。`cpuPick()` の avail フィルタに `!p._drafted` を追加。くじ引き演出を CPU 間競合が実際に発生するよう `buildCpuPicks` の重複排除を廃止し複数競合ループ（最大3回）を実装 | TBD |
```

- 「最終更新」ヘッダー行を `YYYY-MM-DD（ドラフト指名バグ修正＋くじ引きループ完了）` に更新

---

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — ドラフト指名結果バグ修正＋くじ引きループ演出（コミットハッシュ）

**仕様本文への影響あり（§4.7 ドラフトシステム）**

- [fix] handleDraftComplete: 全12球団の1〜6巡目指名を farm に反映（B-A）
- [fix] DraftScreen.cpuPick: _drafted 選手を avail から除外し2巡目以降の重複指名を防止（B-B）
- [fix] DraftScreen.myPicks: 1巡目指名（_r1winner）を自チーム指名済みリストに追加（B-C）
- [feat] DraftLotteryScreen: CPU間の重複排除を廃止し実際の競合が発生するよう変更
- [feat] DraftLotteryScreen: 複数競合を順番にくじ引き解決するループ（最大3回）を実装
- [feat] くじ引き画面に「競合N/M件目」インジケーターを追加
```

---

## SPEC.md 更新箇所

§4.7 ドラフトシステム「ドラフト進行」セクションに以下を追記:

```
#### 1位競合処理（くじ引きループ）

複数球団が同一選手を1位指名した場合:
1. 競合した全球団でくじ引きを実施
2. 外れた球団は「外れ1位」として別の選手を即座に指名
3. 外れ1位同士で再競合した場合は再度くじ引き（最大 `DRAFT_LOTTERY_MAX_ROUNDS=3` 回）
4. ループ上限到達後の未解決指名は乱数で自動解決
```

---

## コミットメッセージ

`fix: ドラフト指名選手ゼロバグ修正（全球団反映・1位漏れ・重複指名）＋くじ引きループ演出`

## PR タイトル

`fix: ドラフト指名選手ゼロバグ修正（全球団反映・1位漏れ・重複指名）＋くじ引きループ演出`
