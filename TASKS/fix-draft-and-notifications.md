---
task-id: fix-draft-and-notifications
type: bugfix
commit-prefix: fix
created: 2026-04-04
roadmap-item: "B10 / B11 ドラフト1位指名クラッシュ・ニュースバッジ欠落"
---

# Task: ドラフト1位指名ボタンのクラッシュ修正＋メール/ニュースバッジ欠落修正

## 背景・目的

2つの独立したバグを1コミットで修正する。

①`DraftLotteryScreen` で選手を1位指名するボタンを押すと `TypeError: n.includes is not a function` がスローされ、フェーズが進まない（「ボタンが押せない」）。`analyzeTeamNeeds()` の戻り値が `{type, score}[]` のオブジェクト配列なのに、文字列配列として `.includes()` を直接呼んでいることが原因。

②`tabBadges`（`useGameState.js`）に `news` キーが存在しないため、ニュースタブに新着インタビューが届いても未読バッジが表示されない。さらに `handleInterview` がニュースアイテムに `answered` フラグを付与しないため、`NewsTab` を離れて戻るたびにインタビュー回答状態がリセットされる。

## 機能説明

- ドラフト1巡目指名フロー（DraftLotteryScreen）：選手をクリックして `myPick` を設定後、「○○ を1位指名 →」ボタンを押すと `announce` フェーズに正しく遷移する。
- 2巡目以降のCPU指名（DraftScreen）：CPU指名ロジックが補強ニーズを正しく判定してプレイヤーを選ぶ。
- ニュースタブバッジ：未回答インタビューがある場合、`news` タブに黄色バッジ（件数）が表示される。
- インタビュー回答の永続化：`handleInterview` 呼び出し時にニュースアイテムへ `answered: true` を付与し、タブを再訪しても「回答待ち」バッジが消えたままになる。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/Draft.jsx` | `buildCpuPicks()`（~125行目）と `cpuPick()`（~429行目）の `needs.some(n=>n.includes(...))` を修正 |
| `src/hooks/useGameState.js` | `tabBadges` useMemo（77〜89行）と `handleInterview`（184〜187行）を修正 |
| `src/engine/trade.js` | `analyzeTeamNeeds()` の戻り値型を確認（23〜50行）。`{ type: string, score: number }[]` を返す |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/components/Draft.jsx` | Modify | `n.includes(...)` → `n.type.includes(...)` を2箇所修正 |
| `src/hooks/useGameState.js` | Modify | `tabBadges` に `news` キー追加・`handleInterview` に `answered` フラグ付与・`useMemo` 依存配列に `news` 追加 |

## 実装ガイダンス

### Step 1: Draft.jsx — buildCpuPicks() の修正（~125行目付近）

`DraftLotteryScreen` コンポーネント内の `buildCpuPicks` 関数：

```js
// 修正前
const needsPitcher = needs.some(n => n.includes("投手"));

// 修正後
const needsPitcher = needs.some(n => n.type.includes("投手"));
```

### Step 2: Draft.jsx — cpuPick() の修正（~429行目付近）

`DraftScreen` コンポーネント内の `cpuPick` 関数：

```js
// 修正前
const needsPitcher = needs.some(n => n.includes("投手"));
const needsPower   = needs.some(n => n.includes("長打"));

// 修正後
const needsPitcher = needs.some(n => n.type.includes("投手"));
const needsPower   = needs.some(n => n.type.includes("長打"));
```

### Step 3: useGameState.js — tabBadges に news キーを追加

`tabBadges` useMemo（77〜89行）を以下のように修正：

```js
const tabBadges = useMemo(()=>{
    if(!myTeam) return {};
    const expiringCount = myTeam.players.filter(p=>!p.isIkusei&&(p.contractYearsLeft??99)<=1).length;
    const pendingTrades = mailbox.filter(m=>m.type==="trade"&&!m.resolved&&!m.read).length;
    const unreadMail    = mailbox.filter(m=>!m.read).length;
    const unreadInterviews = news.filter(n=>n.type==="interview"&&!n.answered).length;  // ← 追加
    return {
      roster:   myTeam.players.filter(p=>!p.isIkusei).length>MAX_ROSTER?{n:myTeam.players.filter(p=>!p.isIkusei).length-MAX_ROSTER,color:"#f87171"}:null,
      contract: expiringCount>0?{n:expiringCount,color:"#f5c842"}:null,
      trade:    pendingTrades>0?{n:pendingTrades,color:"#f97316"}:null,
      mailbox:  unreadMail>0?{n:unreadMail,color:pendingTrades>0?"#f97316":"#f5c842"}:null,
      fa:       faPool.length>0?{n:faPool.length,color:"#94a3b8"}:null,
      news:     unreadInterviews>0?{n:unreadInterviews,color:"#f5c842"}:null,  // ← 追加
    };
  },[myTeam, mailbox, faPool, news]);  // ← news を依存配列に追加
```

