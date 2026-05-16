# Tier 7 要件定義 — 複数年フランチャイズ基盤

> 作成: 2026-03-24
> 対象バージョン: v2.1.0 → v3.0.0
> 優先度: 🔴 最優先（ROADMAP Tier 7）

---

## 0. 前提：現状ギャップ分析

### ✅ 既に実装済み（Tier 7 の核心部分）

| 機能 | 実装場所 | 状態 |
|------|---------|------|
| `handleNextYear()` — year++, age++, serviceYears++, careerLog, stats リセット | App.jsx:595 | 完了 |
| `developPlayers()` — フェーズ別成長/衰退、コーチボーナス、ブレイクアウト/バスト | engine/player.js:203 | 完了 |
| `rollRetire()` + `retire_phase` 画面 + CPU球団自動引退 | engine/player.js:136, App.jsx | 完了 |
| オフシーズンフロー — playoff → retire → develop → waiver → draft → nextYear | App.jsx | 完了 |
| `seasonHistory` — awards[], records（歴代記録）, hallOfFame[], championships[] | App.jsx:55 | 完了 |

### ❌ 未実装・不足（Tier 7 本体の残件）

| ID | 機能 | 詳細 |
|----|------|------|
| **BUG-1** | lineup/rotation クリーンアップ漏れ | `handleNextYear()` で退団・引退選手 ID が `team.lineup[]` / `team.rotation[]` に残存する |
| **GAP-1** | 年度別順位表の蓄積 | `seasonHistory` に各年の全球団最終順位が保存されていない |
| **GAP-2** | 記録タブの年度アーカイブ UI | 現在は最新年のみ表示。過去年の表彰・順位が参照できない |
| **GAP-3** | 記録更新ニュース通知 | 通算HR/W 記録更新時のニュース追加が未実装 |
| **T1** | IndexedDB 移行 | localStorage のまま（5MB 上限、複数年で超過リスク） |
| **T2** | Error Boundary | 未実装（シム中エラーで画面が白くなる） |
| **U1** | グローバル選手詳細モーダル | `PlayerModal.jsx` 未作成 |

---

## 1. 技術的前提条件（P0 — Tier 7 着手前に必須）

### T1: IndexedDB 移行

**背景:** localStorage は約 5 MB 上限。複数年の `careerLog[]`・`seasonHistory` で確実に超過する。

**要件:**

```
FR-T1-1: saveload.js を idb-keyval ベースに差し替え
FR-T1-2: セーブキーを 3 分割して保存
  - 'bm_meta'    → { year, gameDay, myId, savedAt }  (軽量)
  - 'bm_teams'   → teams[]
  - 'bm_history' → seasonHistory
FR-T1-3: SAVE_VERSION 定数を管理し、旧データのマイグレーション関数を用意
FR-T1-4: localStorage からの移行処理（初回ロード時に自動マイグレーション）
FR-T1-5: 保存失敗時のエラーハンドリングを維持（quota エラー等）
```

**インターフェース変更:**

```js
// 現状
export function saveGame(state) { ... }      // 同期
export function loadGame() { ... }           // 同期

// 変更後 (非同期)
export async function saveGame(state) { ... }
export async function loadGame() { ... }
export async function hasSave() { ... }
```

**影響範囲:** App.jsx の `handleSave()`, `handleLoad()`, タイトル画面の `hasSave()` 呼び出し箇所

**推奨ライブラリ:** `idb-keyval`（1 KB、IndexedDB の薄いラッパー）
**代替:** ライブラリ不使用で `indexedDB` API を直接実装も可

**受け入れ基準:**
- [ ] 5 MB 超のデータを保存・ロードできる
- [ ] 旧 localStorage セーブを自動マイグレーションして読み込める
- [ ] 保存中に例外が発生してもゲームがクラッシュしない

---

### T2: React Error Boundary

**背景:** シミュレーション中の例外で画面が真っ白になり、セーブデータを失うリスクがある。

**要件:**

```
FR-T2-1: ErrorBoundary.jsx を src/components/ に新規作成
FR-T2-2: エラー発生時に「前の画面に戻る」ボタンを持つリカバリー画面を表示
FR-T2-3: エラー内容を console.error に出力（ユーザーには詳細非表示）
FR-T2-4: App.jsx で以下のコンポーネントをラップ
  - TacticalGame / TacticalGameScreen
  - BatchResultScreen
  - PlayoffScreen
  - RetirePhaseScreen / GrowthSummaryScreen / WaiverPhaseScreen
```

**コンポーネント仕様:**

```jsx
// src/components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err, info) { console.error(err, info) }
  render() {
    if (this.state.hasError) {
      return <ErrorRecoveryScreen onReset={() => this.setState({ hasError: false })} />
    }
    return this.props.children
  }
}
```

