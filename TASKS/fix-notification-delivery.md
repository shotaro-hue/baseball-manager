---
task-id: fix-notification-delivery
type: bugfix
commit-prefix: fix
created: 2026-04-04
roadmap-item: "バグ修正 — メール・ニュース通知配信改善"
---

# Task: メール・ニュース通知配信改善

## 背景・目的

プレイヤーが「メールやニュースがほとんど届かない」と感じる原因は大きく2種類ある。
①メールオブジェクトに `subject` フィールドで作成しているが、`MailboxTab.jsx` は `m.title` を参照するため、日本一・オーナー評価・モラル低下・海外FA・殿堂入りの各メールがタイトル空白で届く（実質「見えない」）。
②イベント発生確率が低すぎる＋手動戦術試合後にニュースが生成されないという設計上の欠落がある。
これらを修正してメール・ニュースの体験を改善する。

## 機能説明

- `subject` を使っているすべてのメール作成箇所を `title` に統一し、`from`・`timestamp` を補完する
- `handleTacticalGameEnd`（手動操作試合終了後）にも試合ニュース記事とインタビューを生成する
- CPUトレードオファー発生確率を 5% → 15% に引き上げる
- 試合後インタビュー出現確率を 20% → 35% に引き上げる
- オートシム（`handleAutoSimEnd`）時、自チーム選手に怪我が発生したらニュース記事を追加する

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/hooks/useSeasonFlow.js` | `tryGenerateCpuOffer`（103行目）確率変更、インタビュー確率（286行目）、`handleAutoSimEnd`（188〜310行）、`handleTacticalGameEnd`（446〜545行）にニュース追加 |
| `src/hooks/useOffseason.js` | `subject` → `title` の修正箇所: 232行・240行・290行 |
| `src/App.jsx` | `subject` → `title` の修正箇所: 152行・158行 |
| `src/components/tabs/MailboxTab.jsx` | `m.title` と `m.from` をどう参照しているか確認（1〜40行） |
| `src/constants.js` | `NEWS_TEMPLATES_WIN/LOSE` の内容確認（144〜155行）|

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/hooks/useSeasonFlow.js` | Modify | 確率変更・ニュース追加 |
| `src/hooks/useOffseason.js` | Modify | `subject` → `title` 修正 |
| `src/App.jsx` | Modify | `subject` → `title` 修正 |

## 実装ガイダンス

### Step 1: App.jsx の subject → title 修正（152行・158行）

**152行目** — championship メール:
```js
// 変更前
{id:uid(), type:"championship", read:false,
  subject:"🏆 "+year+"年 日本一達成！",
  body:"..."}

// 変更後（title・from・timestamp を追加）
{id:uid(), type:"championship", read:false,
  title:"🏆 "+year+"年 日本一達成！",
  from:"NPB本部",
  dateLabel:year+"年",
  timestamp:Date.now(),
  body:"..."}
```

**158行目** — owner_trust メール:
```js
// 変更前
{id:uid(), type:"owner_trust", read:false,
  subject:(trustDelta>0?"✅":"⚠️")+" オーナー評価: ...",
  body:"..."}

// 変更後
{id:uid(), type:"owner_trust", read:false,
  title:(trustDelta>0?"✅":"⚠️")+" オーナー評価: 目標「"+goalLabel+"」"+(trustDelta>0?"達成":"未達"),
  from:"球団オーナー",
  dateLabel:year+"年",
  timestamp:Date.now(),
  body:"..."}
```

### Step 2: useOffseason.js の subject → title 修正

**232行目** — morale_warning メール（setMailbox内の `subject:` を `title:` に変更し `from`・`dateLabel`・`timestamp` を追加）:
```js
// 変更前（setMailbox 内のオブジェクト）
{id:uid(), type:"morale_warning", read:false,
  subject:"【モラル低下】"+p.name+"のモラルが低下しています",
  body:"...", player:p}

// 変更後
{id:uid(), type:"morale_warning", read:false,
  title:"【モラル低下】"+p.name+"のモラルが低下しています",
  from:"チーム管理部",
  dateLabel:year+"年",
  timestamp:Date.now(),
  body:"...", player:p}
```

