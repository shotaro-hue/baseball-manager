# 変更履歴

> 最新エントリが最上部。過去のエントリは削除しない。
> 仕様本文を変更した場合は「旧 → 新」を明記、内部バグ修正のみの場合は概要のみ記録。

---

### 2026-03-31 — ㉘ フロント目標・信頼度 + U4 ナビゲーション整理

**仕様本文への影響あり（§5 データモデル・§13.3・§15 UI改善計画）**

- `src/constants.js`: `OWNER_TRUST_BUDGET_LOW/HIGH`・`OWNER_TRUST_FACTOR_LOW/HIGH` 定数を追加
- `src/engine/player.js`: `buildTeam()` に `ownerGoal: "cs"`・`ownerTrust: 50` を追加
- `src/engine/realplayer.js`: `buildRealTeam()` にも同フィールドを追加（`stadiumLevel`・`revenueThisSeason` も補完）
- `src/hooks/useOffseason.js`: `handleNextYear()` に信頼度ベース予算補正ロジックを追加（trust<30: ×0.8 / trust>80: ×1.15。自チームのみ適用）
- `src/components/Screens.jsx`: `NewSeasonScreen` に今季目標選択 UI を追加（4種類の目標カード: 日本一/ペナント優勝/CS出場/再建）
- `src/App.jsx`: `calcOwnerTrustDelta()` ヘルパーを追加。プレーオフ `onFinish` にて目標達成度→信頼度変動を計算・反映し、オーナー評価メールを送信。14タブを「試合」「編成」「球団」3カテゴリのグループ化ナビに変更（`TAB_GROUPS`）
- `src/components/DashboardTab.jsx`: オーナー目標・信頼度カードを追加（目標ラベル・信頼度ゲージバー・予算影響警告）
- `src/styles.css`: `.tabs-nav`・`.tab-group`・`.tab-group-label` スタイルを追加

---

### 2026-03-31 — ㉗ 選手育成目標設定（devGoal）

**仕様本文への影響あり（§5 データモデル・§13.2）**

- `src/constants.js`: `DEV_GOALS_BATTER`・`DEV_GOALS_PITCHER` を追加。各6〜7種類の育成目標定数（設定なし／一軍レギュラー狙い／打撃特化／守備強化／走力強化／支配下昇格目標 ほか投手版）
- `src/engine/player.js`: `makePlayer()` に `devGoal: null` を追加。`resolveTrainingFocusFromGoal(player)` 純粋関数を新規実装（devGoal → trainingFocus 自動マッピング。投手・野手で分岐し、「一軍レギュラー狙い」「支配下昇格目標」では選手の最弱能力を自動算出）
- `src/hooks/useGameState.js`: `setDevGoal(pid, goal)` コールバック追加。設定時に `resolveTrainingFocusFromGoal` で trainingFocus を自動更新。一軍・二軍両方に適用
- `src/components/tabs/RosterTab.jsx`: 二軍タブに「育成目標」列を追加。野手/投手で選択肢が異なるセレクタ（DEV_GOALS_BATTER / DEV_GOALS_PITCHER）を表示
- `src/App.jsx`: `onSetDevGoal={gs.setDevGoal}` を RosterTab に渡すよう追加

---

### 2026-03-27 — ㉖ 怪我降格・登録抹消10日ルール・支配下70人枠

**仕様本文への影響あり（§4.10・§7・§13.2）**

- `src/constants.js`: `INJURY_AUTO_DEMOTE_DAYS = 10`・`REGISTRATION_COOLDOWN_DAYS = 10`・`MAX_SHIHAKA_TOTAL = 70` を追加
- `src/hooks/useSeasonFlow.js`: `tickCooldowns()`・`autoInjuryDemote()` ヘルパー追加。全3ゲームパス（autoSim / tactical / batch）で ① 一軍クールダウンデクリメント ② 二軍 `tickInjuries` + クールダウンデクリメント ③ 怪我>10日の一軍選手を自動二軍降格 を適用。`useEffect([myTeam])` で自動降格・回復の通知を検知して `notify()` 発火
- `src/hooks/useGameState.js`: `demote()` で `registrationCooldownDays = 10` セット。`promote()` でクールダウン残りを事前チェック。`convertIkusei()` で支配下70人枠上限チェック
- `src/components/tabs/RosterTab.jsx`: 「支配下 XX/70」常時表示チップ。二軍行に怪我アイコン(`🤕N`)・クールダウンアイコン(`🔒N日`)表示。クールダウン中・怪我中の昇格ボタン無効化。一軍枠空き時に昇格推薦バナー表示（能力上位3名）

---

### 2026-03-27 — Playwright E2E テスト基盤追加（T7-E2E）

- `playwright.config.js`: Playwright 設定追加（Chromium・`webServer` で `npm run dev` 自動起動・baseURL=localhost:5173）
- `e2e/title.spec.js`: タイトル画面 E2E テスト（ゲームタイトル表示・セ/パ全12チーム表示・チーム選択→HUB遷移を検証）
- `SPEC.md`: ディレクトリ構成に `playwright.config.js` / `e2e/` を追記
- `ROADMAP.md`: 保守性セクションに `T7-E2E`（部分実装）を追記
- 方針: Tier 8 完了後にコアフロー（HUB・保存/ロード・試合シム）テストを拡充予定

---

### 2026-03-27 — ㉕ 育成→支配下昇格とFA管理