**受け入れ基準:**
- [ ] TacticalGame 中の例外でリカバリー画面が表示される
- [ ] 「前の画面に戻る」でハブに戻れる
- [ ] ゲーム状態が保持されている（state が破壊されない）

---

## 2. Tier 7 本体機能要件

### F1: BUG-1 修正 — lineup/rotation クリーンアップ（⑳ の品質担保）

**問題:** `handleNextYear()` (App.jsx:596) で `_retireNow=true` な選手が `players[]` から除去されるが、`lineup[]`・`rotation[]` に残ったIDが翌シーズンに nil 参照エラーを引き起こす可能性。

**修正箇所:** `handleNextYear()` 内の `setTeams(prev => prev.map(t => ({ ...t, ... })))` に以下を追加:

```js
// 退団・引退・契約切れ選手を翌シーズンの roster から除外してから lineup/rotation をクリーン
const nextPlayers = t.players
  .filter(p => !p._retireNow && p.contractYearsLeft > 0)  // 引退・契約切れを除外
  .map(p => ({ ...p, age: p.age + 1, ... }))

const nextPlayerIds = new Set(nextPlayers.map(p => p.id))
const nextLineup   = (t.lineup   || []).filter(id => nextPlayerIds.has(id))
const nextRotation = (t.rotation || []).filter(id => nextPlayerIds.has(id))
```

> **注意:** 現状は `contractYearsLeft === 0` の選手も翌年ロスターに残っている（契約更改が未処理の場合）。waiver_phase の処理順序と合わせて整合性を確認すること。

**受け入れ基準:**
- [ ] 2 年目開幕時に lineup/rotation に存在しない選手 ID が含まれない
- [ ] ロスタータブでエラーが発生しない

---

### F2: GAP-1 — 年度別順位表の蓄積（㉓ 歴史データベース）

**要件:**

```
FR-H1: シーズン終了時（playoff 完了後）に全球団の最終順位を seasonHistory.standingsHistory[] に追加
FR-H2: 追加するデータ構造:
  standingsHistory: [
    {
      year: 2025,
      cl: [{ rank, teamId, teamName, wins, losses, draws, winPct }],  // セ6球団、順位順
      pa: [{ rank, teamId, teamName, wins, losses, draws, winPct }],  // パ6球団、順位順
    }
  ]
FR-H3: セーブ時に standingsHistory も永続化する
FR-H4: 初期値 seasonHistory に standingsHistory: [] を追加
```

**実装箇所:** App.jsx の playoff 完了時 (`setSeasonHistory(prev => ({ ...prev, ... }))` の箇所)

**受け入れ基準:**
- [ ] 複数年プレイ後、RecordsTab で各年の最終順位が参照できる
- [ ] standingsHistory の長さ = プレイ年数（1 シーズン目から蓄積）

---

### F3: GAP-2 — 記録タブの年度アーカイブ UI（㉓ 歴史データベース）

**要件:**

```
FR-H2-1: RecordsTab に年度セレクタを追加（過去年表示に対応）
FR-H2-2: 選択年の表彰（MVP・沢村賞・新人王）を表示
FR-H2-3: 選択年のリーグ最終順位を表示
FR-H2-4: 全年通算記録（HR・勝利数）と優勝履歴は現状維持
```

**UI レイアウト（概略）:**

```
[🏛 記録]
  ┌─ 年度選択: [◀] 2025年 [▶] ─────────────────┐
  │ セ順位: 1. 阪神 87-55  2. 巨人 82-61 ...     │
  │ パ順位: 1. SB  90-52  2. ORIX 78-65 ...      │
  ├─────────────────────────────────────────────┤
  │ 表彰 MVP: ○○○（阪神） / 沢村: ×××（SB）  │
  │      新人王: △△△（中日）                    │
  └──────────────────────────────────────────────┘
  ┌─ 通算記録 ──────────────────────────────────┐
  │ シーズン本塁打: 52本 ○○○（2026）            │
  │ 通算本塁打ランキング TOP5: ...               │
  └──────────────────────────────────────────────┘
  ┌─ 優勝履歴 ──────────────────────────────────┐
```

**Props 変更:** `RecordsTab` に `teams` prop を追加（現在の球団名解決に使用）

**受け入れ基準:**
- [ ] 年度ナビで過去年を参照できる
- [ ] 選択年の順位・表彰が正確に表示される
- [ ] 1 年目（sesonHistory が 1 件のみ）でもクラッシュしない

---

### F4: GAP-3 — 記録更新ニュース通知（㉓ 歴史データベース）

**要件:**

```
FR-H3-1: updateRecords() 呼び出し後、更新された記録をニュースに追加
FR-H3-2: 対象記録: singleSeasonHR / singleSeasonAVG / singleSeasonK
FR-H3-3: ニュース形式:
  { type: "record", headline: "【記録更新】田中が通算本塁打記録を更新！",
    body: "田中（38本）が歴代記録を塗り替えた。", dateLabel: year+"年" }
```

