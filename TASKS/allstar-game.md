---
task-id: allstar-game
type: feature
commit-prefix: feat
created: 2026-04-02
roadmap-item: "㉞ オールスターゲーム (Tier 10)"
---

# Task: オールスターゲーム

## 背景・目的

NPB のオールスターゲームをゲーム内に再現する。シーズン中盤（gameDay ≒ 72）に自動でセ・リーグ選抜 vs パ・リーグ選抜の試合を行い、成績上位選手を「ファン投票」、残りを「監督推薦」として選出する。選出された選手には `allStarSelections` カウンターをインクリメントし、殿堂入り評価や選手紹介への活用を見据える。

## 機能説明

- gameDay が定数 `ALL_STAR_GAMEDAY`（≒72）に到達した時点で `"allstar"` 画面に遷移する
- セ・リーグ / パ・リーグからそれぞれ **29名** を選出してオールスターロスターを構成する
- **ファン投票枠**（指標トップ）:
  - 野手: 各ポジション（捕手・一塁手・二塁手・三塁手・遊撃手・左翼手・中堅手・右翼手）から wOBA 最上位1名
  - パ・リーグのみ追加: 指名打者（DH）枠1名（wOBA 最上位、上記ポジション選出者を除く）
  - 先発投手: FIP 最上位3名（IP ≥ 30 でフィルタ）
  - 中継ぎ: HLD 最上位1名（IP ≥ 10 でフィルタ）
  - 抑え: SV 最上位1名（IP ≥ 5 でフィルタ）
  - 合計: セ13名 / パ14名
- **監督推薦枠**（残り、ファン投票未選出の選手から選出）:
  - 投手と野手が合計で14名：15名になるよう補完する
  - セ: 追加投手9名 + 追加野手7名 = 16名 → 合計29名
  - パ: 追加投手9名 + 追加野手6名 = 15名 → 合計29名
  - 推薦優先順: 投手は FIP 昇順・野手は wOBA 降順で既選出者を除いて上から取る
- 選出された全選手の `player.allStarSelections` を +1 する
- `quickSimGame` を使ってセ選抜 vs パ選抜の簡易試合を1試合シミュする（先発はファン投票先発1位を自動配置）
- 試合結果（スコア・MVP候補）をニュースに追加し、専用画面 `AllStarScreen.jsx` で表示
- 「続ける」ボタンで `"hub"` に戻る
- バッチシム中（runBatchGames）でも `ALL_STAR_GAMEDAY` を通過する際に1度だけ allStar 処理を実行し、ニュースに追加する（画面遷移はしない）
- `allStarDone` フラグ（boolean、state）で重複発火を防ぐ。`handleNextYear` でリセット

## 読むべきファイル（優先順）

| ファイル | 理由・参照ポイント |
|---|---|
| `src/hooks/useSeasonFlow.js` | `setGameDay(d=>d+1)` 呼び出し後の分岐（~260行・~476行）。バッチ処理の `runBatchGames`（~287行）に All-Star 差し込みポイントを追加 |
| `src/App.jsx` | スクリーンルーティング（~66〜99行）に `"allstar"` を追加。`allStarDone` state 宣言場所の確認 |
| `src/engine/sabermetrics.js` | `saberBatter(stats).wOBA`・`saberPitcher(stats).FIP` の返り値確認 |
| `src/engine/simulation.js` | `quickSimGame(myTeam, oppTeam)` シグネチャ（~638行）。チームオブジェクト構造の確認 |
| `src/engine/player.js` | `makePlayer()` の初期フィールド一覧（~34〜56行）。`allStarSelections: 0` 追加場所 |
| `src/constants.js` | `POSITIONS` 配列（61行）・`SEASON_GAMES`（5行）確認。`ALL_STAR_GAMEDAY` 追加場所 |
| `src/hooks/useOffseason.js` | `handleNextYear` 内でシーズン間 state リセットが行われる場所（`allStarDone` リセット追加） |

## 変更するファイル

