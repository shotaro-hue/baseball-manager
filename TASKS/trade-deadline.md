---
task-id: trade-deadline
type: feature
commit-prefix: feat
created: 2026-04-05
roadmap-item: "㊳ トレードデッドライン (Tier 11)"
---

# Task: トレードデッドライン

## 背景・目的
NPBのトレード期限は7月31日。現状CPUはシーズン中フラット15%の確率でプレイヤーにオファーを送るだけで、「デッドライン前の駆け込み補強」という戦略的緊張感がない。7月中にCPU球団が買い手（優勝争い中）・売り手（再建中）として役割を持って動くことで、ペナントレース中盤に意思決定の重みを加える。

## 機能説明
- **締切判定**: `gameDayToDate(gameDay, schedule).month > 7`（8月以降）でトレード不可。カレンダー日付ベースで判定する（外国人獲得と同じ方式）。
- **デッドライン期間（7月中）**: CPU→プレイヤーへのオファー確率を最大40%まで引き上げる（7月前半：25%、後半：40%）。
- **買い手/売り手分類**: リーグ順位と勝率でCPU球団を `"buyer" | "seller" | "neutral"` に分類。買い手は即戦力を要求し若手を提示、売り手はベテランを放出し若手返しを望む。
- **CPU vs CPU デッドライントレード**: 7月のバッチシム中、1試合あたり約12%の確率でCPU球団間のトレードを自動成立させる。成立時はニュースタブに移籍報道を追加する。
- **8月以降**: オファー生成を完全停止。プレイヤーからの新規提案も不可（既存 `deadlinePassed` 動作継続）。

## 読むべきファイル（優先順）
| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/trade.js` | `generateCpuOffer()`（69行目）を拡張。新規 `classifyTeam()` / `generateCpuCpuTrade()` を追加 |
| `src/hooks/useSeasonFlow.js` | `tryGenerateCpuOffer()`（102行目）の確率ロジック変更。`runBatchGames()`（333行目）内ループへのCPU vs CPU挿入ポイント。`handleAutoSimEnd`（188行目）と `handleTacticalGameEnd`（450行目）でのCPU vs CPU呼び出し |
| `src/utils.js` | `gameDayToDate(gameDay, schedule)`（67行目）の返り値 `{month, day}` を使って締切判定 |
| `src/App.jsx` | `deadlinePassed={gameDay>95}`（219行目付近）→ 月ベース判定に置換。`TRADE_DEADLINE_MONTH` をimportに追加 |
| `src/constants.js` | 定数ブロック追加場所（`FOREIGN_DEADLINE_DAY = 100` の直上、242行目付近） |
| `src/hooks/useOffseason.js` | `handleTrade()`（72行目）の実装参照。CPU vs CPU適用時の `setTeams` パターンを踏襲する |

## 変更するファイル
| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | トレードデッドライン定数ブロックを追加 |
| `src/engine/trade.js` | Modify | `classifyTeam()` / `generateCpuCpuTrade()` を追加 |
| `src/hooks/useSeasonFlow.js` | Modify | `tryGenerateCpuOffer()` 確率ロジック変更、`tryCpuCpuDeadlineTrade()` 追加、各呼び出しポイントに挿入 |
| `src/App.jsx` | Modify | `deadlinePassed` prop の判定を月ベースに変更 |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

`FOREIGN_DEADLINE_DAY = 100` の直上に追加する:

```js
// ── トレードデッドライン ──────────────────────────
export const TRADE_DEADLINE_MONTH = 7;           // 7月末が期限（NPB協約準拠）
export const TRADE_DEADLINE_PROB_EARLY = 0.25;   // 7月前半（day <= 15）のオファー確率
export const TRADE_DEADLINE_PROB_PEAK  = 0.40;   // 7月後半（day > 15）のオファー確率
export const TRADE_DEADLINE_CPU_CPU_PROB = 0.12; // CPU vs CPUトレード発生確率（1試合あたり）
```

`FOREIGN_DEADLINE_DAY` は変更しない。

---

### Step 2: エンジン実装（src/engine/trade.js）

既存の `generateCpuCpuTrade()` は存在しないため新規追加する。ファイル末尾に追記:

#### `classifyTeam(team, allTeams)`
```js
/**
 * 球団をトレードデッドラインでの立場に分類する。
 * @param {object} team - 対象球団
 * @param {object[]} allTeams - 全球団
 * @returns {"buyer" | "seller" | "neutral"}
 */