**実装箇所:** App.jsx で `setSeasonHistory(prev => ({...}))` を呼ぶ箇所の直後

**受け入れ基準:**
- [ ] シーズン本塁打記録を上回った選手がいる場合、ニュースに記録更新通知が出る

---

### F5: U1 — グローバル選手詳細モーダル（SPEC.md §13.5）

> SPEC.md §13.5 に詳細仕様あり。ここでは要点のみ記載。

**要件:**

```
FR-U1-1: PlayerModal.jsx を src/components/ に新規作成
FR-U1-2: App.jsx に selectedPlayerId (string|null) state を追加
FR-U1-3: openPlayerModal(playerId) 関数を props 経由で主要コンポーネントに配布
FR-U1-4: 閉じ方: ESC キー / 背景クリック / × ボタン
FR-U1-5: モーダル内タブ: 基本情報 / 能力値 / 今季成績 / 契約情報 / キャリア履歴
FR-U1-6: PlayerLink コンポーネントを ui.jsx に追加
FR-U1-7: Tabs.jsx・TacticalGame.jsx・Draft.jsx の選手名を PlayerLink に置き換え
```

**受け入れ基準:**
- [ ] ロスタータブ・成績タブ・トレード画面の選手名クリックでモーダルが開く
- [ ] ESC/背景クリックで閉じられる
- [ ] 能力値タブでスカウト未開示選手は `?` 表示

---

## 3. データモデル変更まとめ

### seasonHistory の変更

```js
// 現状
const initSeasonHistory = {
  awards: [],
  records: { singleSeasonHR: null, singleSeasonAVG: null, singleSeasonK: null, careerHR: {}, careerW: {} },
  hallOfFame: [],
  championships: [],
}

// 変更後（追加フィールドのみ）
const initSeasonHistory = {
  ...既存フィールド,
  standingsHistory: [],   // ← 追加: [{ year, cl: [...], pa: [...] }]
}
```

### team の変更

変更なし。`lineup[]` / `rotation[]` の無効 ID クリーンアップは処理ロジックで対応。

### App.jsx state の変更

```js
// 追加
const [selectedPlayerId, setSelectedPlayerId] = useState(null)
const openPlayerModal  = useCallback(pid => setSelectedPlayerId(pid), [])
const closePlayerModal = useCallback(()  => setSelectedPlayerId(null), [])
```

---

## 4. 実装優先順位と依存関係

```
Priority 1 (着手前 P0)
  ├── T1: IndexedDB 移行          ← 独立して実装可
  └── T2: Error Boundary          ← 独立して実装可

Priority 2 (BUG 修正 — 最初に潰す)
  └── BUG-1: lineup/rotation クリーンアップ

Priority 3 (歴史データベース)
  ├── F2 (GAP-1): standingsHistory 蓄積   ← F3 の前提
  ├── F3 (GAP-2): RecordsTab 年度 UI      ← F2 完了後
  └── F4 (GAP-3): 記録更新ニュース        ← 独立

Priority 4 (UI 改善)
  └── F5 (U1): PlayerModal               ← 独立して実装可
```

**推奨実装順:**

| ステップ | 作業 | 工数目安 |
|---------|------|---------|
| 1 | BUG-1 修正（lineup/rotation クリーンアップ） | 小 |
| 2 | T2: Error Boundary | 小 |
| 3 | F2: standingsHistory 蓄積 | 小 |
| 4 | F3: RecordsTab 年度アーカイブ UI | 中 |
| 5 | F4: 記録更新ニュース | 小 |
| 6 | T1: IndexedDB 移行 | 中〜大 |
| 7 | F5: PlayerModal | 大 |

---

## 5. テスト要件

| テスト対象 | 検証内容 |
|-----------|---------|
| BUG-1 | 2 年目開幕時に lineup/rotation に不正 ID がないこと |
| T1 | 5 MB 超のデータを保存・ロードできること / 旧データ移行 |
| T2 | TacticalGame 中の意図的例外でリカバリー画面が出ること |
| F2 | シーズン終了後に standingsHistory に正しいデータが追加されること |
| F3 | 年度ナビで 1〜N 年目を参照できること（境界値） |
| F5 | 全対象画面から PlayerModal が開閉できること |

---

## 6. スコープ外（Tier 8 以降）

以下は Tier 7 の要件定義に含めない:

- ファームシステム拡張（Tier 8）
- フロント目標・信頼度システム（Tier 9）
- ポスティングシステム（Tier 10）
- CPU 積極補強 AI（Tier 11）
- ダッシュボード画面 / 通知バッジ（UI 改善 U2/U3）

---

## 7. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-03-24 | 初版作成。現状ギャップ分析、T1/T2/BUG-1/GAP-1〜3/U1 の要件を定義 |