- `src/constants.js`: `ACTIVE_ROSTER_FA_DAYS_PER_YEAR = 120` を追加
- `src/engine/player.js`: `makePlayer` に `entryType`（高卒/大卒/社会人/外国人）・`daysOnActiveRoster: 0` を追加
- `src/engine/realplayer.js`: 実選手生成に `entryType` / `daysOnActiveRoster` を追加
- `src/engine/saveload.js`: `migratePlayer` に `entryType` / `daysOnActiveRoster` マイグレーションを追加
- `src/engine/contract.js`: `getFaThreshold` を `entryType` ベース・日数返値（高卒/外国人=960日、大卒/社会人=840日）に変更。FA比較を `daysOnActiveRoster` ベースに切り替え
- `src/hooks/useSeasonFlow.js`: 全3ゲームパスで一軍選手の `daysOnActiveRoster += 1`/日
- `src/hooks/useOffseason.js`: 海外FA判定を `daysOnActiveRoster` ベースに更新
- `src/components/PlayerModal.jsx`: 「FA まで X日（Y年相当）」・外国人は「外国人枠免除まであとX日」を表示
- `src/components/tabs/RosterTab.jsx`: 支配下登録直後に「↑一軍昇格」ボタンを表示する1フロー化
- `src/components/Draft.jsx`: ドラフト候補一覧に `entryType` バッジを表示
- `src/engine/__tests__/contract.test.js`: `getFaThreshold` テストを日数ベースに更新

---

### 2026-03-27 — ㉔ 二軍簡易シミュレーション（Tier 8 第1弾）

- `src/engine/simulation.js`: `farmSimGame(farmA, farmB)` 追加（期待値ベース高速シム、打席単位の解決なし）
- `src/engine/simulation.js`: `applyOneFarmGame()` 追加（1試合分のstats2デルタを各選手に加算）
- `src/engine/simulation.js`: `runFarmSeason(teams)` 追加（143試合バッチ処理、セ→イースタン/パ→ウエスタン）
- `src/engine/player.js`: `makePlayer` に `stats2: { PA, H, HR, W, IP, ER, K }` 初期化を追加
- `src/engine/saveload.js`: `migratePlayer` に `stats2` マイグレーションを追加（既存セーブの後方互換）
- `src/engine/awards.js`: `calcFarmAwards(teams)` 追加（首位打者・HR王・最多勝をリーグ別表彰）、`calcSeasonAwards` の戻り値に `farmAwards` を追加
- `src/hooks/useSeasonFlow.js`: シーズン終了時（3か所）に `runFarmSeason` を呼び出してfarm stats2を蓄積
- `src/components/tabs/RosterTab.jsx`: 二軍一覧に「二軍成績」列を追加（打者: 打率/HR、投手: 勝利数/ERA）

---

### 2026-03-26 — T5: セーブデータバリデーション（ローリングバックアップ・フィールドマイグレーション）

**仕様本文への影響なし（内部実装のみ）**

- `src/engine/saveload.js` に `validateAndMigrateSave()` / `migratePlayer()` を追加
- ロード時に必須フィールドの null チェックを実施し、欠落フィールドにデフォルト値を補完
  - 選手: `entryAge` / `serviceYears` / `ikuseiYears` / `condition` / `morale` / `trust` / `injuryDaysLeft` / `growthPhase` / `recentPitchingDays` / `careerLog` / `peakAbilities`
  - チーム: `pitchingPattern` / `stadiumLevel` / `revenueThisSeason`
- ローリングバックアップ2世代（`bk1` / `bk2`）を実装。`saveGame()` 時にローテーション、`loadGame()` 時にフォールバック
- `deleteSave()` でバックアップキーも合わせて削除

---

### 2026-03-26 — T3/T4 ファイル分割完了 + SPEC.md 同期

**仕様本文への影響あり（§2・§14）**

- **T3: App.jsx 分割完了**
  - 旧 63KB の App.jsx を `src/hooks/` 以下 3カスタムフックに切り出し
  - `useGameState.js`（258行）/ `useSeasonFlow.js`（402行）/ `useOffseason.js`（259行）
  - App.jsx は 198行の render coordinator に縮小
- **T4: Tabs.jsx 分割完了**
  - 旧 81KB の Tabs.jsx を `src/components/tabs/` 以下 12コンポーネントに分割
  - `Tabs.jsx` は 13行のバレルファイル（re-export）に縮小
- **§2 ディレクトリ構成更新**: `src/hooks/` ディレクトリ追加、`src/components/tabs/` サブディレクトリ追加、`src/engine/__tests__/` 追加
- **§14.2 Error Boundary**: 計画中（P0）→ ✅ 実装済み（fb47d0f）に変更
- **§14.3 ファイル分割計画**: 計画中（P1）→ ✅ 完了に変更（実装結果を記録）
- **§14.4 Vitest**: 計画中（P2）→ 🔶 部分実装（`contract.test.js` / `simulation.test.js` / `utils.test.js` の3ファイル）に変更

---

### 2026-03-25 — Tier 7 全完了: マルチシーズンフランチャイズ基盤（c1c404b）

**仕様本文への影響あり（§3・§4.3・§4.11・§4.12・§5・§9・§13.1・§15.4）**

#### ⑳ マルチシーズン継続

- `handleNextYear` 完全実装。`setSchedule` 呼び出しを含む全状態リセットを実行
- **予算リセット式**: `max(baseBudget × 0.5, baseBudget + revenue×0.6 − seasonalPayroll)`
- 選手全員の `age++`, `serviceYears++`, `ikuseiYears++`（該当者のみ）
- ローテーション・ラインナップ引き継ぎ（退団・引退選手を自動除外）
- **careerLog コンパクト化**: 25フィールド形式（CS/R/BS/evSum/evN/laSum/laN 除去）+ `teamId`/`teamName` 追加。25年分のプレイで localStorage 5MB 上限に余裕あり
- **NewSeasonScreen 新設**: ドラフト完了後に `new_season` 画面遷移。引退選手数・ドラフト指名数・ブレイクアウト選手名一覧を表示し「開幕！」ボタンでハブへ
- `newSeasonInfo` state（App.jsx）で オフシーズンサマリーを NewSeasonScreen に受け渡し

#### ㉑ 選手加齢・引退パイプライン

- **calcRetireWill 精緻化**: 旧テーブル（40歳:+50 / 38-39:+30 / 36-37:+15 / 35:+5）→ 新テーブル（42歳+:+80 / 41歳:+65 / 40歳:+50 / 38-39歳:+28 / 36-37歳:+12 / 35歳:+3）。シーズンエンド怪我（injuryDaysLeft ≥ 100）で +25 追加（§4.11 参照）
- **CPU alumni 修正**: CPU チーム引退選手が `t.history[]` に記録されていなかったバグを修正。`teams.map()` 内で直接 `history: [...t.history, ...cpuAlumni]` をマージ