export function classifyTeam(team, allTeams) {
  const leagueTeams = allTeams
    .filter(t => t.league === team.league)
    .sort((a, b) => b.wins - a.wins);
  const rank = leagueTeams.findIndex(t => t.id === team.id) + 1;
  const g = (team.wins || 0) + (team.losses || 0);
  const winPct = g > 0 ? team.wins / g : 0.5;

  if (rank <= 2 || winPct >= 0.56) return "buyer";
  if (rank >= 5 || winPct <= 0.44) return "seller";
  return "neutral";
}
```

#### `generateCpuCpuTrade(allTeams)`
```js
/**
 * CPU vs CPU のトレードを1件生成する。
 * 買い手チームが売り手チームからベテランを獲得し、若手を対価として提示する。
 * @param {object[]} allTeams - 全球団（myTeam含む）
 * @returns {{ buyerId: string, sellerId: string, buyerGets: object, sellerGets: object } | null}
 */
export function generateCpuCpuTrade(allTeams) {
  const buyers  = allTeams.filter(t => classifyTeam(t, allTeams) === "buyer");
  const sellers = allTeams.filter(t => classifyTeam(t, allTeams) === "seller");
  if (!buyers.length || !sellers.length) return null;

  const buyer  = buyers[Math.floor(Math.random() * buyers.length)];
  const seller = sellers.filter(t => t.id !== buyer.id)[0];
  if (!seller) return null;

  // 売り手の選手: ベテラン（28歳以上）を高価値順でソート
  const sellerVets = seller.players
    .filter(p => !p.injury && (p.age || 25) >= 28)
    .sort((a, b) => tradeValue(b) - tradeValue(a));
  // 買い手の選手: 若手（25歳以下）で対価とする
  const buyerProspects = buyer.players
    .filter(p => !p.injury && (p.age || 25) <= 25)
    .sort((a, b) => tradeValue(b) - tradeValue(a));

  if (!sellerVets.length || !buyerProspects.length) return null;

  const buyerGets  = sellerVets[0];
  const sellerGets = buyerProspects[0];

  // 価値差が大きすぎる場合はスキップ（±30以上）
  const valueDiff = Math.abs(tradeValue(buyerGets) - tradeValue(sellerGets));
  if (valueDiff > 30) return null;

  return { buyerId: buyer.id, sellerId: seller.id, buyerGets, sellerGets,
           buyerName: buyer.name, sellerName: seller.name };
}
```

**注意**: `Math.random()` は `trade.js` 内の他の関数でも既に使用されているため、この関数でも使用可。ただし `rng` が利用可能なら `rng()` を優先すること（`src/utils.js` の `rng` をimportして使う）。

---

### Step 3: useSeasonFlow.js の変更

#### 3-a. インポート追加

ファイル先頭の `import { ... } from '../engine/trade'` に `classifyTeam` と `generateCpuCpuTrade` を追加:
```js
import { generateCpuOffer, generateCpuCpuTrade, classifyTeam } from '../engine/trade';
```

`constants.js` のインポートに追加:
```js
import {
  ..., TRADE_DEADLINE_MONTH, TRADE_DEADLINE_PROB_EARLY,
  TRADE_DEADLINE_PROB_PEAK, TRADE_DEADLINE_CPU_CPU_PROB,
} from '../constants';
```

`gameDayToDate` を utils からインポートに含まれているか確認し、なければ追加:
```js
import { rng, uid, gameDayToDate, ... } from '../utils';
```

#### 3-b. `tryGenerateCpuOffer()` の変更（102行目付近）

現在の実装:
```js
const tryGenerateCpuOffer = () => {
  if(Math.random()>0.15||cpuTradeOffers.length>=2||!myTeam) return;
  ...
```

置き換え:
```js
const tryGenerateCpuOffer = () => {
  if (!myTeam) return;
  // 8月以降はオファー生成しない
  const currentDate = gameDayToDate(gameDay, schedule);
  if (currentDate && currentDate.month > TRADE_DEADLINE_MONTH) return;

  // 7月中はデッドライン確率、それ以外は通常確率
  let prob = 0.15;
  if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
    prob = currentDate.day > 15 ? TRADE_DEADLINE_PROB_PEAK : TRADE_DEADLINE_PROB_EARLY;
  }
  if (rngf(0, 1) > prob || cpuTradeOffers.length >= 2) return;

  const others = teams.filter(t => t.id !== myId);
  if (!others.length) return;
  // 7月中は買い手チームを優先してオファー元に選ぶ
  let cpuTeam;
  if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
    const buyers = others.filter(t => classifyTeam(t, teams) === "buyer");
    cpuTeam = buyers.length ? buyers[rng(0, buyers.length - 1)] : others[rng(0, others.length - 1)];
  } else {
    cpuTeam = others[rng(0, others.length - 1)];
  }
  const offer = generateCpuOffer(cpuTeam, myTeam);
  if (offer) {
    // 以降は既存の mail 生成ロジックをそのまま踏襲
    ...（既存コードをそのまま維持）
  }
};
```

**注意**: `rngf(0,1)` は `src/utils.js` の `rngf(min,max)`。既存コードで `Math.random()` が使われている部分をここで置き換えること。

#### 3-c. `tryCpuCpuDeadlineTrade(teamsArr)` を新規追加（`tryGenerateCpuOffer` の直後）

この関数は `runBatchGames` の `newTeams` 配列を受け取り、直接変異させる（参照渡しパターン）。`addNews` / `setTeams` は呼び出せないため、戻り値でニュース項目を返す。

```js
/**
 * 7月のバッチシム中にCPU vs CPU デッドライントレードを試みる。
 * @param {object[]} teamsArr - runBatchGames 内の newTeams（直接変異させる）
 * @param {number} currentGameDay
 * @returns {{ headline: string, body: string } | null} 成立時はニュース項目
 */