**240行目** — overseas_fa メール:
```js
// 変更前
{id:uid(), type:"overseas_fa", read:false,
  subject:"【海外FA】"+p.name+"が海外移籍を宣言",
  body:"...", player:p}

// 変更後
{id:uid(), type:"overseas_fa", read:false,
  title:"【海外FA】"+p.name+"が海外移籍を宣言",
  from:p.name,
  dateLabel:year+"年",
  timestamp:Date.now(),
  body:"...", player:p}
```

**290行目** — hof メール（`newInductees.forEach` 内のオブジェクト）:
```js
// 変更前
{id:uid(), type:"hof", read:false,
  subject:"🏛 殿堂入り: "+h.playerName,
  body:"..."}

// 変更後
{id:uid(), type:"hof", read:false,
  title:"🏛 殿堂入り: "+h.playerName,
  from:"球団殿堂委員会",
  dateLabel:year+"年",
  timestamp:Date.now(),
  body:"..."}
```

### Step 3: useSeasonFlow.js — 確率変更

**103行目** `tryGenerateCpuOffer`:
```js
// 変更前
if(Math.random()>0.05||cpuTradeOffers.length>=2||!myTeam) return;
// 変更後
if(Math.random()>0.15||cpuTradeOffers.length>=2||!myTeam) return;
```

**286行目** インタビュー確率:
```js
// 変更前
if(Math.random()<0.2){
// 変更後
if(Math.random()<0.35){
```

### Step 4: useSeasonFlow.js — handleAutoSimEnd に怪我ニュースを追加

`handleAutoSimEnd` の204〜205行付近、`checkForInjuries` で `newInj` が取得されたあとに、ニュース生成を追加する:

```js
const newInj=checkForInjuries(updated.players);
if(newInj.length>0){
  updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
  // 怪我ニュース追加（重傷のみ: injuryDaysLeft >= 7）
  newInj.filter(i=>i.days>=7).forEach(i=>{
    addNews({type:"season",headline:`🤕 【怪我】${updated.players.find(p=>p.id===i.id)?.name??'選手'}が負傷`,source:"チーム広報",dateLabel:`${year}年 ${gameDay}日目`,body:`${updated.players.find(p=>p.id===i.id)?.name??'選手'}が${i.type}で${i.days}試合の離脱が見込まれる。`});
  });
}
```

注意: 上記コードで `updated.players` から名前を取得する場合、怪我適用「後」の配列を参照すること。
または `newInj` を適用する前に `updated.players` から名前を取っておく方が安全（`newInj` は `{id, type, days}` 形式なので、名前は適用前の `updated.players` から取得できる）。

より安全な書き方:
```js
const newInj=checkForInjuries(updated.players);
if(newInj.length>0){
  // 名前を先に取得
  const injNames=newInj.reduce((acc,i)=>{
    const p=updated.players.find(x=>x.id===i.id);
    if(p) acc.push({name:p.name,...i});
    return acc;
  },[]);
  updated.players=updated.players.map(p=>{const inj=newInj.find(i=>i.id===p.id);return inj?{...p,injury:inj.type,injuryDaysLeft:inj.days}:p;});
  injNames.filter(i=>i.days>=7).forEach(i=>{
    addNews({type:"season",headline:`🤕 【怪我】${i.name}が負傷`,source:"チーム広報",dateLabel:`${year}年 ${gameDay}日目`,body:`${i.name}が${i.type}により${i.days}試合の戦線離脱が見込まれる。チームはロスター調整を余儀なくされる。`});
  });
}
```

### Step 5: useSeasonFlow.js — handleTacticalGameEnd にニュース生成を追加

`handleTacticalGameEnd` の `setGameResult(...)` 呼び出し（526行）の直後（`pushResult` の前後あたり）に、`handleAutoSimEnd` と同様のニュース・インタビュー生成コードを追加する。