| ファイル | 操作 | 備考 |
|---|---|---|
| `src/constants.js` | Modify | `ALL_STAR_GAMEDAY = 72` を追加 |
| `src/engine/player.js` | Modify | `makePlayer()` に `allStarSelections: 0` を追加 |
| `src/engine/allstar.js` | Create | 選出ロジック・簡易シム呼び出しを集約 |
| `src/hooks/useSeasonFlow.js` | Modify | `setGameDay` 分岐に allstar トリガーを追加。`runBatchGames` にも差し込み |
| `src/hooks/useGameState.js` | Modify | `allStarDone` state（boolean）を追加 |
| `src/hooks/useOffseason.js` | Modify | `handleNextYear` で `allStarDone` を `false` にリセット |
| `src/App.jsx` | Modify | `allStarDone` を props として渡す。`"allstar"` スクリーン分岐を追加 |
| `src/components/AllStarScreen.jsx` | Create | オールスター選抜表示・試合結果・続けるボタン |

## 実装ガイダンス

### Step 1: 定数追加（src/constants.js）

```js
// SEASON_GAMES の近くに追加
export const ALL_STAR_GAMEDAY = 72; // シーズン中盤オールスター発火 gameDay
```

### Step 2: エンジン実装（src/engine/allstar.js）

```js
import { saberBatter, saberPitcher } from './sabermetrics';
import { quickSimGame } from './simulation';
import { rng } from '../utils';

/**
 * 全チームの全選手からリーグ別にオールスターロスターを選出する。
 * @param {Object[]} teams - 全チーム配列（team.league === "セ" | "パ"）
 * @returns {{ ce: Object[], pa: Object[] }} 各リーグ29名の選手配列
 */
export function selectAllStars(teams) { ... }

/**
 * selectAllStars の結果を受け取り簡易試合をシミュする。
 * @param {{ ce: Object[], pa: Object[] }} rosters
 * @returns {{ score: {ce:number, pa:number}, mvp: Object }} 試合結果
 */
export function runAllStarGame(rosters) { ... }
```

#### selectAllStars の実装詳細

```
ポジション対応マップ（constants.js の POSITIONS 配列と照合）:
  捕手 → C
  一塁手 → 1B
  二塁手 → 2B
  三塁手 → 3B
  遊撃手 → SS
  左翼手 → LF
  中堅手 → CF
  右翼手 → RF

各リーグの野手選出ループ:
  for pos in ["捕手","一塁手","二塁手","三塁手","遊撃手","左翼手","中堅手","右翼手"]:
    league野手を pos でフィルタ → wOBA 降順ソート → 未選出の先頭1名 → fanVote.batters に追加

パリーグのみ DH 追加:
  全パ野手から既選出者を除いて wOBA 降順 → 先頭1名を fanVote.batters に追加

投手ファン投票:
  IP≥30 の先発投手を FIP 昇順 → 上位3名 → fanVote.starters
  IP≥10 の中継ぎ（HLD > 0 or pos==="中継ぎ"）を HLD 降順 → 1名 → fanVote.reliever
  IP≥5 の抑え（SV > 0 or pos==="抑え"）を SV 降順 → 1名 → fanVote.closer

セ合計: fanVote = 8+5=13名, パ合計: fanVote = 9+5=14名

監督推薦 (残り):
  セ: 投手9名(FIP昇順,既選出除く) + 野手7名(wOBA降順,既選出除く) = 16名
  パ: 投手9名(FIP昇順,既選出除く) + 野手6名(wOBA降順,既選出除く) = 15名
```

#### runAllStarGame の実装詳細

```
セ選抜チームオブジェクトを構成:
  { id: "allstar_ce", name: "セ・リーグ選抜", league: "セ", players: rosters.ce }

パ選抜チームオブジェクトを構成:
  { id: "allstar_pa", name: "パ・リーグ選抜", league: "パ", players: rosters.pa }

result = quickSimGame(ceTeam, paTeam)
  → result.score.my = セ得点, result.score.opp = パ得点

MVP: result.log から最多打点 or 最多安打の野手を抽出（いなければ rosters.ce[0]）

return { score: { ce: result.score.my, pa: result.score.opp }, mvp }
```

> **注意**: `quickSimGame` はチームオブジェクトの `players` 配列と `pitchingPattern` を参照する。`pitchingPattern` が未定義の場合は `simulation.js` 内でデフォルト処理されるため undefined のまま渡してよい。

### Step 3: player.js 更新

```js
// makePlayer() の初期化オブジェクト（~54行付近）に追加
allStarSelections: 0,
```

### Step 4: useGameState.js 更新

```js
// 既存の useState 群（gameDay 等の近く）に追加
const [allStarDone, setAllStarDone] = useState(false);
```

