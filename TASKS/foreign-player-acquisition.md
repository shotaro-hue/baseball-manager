---
task-id: foreign-player-acquisition
type: feature
commit-prefix: feat
created: 2026-04-04
roadmap-item: "㊱ 外国人選手獲得 (Tier 10)"
---

# Task: 外国人選手獲得

## 背景・目的

現状、外国人選手は海外スカウトのみで獲得できるが、NPB では毎年オフに海外FA市場から新外国人選手が加入するのが一般的。この機能を追加することで、スカウトとは別の補強ルート（外国人FA市場）をプレイヤーに提供し、枠戦略と代理人交渉の駆け引きをゲームプレイの深みとして実現する。

外国人枠（一軍登録最大4名）はあくまで **一軍出場登録** の制限であり、契約・獲得自体は枠超過でも可能（超過時は二軍スタート）。これにより、外国人選手を枠を超えて保有しつつ一軍を使い分けるNPBリアルな戦略が可能になる。

## 機能説明

- 毎年シーズン開幕時に `FOREIGN_FA_COUNT_MIN`〜`FOREIGN_FA_COUNT_MAX`（5〜10）名の外国人選手が手続き生成されFA市場に追加される
- FA市場（tab="fa"）に「外国人FA市場」セクションを新設し、通常FAと分離して表示する
- gameDay ≤ `FOREIGN_DEADLINE_DAY`（100）の期間のみ代理人交渉ボタンが有効（それ以降は「交渉期限終了（7月末）」表示で非活性）
- 外国人選手の獲得は **代理人交渉（最大2ラウンド）** を経由する：
  - **Round 1（年俸）**: エージェントが `salary × FOREIGN_AGENT_SALARY_RATIO`（1.2倍）を要求。ユーザーは「要求を呑む」か「基準年俸で交渉」（確率判定あり）か「打ち切り」を選択
  - **Round 2（契約年数）**: エージェントが最低年数（age ≤ 30 なら2年、age > 30 なら1年）を要求。ユーザーは「同意」か「打ち切り」を選択
  - 合意成立時: 一軍外国人枠（4名）に空きがあれば一軍登録、なければ二軍スタートで契約（警告メッセージ付き）
  - 破談時: 選手はFA市場に残留
- CPU チームの外国人FA入札（`processCpuFaBids`）も外国人選手を対象に含める（外国人枠チェックは一軍のみ、枠超過時は farm に追加）
- FA市場ヘッダーに「外国人一軍: X/4」バッジを常時表示

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/engine/player.js` | `makePlayer(pos, q, isPitch, ageOverride, isForeign)` を確認（34行目）。新規 `generateForeignFaPool()` をここに追加 |
| `src/hooks/useOffseason.js` | `handleNextYear()` の37行目（`setFaPool([])`）が注入ポイント。`generateForeignFaPool` をここで呼ぶ |
| `src/App.jsx` | FA タブ（tab="fa"）の170〜192行。代理人交渉UI を追加する箇所。`agentNeg` state を追加 |
| `src/engine/contract.js` | `processCpuFaBids()`（169行目〜）。外国人選手の farm 配置ロジックを追加 |
| `src/constants.js` | ファイル末尾に新定数ブロックを追加 |
| `src/utils.js` | `pname()` の実装（61行目）を確認。外国人名生成は別配列を constants.js で定義する |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | 外国人FA定数ブロックを末尾に追加 |
| `src/engine/player.js` | Modify | `generateForeignFaPool(count, year)` 関数を追加 |
| `src/hooks/useOffseason.js` | Modify | `handleNextYear()` 内で外国人FAプールを生成して `setFaPool` に注入 |
| `src/App.jsx` | Modify | `agentNeg` state 追加・FA タブに外国人FA市場セクションと交渉UIを追加 |
| `src/engine/contract.js` | Modify | `processCpuFaBids()` に外国人枠チェック（farm配置）を追加 |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

ファイル末尾の `DEV_GOALS_PITCHER` 配列の後に追加する：

```js
// ── 外国人FA市場 ─────────────────────────────────
export const FOREIGN_FA_COUNT_MIN = 5;
export const FOREIGN_FA_COUNT_MAX = 10;
export const FOREIGN_DEADLINE_DAY = 100;  // Day > 100 は代理人交渉不可（7月末相当）
export const FOREIGN_AGENT_SALARY_RATIO = 1.2;  // Round 1: エージェント要求倍率
export const FOREIGN_AGENT_ACCEPT_PROB = 0.55;  // 基準年俸で交渉時の合意確率

