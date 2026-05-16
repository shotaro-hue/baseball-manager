---
task-id: injury-detail
type: feature
commit-prefix: feat
created: 2026-04-06
roadmap-item: "㊵ 怪我の詳細化 (Tier 11)"
---

# Task: 怪我の詳細化（故障箇所別・再発リスク）

## 背景・目的

現行の怪我システムは「ラベル（筋肉系・骨折等）＋残日数」だけを管理しており、
どの部位が故障しているかの情報を持たない。
故障箇所（肩・肘・膝・腰・脇腹・足首）を追跡し、
同部位の再発リスクを高めることで、
長期起用の戦略的コスト・選手管理の奥深さをゲームに加える。

## 機能説明

- 怪我発生時に故障箇所（`injuryPart`）が確率的に決定される
- 決定された故障箇所を含む怪我歴を `injuryHistory` に蓄積する（最大10件）
- 次回以降の `checkForInjuries` で、過去2シーズン以内に同部位の負傷歴があれば
  基本確率を **×1.2 倍**する
- 故障箇所は PlayerModal と RosterTab の怪我バッジに表示される
  （例: `🤕 筋肉系 [腰] 残18試合`）

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/player.js` | `INJURY_TYPES`・`checkForInjuries()`・`tickInjuries()` を拡張（389〜419行目） |
| `src/constants.js` | `INJURY_AUTO_DEMOTE_DAYS` 付近（109〜116行）に故障箇所定数ブロックを追加 |
| `src/hooks/useSeasonFlow.js` | 怪我適用パターン（`inj.type` / `inj.days`）が11箇所。`inj.part` / `injuryHistory` も同時に書き込む必要あり（248, 278, 307, 312, 423, 429, 452, 470, 529, 556, 584, 589 行目付近） |
| `src/components/ui.jsx` | `StatusBadge` の怪我バッジ（13行目）に箇所を追加 |
| `src/components/PlayerModal.jsx` | 怪我表示スパン（97行目）に `injuryPart` を追加 |
| `src/engine/__tests__/` | 既存テストファイル群を参照し、追加テストの書き方を合わせる |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | `INJURY_BODY_PARTS` 定数を追加 |
| `src/engine/player.js` | Modify | `checkForInjuries()` に箇所決定・再発リスクロジックを追加。`generatePlayer()` に `injuryPart: null, injuryHistory: []` を追加 |
| `src/hooks/useSeasonFlow.js` | Modify | 怪我適用の全箇所で `part` / `injuryHistory` を書き込む |
| `src/components/ui.jsx` | Modify | `StatusBadge` の怪我表示に `injuryPart` を追加 |
| `src/components/PlayerModal.jsx` | Modify | 怪我情報スパンに `injuryPart` を追加 |
| `src/engine/__tests__/injury.test.js` | Create | 再発リスク計算のユニットテスト |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

`INJURY_AUTO_DEMOTE_DAYS` の近く（116行目以降）に追加:

```js
// 故障箇所（確率重み付き）
export const INJURY_BODY_PARTS = [
  { part: '肩',   weight: 20 },
  { part: '肘',   weight: 18 },
  { part: '膝',   weight: 15 },
  { part: '腰',   weight: 17 },
  { part: '脇腹', weight: 15 },
  { part: '足首', weight: 15 },
];

// 同部位の再発リスク倍率・参照年数
export const INJURY_RECURRENCE_MULTIPLIER = 1.2;
export const INJURY_RECURRENCE_WINDOW_YEARS = 2;
export const INJURY_HISTORY_MAX = 10; // injuryHistory の最大保持件数
```

### Step 2: エンジン実装（src/engine/player.js）

#### 2-1. `generatePlayer()` へのフィールド追加（45行目付近）

```js
injury: null,
injuryDaysLeft: 0,
injuryPart: null,      // 追加: 現在の故障箇所
injuryHistory: [],     // 追加: 過去の怪我歴 [{part, year}]
```

#### 2-2. `checkForInjuries()` の拡張（396行目）

```js
import {
  INJURY_BODY_PARTS,
  INJURY_RECURRENCE_MULTIPLIER,
  INJURY_RECURRENCE_WINDOW_YEARS,
  INJURY_HISTORY_MAX,
} from '../constants';