`allStarDone` と `setAllStarDone` を `return` オブジェクトに追加してエクスポートする。

### Step 5: useSeasonFlow.js 更新

`useSeasonFlow(gs)` が受け取る `gs` オブジェクトから `allStarDone`・`setAllStarDone` を分解する。

#### 通常試合後の分岐（~262行, handleTacticalGameEnd / handleAutoSimEnd）

```js
setGameDay(d => d + 1);
// 追加: All-Star 発火チェック（次の gameDay がオールスター日かつ未実施）
if (!allStarDone && gameDay + 1 === ALL_STAR_GAMEDAY) {
  // 選出 + stats 更新 + setScreen("allstar")
  const rosters = selectAllStars(teams);
  const gameResult = runAllStarGame(rosters);
  // allStarSelections++ を全選出選手に適用
  const allSelected = [...rosters.ce, ...rosters.pa];
  setTeams(prev => prev.map(t => ({
    ...t,
    players: t.players.map(p => {
      const hit = allSelected.find(s => s.id === p.id);
      return hit ? { ...p, allStarSelections: (p.allStarSelections ?? 0) + 1 } : p;
    })
  })));
  setAllStarDone(true);
  setAllStarResult({ rosters, gameResult }); // 別 state で画面に渡す
  setScreen("allstar");
  return; // "result" 遷移をスキップ
}
if (gameDay >= SEASON_GAMES) { ... }
else setScreen("result");
```

#### バッチシム runBatchGames（~287行）

```js
// ループ内、newDay++ の前後に挿入
if (!allStarDoneLocal && newDay === ALL_STAR_GAMEDAY) {
  allStarDoneLocal = true; // ローカルフラグ（重複防止）
  const rosters = selectAllStars(newTeams);
  const asResult = runAllStarGame(rosters);
  const allSelected = [...rosters.ce, ...rosters.pa];
  newTeams = newTeams.map(t => ({
    ...t,
    players: t.players.map(p => {
      const hit = allSelected.find(s => s.id === p.id);
      return hit ? { ...p, allStarSelections: (p.allStarSelections ?? 0) + 1 } : p;
    })
  }));
  // ニュース追加（setAllStarDone は runBatchGames 終了後に true にする）
  addNews({ type: "allstar", headline: `オールスターゲーム結果: セ${asResult.gameResult.score.ce} - パ${asResult.gameResult.score.pa}`, ... });
}
```

バッチ終了後の `setTeams(newTeams)` で allStarSelections が自動反映される。`setAllStarDone(true)` をバッチ終了直後（setTeams の後）に呼ぶ。

### Step 6: useOffseason.js 更新

`handleNextYear` の最初（または `setYear(y=>y+1)` の近く）に追加:

```js
setAllStarDone(false);
```

`setAllStarDone` は `gs` から取得する。

### Step 7: App.jsx 更新

```jsx
// allStarResult state を追加（useGameState or App.jsx 内）
const [allStarResult, setAllStarResult] = useState(null);

// スクリーンルーティングに追加（"result" ルーティングの近く）
if (screen === "allstar" && allStarResult) return (
  <AllStarScreen
    rosters={allStarResult.rosters}
    gameResult={allStarResult.gameResult}
    myId={myId}
    year={year}
    onEnd={() => setScreen("hub")}
  />
);
```

### Step 8: AllStarScreen.jsx 作成

`src/components/AllStarScreen.jsx`

```jsx
// 表示内容:
// 1. ヘッダー: 「{year}年 プロ野球オールスターゲーム」
// 2. スコアカード: セX - パY（勝利リーグを強調）
// 3. MVP: player名・所属チーム・成績1行
// 4. ファン投票選出リスト（セ/パ タブ切り替え）
//    - 野手: ポジション | 選手名 | チーム | wOBA
//    - 投手: 役割 | 選手名 | チーム | FIP / SV / HLD
// 5. 監督推薦選出リスト（折りたたみ表示 <details>）
// 6. 「続ける」ボタン → onEnd()

// 参照コンポーネント: src/components/Screens.jsx（既存の ResultScreen 等のレイアウトパターン）
// スタイル: 既存の CSS クラス（.modal, .card, .btn 等）を流用
```

## データモデル変更

```js
// src/engine/player.js の makePlayer() に追加
allStarSelections: 0,  // 通算オールスター選出回数（キャリア累積）
```