#### ㉒ 能力自然変化（成長/衰退）

- **PITCHER_DECLINE_WEIGHTS 導入**: 投手衰退時の能力別ウェイト（velocity:1.4 優先低下）を追加（§4.12 参照）
- **晩年ブレイクスルー**: 28〜34歳・成長バジェット負の場合、2% 確率で衰退反転（1.5倍成長）
- **peakAbilities スナップショット**: `"peak"→"earlyDecline"` 遷移時に打者/投手能力値を `player.peakAbilities` に保存。衰退下限（peak × 0.6）計算に使用
- `growthPhase` 文字列を `"earlydecline"` → `"earlyDecline"` に統一（realplayer.js も修正）
- **GrowthSummaryScreen 衰退警告**: 33歳以上・能力低下幅 ≥ 5 の選手に「⚠️ 衰退警告」を表示

#### ㉓ 歴史データベース（完成）

- **RecordsTab 5サブタブ再編**: 今季表彰 / タイトル歴代 / 通算記録 / 年度別順位 / 殿堂
- **calcTitles()**: セ/パ別8タイトル（首位打者・HR王・打点王・盗塁王・最優秀防御率・最多勝・最多奪三振・最多セーブ）を計算し `standingsSnap.awards.titles` に保存
- **セ/パ別 MVP**: `calcSeasonAwards` を `{ central: ..., pacific: ... }` 形式に変更。RecordsTab の `getMvp()` ヘルパーで旧形式との後方互換を維持
- `standingsSnap` に `awards`（mvp/sawamura/rookie/bestNine/titles）を含めて蓄積

#### U5 選手能力グレード表示

- `PlayerModal.jsx` に `abilityGrade(v)` 関数と `AbilityBar` コンポーネントを追加
- S（90+）/A（80+）/B（65+）/C（50+）/D（35+）/E（<35）の色付きバッジ表示（§15.4 参照）

---

### 2026-03-25 — B9: 起動時の黒画面バグ修正（1394edd）

**仕様本文への影響なし（内部実装バグ修正のみ）**

- `App.jsx` 内で `news` / `mailbox` / `cpuTradeOffers` / `draftPool` / `draftResult` / `playoff` / `draftAllocation` の7つの `useState` がコンポーネント中盤に後置されていた
- `tabBadges` useMemo（旧 line 85–97）の依存配列が `mailbox` を宣言前に参照し、JavaScript TDZ（Temporal Dead Zone）`ReferenceError` が発生
- React レンダリングがクラッシュしてタイトル画面から先が真っ黒になる起動不能バグ
- **修正**: 7つの `useState` 宣言を `schedule` 宣言の直後（line 62 以降）に移動し、全フックをコンポーネント先頭に集約

---

### 2026-03-25 — U2: ダッシュボード画面 / U3: 通知バッジシステム（345c0f3）

**仕様本文への影響あり（§2 ディレクトリ構成、§15.2、§15.3）**

#### U2: ダッシュボード画面（DashboardTab.jsx 新規）

- `src/components/DashboardTab.jsx` を新規作成
- 表示: チーム概況（順位・GB・勝率・得失差・勝敗・予算）/ 次の試合 / 直近5試合バッジ / 要対応アクション
- 要対応アクションのクリックで該当タブに遷移（`onTabSwitch` prop）
- `recentResults` state を App.jsx に追加（`{won,drew,oppName,myScore,oppScore,gameNo}[]`）
- `pushResult` useCallback で handleAutoSimEnd・handleTacticalGameEnd・runBatchGames の3パスから結果を蓄積
- デフォルトタブを `"roster"` → `"dashboard"` に統一変更（useState・handleSelect・handleLoad・リセット処理）
- §2 ディレクトリ構成: `DashboardTab.jsx` を `# 【計画中】` → `✅ 実装済み` に更新

#### U3: 通知バッジシステム

- `tabBadges` useMemo を App.jsx に追加（roster赤・contract黄・trade橙・mailbox橙/黄・fa灰）
- タブバー描画を `tabBadges` に統一 — 旧 mailbox 専用ハードコードバッジを削除
- §15.2 を「計画策定済み」→「実装済み」に更新、§15.3 同様

---

### 2026-03-25 — T2: Error Boundary / F2/F3/F4: 歴史データベース先行実装 / U1: グローバル選手詳細モーダル

**仕様本文への影響あり（§2 ディレクトリ構成、§3 画面フロー、§13.5、§15.1）**

#### T2: React Error Boundary 追加（fb47d0f）

- `src/components/ErrorBoundary.jsx` を新規作成し、App.jsx の各主要レンダリング箇所をラップ
- シミュ中エラー（null 参照・不正 state 等）で画面が白くなる現象を防止
- エラー発生時: 「リセット」ボタン付きのリカバリー画面を表示し、ハブ画面に戻れる
- §14 T2 → ✅ 完了

#### F2: standingsHistory 蓄積（8056f2c）

- `seasonHistory.standingsHistory: Array<{year, standings: [{id, name, emoji, wins, losses, draws, rf, ra}[セ], [...パ]}>`
- シーズン終了時の `onNext` コールバックでスナップショット蓄積（セ/パ独立配列）
- RecordsTab に「年度別最終順位」セクション追加（新→旧順）
- 古いセーブデータとの互換は `|| []` でフォールバック

#### F3: 年度アーカイブ UI（c6a19f7）

- RecordsTab「年度別最終順位」を `<details>/<summary>` で折りたたみ可能に（最新年のみデフォルト展開）
- 「歴代シーズン表彰」を「歴代 MVP」から「歴代シーズン表彰」に拡張
  - MVP（金）・沢村賞（青）・新人王（緑）を全年度分カラーバッジで表示

