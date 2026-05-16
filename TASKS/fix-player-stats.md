---
task-id: fix-player-stats
type: bugfix
commit-prefix: fix
created: 2026-04-11
roadmap-item: "B13 選手成績集計バグ修正（BF過剰計上・キャリア通算WHIP/FIP崩壊・先発不在時pitcherId未設定）"
---

# Task: 選手成績集計バグ修正（投手奪三振数を含む）

## 背景・目的

投手の奪三振数（`stats.Kp`）をはじめとする個人成績が、特定条件下で正しく集計されない複数のバグが存在する。
コードレビューにより以下 3 箇所の問題を特定した。いずれも `postGame.js` / `CareerTable.jsx` / `simulation.js` に起因し、
MVP 選考・沢村賞・歴代記録（`singleSeasonK`）など下流ロジックにも波及する。

## 機能説明

以下 3 つのバグをすべて修正する。付随して `simulation.js` 内の `Math.random()` 直接呼び出しも規約準拠に置換する。

### Bug A: 盗塁企図が投手の BF（対戦打者数）に加算される
- `postGame.js` の `myPitchABs` フィルタが `isStolenBase:true` イベントを除外していない。
- 盗塁企図・盗塁刺が BF に加算されるため、Kpct（三振率 = Kp/BF）が過小評価される。

### Bug B: キャリア通算 WHIP / FIP / xFIP が常に崩壊した値になる
- `CareerTable.jsx` の `totals` オブジェクトに `BBp`・`HBPp`・`Hp`・`HRp` が含まれていない。
- 代わりに存在しないフィールド `BB`（打者の四球）・`HRA`（emptyStats に存在しないキー）を参照。
- `saberPitcher(totals)` の WHIP 計算で `BBp` と `Hp` が `undefined → 0` になるため、通算 WHIP = 0 になる。

### Bug C: 全先発投手が故障・降格時に pitcherId が undefined になり投手全成績が消える
- `initGameState` の `myStarter` フォールバックが `p.isPitcher && p.subtype === '先発'` 限定。
- 自チームのローテ配列が空になり、残る投手が中継ぎ・抑えのみの場合、`myStarter = undefined` になる。
- すべての打席ログで `pitcherId: undefined` となり `myPitchABs` フィルタの `&& e.pitcherId` で弾かれ、
  投手全員の Kp・BF・IP・ER 等が一切更新されない。
- 対して `opStarter` のフォールバックは `oppTeam.players.find(p => p.isPitcher)` で条件なし（非対称バグ）。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/postGame.js` | Bug A: `myPitchABs` フィルタ（13行目）・Bug A 全体で30行以内 |
| `src/components/tabs/CareerTable.jsx` | Bug B: `totals` オブジェクト（42行目付近） |
| `src/engine/simulation.js` | Bug C: `initGameState` 内の `myStarter`/`opStarter` 定義（385〜386行目） |
| `src/engine/player.js` | `emptyStats()` の全フィールド確認（14〜18行目） |
| `src/engine/sabermetrics.js` | `saberPitcher()` が要求するフィールド確認（40〜53行目） |
| `src/utils.js` | `rngf(min, max)` の使い方確認（Math.random() 置換用） |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/engine/postGame.js` | Modify | `myPitchABs` フィルタに `&& !e.isStolenBase` を追加 |
| `src/components/tabs/CareerTable.jsx` | Modify | `totals` の pitcherfieldを修正・追加 |
| `src/engine/simulation.js` | Modify | `myStarter` フォールバック修正 + `Math.random()` 置換 |
| `src/engine/__tests__/simulation.test.js` | Modify | Bug A / C のユニットテスト追加（下記参照） |

## 実装ガイダンス

### Step 1: Bug A — postGame.js（13行目）

**現在:**
```js
const myPitchABs = log.filter((e) => e.scorer === !isMyTeam && e.pitcherId && e.result && e.result !== "change");
```