const tryCpuCpuDeadlineTrade = (teamsArr, currentGameDay) => {
  const currentDate = gameDayToDate(currentGameDay, schedule);
  if (!currentDate || currentDate.month !== TRADE_DEADLINE_MONTH) return null;
  if (rngf(0, 1) > TRADE_DEADLINE_CPU_CPU_PROB) return null;

  const result = generateCpuCpuTrade(teamsArr);
  if (!result) return null;

  const { buyerId, sellerId, buyerGets, sellerGets, buyerName, sellerName } = result;
  const buyer  = teamsArr.find(t => t.id === buyerId);
  const seller = teamsArr.find(t => t.id === sellerId);
  if (!buyer || !seller) return null;

  // ロスター変更（直接変異）
  buyer.players  = [...buyer.players.filter(p => p.id !== sellerGets.id), buyerGets];
  seller.players = [...seller.players.filter(p => p.id !== buyerGets.id), sellerGets];

  return {
    headline: `【移籍情報】${buyerGets.name}が${buyerName}へ`,
    body: `${sellerName}と${buyerName}の間でトレードが成立。${buyerName}は${buyerGets.name}を獲得し、${sellerGets.name}を放出した。`,
  };
};
```

#### 3-d. `runBatchGames()` 内ループへの挿入（382行目付近）

CPU vs CPU ゲーム処理ブロックの直後（`b.rotIdx++` の後）に追加:

```js
// デッドライントレード試行（7月のみ）
const cpuCpuTradeNews = tryCpuCpuDeadlineTrade(newTeams, newDay);
if (cpuCpuTradeNews) {
  results.push({ type: 'trade_news', ...cpuCpuTradeNews, day: newDay });
}
```

`runBatchGames` の末尾で `setTeams(newTeams)` する前に、`results` 配列内の `trade_news` をニュースとして配信する:

```js
// 既存の setTeams / setGameDay / setMailbox 等の更新ブロックの中に追記
results.filter(r => r.type === 'trade_news').forEach(r => {
  addNews({
    type: 'trade',
    headline: r.headline,
    source: 'Baseball Times',
    dateLabel: `${year}年 ${r.day}日目`,
    body: r.body,
  });
});
```

#### 3-e. `handleAutoSimEnd` と `handleTacticalGameEnd` への追加

`tryGenerateCpuOffer()` が呼ばれている箇所（276行目・541行目付近）の直後に追加:

```js
// handleAutoSimEnd 内（tryGenerateCpuOffer() の後）
const currentDate = gameDayToDate(gameDay, schedule);
if (currentDate && currentDate.month === TRADE_DEADLINE_MONTH) {
  const liveTeams = [...teams]; // stateスナップショット
  const newsItem = tryCpuCpuDeadlineTrade(liveTeams, gameDay);
  if (newsItem) {
    setTeams(liveTeams);
    addNews({ type: 'trade', headline: newsItem.headline, source: 'Baseball Times',
              dateLabel: `${year}年 ${gameDay}日目`, body: newsItem.body });
  }
}
```

**同じパターンを `handleTacticalGameEnd` にも追加すること。**

---

### Step 4: App.jsx の変更

#### 4-a. インポート追加

```js
import {
  ..., TRADE_DEADLINE_MONTH,
} from './constants';
import { gameDayToDate } from './utils';
```

#### 4-b. `deadlinePassed` の判定変更（219行目付近）

変更前:
```js
deadlinePassed={gameDay>95}
```

変更後:
```js
deadlinePassed={(() => {
  const d = gameDayToDate(gameDay, schedule);
  return d ? d.month > TRADE_DEADLINE_MONTH : gameDay > 95;
})()}
```

`schedule` は App.jsx の state として既に存在する。

---

## データモデル変更

新規フィールドなし。`classifyTeam` はランタイム計算のみ（永続化不要）。

---

## 受け入れ条件
- [ ] 7月中（`gameDayToDate().month === 7`）にCPUオファーが通常より頻繁に届く（目視確認）
- [ ] 7月後半（day > 15）のオファー確率が前半より高い（コードレビューで確認）
- [ ] 上位チームの買い手が若手を対価に即戦力を要求するオファーを生成する
- [ ] 8月1日以降（month > 7）はCPUオファーが届かず、TradeTab の新規提案ボタンが無効になる
- [ ] バッチシム（7月分）完了後ニュースタブにCPU vs CPU移籍情報が1件以上表示される（確率12%のため必ず出るとは限らない）
- [ ] ビルド（`npm run build`）エラーなし・全Vitestテスト通過

---

## テストケース

`src/engine/__tests__/trade.test.js` に `describe("classifyTeam")` を追加:

```js
describe("classifyTeam", () => {
  const makeTeam = (id, wins, losses, league = "セ") => ({
    id, wins, losses, league, players: [],
  });

  it("勝率56%以上はbuyer", () => {
    const teams = [
      makeTeam("t1", 56, 44), // winPct=0.56 → buyer
      makeTeam("t2", 40, 60),
      makeTeam("t3", 50, 50),
      makeTeam("t4", 45, 55),
      makeTeam("t5", 42, 58),
      makeTeam("t6", 38, 62),
    ];
    expect(classifyTeam(teams[0], teams)).toBe("buyer");
  });

  it("勝率44%以下はseller", () => {
    const teams = [
      makeTeam("t1", 60, 40),
      makeTeam("t2", 55, 45),
      makeTeam("t3", 50, 50),
      makeTeam("t4", 45, 55),
      makeTeam("t5", 42, 58), // winPct=0.42 → seller
      makeTeam("t6", 38, 62),
    ];
    expect(classifyTeam(teams[4], teams)).toBe("seller");
  });

  it("中間はneutral", () => {
    const teams = [
      makeTeam("t1", 60, 40),
      makeTeam("t2", 55, 45),
      makeTeam("t3", 52, 48), // rank=3, winPct=0.52 → neutral
      makeTeam("t4", 50, 50),
      makeTeam("t5", 48, 52),
      makeTeam("t6", 45, 55),
    ];
    expect(classifyTeam(teams[2], teams)).toBe("neutral");
  });
});