#### F4: 記録更新ニュース通知（f0594b0）

- `updateRecords(players, records)` 戻り値を `records` 単体 → `{ records, broken }` に変更
- `broken`: 更新された記録エントリ配列（`{key, name, value, playerName}`）
- ニュース通知対象: シーズン本塁打・打率・奪三振の記録更新（初年度・通算記録は対象外）
- 変更ファイル: `src/engine/awards.js`、`src/App.jsx`（呼び出し箇所で broken を消費）

#### U1: グローバル選手詳細モーダル（d7885d0）

- `src/components/PlayerModal.jsx` を新規作成（§13.5 仕様通り実装）
- `App.jsx` に `selectedPlayerId` state と `handlePlayerClick(id)` / `handleCloseModal()` を追加
- モーダル内タブ: 基本情報 / 能力値 / 今季成績 / 契約情報
- 開き方: `onPlayerClick` props を各 Tab コンポーネントに配布
- 閉じ方: ESC キー / 背景クリック / × ボタン
- PlayerLink コンポーネントは作成せず、`onPlayerClick` コールバックを直接 props で渡す方式を採用
- §15.1 → ✅ 実装済み

---

### 2026-03-24 — E1: スタミナ連動疲弊度計算 / E2: 継投パターン設定画面

**仕様本文への影響あり（§4.4 疲労補正、§7 定数表、§5.1 チームデータモデル）**

#### E1: スタミナ・コンディション連動疲弊度計算（`calcEffectiveFatigue`）

- **旧**: 疲労判定を投球数の固定閾値（`PITCH_WARNING=100` / `PITCH_LIMIT=120`）で行っていた。スタミナ差が交代判断に反映されなかった。
- **新**: `calcEffectiveFatigue(pitchCount, pitcher)` を導入。`effectiveStamina = stamina × (condition / 100)` でコンディションも加味した補正スタミナを算出し、疲弊度パーセントで閾値判定（`FATIGUE_WARNING=83` / `FATIGUE_LIMIT=100`）。スタミナ高の投手は同球数でも疲弊度が低く長く投げられる。
- **定数変更**: `PITCH_WARNING` / `PITCH_LIMIT` を廃止し `PITCH_NORM=120` / `PITCH_HARD_CAP=130` / `FATIGUE_WARNING=83` / `FATIGUE_LIMIT=100` に置換（§7 参照）。
- **影響範囲**: `simulation.js`（`checkStopCondition` / `autoSwapPitcher` / `simAtBat`）、`TacticalGame.jsx`（疲労バー表示・球数カラー）。

#### E2: 継投パターン設定画面（RosterTab「📋 継投」タブ）

- **新機能**: ロスター画面に「📋 継投」サブタブを追加。試合前に抑え・セットアッパー指名と中継ぎ優先順を設定できる。
- **データ**: `team.pitchingPattern = { closerId, setupId, middleOrder[] }` を追加（§5.1 参照）。未設定または指名投手不在の場合は従来のスコアベース自動選択にフォールバック。
- **UI構成**: ①先発ローテーション管理（↑↓並び替え・✕除外・追加ドロップダウン）、②抑え/セットアッパー指名（同一選手の重複指定を禁止）、③中継ぎ優先順（＋追加・↑↓並び替え・✕削除）。
- **エンジン反映**: `pickBullpenArm(bullpen, targetRole, pattern)` に `pattern` 引数を追加。`initGameState` に `myPitchingPattern` / `opPitchingPattern` を追加し `autoSwapPitcher` 経由で `pickBullpenArm` に渡す。CPU側は常に `{}` でスコアベース選択。

---

### 2026-03-18 — バグ修正 B8: 相手チーム投手が絶対に交代しないバグ修正（本当の根本原因）

**仕様本文への影響あり（§4.4）**

#### B8: `initGameState` に `opBullpen` が存在せず `quickSimGame` が相手投手を管理しない（P0）

- **根本原因**: `initGameState()` は `myBullpen`（自チームのブルペン）を生成するが `opBullpen`（相手チームのブルペン）が一切存在しなかった。
  `quickSimGame()` のループは `myPitcher` の疲労のみチェックし `opPitcher/opPitchCount` を管理するコードがゼロだった。
  結果として、全オートシム・バッチシム・CPU vs CPU ゲームで相手先発投手は何球投げても絶対に交代しなかった。
  B7 fix（isTop フラグ修正）は自チーム投手の交代タイミング改善だったが、本問題（相手投手の未管理）は未タッチだった。
- **修正 1**: `initGameState` の return 内に `opBullpen: oppTeam.players.filter(p => p.isPitcher && p.id !== opStarter?.id)` を追加
- **修正 2**: `quickSimGame` のループに相手投手疲労チェックを追加:
  `!gs.isTop && gs.opPitchCount >= PITCH_WARNING && gs.opBullpen?.length > 0` の場合に `opPitcher` を交代
  （`!isTop` = 自チームが打席 = 相手が投球中。自チーム投手チェックの対称的な実装）
- **変更ファイル**: `src/engine/simulation.js`（initGameState line 312、quickSimGame lines 467–470）

---

### 2026-03-18 — バグ修正 B7: バッチシムで中継ぎが起用されず先発が必ず完投するバグ修正

**仕様本文への影響あり（§4.4）**

#### B7: `checkStopCondition` の `isTop` フラグ反転により投手交代条件が発火しない（P1）

- **根本原因**: `checkStopCondition()` のピッチカウント閾値条件（PITCH_WARNING/PITCH_LIMIT）が `!gs.isTop`（自チームが打席の回）を条件としていた。
  `isTop=true` が「相手チームが打席 = 自チームが投球中」を意味するため、自チーム投手の投球数が閾値を超えても交代条件がトリガーされなかった。
  結果として `quickSimGame`（バッチシム）で投手交代が一切行われず、先発が常に完投していた。