**修正後:**
```js
const myPitchABs = log.filter((e) => e.scorer === !isMyTeam && e.pitcherId && e.result && e.result !== "change" && !e.isStolenBase);
```

理由: 盗塁イベント（`isStolenBase:true`）は打席結果ではないため投手の BF に含めてはならない。
打者側の `allMyEvents` ループ内では既に `isStolenBase` を SB/CS として別処理しており（46〜51行目）、
投手側フィルタも同様に除外する必要がある。

### Step 2: Bug B — CareerTable.jsx（42行目）

**現在:**
```js
const totals = {
  PA:sumK("PA"), AB:sumK("AB"), H:sumK("H"), HR:sumK("HR"), RBI:sumK("RBI"),
  SB:sumK("SB"), BF:sumK("BF"), W:sumK("W"), L:sumK("L"), SV:sumK("SV"),
  IP:sumK("IP"), Kp:sumK("Kp"), ER:sumK("ER"), BB:sumK("BB"), HRA:sumK("HRA")
};
```

**修正後:**
```js
const totals = {
  PA:sumK("PA"), AB:sumK("AB"), H:sumK("H"), HR:sumK("HR"), RBI:sumK("RBI"),
  SB:sumK("SB"), BF:sumK("BF"), W:sumK("W"), L:sumK("L"), SV:sumK("SV"),
  IP:sumK("IP"), Kp:sumK("Kp"), ER:sumK("ER"),
  BBp:sumK("BBp"), HBPp:sumK("HBPp"), Hp:sumK("Hp"), HRp:sumK("HRp")
};
```

変更点:
- `BB:sumK("BB")` → `BBp:sumK("BBp")` （投手の四球フィールド名は `BBp`）
- `HRA:sumK("HRA")` → `HRp:sumK("HRp")` （`emptyStats` に `HRA` は存在しない、正しくは `HRp`）
- `HBPp:sumK("HBPp")` を追加（`saberPitcher().WHIP` の `totalBB = BBp + HBPp` に必要）
- `Hp:sumK("Hp")` を追加（`saberPitcher().WHIP = (BBp + Hp) / IP` に必要）

確認: `saberPitcher(s)` が参照するフィールド（`sabermetrics.js` 40〜53行目）:
- `s.BBp`, `s.HBPp` → `totalBB` に使用
- `s.Hp`, `s.HRp`, `s.Kp`, `s.BF`, `s.IP`, `s.ER` → WHIP / FIP / xFIP に使用

### Step 3: Bug C — simulation.js（385行目）

**現在:**
```js
const myStarter = myTeam.players.find(p => p.id === myTeam.rotation[myTeam.rotIdx % Math.max(myTeam.rotation.length,1)])
  || myTeam.players.find(p => p.isPitcher && p.subtype === '先発');
```

**修正後:**
```js
const myStarter = myTeam.players.find(p => p.id === myTeam.rotation[myTeam.rotIdx % Math.max(myTeam.rotation.length,1)])
  || myTeam.players.find(p => p.isPitcher);
```

理由: `opStarter`（386行目）は `find(p => p.isPitcher)` で subtype を問わない。
自チームも同じ緩やかな条件にすることで、全先発が故障・降格した場合でも
中継ぎ・抑えが先発として起用され `pitcherId` が必ず設定される。

### Step 4: Math.random() 置換 — simulation.js

`Math.random()` を使用している箇所を `rngf(0, 1)` に置換する。
`rngf` は `src/utils.js` からインポート済みであることを先に確認すること。

対象箇所（`Math.random() < X` のパターン）:
- 437行目: 盗塁成功判定
- 468行目: 犠牲フライ判定
- 469行目: 同（ネスト内）
- 481行目: その他アウト進塁判定
- 682行目: `quickSimGame` 内の盗塁試行判定

置換パターン:
```js
// 変更前
if (Math.random() < probability)
// 変更後
if (rngf(0, 1) < probability)
```