// 外国人選手名プール（姓のみ。NPB実在選手の姓スタイルを参考に）
export const FOREIGN_PLAYER_NAMES = [
  "ロドリゲス","ガルシア","マルティネス","ゴメス","ヘルナンデス",
  "ウィルソン","ジョンソン","スミス","ブラウン","ジョーンズ",
  "チェン","キム","パク","リ","ルー",
  "アルバレス","モレノ","カスティーヨ","フローレス","ペレス",
  "オコエ","ンウォス","トーレス","ロペス","サンチェス",
  "ミラー","ダービス","トンプソン","テイラー","アンダーソン",
  "ディアス","ヒメネス","バルデス","カブレラ","モンテス",
];

// 出身国プール
export const FOREIGN_NATIONALITIES = [
  "ドミニカ","ベネズエラ","キューバ","アメリカ","韓国",
  "台湾","メキシコ","パナマ","コロンビア","ブラジル",
  "オーストラリア","プエルトリコ",
];
```

### Step 2: 外国人FA選手生成（src/engine/player.js）

`makePlayer` の後に追加する：

```js
import {
  FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX,
  FOREIGN_PLAYER_NAMES, FOREIGN_NATIONALITIES, POSITIONS,
} from '../constants';

/**
 * 毎シーズン開幕時に FA 市場に追加する外国人選手プールを生成する。
 * @param {number} count - 生成人数（FOREIGN_FA_COUNT_MIN〜MAX の間で呼び出し元が決める）
 * @returns {Object[]} isForeign=true の選手オブジェクト配列
 */
export function generateForeignFaPool(count) {
  const pool = [];
  // 野手・投手を概ね半々で生成
  for (let i = 0; i < count; i++) {
    const isPitch = i % 2 === 0;
    // 外国人選手は即戦力（能力値レンジ: 62〜82）
    const q = rng(62, 82);
    const age = rng(22, 32);
    // ポジション: 野手は一塁手・外野が多い、投手は先発・抑えが多い
    const batPositions = ["一塁手","左翼手","右翼手","中堅手","指名打者"];
    const pitPositions = ["先発","先発","先発","抑え","中継ぎ"];
    const pos = isPitch
      ? pitPositions[rng(0, pitPositions.length - 1)]
      : batPositions[rng(0, batPositions.length - 1)];
    const p = makePlayer(pos, q, isPitch, age, true);
    // 名前・出身地を外国人風に上書き
    p.name = FOREIGN_PLAYER_NAMES[rng(0, FOREIGN_PLAYER_NAMES.length - 1)];
    p.hometown = FOREIGN_NATIONALITIES[rng(0, FOREIGN_NATIONALITIES.length - 1)];
    // 年俸: 能力に応じた相場（単位: 万円）
    p.salary = rng(8000, 25000);
    // 契約年数はリセット（FAなので0）
    p.contractYearsLeft = 0;
    p.contractYears = 0;
    p.isFA = true;
    pool.push(p);
  }
  return pool;
}
```

**注意**: `makePlayer` は `pname()` で日本語名を生成するが、その後 `p.name` を上書きするため問題なし。

### Step 3: オフシーズン注入（src/hooks/useOffseason.js）

`handleNextYear()` の先頭（37行目付近）を変更する：

```js
// Before:
setYear(y=>y+1); setGameDay(1); setFaPool([]); ...

// After:
const foreignPool = generateForeignFaPool(rng(FOREIGN_FA_COUNT_MIN, FOREIGN_FA_COUNT_MAX));
setYear(y=>y+1);
setGameDay(1);
setFaPool(foreignPool);  // 外国人FAプールを初期値としてセット（通常FAは後続で追加）
```

`useOffseason.js` のインポートに `generateForeignFaPool`, `FOREIGN_FA_COUNT_MIN`, `FOREIGN_FA_COUNT_MAX` を追加する。

**重要**: `setFaPool([])` を `setFaPool(foreignPool)` に置き換えるだけ。オフシーズン処理（`handleOffseason`）で `setFaPool(prev=>[...prev,...renewResult.newFaPlayers])` が呼ばれるが、これは既存FAプールに通常FA選手を追加するため順序を変えてはならない。ただし `handleOffseason` は `handleNextYear` より **前**（`development_phase` 中）に呼ばれるため、実際には外国人プールは `handleDraftComplete → handleNextYear` 経由で追加される。開幕時の gameDay=1 に外国人FA選手が並ぶ動作となる。

### Step 4: FA タブ UI（src/App.jsx）

#### 4-1. `agentNeg` state を追加（既存 useState 群の末尾付近に追加）

```jsx
const [agentNeg, setAgentNeg] = useState(null);
// agentNeg = null | { player, round: 1|2, salaryDemand, minYears, salaryOffer }
```

#### 4-2. FA タブ（tab="fa" の div、170〜192行）を以下の構成に拡張

```
<div className="card">
  ヘッダー: "FA市場 (N人)" + "外国人一軍: X/4" バッジ

  --- 外国人FA市場セクション ---
  <div className="card-h">🌏 外国人FA市場 ({外国人プール.length}人)</div>
  {gameDay > FOREIGN_DEADLINE_DAY && <警告バナー>交渉期限終了（7月末を過ぎました）</警告バナー>}
  {外国人FAプール.map(p => (
    <div className="card2">
      選手情報（名前・年齢・ポジション・出身・ベース年俸）
      能力値サマリー（グレード表示）
      {agentNeg?.player.id === p.id
        ? <代理人交渉パネル />
        : <button onClick={() => startNeg(p)} disabled={gameDay > FOREIGN_DEADLINE_DAY}>
            代理人交渉
          </button>
      }
    </div>
  ))}

  --- 国内FAセクション ---
  <div className="card-h">国内FA・戦力外 ({国内プール.length}人)</div>
  {既存のFAリスト（isForeignでない選手）}