追加するコードブロック（526行 `setGameResult(...)` の直後に挿入）:
```js
// 試合ニュース（手動試合も同様に生成）
const _tmpl=won?NEWS_TEMPLATES_WIN:NEWS_TEMPLATES_LOSE;
const _scoreStr=gsResult.score.my+"-"+gsResult.score.opp;
const _hl=_tmpl[rng(0,_tmpl.length-1)].replace("{team}",myTeam?.name||"自チーム").replace("{opp}",currentOpp?.name||"相手").replace("{score}",_scoreStr);
addNews({type:"game",headline:_hl,source:"スポーツ報知",dateLabel:year+"年 "+gameDay+"日目",body:(won?myTeam?.name+"が"+currentOpp?.name+"に"+_scoreStr+"で勝利した。\n\n投打ともに噛み合い、理想的な試合運びで勝点を積み上げた。":myTeam?.name+"は"+currentOpp?.name+"に"+_scoreStr+"で敗れた。\n\n流れを引き戻せず、次戦での巻き返しが期待される。")});
if(Math.random()<0.35){
  const _qs=won?INTERVIEW_QUESTIONS_WIN:INTERVIEW_QUESTIONS_LOSE;
  const _opts=won?INTERVIEW_OPTIONS_WIN:INTERVIEW_OPTIONS_LOSE;
  addNews({type:"interview",headline:"【インタビュー】"+(myTeam?.name||"")+"監督に直撃！",source:"野球速報",dateLabel:year+"年 "+gameDay+"日目",body:"試合後、記者団が監督にコメントを求めた。",question:_qs[rng(0,_qs.length-1)],options:_opts});
}
tryGenerateCpuOffer();
```

**重要**: `NEWS_TEMPLATES_WIN`, `NEWS_TEMPLATES_LOSE`, `INTERVIEW_QUESTIONS_WIN`, `INTERVIEW_QUESTIONS_LOSE`, `INTERVIEW_OPTIONS_WIN`, `INTERVIEW_OPTIONS_LOSE` はすでに `useSeasonFlow.js` の冒頭 import（13行目）で `../constants` からインポート済みなので追加不要。

`tryGenerateCpuOffer` 関数も `useSeasonFlow.js` 内で定義済み（102行目）なので呼び出し可能。

`addNews` は `gs` から分解されている（46行目）ので利用可能。

## データモデル変更

新規フィールドなし。既存メールオブジェクトに `title`・`from`・`timestamp`・`dateLabel` を追加するのみ。

## 受け入れ条件

- [ ] 日本一達成・オーナー評価・モラル低下・海外FA・殿堂入りの各メールがメールボックスに**タイトル付きで**表示される
- [ ] 手動操作で試合を終えた後、ニュースタブに試合記事が追加される
- [ ] 手動操作試合後、35%の確率でインタビュー記事が生成される
- [ ] `ビルド・全テスト通過`

## テストケース

新規テストファイル不要（純粋なロジック変更のみ）。
既存 `src/engine/__tests__/` のテストが通ることを確認する。

## NPB 協約上の制約

なし

## 過去バグからの教訓

- B1 パターン: 試合後処理は両チームに適用すること（今回は変更なし、既存の適用ロジックを崩さないこと）
- B9 パターン: `useState` の順序に注意。今回は新規 state を追加しないので問題なし

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）— ただし既存の `Math.random()` 比較箇所（確率判定）はそのまま `Math.random()` で統一されているため踏襲してよい
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す — ただし今回の確率変更は元々 `Math.random()` の直値なので定数化は任意

## ROADMAP.md 更新指示

ROADMAPの新規アイテムとして末尾バグ修正セクションに追加:

```
| N1 | **[P1] メール・ニュース通知配信改善** | `subject`→`title` フィールド統一・戦術試合後ニュース欠落修正・確率調整 | <コミットハッシュ> |
```

「最終更新」ヘッダー行を `2026-04-04（メール・ニュース通知配信改善 完了）` に更新。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-04 — メール・ニュース通知配信改善（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- メールオブジェクトの `subject` → `title` フィールド統一（championship / owner_trust / morale_warning / overseas_fa / hof）
- 全メールに `from`・`timestamp`・`dateLabel` を補完（MailboxTab の差出人表示が正常化）
- `handleTacticalGameEnd` 後に試合ニュース記事・インタビュー（35%確率）を生成するよう修正
- CPUトレードオファー発生確率: 5% → 15%
- 試合後インタビュー確率: 20% → 35%
- `handleAutoSimEnd` 時、自チーム選手の重傷（7試合以上離脱）をニュース記事として追加
```

## SPEC.md 更新箇所

なし（内部実装のみ）

## コミットメッセージ

`fix: メール・ニュース通知配信を改善（title修正・確率調整・戦術試合後ニュース追加）`

## PR タイトル

`fix: メール・ニュース通知配信を改善（title修正・確率調整・戦術試合後ニュース追加）`