`rngf` が `simulation.js` の import 行に含まれているか確認し、なければ追加する。

## データモデル変更

なし（既存フィールドの参照修正のみ）

## 受け入れ条件

- [ ] 盗塁企図のある試合をシムした後、投手の BF が盗塁企図回数分だけ過剰計上されない
- [ ] 複数シーズン経過後、投手のキャリア通算 WHIP・FIP が 0 や異常値にならない
- [ ] 全先発投手が故障降格した状態でオートシムを実行しても、中継ぎ投手の Kp・IP が正常に集計される
- [ ] `npm run build` でビルドエラーなし
- [ ] `npx vitest run` で全テストパス

## テストケース

`src/engine/__tests__/simulation.test.js` に以下を追加:

```js
// Bug A 検証: 盗塁イベントが BF にカウントされないことを postGame.js 経由で確認
// （postGame.test.js を新規作成して追加してもよい）
describe('applyGameStatsFromLog — 盗塁BF除外', () => {
  it('isStolenBase:true のイベントは投手の BF にカウントされない', () => {
    // k イベント1件 + isStolenBase イベント1件を含む最小ログを組んで
    // applyGameStatsFromLog を呼び、BF===1 かつ Kp===1 であることを確認
  });
});

// Bug C 検証: rotation 空でも myStarter が見つかること（simulation.js テスト）
describe('initGameState — rotation 空時のフォールバック', () => {
  it('rotation が空でも isPitcher な選手が myPitcher に設定される', () => {
    // rotation:[] のチームで initGameState を呼び、gs.myPitcher !== undefined を確認
  });
});
```

`initGameState` が `simulation.js` から export されていない場合は、
`quickSimGame` を呼び出して `gs.log` の `pitcherId` が全件 truthy かを確認するアプローチでよい。

## NPB 協約上の制約

なし

## 過去バグからの教訓

- B1 パターン: 両チームに適用すること。`applyGameStatsFromLog` は `isMyTeam=true/false` 両方で呼ばれる。Bug C の修正は `myStarter` のみを対象とするが、非対称性の解消がゴール
- B7/B8 パターン: `isTop` の方向に注意。`myPitchABs` の `scorer === !isMyTeam` ロジックは既に正しい

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（今回は不要）
- 選手・イベント ID は `uid()` で生成（今回は不要）

## ROADMAP.md 更新指示

ROADMAP.md の「バグ修正 / インフラ改善」セクション末尾に以下を追記する:

```markdown
| B13 | **[P1] 投手成績集計バグ（BF過剰計上・キャリアWHIP崩壊・starter undefined）** | postGame.js の盗塁BF除外漏れ・CareerTable totals の投手フィールド名誤り（BB→BBp / HRA→HRp, Hp・HBPp追加）・initGameState の myStarter フォールバック条件を緩和（先発限定→全投手） + simulation.js の Math.random() → rngf() 置換 | TBD |
```

「最終更新」ヘッダー行を `2026-04-11（選手成績集計バグ修正 完了）` に更新する。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-11 — 投手成績集計バグ修正（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- postGame.js: 盗塁企図イベント（isStolenBase:true）を投手 BF の集計から除外
- CareerTable.jsx: 通算統計の pitcherフィールド修正（BB→BBp, HRA→HRp, HBPp/Hp 追加）→ キャリア WHIP/FIP/xFIP が正常値に
- simulation.js: initGameState の myStarter フォールバックを全投手対象に緩和（全先発故障時の pitcherId undefined を防止）
- simulation.js: Math.random() 直接呼び出し5箇所を rngf(0,1) に置換
```

## SPEC.md 更新箇所

なし（内部実装のみ）

## コミットメッセージ

`fix: 投手成績集計バグ修正（BF過剰計上・キャリアWHIP崩壊・starter fallback）`

## PR タイトル

`fix: 投手成績集計バグ修正（BF過剰計上・キャリアWHIP崩壊・starter fallback）`
