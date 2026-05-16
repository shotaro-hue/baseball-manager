---
task-id: remove-allstar-info-card
type: ui
commit-prefix: refactor
created: 2026-04-04
roadmap-item: "㉞ オールスターゲーム修正 (Tier 10)"
---

# Task: 日程タブのオールスター実施日カード削除

## 背景・目的

日程タブに「⭐ オールスターゲーム / 第X戦 (日付) に開催　未実施」というカードが表示されているが、
オールスターの実施日はカレンダーグリッド上のセル（⭐ AS第1戦・AS第2戦）で確認できるため
このカードは冗長かつ日付表示が不正確（gameDay番号ベースのズレ問題）なため削除する。

## 機能説明

- `ScheduleTab.jsx` の339〜345行目にあるオールスター情報カードを丸ごと削除する。
- 削除する要素: `<div className="card" style={{ background: 'rgba(245,200,66,.06)' }}>` ブロック全体。
- カレンダーグリッドの `isAllStar` セル表示（104・108行目）や
  「今日のカード」内の chip 表示（362行目）は残す。

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/components/tabs/ScheduleTab.jsx` | 339〜345行目のカードブロックを削除する。前後（337行目の SeasonProgressBar・347行目の「今日のカード」）との空行も整理する |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/components/tabs/ScheduleTab.jsx` | Modify | 339〜345行目のカードブロックと直後の空行（346行目）を削除 |

## 実装ガイダンス

### Step 1: 削除対象ブロックの確認

339〜346行目が削除対象（空行含む）:

```jsx
      <div className="card" style={{ background: 'rgba(245,200,66,.06)' }}>
        <div className="card-h">⭐ オールスターゲーム</div>
        <div style={{ fontSize: 12, color: '#cbd5e1' }}>
          第{ALL_STAR_GAMEDAY}戦 ({formatDate(gameDayToDate(ALL_STAR_GAMEDAY, schedule))}) に開催
          <span style={{ marginLeft: 8, color: allStarDone ? '#4ade80' : '#f5c842' }}>{allStarDone ? '実施済み' : '未実施'}</span>
        </div>
      </div>
                                        ← この空行も削除
```

削除後は `<SeasonProgressBar>` の直後に `{/* 今日のカード */}` ブロックが続く形になる。

### Step 2: 不要になった import・props の確認

削除後、`ALL_STAR_GAMEDAY` が他箇所（104・108・362行目）でまだ使われているため
**import 行（4行目）は削除しない**。

`allStarDone` props（278行目）も 362行目の chip 表示で使われているため**削除しない**。

変更が必要なのは339〜346行目の JSX ブロックの削除のみ。

## 受け入れ条件

- [ ] 日程タブを開いたときに「⭐ オールスターゲーム」カードが表示されない
- [ ] カレンダーグリッドの「AS第1戦」「AS第2戦」セルは引き続き表示される
- [ ] 「今日のカード」内の「⭐ オールスター開催日」chip は引き続き表示される
- [ ] `npm run build` がエラーなく通過する

## テストケース

なし（UI 表示要素の削除のみ）。

## NPB 協約上の制約

なし。

## 過去バグからの教訓

なし（削除のみで新規ロジック不要）。

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す

## ROADMAP.md 更新指示

なし。

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-04-04 — 日程タブのオールスター実施日カード削除（コミットハッシュ）

**仕様本文への影響なし（内部実装のみ）**

- ScheduleTab のオールスター情報カード（冗長・日付ズレあり）を削除
```

## SPEC.md 更新箇所

なし。

## コミットメッセージ

`refactor: 日程タブのオールスター実施日カードを削除`

## PR タイトル

`refactor: 日程タブのオールスター実施日カードを削除`