### Step 4: useGameState.js — handleInterview に answered フラグ付与

`handleInterview` 関数（184〜187行）を以下のように修正：

```js
const handleInterview = useCallback((newsId, opt)=>{
    upd(myId, t=>({
      ...t,
      popularity: clamp((t.popularity||50)+opt.popMod,0,100),
      players: t.players.map(p=>({...p, morale: clamp((p.morale||60)+opt.moraleMod,0,100)})),
    }));
    // ニュースアイテムに answered フラグを付与（バッジ消去・再マウント後も維持）
    setNews(prev => prev.map(n => n.id===newsId ? {...n, answered:true} : n));
    notify("回答しました！ 人気"+(opt.popMod>=0?"+":"")+opt.popMod+" モラル"+(opt.moraleMod>=0?"+":"")+opt.moraleMod,"ok");
  },[upd, myId, notify, setNews]);
```

> `setNews` は `useState` の setter。`useGameState.js` 内で既に宣言されているので import 不要。`useCallback` の依存配列に `setNews` を追加すること。

## データモデル変更

```js
// news アイテム（既存型に任意フィールドを追加）
{
  id: string,
  type: "interview" | "game" | "season" | ...,
  // ... 既存フィールド ...
  answered?: boolean,  // ← interview 型のみ。handleInterview 呼び出し時に true をセット
}
```

## 受け入れ条件

- [ ] DraftLotteryScreen で選手をクリック後「○○ を1位指名 →」ボタンを押すと `announce` フェーズに遷移する（コンソールに TypeError が出ない）
- [ ] DraftScreen の CPU 指名が投手/野手ニーズを正しく判定してプレイヤーを選ぶ（例外が出ない）
- [ ] インタビューニュースが存在するとき、`news` タブに黄色バッジ（件数）が表示される
- [ ] インタビューに回答後、ニュースタブを離れて戻っても「回答待ち」バッジが消えたまま（`answered:true` が永続）
- [ ] `npm run build` が通る（型・構文エラーなし）

## テストケース

既存テスト:
- `src/engine/__tests__/` 配下の全テストが引き続き PASS すること

手動確認:
- ドラフト会議を開始 → 1巡目選択画面で選手をクリック → 「を1位指名 →」ボタン押下 → フェーズが `announce` に進む
- インタビューニュースが届く（試合後）→ `news` タブに `1` バッジが表示される → タブを開いてインタビューに回答 → バッジが消える → 別タブに移動して戻る → バッジが消えたまま

## NPB 協約上の制約

なし

## 過去バグからの教訓

- CLAUDE.md B6: ファイル参照の確認（今回は既存ファイルの修正のみ。新ファイル不要）
- `analyzeTeamNeeds` の戻り値型に依存するコードは他にもある可能性があるため、`trade.js` の `evalTradeForCpu` も念のため確認すること（既に `n.type.includes` で正しく使用済みのため変更不要）

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

`バグ修正 / インフラ改善` セクションに以下を追記（既存行 N1 の直後）：

```
| B10 | **[P0] ドラフト1位指名クラッシュ（analyzeTeamNeeds戻り値型誤用）** | `buildCpuPicks()` / `cpuPick()` で `needs.some(n=>n.includes(...))` が TypeError。`n.type.includes(...)` に修正 | <hash> |
| B11 | **[P1] ニュースタブ未読バッジ欠落・インタビュー回答リセット** | `tabBadges` に `news` キー追加。`handleInterview` で `answered:true` フラグを付与し再マウント後も維持 | <hash> |
```

`<hash>` はコミット後に実ハッシュで置換。

最終更新行を更新：
```
> 最終更新: 2026-04-04（ドラフト1位指名クラッシュ・ニュースバッジ修正 完了）
```

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-04 — ドラフト1位指名クラッシュ＋ニュースバッジ修正（<コミットハッシュ>）

**仕様本文への影響なし（内部実装のみ）**

- Draft.jsx `buildCpuPicks()` / `cpuPick()` で analyzeTeamNeeds 戻り値のオブジェクトを文字列として .includes() していた TypeError を修正（n.type.includes に変更）
- useGameState.js `tabBadges` に `news` キーを追加し、未回答インタビューがあるときニュースタブにバッジ表示
- handleInterview 呼び出し時にニュースアイテムへ `answered: true` フラグを付与し、タブ再訪後もバッジが消えたまま維持
```

## SPEC.md 更新箇所

なし（内部実装の修正のみ）

## コミットメッセージ

```
fix: ドラフト1位指名クラッシュとニュースバッジ欠落を修正
```

## PR タイトル

```
fix: ドラフト1位指名クラッシュとニュースバッジ欠落を修正
```