- **修正**: `simulation.js` の `checkStopCondition` 内 2 箇所を `!gs.isTop` → `gs.isTop` に変更
- **変更ファイル**: `src/engine/simulation.js`（lines 436, 438）
- **補足**: 同関数内の `scoring_position_crisis`（line 440）・`closer_time`（line 450）は元々 `gs.isTop` を正しく使っていた

---

### 2026-03-18 — バグ修正 B6: エントリーポイント誤設定による日程タブ完全未表示バグ修正

**仕様本文への影響なし（ビルド設定バグ修正のみ）**

#### B6: src/main.jsx が combined-artifact.jsx を参照しており src/App.jsx が使われていなかった（P0）

- **根本原因**: `src/main.jsx` の import が `'../combined-artifact'` を指していた。
  `combined-artifact.jsx` はモジュール分割前の古い全結合ファイルであり、日程タブを持たない。
  そのため B4/B5 を含む `src/App.jsx` への修正が一切アプリに反映されていなかった。
- **修正**: `src/main.jsx` の import を `'./App'` に変更（1行修正）
- **変更ファイル**: `src/main.jsx`（line 3）
- **補足**: `src/App.jsx` は `combined-artifact.jsx` の上位互換（13タブ vs 10タブ）であり、
  B4/B5 修正・日程タブ・歴代タブ・記録タブなど全追加機能が含まれている。

---

### 2026-03-18 — バグ修正 B5: handleNextYear 翌年開幕時の日程タブ旧スケジュール表示バグ修正

**仕様本文への影響なし（内部バグ修正のみ）**

#### B5: handleNextYear でスケジュールが翌年分に更新されない（P1）

- **根本原因**: `handleNextYear` は `setYear(y=>y+1)` + `setScreen("hub")` を発火させるが、`setSchedule` を明示呼び出ししていなかった。React 18 の passive effects（`useEffect`）は render 後に非同期スケジュールされるため、ハブ画面の初期レンダリング時点では `schedule` が前年分のまま残る。翌年開幕直後に日程タブを開くと旧年の日付が表示され、状況によっては「読み込み中…」固定になる
- **修正**: `handleNextYear` に `setSchedule(generateSeasonSchedule(year+1, teams))` を追加。B4 修正（handleLoad / handleSelect）と同じパターンで全 hub 遷移パスで schedule を明示確定
- **変更ファイル**: `src/App.jsx`（`handleNextYear` 行 590）

---

### 2026-03-18 — バグ修正 B4: 日程タブ「読み込み中」固定バグ修正

**仕様本文への影響なし（内部バグ修正のみ）**

#### B4: handleLoad/handleSelect でスケジュールが再生成されない（P1）

- **根本原因**: `schedule` state は `useEffect([year, teams.length])` でのみ生成。同年セーブをロードする際は `year` も `teams.length`（常に12）も変化しないため useEffect が再実行されず、`schedule` が `null` のまま ScheduleTab に渡され「読み込み中…」が永久表示されていた。新規チーム選択（`handleSelect`）も同様のタイミングリスクを持っていた
- **修正**: `handleLoad` および `handleSelect` に `setSchedule(generateSeasonSchedule(...))` を明示追加。useEffect への依存を排除し、ハブ画面遷移時には常にスケジュールが確定する
- **変更ファイル**: `src/App.jsx`（`handleLoad` 行 109・`handleSelect` 行 135）

---

### 2026-03-18 — バグ修正 B1/B2/B3 + NPBリアル日程システム実装

**仕様本文への影響あり（§2 / §4.1）**

#### B1: CPU選手個人成績未更新（P0）

- **旧**: CPU vs CPU 試合では勝敗・得失点のみ更新。`applyGameStatsFromLog` / `applyPostGameCondition` / `tickInjuries` / `checkForInjuries` が未呼び出し → MVP・沢村賞・個人タイトル・記録が破綻
- **新**: `runBatchGames` の CPU vs CPU ループ、および `handleAutoSimEnd` / `handleTacticalGameEnd` の CPU 試合処理で両チームの全選手に対して個人成績更新を適用

#### B2: handleStartGame 二重カウント（P1）

- **旧**: `handleStartGame` がモード選択画面への遷移前に CPU 試合をシム・状態を commit → ハブに戻って再び試合ボタンを押すと二重集計
- **新**: CPU 試合のシムをモード確定後（`handleAutoSimEnd` / `handleTacticalGameEnd`）に移動。`handleStartGame` は対戦相手決定と画面遷移のみ実行

#### B3: CS Final シード誤り（P2）

- **旧**: `PlayoffScreen.simAllRemaining()` で `cs1_se.teams[0]`（CS 1st ステージの2位チーム）を CS Final の1位側に使用 → アドバンテージが逆転
- **新**: `state.se1` / `state.pa1`（リーグ1位・アドバンテージあり）を正しく参照するよう修正

#### NPBリアル日程システム（§4.1 大幅改定）

- **§2 ディレクトリ構成**: `engine/scheduleGen.js`・`data/scheduleParams.js` を新規追加
- **§4.1 シーズン構成**: 「毎試合ランダム対戦相手」→「143日分事前生成スケジュール参照」に変更
  - `ScheduleDay = { gameNo, date, isInterleague, matchups[] }` を新設
  - `Matchup = { homeId, awayId, isInterleague, venueNote }` を新設
  - Berger 方式ラウンドロビン（6チーム5ラウンド）× 25回 = 125日リーグ内日程
  - offset-based rotation で交流戦全18日程（各チームが全6相手と3試合ずつ）
  - 甲子園ブラックアウト制約: 阪神ホームに `venueNote:"kyocera"`、オリックスはブラックアウト期間をアウェイ優先配置（ホーム試合数57→69に改善）
  - `gameDayToDate(gameDay, schedule)`: schedule 参照対応（後方互換あり）
  - `getMyMatchup(schedule, gameDay, myId)` / `getCpuMatchups(schedule, gameDay, myId, oppId)` を App.jsx から呼び出し
- **§4.1 交流戦**: gameDay 60〜94 の固定判定 → `schedule[d].isInterleague` 参照に変更

---