</div>
```

#### 4-3. 代理人交渉パネルのロジック

```jsx
// 交渉開始
const startNeg = (player) => {
  const salaryDemand = Math.ceil(player.salary * FOREIGN_AGENT_SALARY_RATIO);
  const minYears = player.age <= 30 ? 2 : 1;
  setAgentNeg({ player, round: 1, salaryDemand, minYears, salaryOffer: salaryDemand });
};

// Round 1: 年俸交渉
// - 「要求を呑む (salaryDemand万/年)」→ round=2 へ
// - 「基準年俸 (player.salary万/年) で交渉」→ 確率 FOREIGN_AGENT_ACCEPT_PROB で合意
//   合意 → round=2 へ（salaryOffer=player.salary）
//   不合意 → "エージェントが交渉を打ち切りました" → agentNeg=null
// - 「交渉打ち切り」→ agentNeg=null

// Round 2: 契約年数交渉
// - 「同意する ({minYears}年 計{fmtSal(salaryOffer * minYears)})」→ signForeignPlayer()
// - 「交渉打ち切り」→ agentNeg=null

// 契約成立ロジック
const signForeignPlayer = (player, salary, years) => {
  const foreignActive = myTeam.players.filter(p => p.isForeign).length;
  const goToFarm = foreignActive >= MAX_外国人_一軍;
  const totalCost = salary * years;
  if (myTeam.budget < totalCost) { notify("予算不足", "warn"); return; }
  if (goToFarm) {
    // 二軍スタート
    upd(myId, t => ({
      ...t,
      budget: t.budget - totalCost,
      farm: [...t.farm, { ...player, isFA: false, contractYearsLeft: years, salary }],
    }));
    notify(`${player.name}と契約（外国人枠満杯のため二軍スタート）`, "warn");
  } else {
    upd(myId, t => ({
      ...t,
      budget: t.budget - totalCost,
      players: [...t.players, { ...player, isFA: false, contractYearsLeft: years, salary }],
    }));
    notify(`${player.name}を一軍登録で獲得！(${years}年 計${fmtSal(totalCost)})`, "ok");
  }
  setFaPool(prev => prev.filter(p => p.id !== player.id));
  setAgentNeg(null);
};
```

#### 4-4. 外国人一軍バッジ（ヘッダーに追加）

```jsx
const foreignActiveCount = myTeam.players.filter(p => p.isForeign).length;
// ヘッダー部分:
<span className="chip cb" style={{marginLeft:8,fontSize:10}}>
  外国人一軍: {foreignActiveCount}/{MAX_外国人_一軍}
</span>
```

### Step 5: CPU FA 入札（src/engine/contract.js）

`processCpuFaBids()` の候補選定ロジック（182行目付近）に外国人選手を含める + farm 配置を追加する。

```js
// 既存: .filter(p => wantPitcher ? p.isPitcher : !p.isPitcher)
// 変更不要（外国人選手もすでに候補に入る）

// 契約成立時（208行目付近）を変更:
const foreignActiveOnTeam = team.players.filter(p => p.isForeign).length;
const goToFarm = player.isForeign && foreignActiveOnTeam >= MAX_外国人_一軍;