```js
// src/hooks/useGameState.js に追加する state
allStarDone: boolean,       // 当シーズンのオールスター発火済みフラグ
// App.jsx 側
allStarResult: { rosters: { ce: Player[], pa: Player[] }, gameResult: { score: {ce:number, pa:number}, mvp: Player } } | null
```

## 受け入れ条件

- [ ] gameDay が ALL_STAR_GAMEDAY（72）に達すると `"allstar"` 画面が表示される
- [ ] セ・リーグ29名・パ・リーグ29名が正しく選出され（セはDHなし・パはDHあり）、ファン投票/監督推薦のどちらかに必ず分類されている
- [ ] 選出された全58名の `allStarSelections` が +1 されている（試合後 Playerモーダルで確認可能）
- [ ] バッチシム（5試合/全試合シム）が ALL_STAR_GAMEDAY をまたいでも重複発火しない
- [ ] 2年目以降のシーズンでも正常にオールスターが発火する（`allStarDone` が年度またぎでリセットされる）
- [ ] `npm run build` が通る

## テストケース

`src/engine/__tests__/allstar.test.js` を新規作成:

```js
describe("selectAllStars", () => {
  // 正常系: セ6チーム+パ6チームのモックteamsを渡す
  // → rosters.ce.length === 29, rosters.pa.length === 29
  
  // ファン投票確認: rosters.ce の中に fanVote フラグ付きが 13名
  // パDH確認: rosters.pa の中に pos==="DH" が1名含まれる
  
  // 投手比率確認: 投手(isPitcher===true)が14名、野手が15名
  
  // エッジケース: 特定ポジションに選手が1名しかいない場合 → エラーにならず選出される
  // エッジケース: IP < 30 の投手しかいない場合 → 先発ファン投票がフォールバックしてIPフィルタなしで選出
})

describe("runAllStarGame", () => {
  // 正常系: rosters を渡す → score.ce と score.pa が非負整数
  // MVP が null にならない
})
```

## NPB 協約上の制約

なし（選出基準は NPB 公式ではなくゲーム内独自ルール）

## 過去バグからの教訓

- **B1 パターン**: `setTeams` で allStarSelections を更新する際は **全チーム**（`teams.map(t => ...)`）に適用すること。自チームだけ更新すると CPU チームの選手が永続的に 0 のままになる
- **B2 パターン**: バッチシム中の allStar 処理は `newTeams` の変換として行い、`setTeams(newTeams)` で一括反映すること。バッチ中に `setTeams` を中途で呼ぶと二重更新が発生する

## コーディング規約リマインダー

- `Math.random()` 禁止。`rng()` / `rngf()` を使う（`src/utils.js`）
- ゲームバランス数値は `src/constants.js` に定数として切り出す（`ALL_STAR_GAMEDAY`）
- 選手・イベント ID は `uid()` で生成（`src/utils.js`）

## ROADMAP.md 更新指示

- `㉞` の状態を `未着手` → `✅ 完了` に変更
- `㉟` の状態を `未着手` → `✅ 完了` に変更（ユーザー確認済み: 実装済み）
- 「最終更新」ヘッダー行を `YYYY-MM-DD（㉞ オールスターゲーム 完了）` に更新

## CHANGELOG.md エントリ（コミット後に hash を埋めること）

```
### YYYY-MM-DD — オールスターゲーム（コミットハッシュ）

**仕様本文への影響あり（§13.4 NPB固有システム）**

- ゲームDay 72 にセ/パ各29名選出・簡易試合シミュを実装
- ファン投票（指標トップ: 野手各ポジション1名+先発3+中継ぎ1+抑え1）と監督推薦の2段階選出
- パ・リーグは指名打者（DH）枠を追加（計29名）
- player.allStarSelections カウンター追加
- AllStarScreen.jsx 新規作成
- バッチシム中も重複なく1回処理（allStarDone フラグ）
```

## SPEC.md 更新箇所

- §13.4 オールスターゲームセクションを詳細化:
  - 選出ルール（ファン投票13/14名・監督推薦16/15名・計29名）を明記
  - `player.allStarSelections` フィールドを §5 データモデルに追記

## コミットメッセージ

`feat: オールスターゲーム実装（セ/パ各29名選出・簡易試合シミュ・allStarSelectionsカウンター）`

## PR タイトル

`feat: オールスターゲーム実装（セ/パ各29名選出・簡易試合シミュ・allStarSelectionsカウンター）`
