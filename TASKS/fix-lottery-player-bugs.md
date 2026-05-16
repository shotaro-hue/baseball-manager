---
task-id: fix-lottery-player-bugs
type: bugfix
commit-prefix: fix
created: 2026-04-11
roadmap-item: "バグ修正（ドラフトくじ引き遷移不全・1巡目入団未反映）"
---

# Task: ドラフト1巡目くじ引き2バグ修正

## 背景・目的

ドラフト1巡目くじ引き画面（`DraftLotteryScreen`）に2つの致命的バグがある。

① 「くじを引く！」ボタンを押しても次画面へ遷移しない（競合球団が0件表示される）。  
② ヤクルトスワローズ（全球団の1巡目指名）の選手がドラフト後に入団しない。

どちらも **チームIDの型不一致**（`Object.entries` は常に文字列キーを返すが、チームIDは数値 0〜11）が原因。3行の修正で解消できる。

## 機能説明

- `processLottery` / `advanceToNextConflict` で `teams.find(t => t.id === tid)` の `===` 比較が
  数値 `0` vs 文字列 `"0"` で false になり、`lotteryTeams` が常に `[]` になる。
  → `drawLottery` が `lotteryTeams[rng(0,-1)]` で `winner = undefined` のまま setTimeout を呼ぶため遷移しない。
- `App.jsx` の `onDone` コールバックで `_r1winner = winner[0]`（文字列）を保存するが、
  `handleDraftComplete` で `p._r1winner === teamId`（数値）と厳格比較するため全球団0一致になる。
  → ヤクルト（id:0）含む全12球団の1巡目指名選手がファームに加わらない。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/Draft.jsx` | `processLottery` ~162行、`advanceToNextConflict` ~205行の `lotteryTeams` 設定行 |
| `src/App.jsx` | 163行目 `draft_lottery` 画面の `onDone` コールバック内 `_r1winner` 設定 |
| `src/hooks/useOffseason.js` | 71行目 `handleDraftComplete` 内 `p._r1winner === teamId` 比較（参照のみ、修正不要） |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/components/Draft.jsx` | Modify | `processLottery` と `advanceToNextConflict` の2箇所 |
| `src/App.jsx` | Modify | `onDone` コールバックの1箇所 |

## 実装ガイダンス

### Step 1: Draft.jsx — processLottery の lotteryTeams 修正（~179行）

**場所**: `src/components/Draft.jsx` の `processLottery` 関数内、`setLotteryTeams(...)` の行

**変更前**:
```js
setLotteryTeams(first.tids.map(tid=>teams.find(t=>t.id===tid)).filter(Boolean));
```

**変更後**:
```js
setLotteryTeams(first.tids.map(tid=>teams.find(t=>String(t.id)===tid)).filter(Boolean));
```

理由: `Object.entries(allPicks)` が返す `tid` は常に文字列。`t.id`（数値 0〜11）と `===` 比較すると必ず false になるため、`String()` で揃える。

---

### Step 2: Draft.jsx — advanceToNextConflict の lotteryTeams 修正（~212行）

**場所**: `src/components/Draft.jsx` の `advanceToNextConflict` 関数内、`setLotteryTeams(...)` の行

**変更前**:
```js
setLotteryTeams(next.tids.map(tid=>teams.find(t=>t.id===tid)).filter(Boolean));
```

**変更後**:
```js
setLotteryTeams(next.tids.map(tid=>teams.find(t=>String(t.id)===tid)).filter(Boolean));
```

---

### Step 3: App.jsx — _r1winner を数値で保存（~163行）

**場所**: `src/App.jsx` 163行目、`DraftLotteryScreen` の `onDone` コールバック内

**変更前**:
```js
_r1winner:winner?winner[0]:undefined
```

**変更後**:
```js
_r1winner:winner?Number(winner[0]):undefined
```

理由: `winner[0]` は `Object.entries(r1)` が返す文字列キー（例: `"0"`）。
`handleDraftComplete` で `p._r1winner === teamId`（数値）と比較するので、`Number()` で数値に変換して保存する。
ヤクルト（id: 0）の場合 `"0" === 0` が false になるため入団しないバグも解消される。

---

## データモデル変更

なし（`_r1winner` の型を文字列→数値に正規化するだけ。既存セーブデータには影響しない）

## 受け入れ条件

- [ ] くじ引き画面（lottery フェーズ）で「N球団が競合」に実際の球団数が表示される（0球団にならない）
- [ ] 「くじを引く！」ボタン押下後、1.5秒以内に hazure フェーズ or 次の競合 or done フェーズへ遷移する
- [ ] ドラフト完了後、ヤクルト（id:0）を含む全12球団の1巡目指名選手がファーム（`farm[]`）に登録されている
- [ ] ビルド・全テスト通過（`npm run build` がエラーなし）

## テストケース

`src/engine/__tests__/draft.test.js`（なければ新規作成）に以下を追加:

```js
describe("DraftLotteryScreen — lotteryTeams type mismatch", () => {
  it("String(t.id) === tid で正しくチームが見つかる", () => {
    const teams = [{ id: 0, name: "ヤクルト" }, { id: 1, name: "DeNA" }];
    // Object.entries で tid は文字列になる
    const tid = "0";
    const found = teams.find(t => String(t.id) === tid);
    expect(found).toBeDefined();
    expect(found.id).toBe(0);
  });
});

describe("handleDraftComplete — _r1winner type match", () => {
  it("Number(_r1winner) === teamId でヤクルト選手が入団する", () => {
    const player = { id: "p1", name: "選手A", _drafted: true, _r1winner: 0 };
    const teamId = 0; // ヤクルト
    expect(player._r1winner === teamId).toBe(true); // Number() 変換後は一致する
  });
});
```

## NPB 協約上の制約

なし

## 過去バグからの教訓

（CLAUDE.md の教訓テーブルから関連項目）
- B1 パターン: 両チームへの適用 — 今回の修正で全12球団のファームに選手が入るようになる

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

- バグ修正タスクのため ROADMAP.md のステータス変更は不要
- 「最終更新」ヘッダー行を `2026-04-11（ドラフトくじ引き2バグ修正 完了）` に更新

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-11 — ドラフトくじ引き2バグ修正（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- fix: Draft.jsx の processLottery / advanceToNextConflict にて `String(t.id)===tid` で型不一致を解消
- fix: App.jsx の _r1winner を `Number(winner[0])` で数値保存し、全球団1巡目入団を修正
```

## SPEC.md 更新箇所

なし

## コミットメッセージ

`fix: ドラフトくじ引き遷移不全・1巡目入団未反映バグを修正（型不一致）`

## PR タイトル

`fix: ドラフトくじ引き遷移不全・1巡目入団未反映バグを修正（型不一致）`