### 2026-03-18 — Tier 5 ⑭⑮⑯ カウンター交渉・球場投資・ドラフト予算配分

**仕様本文への影響あり（§4.6 / §4.7 / §4.8 / §5）**

#### ⑭ トレード交渉 UI 深化（§4.6）

- **カウンター交渉のラウンド制**を追加（最大3ラウンド）
  - Round 1: `fair` 時に 55% で承認、それ以外はカウンター
  - Round 2: 承認率 30% に低下、追加要求現金を 1.5 倍に増加
  - Round 3: 最終判定（50% or favorable で承認、否で拒否）
- **CPU 交渉理由の表示** — `evalTradeForCpu` の戻り値に `reasons` 配列を追加
  - 「対価が不足（差: N点）」「投手/打線強化を優先したい」「若手選手が欲しい」等
  - カウンターカード内に「CPU の本音」として最大2件表示
- **「✏️ 修正して再提案」ボタン** — カウンター受領後にラウンドを維持したまま条件変更可能

#### ⑮ 球団財政・球場投資（§4.8 / §5）

- **球場レベル制（Lv 0〜3）** を Team オブジェクトに `stadiumLevel` フィールドとして追加
  - 旧: チケット = `budget * 0.3 * ... * 1000`
  - 新: チケット = `budget * 0.3 * ... * 1000 * STADIUM_MULT[lvl]`
  - STADIUM_MULT = [1.0, 1.25, 1.6, 2.0]
  - 投資コスト: Lv0→1: 500万 / Lv1→2: 1000万 / Lv2→3: 2000万（即時予算減算）
- **シーズン累積収益追跡** — Team に `revenueThisSeason` フィールドを追加
  - 3 ハンドラ（handleAutoSimEnd / handleTacticalGameEnd / runBatchGames 内ループ）で毎試合累積
  - 年度切り替え（handleNextYear）でリセット、stadiumLevel はシーズン間で保持
- **FinanceTab 更新** — 「🏟️ 球場投資」カード + 「📈 シーズン収益サマリー」カードを追加
  - シーズン累計 / 球場レベル（倍率） / シーズン収入予測（進捗ベース）を表示

#### ⑯ ドラフト戦略深化（§4.7）

- **スカウト予算配分スライダー** — DraftPreviewScreen に「⚙️ 予算配分」タブを追加
  - 投手/野手スカウトへの予算比率（10〜90%）をスライダーで設定
  - 精度（±ノイズ幅）と自動開示人数のプレビュー表示
  - 配分設定は `draftAllocation` として App.jsx で管理し DraftScreen へ受け渡し
- **自動事前開示** — DraftScreen 開始時に配分に応じた選手を自動スカウト済みに
  - 自動開示数 = `round(share × 8)` 名（高ポテンシャル優先）
- **ノイズ付き能力値表示** — スカウト済み選手の statView / ovView を `scoutedValue` 経由に変更
  - `budgetFactor = 1.0 - share × 0.5`（高配分ほど精度UP）
  - `fromScout` 選手（事前スカウト済み）は常に真の値を表示

---

### 2026-03-18 — Tier 4 ⑪⑫⑬ 試合内戦術・コーチ効果・フランチャイズ記録

**仕様本文への影響あり（§4.4 / §4.12 / §4.13 / §8）**

#### ⑪ 試合内戦術詳細化

- **エンドラン（hitrun）実装** — `simulation.js` `processAtBat()`
  - 一塁走者ありの場合に hitrun 後処理を適用
  - 単打: 1塁走者が3塁へ進塁（通常は2塁）
  - 2塁打: 1塁走者が生還（通常は3塁）
  - 三振: 50% で CS（走者アウト、outs+1）
  - アウト（ゴロ/フライ判定 50/50）: ゴロ→走者2塁へ / フライ→70% CS
- **投球方針セレクタ** — `constants.js` `PITCHING_POLICY_OPTS` / `TacticalGame.jsx`
  - 4択: 通常 / 速球主体 / 変化球主体 / コントロール重視
  - `applyPitchingPolicy(probs, policy)` で確率補正（normalizeあり）
  - TacticalGame.jsx の投手情報カードに方針ボタン追加
  - `gs.pitchingPolicy` → situation 経由で simulation に渡す

#### ⑫ コーチングスタッフ シーズン中効果

- **走塁コーチ → 盗塁成功率 UP** — `processAtBat` steal 分岐
  - `runningBonus * 0.025` を successRate に加算（gs.coachBonuses.running）
- **投手コーチ → 疲労耐性 UP** — `applyFatigue(pit, fatigue, pitchingBonus)`
  - 疲労ペナルティ開始閾値: `30 → 30 + pitchingBonus * 3`（grade4=5→閾値45）
- **守備コーチ → 怪我回復速度 UP** — `App.jsx` tickInjuries 直後
  - `applyDefenseCoachRecovery()` で確率的追加回復（defBonus * 10% / 試合）
- **メンタルコーチ → 年度末モラル回復ボーナス** — App.jsx シーズン末モラル処理
  - `mentalBonus = coaches.mental.reduce(bonus/2)` を delta に加算
- 全コーチボーナスは `initGameState` で `myTeam.coaches` から自動計算して `gs.coachBonuses` に格納

#### ⑬ 長期フランチャイズ記録・球団史

- **`seasonHistory.championships`** 配列追加
  - 日本シリーズ勝者確定時（PlayoffScreen onFinish コールバック）に追記
  - 構造: `{ year, championId, championName, opponent, seriesResult }`
  - 自チームが優勝時にメールボックスへ通知
- **RecordsTab — 優勝履歴セクション** (`Tabs.jsx`)
  - 年降順で優勝旗バッジ付きカード表示
- **RecordsTab — 球団殿堂 HOF カード強化** (`Tabs.jsx`)
  - 旧: 名前リスト → 新: グリッドカード（通算HR/勝利/打席付き）
- **殿堂入り通知メール** (`App.jsx`)
  - 新規殿堂入り選手発生時にメールボックスへ自動追加（type: "hof"）