export function checkForInjuries(players, currentYear) {
  const injured = [];
  for (const p of players) {
    if ((p.injuryDaysLeft ?? 0) > 0) continue;

    // 再発リスク: 過去2シーズン以内に同部位の怪我歴があるか確認
    // (この時点では部位未確定なので、いずれかの部位に再発歴があれば倍率を掛ける)
    const recentHistory = (p.injuryHistory ?? []).filter(
      h => currentYear - h.year <= INJURY_RECURRENCE_WINDOW_YEARS
    );
    const recurrenceMod = recentHistory.length > 0 ? INJURY_RECURRENCE_MULTIPLIER : 1.0;

    const ageMod  = p.age > 33 ? 2.0 : p.age > 29 ? 1.4 : 1.0;
    const condMod = (p.condition || 100) < 70 ? 1.6 : 1.0;
    if (rng(0, 9999) < Math.round(0.003 * ageMod * condMod * recurrenceMod * 10000)) {
      // 怪我種別を選択
      const roll = rng(0, 99);
      let cum = 0, type = INJURY_TYPES[0];
      for (const t of INJURY_TYPES) { cum += t.weight; if (roll < cum) { type = t; break; } }
      const days = rng(type.days[0], type.days[1]);

      // 故障箇所を決定（再発歴ありの箇所を2倍の重みで引く）
      const partWeights = INJURY_BODY_PARTS.map(bp => {
        const hasHistory = recentHistory.some(h => h.part === bp.part);
        return { ...bp, weight: hasHistory ? bp.weight * 2 : bp.weight };
      });
      const totalW = partWeights.reduce((s, b) => s + b.weight, 0);
      const partRoll = rng(0, totalW - 1);
      let pcum = 0, chosenPart = partWeights[0].part;
      for (const bp of partWeights) { pcum += bp.weight; if (partRoll < pcum) { chosenPart = bp.part; break; } }

      injured.push({ id: p.id, type: type.label, days, part: chosenPart });
    }
  }
  return injured;
}
```

**重要**: `Math.random()` の代わりに `rng()` を使う。確率比較は整数演算に変換する。

#### 2-3. `tickInjuries()` の変更（413行目）

`injuryPart` は回復時に `null` に戻す:

```js
export function tickInjuries(players) {
  return players.map(p => {
    if (!p.injuryDaysLeft) return p;
    const next = Math.max(0, p.injuryDaysLeft - 1);
    return {
      ...p,
      injuryDaysLeft: next,
      injury: next > 0 ? p.injury : null,
      injuryPart: next > 0 ? p.injuryPart : null,  // 追加
    };
  });
}
```

### Step 3: hooks 更新（src/hooks/useSeasonFlow.js）

`checkForInjuries` の呼び出しは11箇所あるが、全て同パターン:
```js
const newInj = checkForInjuries(players);
// ↓
const newInj = checkForInjuries(players, year); // year は useGameState から取得済み
```

怪我適用箇所（`inj.type` / `inj.days` を書き込む全パターン）に `part` と `injuryHistory` を追加:
```js
// 変更前（例: 248行目付近）
p => { const inj = newInj.find(i => i.id === p.id); return inj ? { ...p, injury: inj.type, injuryDaysLeft: inj.days } : p; }