if (goToFarm) {
  teamMap.set(bid.tid, {
    ...team,
    farm: [...(team.farm || []), { ...player, isFA: false, contractYearsLeft: 1, salary: bid.salary }],
    budget: team.budget - bid.salary,
  });
} else {
  teamMap.set(bid.tid, {
    ...team,
    players: [...team.players, { ...player, isFA: false, contractYearsLeft: 1, salary: bid.salary }],
    budget: team.budget - bid.salary,
  });
}
```

`MAX_外国人_一軍` を contract.js のインポートに追加すること（`src/constants.js` から）。

## データモデル変更

新規フィールドなし。既存フィールドをそのまま使用。

```js
// faPool の外国人エントリー（既存構造に追加情報なし）
{
  ...makePlayer(..., true),  // isForeign: true
  name: "ロドリゲス",         // 上書き
  hometown: "ドミニカ",       // 上書き（出身国）
  salary: 15000,             // 万円
  isFA: true,
}
```

## 受け入れ条件

- [ ] シーズン開幕（gameDay=1）時に FA 市場の「外国人FA市場」セクションに 5〜10 名が表示される
- [ ] gameDay ≤ 100 のとき「代理人交渉」ボタンが有効。Day > 100 は非活性で「交渉期限終了（7月末）」が表示される
- [ ] 代理人交渉は最大2ラウンドで、Round 1（年俸）→ Round 2（年数）の順に進む
- [ ] 合意成立時、外国人一軍枠に空きがあれば `team.players` に、なければ `team.farm` に追加される（警告付き）
- [ ] 「外国人一軍: X/4」バッジが FA 市場ヘッダーに常時表示される
- [ ] 交渉破談時は選手が FA プールに残留する
- [ ] CPU チームも外国人選手を FA 入札で獲得できる（枠超過時は farm 配置）
- [ ] ビルド・全テスト通過

## テストケース

`src/engine/__tests__/player.test.js`（または新規 `foreignPlayer.test.js`）に追加：

```js
describe("generateForeignFaPool", () => {
  it("指定人数の外国人選手を生成する", () => {
    const pool = generateForeignFaPool(7);
    expect(pool).toHaveLength(7);
    pool.forEach(p => {
      expect(p.isForeign).toBe(true);
      expect(p.entryType).toBe('外国人');
      expect(p.isFA).toBe(true);
      expect(p.salary).toBeGreaterThanOrEqual(8000);
    });
  });
  it("投手と野手が概ね半々で生成される（偶数インデックスが投手）", () => {
    const pool = generateForeignFaPool(6);
    const pitchers = pool.filter(p => p.isPitcher);
    expect(pitchers).toHaveLength(3);
  });
});
```

## NPB 協約上の制約

- **一軍外国人枠**: 一軍出場選手登録は外国人最大 4 名（NPB協約 §82 条）。契約・支配下登録は枠外。
- **外国人枠免除**: `daysOnActiveRoster >= 960` で外国人枠から除外（既存 `FOREIGN_EXEMPTION_DAYS` 定数を使用）。

## 過去バグからの教訓

- **B1 パターン**: CPU チームへの処理は両チームに適用すること。`processCpuFaBids` 変更時は全チームを対象にする
- **外国人枠**: 既存の App.jsx:185 の旧ガード（`isForeign && 枠満杯 → 獲得不可`）を **削除**し、farm 配置ロジックに置き換えること。削除漏れで二重チェックになるとバグになる

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（`FOREIGN_AGENT_SALARY_RATIO` 等）
- 選手 ID は `uid()` で生成（`makePlayer` 内でこれが行われるため追加不要）

## ROADMAP.md 更新指示

- `㊱` の状態を `未着手` → `✅ 完了` に変更（コミットハッシュを追記）
- 「最終更新」ヘッダー行を `2026-XX-XX（㊱ 外国人選手獲得 完了）` に更新

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### 2026-XX-XX — 外国人選手獲得（コミットハッシュ）

**仕様本文への影響あり（§13.4）**

- 毎シーズン開幕時に外国人FA選手 5〜10 名を自動生成してFA市場に追加
- 代理人交渉 UI（最大2ラウンド: 年俸→年数）を FA タブに実装
- gameDay > 100 で交渉期限終了（7月末デッドライン）
- 外国人一軍枠超過時は二軍スタート契約に対応（枠自体は獲得を阻まない）
- CPU チームの外国人FA入札に farm 配置ロジックを追加
```

## SPEC.md 更新箇所

- §13.4（Tier 10 計画中システム）の「外国人選手獲得」節に以下を追記：
  - `generateForeignFaPool()` の仕様（生成人数・能力レンジ・名前プール）
  - 代理人交渉ラウンド仕様（2ラウンド構成・`FOREIGN_AGENT_SALARY_RATIO`・`FOREIGN_DEADLINE_DAY`）
  - 外国人枠は一軍登録のみの制限であり獲得自体は常に可能である旨

## コミットメッセージ

`feat: 外国人選手獲得 — FA市場に毎年5〜10名を追加・代理人交渉UI・外国人枠farm配置対応`

## PR タイトル

`feat: 外国人選手獲得 — FA市場に毎年5〜10名を追加・代理人交渉UI・外国人枠farm配置対応`