- **`checkHallOfFame` 返り値拡張** (`awards.js`)
  - `{ playerId, playerName, inductYear, careerHR, careerW, careerPA }` に変更

---

### 2026-03-17 — Tier2 ⑥ 選手個人成績グラフ（Tabs.jsx）

**仕様本文への影響あり（§5 / CareerTable）**

- `CareerTable` コンポーネントに年度別キャリア推移グラフを追加
  - Recharts `LineChart` を使用（既存 RadarChart に加えて新規インポート）
  - データソース: `player.careerLog`（シーズン単位）
  - 表示指標（打者）: 本塁打 / 打点 / 打率 / OPS / wOBA / WAR
  - 表示指標（投手）: 防御率 / 勝利 / WHIP / 奪三振 / FIP / WAR
  - 指標セレクター（ピルボタン）でリアルタイム切替可能
  - `saberBatter()` / `saberPitcher()` で sabermetrics 指標を計算（既存関数を再利用）
  - careerLog が1件以下（新人）はグラフ非表示
  - 既存のレギュラー/ポストシーズン切替（`mode` ステート）と連動

---

### 2026-03-17 — Tier2 ⑤ 球種・コース表示（ui.jsx / TacticalGame.jsx）

**仕様本文への影響あり（§4.4）**

- **§4.4 試合シミュレーション — 球種・コース表示（演出レイヤー）**
  - `ui.jsx` に `PitchBadge` コンポーネントを追加
    - 球種（直球/スライダー/カーブ/フォーク/チェンジアップ）を色付きバッジで表示
    - コース（内角/真中/外角/内低/低め/外低）をラベルで表示
  - TacticalGame.jsx のイベントログ各行に `<PitchBadge>` を追加
  - 意図四球（pitchType: null）・盗塁イベントでは非表示（null チェックで制御）
  - 球種カラー: 直球=赤 / スライダー=青 / カーブ=緑 / フォーク=紫 / チェンジアップ=黄

---

### 2026-03-17 — バグ修正（postGame.js / App.jsx）

**仕様本文への影響あり（§4.4）**

- **§4.4 試合シミュレーション — 投手統計**
  - **W（勝利投手）ロジックの修正**
    - 旧: 勝利時は常に先発投手に W を付与
    - 新: 先発が5回以上（outs≥15）投げた場合のみ先発にW。未満の場合は最初の中継ぎ（pitcherOrder[1]）に付与
  - **HLD（ホールド）重複付与バグの修正**
    - 旧: 先発・クローザー以外の中継ぎ全員にHLDを付与（W+HLD二重付与が発生）
    - 新: 勝利投手（winnerId）を除外した中継ぎのみHLDを付与
  - **SV（セーブ）と W の二重付与防止**
    - クローザーが勝利投手になった場合はSVを付与しないよう修正（`p.id !== winnerId` 条件追加）

**仕様本文への影響なし（内部バグ修正）**

- **App.jsx — `pickOpponent()` フォールバック漏れ**
  - 交流戦期間（gameDay 60〜94）などでプールが空になった場合に `undefined` を返しクラッシュする可能性
  - バッチシミュレーション側と同じフォールバック `|| teams.filter(t=>t.id!==myId)[0]` を追加

---

### 2026-03-16 — バグ修正（postGame.js）

**仕様本文への影響あり**

- **§4.4 試合シミュレーション — 投手統計**
  - **L（敗戦）・BS（ブローセーブ）の引き分け除外**
    - 旧: `!won`（L）/ `!won && finalLead <= 0`（BS）で判定し、引き分けも誤ってカウント
    - 新: `!won && finalLead < 0` で判定（引き分け = finalLead === 0 を除外）

---

### 2026-03-18 — バグ修正（contract.js / App.jsx）

**仕様本文への影響なし（実装バグ修正のみ）**

- `processCpuFaBids`: CPU FA獲得時、選手オブジェクトに旧年俸が残っていたバグを修正（`salary: bid.salary` を追加）
- `convertIkusei`: 支配下登録変換時に予算チェックが欠如していたバグを修正
- `evalOffer`: `player.personality` が null の場合のクラッシュを防ぐデフォルト値を追加

---

### 2026-03-18 — NPB最低年俸をNPB協約準拠の金額に変更（constants.js / player.js / App.jsx / contract.js）

**仕様本文への影響あり（§4.5・§7）**

- `MIN_SALARY_SHIHAKA = 4,200,000`（支配下選手最低年俸 420万円）を新設
- `MIN_SALARY_IKUSEI = 2,400,000`（育成選手最低年俸 240万円）を新設
- `player.js` の年俸生成下限を `MIN_SALARY_IKUSEI` に変更
- `convertIkusei`・CPU契約更改・CPU FA獲得の全パスで最低年俸を強制適用

---

### 2026-03-18 — Tier3バグ修正 4件（Tabs.jsx / simulation.js / App.jsx / contract.js）

**仕様本文への影響なし（実装バグ修正のみ）**

- `Tabs.jsx` 二軍テーブル空表示の `colSpan` 7→8 修正（列数不一致）
- `simulation.js` `applyFatigue` の `moraleMod === 0` を `Math.abs(moraleMod) < 0.001` に変更（浮動小数点比較）
- `App.jsx` `retire_phase` のモラル計算から `_retireNow` 選手を除外
- `contract.js` `getFaThreshold` の `entryAge` フォールバックを大卒扱い（7年）に修正

---

### 2026-03-17 — Tier3 実装（⑧⑨⑩）（utils.js / player.js / contract.js / simulation.js / App.jsx / Tabs.jsx / constants.js）

**仕様本文への影響あり（§4.3・§4.4・§4.5・§4.9・§4.13新設・§7）**

- **⑧ スカウティング精度・隠し能力値**（§4.9）
  - `scoutedValue()` を utils.js に追加（ノイズ付き能力値を返す）
  - SCOUT_REGIONS に `regionFactor` を追加（国内 0.8〜0.9、海外 1.1〜1.3）
  - スカウトタブで `?` マーク付き推定値を表示