describe("generateCpuCpuTrade", () => {
  it("buyer/seller が存在しない場合はnullを返す", () => {
    // 全チームが同一勝率でneutral → トレード不成立
    const teams = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`, wins: 50, losses: 50, league: "セ",
      players: [],
    }));
    expect(generateCpuCpuTrade(teams)).toBeNull();
  });
});
```

---

## NPB 協約上の制約
トレード公示期間（7月31日締切）。`gameDayToDate().month > 7`（8月以降）で締切判定することでNPB協約と整合する。

---

## 過去バグからの教訓
- **B1 パターン**: CPU vs CPU トレードは `runBatchGames` 内の `newTeams` 配列を直接変異させること。`setTeams` を forループ内で呼ぶと state が正しく反映されない。
- **B2 パターン**: `handleAutoSimEnd` / `handleTacticalGameEnd` でのCPU vs CPUトレードは `setTeams` で更新するが、ループ外の単発呼び出しのため問題なし。

---

## コーディング規約リマインダー
- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
  - **例外**: `trade.js` 内の既存関数は `Math.random()` を使っているが、新規追加関数では `rng` / `rngf` を使うこと
- ゲームバランス数値（確率・閾値）は `src/constants.js` に定数として切り出す
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

---

## ROADMAP.md 更新指示
- `㊳` の状態を `未着手` → `✅ 完了` に変更
- 「最終更新」ヘッダー行を `2026-MM-DD（トレードデッドライン 完了）` に更新

---

## CHANGELOG.md エントリ（コミット後に hash を埋めること）
```
### 2026-MM-DD — トレードデッドライン（コミットハッシュ）

**仕様本文への影響あり（§4.6 トレードシステム）**

- TRADE_DEADLINE_MONTH=7 定数を追加し、8月以降トレード不可の判定をgameDayToDate()ベースに変更
- classifyTeam()で球団を buyer/seller/neutral に分類
- tryGenerateCpuOffer()のデッドライン期間（7月）確率を最大40%に引き上げ
- CPU vs CPU デッドライントレード（generateCpuCpuTrade）を実装し runBatchGames / handleAutoSimEnd / handleTacticalGameEnd に組み込み
```

---

## SPEC.md 更新箇所
- §4.6 トレードシステム — トレードデッドライン（7月末）とデッドライン期間のCPU行動変化を追記

---

## コミットメッセージ
`feat: トレードデッドライン実装（7月末期限・CPU買い手/売り手分類・CPU間自動トレード）`

## PR タイトル
`feat: トレードデッドライン実装（7月末期限・CPU買い手/売り手分類・CPU間自動トレード）`