// 変更後
p => {
  const inj = newInj.find(i => i.id === p.id);
  if (!inj) return p;
  const history = [
    ...(p.injuryHistory ?? []),
    { part: inj.part, year }
  ].slice(-INJURY_HISTORY_MAX);
  return { ...p, injury: inj.type, injuryDaysLeft: inj.days, injuryPart: inj.part, injuryHistory: history };
}
```

`INJURY_HISTORY_MAX` を `constants.js` からインポートすること。

### Step 4: UI 更新

#### src/components/ui.jsx（13行目）

```js
// 変更前
if (p?.injury) return <span className="inj-badge">🤕{p.injury}</span>;
// 変更後
if (p?.injury) return <span className="inj-badge">🤕{p.injury}{p.injuryPart ? ` [${p.injuryPart}]` : ''}</span>;
```

#### src/components/PlayerModal.jsx（97行目）

```js
// 変更前
{(p.injuryDaysLeft??0)>0 && <span ...>🤕 {p.injury} 残{p.injuryDaysLeft}試合</span>}
// 変更後
{(p.injuryDaysLeft??0)>0 && <span ...>🤕 {p.injury}{p.injuryPart ? ` [${p.injuryPart}]` : ''} 残{p.injuryDaysLeft}試合</span>}
```

## データモデル変更

```js
// src/engine/player.js の generatePlayer() に追加
injuryPart: null,         // 現在の故障箇所（string | null）。回復時 null に戻る
injuryHistory: [],        // 過去の怪我歴。[{ part: string, year: number }] 最大10件
```

## 受け入れ条件

- [ ] 怪我発生時に `injuryPart`（肩/肘/膝/腰/脇腹/足首 のいずれか）が必ず設定される
- [ ] PlayerModal と StatusBadge に `[部位]` が表示される
- [ ] 過去2シーズン以内に怪我歴のある選手は `checkForInjuries` での発生確率が ×1.2 倍になる
- [ ] 同部位の再発歴がある場合、その部位が怪我として選ばれる確率が高くなる（重み2倍）
- [ ] `injuryHistory` は最大10件でそれ以上は古い方から削除される
- [ ] 新規ゲーム開始・既存セーブロード時に `injuryPart: null, injuryHistory: []` が欠落しても動作する（nullish coalescingで防御）
- [ ] `Math.random()` を使用していない（`rng()` / `rngf()` のみ）
- [ ] ビルド・全テスト通過

## テストケース

`src/engine/__tests__/injury.test.js` を新規作成:

```js
describe('checkForInjuries - recurrence risk', () => {
  // 正常系: 怪我歴なしの選手は recurrenceMod = 1.0
  // 再発リスク: 過去2年以内に怪我歴あり → recurrenceMod = 1.2
  // ウィンドウ外: 3年以上前の怪我は recurrenceMod に影響しない
  // 部位重み: 再発歴のある部位の weight が2倍になっている
  // エッジケース: injuryHistory が undefined でもクラッシュしない
})

describe('tickInjuries - part clearing', () => {
  // injuryDaysLeft が 0 になったとき injuryPart も null に戻る
  // injuryDaysLeft > 0 のとき injuryPart は維持される
})
```

## NPB 協約上の制約

なし（故障箇所の追跡・再発リスクは内部ゲームバランス実装）

## 過去バグからの教訓

- B1 パターン: `checkForInjuries` は **自チーム・相手チーム両方** に適用すること。
  `useSeasonFlow.js` の全11箇所を漏れなく更新する（片方だけ更新すると CPU 選手の怪我に部位情報が付かなくなる）

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（`INJURY_BODY_PARTS` 等）
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

- `㊵` の状態を `未着手` → `✅ 完了` に変更し、コミットハッシュを追記
- 「最終更新」ヘッダー行を `YYYY-MM-DD（怪我詳細化 完了）` に更新

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — 怪我の詳細化（コミットハッシュ）

**仕様本文への影響あり（§4.10）**

- 故障箇所（肩/肘/膝/腰/脇腹/足首）をランダム決定し player.injuryPart に記録
- injuryHistory（最大10件）で過去2シーズンの怪我歴を追跡
- 同部位の再発リスク: 怪我発生確率 ×1.2 倍・同部位が選ばれる確率 2倍重み
- PlayerModal・StatusBadge に故障箇所を表示
- injury.test.js を新規追加（再発リスク・部位クリアの検証）
```

## SPEC.md 更新箇所

- §4.10 怪我システム「怪我の種類」表の下に以下を追記:

```
#### 故障箇所

| 箇所 | 確率重み |
|------|---------|
| 肩   | 20 |
| 肘   | 18 |
| 腰   | 17 |
| 膝   | 15 |
| 脇腹 | 15 |
| 足首 | 15 |

- `injuryPart` フィールドに記録。回復時 null に戻る
- 同箇所の再発リスク（過去2シーズン以内）: 怪我確率 ×1.2 倍。当該箇所の重みも 2倍
- `injuryHistory: [{part, year}]`（最大10件）で追跡
```

## コミットメッセージ

`feat: 怪我の詳細化 — 故障箇所追跡・同部位再発リスク実装`

## PR タイトル

`feat: 怪我の詳細化 — 故障箇所追跡・同部位再発リスク実装`