- **⑨ 選手モラル**（§4.3・§4.4・§4.13）
  - Player に `morale`（0〜100）を追加
  - `applyBatterSituation` / `applyFatigue` で個人モラルを能力に反映
  - シーズン末に出場機会・勝率・年俸・在籍年数でモラル変動
  - `MoralBadge` コンポーネントを Tabs.jsx に追加

- **⑩ NPB固有ルール深化**（§4.3・§4.5）
  - Player に `serviceYears`・`entryAge`・`ikuseiYears` を追加
  - `getFaThreshold()` で高卒/大卒別FA資格年数を計算
  - `cpuRenewContracts` に FA資格チェック・海外FA離脱・育成3年ルールを追加
  - `convertIkusei` ハンドラで育成→支配下登録変換を実装
  - `personality.overseas` 追加（≥70で海外FA優先）

---

### 2026-03-16 — Tier2 実装（⑤⑥）（simulation.js / Tabs.jsx / App.jsx）

**仕様本文への影響あり（§4.4）**

- **⑤ 球種・コース表示**
  - `pickPitchType()` で球種選択、`pickZone()` でコースを決定
  - イベントログに球種バッジ・コースラベルを表示

- **⑥ 選手個人成績グラフ**
  - `CareerTable` コンポーネントを Tabs.jsx に追加
  - キャリア推移 LineChart（Recharts）・指標セレクター付き

---

### 2026-03-16 — Tier1 新機能実装（App.jsx / utils.js / simulation.js / player.js / postGame.js / Tabs.jsx）

**仕様本文への影響あり（§4.1・§4.3・§4.4・§5）**

- **⓪ カレンダーシステム + 在籍年数基盤**（§4.1）
  - `gameDayToDate()` を utils.js に追加（gameDay 1〜143 → 実際の日付へ変換）
  - 開幕日: 3月29日、週6試合（火〜日）、月曜休み、gameDay 72 後にオールスター3日休止
  - ハブ上部に「M月D日 / 第N戦」形式で表示
  - Player に `serviceYears`・`entryAge`・`recentPitchingDays` フィールドを追加

- **① 投手利き腕 × 打者 vsLeft 補正**（§4.4）
  - 打席処理（`processAtBat`）に `pitcherHand` を渡すよう変更
  - 左投手対戦時に `(vsLeft - 50) / 300` を contact・power に加算

- **② 投手統計拡充（SV / HLD / QS / BS）**（§4.4・§5）
  - `emptyStats()` に HLD・QS・BS を追加
  - `applyGameStatsFromLog` で投手順を追跡し各統計を付与
  - Tabs.jsx の投手成績表に「S / H / QS」列を追加

- **③ 中継ぎ連投疲労**（§4.4）
  - `applyPostGameCondition` に `gameDay` パラメータを追加
  - `recentPitchingDays` で直近7試合の登板 gameDay を管理
  - 2試合連続登板: コンディション -5、3試合以上: -15

- **④ 交流戦（gameDay 60〜94）**（§4.1）
  - `pickOpponent()` ヘルパーを追加し、60〜94 試合目は相手リーグから対戦相手を選出
  - ハブ画面に「🔄交流戦」バッジを表示（`handleStartGame` / `runBatchGames` 両対応）

---

### 2026-03-16 — バグ修正（simulation.js / App.jsx / ui.jsx）

**仕様本文への影響あり**

- **§4.4 試合シミュレーション — 打席結果と走者進塁**
  - **BB/HBP（満塁時）**
    - 旧: r3 のみ生還。r2・r1 は進塁せず、打者が r1 の位置を上書きしていた
    - 新: r3 生還・r2→3塁・r1→2塁・打者→1塁 に正しく更新
  - **BB/HBP（一・二塁時）**
    - 旧: r2→3塁は行われていたが、r1 が 2塁に進まず打者に上書きされていた
    - 新: r2→3塁・r1→2塁・打者→1塁 に修正
  - **2塁打（一塁走者が得点しなかった場合）**
    - 旧: 2塁打後の newBases が常に [null, 打者, null] で r1 が消えていた
    - 新: r1 が得点しない場合は 3塁（newBases[2]）に正しく配置

- **§4.10 怪我システム — 戦術モードの怪我処理**
  - 旧: `handleTacticalGameEnd` に `tickInjuries`・`checkForInjuries` が存在せず、戦術モードでは怪我が発生・回復しなかった
  - 新: オートシムと同等の怪我処理（tickInjuries → checkForInjuries → 選手状態更新）を追加

- **§5 データモデル — Player.injury の型**
  - 旧: `CondBadge` が `p.injury.name` を参照（`p.injury` は文字列なので `.name` は undefined）
  - 新: `p.injury` を直接参照（例: `"軽微"`、`"骨折"` などの文字列ラベル）

---

### 2026-03-24 — Tier 7〜12 / 保守性 / UI改善 計画追記

- §1 プロジェクト概要: 長期目標・IndexedDB移行計画・useReducer移行計画・JSDoc/TypeScript計画を追記
- §2 ディレクトリ構成: PlayerModal.jsx（計画中）追加。App.jsx / Tabs.jsx 分割計画をコメントで明示
- §13（新設）計画中システム: Tier 7〜12 全機能の概要を記載
- §14（新設）保守性・技術的負債: IndexedDB移行・Error Boundary・ファイル分割・テスト計画
- §15（新設）UI改善計画: グローバル選手モーダル（最優先）・ダッシュボード・通知バッジ・グレード表示等

---

### 2026-03-16 — 初版作成

- SPEC.md を新規作成
- 全ソースファイルを解析し、以下を網羅:
  プロジェクト概要・ディレクトリ構成・画面フロー・ゲームシステム12節
  （シーズン・試合モード・選手・シミュレーション・契約・トレード・ドラフト・財務・スカウト・怪我・引退・育成）
  データモデル（Player / Team / GameState / News）・セーブロード・定数・計算式・賞記録・球場・チーム一覧

---

