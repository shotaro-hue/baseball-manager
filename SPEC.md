# Baseball Manager 2025 — 仕様書

> 最終更新: 2026-04-06（㊵ 怪我の詳細化を反映）

> **運用ルール**: コードに改修を加えた際は、仕様への影響を確認し、影響がある場合のみ本文を更新する。
> 変更の有無にかかわらず `CHANGELOG.md` に日付・内容を追記し、**過去の記録は削除しない**。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [ディレクトリ構成](#2-ディレクトリ構成)
3. [画面フロー](#3-画面フロー)
4. [ゲームシステム](#4-ゲームシステム)
   - 4.1 シーズン構成
   - 4.2 試合モード
   - 4.3 選手（Player）
   - 4.4 試合シミュレーション
   - 4.5 契約システム
   - 4.6 トレードシステム
   - 4.7 ドラフトシステム
   - 4.8 財務システム
   - 4.9 スカウトシステム
   - 4.10 怪我システム
   - 4.11 引退システム
   - 4.12 育成システム（年度末）
5. [データモデル](#5-データモデル)
6. [セーブ・ロード](#6-セーブロード)
7. [ゲームバランス定数](#7-ゲームバランス定数)
8. [セイバーメトリクス計算式](#8-セイバーメトリクス計算式)
9. [賞・記録・殿堂](#9-賞記録殿堂)
10. [球場情報](#10-球場情報)
11. [チーム一覧](#11-チーム一覧)
12. [変更履歴](../CHANGELOG.md)
13. [計画中システム（Tier 7〜12）](#13-計画中システムtier-712)
14. [保守性・技術的負債](#14-保守性技術的負債)
15. [UI改善計画](#15-ui改善計画)

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| **名称** | Baseball Manager 2025 |
| **ジャンル** | NPB（プロ野球）シミュレーション・監督ゲーム |
| **目的** | 12球団から1チームを選び、143試合のシーズンを戦って日本一を目指す |
| **長期目標** | NPB版 OOTP / Football Manager — 複数年フランチャイズ経営・深いシミュレーション |
| **フレームワーク** | React 18.2 + Vite 5.4 |
| **状態管理** | React useState / useReducer / useCallback / useMemo（Context なし）。コアゲームデータ（teams / gameDay / year / myId）は `gameStateReducer` で管理 |
| **グラフ** | Recharts 2.12 |
| **永続化** | ブラウザ localStorage（JSON）→ **IndexedDB 移行計画中**（複数年データ量対策） |
| **言語** | JavaScript（ES Modules）→ **JSDoc 注釈 / TypeScript 移行計画中** |
| **スタイリング** | カスタム CSS（CSS変数でチームカラーを動的適用） |

---

## 2. ディレクトリ構成

```
baseball-manager/
├── index.html
├── package.json
├── vite.config.js
├── playwright.config.js # Playwright E2E テスト設定（Chromium・webServer自動起動）
├── e2e/                 # Playwright E2E テスト（コアフロー限定）
│   └── title.spec.js   # タイトル画面テスト（チーム表示・選択→HUB遷移）
└── src/
    ├── App.jsx              # render coordinator・画面ルーティング（198行）✅ T3分割完了
    ├── main.jsx             # React エントリポイント
    ├── constants.js         # ゲームバランス定数・チーム定義・テンプレート文字列
    ├── utils.js             # 乱数(rng)・clamp・uid・名前生成 など汎用関数
    ├── styles.css           # グローバルスタイル
    ├── hooks/               # ✅ T3 で App.jsx から切り出したカスタムフック
    │   ├── useGameState.js  # チーム・選手・ゲーム state 管理（258行）
    │   ├── useSeasonFlow.js # 試合シミュ・プレーオフ進行（402行）
    │   └── useOffseason.js  # オフシーズン・ドラフト・引退処理（259行）
    ├── engine/
    │   ├── simulation.js    # 打席解決・試合状態進行
    │   ├── player.js        # 選手生成・育成・引退・怪我
    │   ├── contract.js      # 契約オファースコア計算・CPU自動更改
    │   ├── trade.js         # トレード価値計算・CPUオファー生成
    │   ├── draft.js         # ドラフトプール生成・推薦
    │   ├── finance.js       # 試合収入計算
    │   ├── playoff.js       # プレーオフ構造初期化
    │   ├── postGame.js      # 試合ログからの成績集計・W/L帰属
    │   ├── sabermetrics.js  # 高度打撃/投球指標計算
    │   ├── awards.js        # 表彰・歴代記録・殿堂入りチェック
    │   ├── saveload.js      # localStorage 読み書き
    │   ├── realplayer.js    # 実成績 → ゲーム内能力値変換
    │   ├── scheduleGen.js   # NPBシーズン日程生成エンジン（143日分事前生成）
    │   └── __tests__/       # Vitest ユニットテスト（🔶 部分実装）
    │       ├── contract.test.js
    │       ├── simulation.test.js
    │       └── utils.test.js
    ├── data/
    │   ├── npb2025.js       # 実NPB 2025年ロスターデータ（オプション）
    │   └── scheduleParams.js# 年度別シーズンパラメータ（開幕日・交流戦・甲子園制約等）
    └── components/
        ├── TacticalGame.jsx # 戦術モード（イニング制御）UI
        ├── BatchResult.jsx  # 5試合一括シム結果表示
        ├── Screens.jsx      # モード選択・試合結果・プレーオフ等の画面
        ├── Tabs.jsx         # バレルファイル（13行）✅ T4分割完了
        ├── Draft.jsx        # ドラフト画面（抽選→指名→確認）
        ├── PlayoffScreen.jsx# プレーオフシリーズ管理
        ├── RetireModal.jsx  # 引退処理モーダル
        ├── PlayerModal.jsx  # グローバル選手詳細モーダル（どのタブからでも開ける）✅ 実装済み
        ├── DashboardTab.jsx # ハブ用ダッシュボードタブ（U2 対応）✅ 実装済み
        ├── ErrorBoundary.jsx# エラー境界（主要コンポーネントをラップ）✅ 実装済み
        ├── ui.jsx           # 小型共通コンポーネント（OV・CondBadge・HandBadge 等）
        └── tabs/            # ✅ T4 で Tabs.jsx から分割した各タブコンポーネント
            ├── RosterTab.jsx
            ├── StatsTab.jsx
            ├── TradeTab.jsx
            ├── FinanceTab.jsx
            ├── ContractTab.jsx
            ├── NewsTab.jsx
            ├── MailboxTab.jsx
            ├── AlumniTab.jsx
            ├── StandingsTab.jsx
            ├── RecordsTab.jsx
            ├── ScheduleTab.jsx
            └── CareerTable.jsx
```

---

## 3. 画面フロー

```
[タイトル画面]
    ├── 新規ゲーム（チーム選択）
    └── ロードゲーム
         ↓
[ハブ画面] ──────────────────────────────────────────────────────────
 ┌──────────────────────────────────────────────────────────────────┐
 │  上部バー: チーム名・年度・試合日・成績・予算・セーブボタン      │
 │  試合ボタン: [1試合] [5試合一括] [残り全試合シム]               │
 │                                                                  │
 │  タブ:                                                           │
 │  🏠概況（デフォルト）                                           │
 │  👥ロスター │ 📰ニュース │ 📨メールボックス │ 🔄トレード        │
 │  📖OB名簿  │ 📝契約     │ 🏪FA市場        │ 🔍スカウト        │
 │  💴財務    │ 🏆順位     │ 📊成績         │ 🏛️記録            │
 │  ※各タブに通知バッジ（赤/黄/グレー）常時表示（U3）             │
 └──────────────────────────────────────────────────────────────────┘
         ↓ 1試合 or 5試合一括
[モード選択画面]
    ├── 戦術モード → [戦術ゲーム画面] → [試合結果]
    └── オートシム  → [試合結果]
                          ↓
                   [ハブ画面へ戻る]

    ↓ 143試合完了
[プレーオフ画面]
    CS 1stステージ（3位 vs 2位、3試合制）
    CS 2ndステージ（1位 + CS 1st勝者、5試合制）
    日本シリーズ（セ代表 vs パ代表、7試合制）
         ↓
[オフシーズン処理]
    引退処理 → 選手育成 → ウェーバー →  FA市場 → ドラフト
         ↓
[新シーズン開幕画面（NewSeasonScreen）]
    引退選手サマリー / ドラフト指名結果 / ブレイクアウト選手
    「開幕！」ボタン → [ハブ画面（翌年）]
```

---

## 4. ゲームシステム

### 4.1 シーズン構成

| 項目 | 値 |
|------|----|
| 試合数 | 143試合 |
| チーム数 | 12（セ・リーグ 6、パ・リーグ 6） |
| 対戦相手 | シーズン開幕時に143日分の全試合日程を事前生成（`scheduleGen.js`）。各チームが全対戦相手と規定試合数を消化する |
| リーグ内対戦 | 同一リーグ5チームと各25試合（計125試合）。Berger方式ラウンドロビンで 13H/12A に配分 |
| 交流戦 | 相手リーグ6チームと各3試合（計18試合）。6シリーズ×3連戦で PAホーム/CEホームを交互に実施 |
| 勝率計算 | 引き分けを除外した勝敗で算出 |

#### カレンダーシステム

| 項目 | 内容 |
|------|------|
| 開幕日 | 2025年: 3月28日（金）。2026年以降: 3月最終金曜日（3月25〜31日）を自動算出 |
| 週スケジュール | 火〜日（月曜は休み）。AllStar期間（3日間）も休止 |
| 交流戦期間 | 2025年: 6月3日〜6月22日（18日間）。2026年以降: 6月第1火曜日から18ゲーム日 |
| 日付表示 | ハブ画面上部に「M月D日 / 第N戦」形式で表示（`gameDayToDate(gameDay, schedule)` in utils.js） |
| 日程生成 | `generateSeasonSchedule(year, teams)` が `[null, ScheduleDay1, …, ScheduleDay143]` を返す |

#### 甲子園制約（阪神・オリックス）

| 制約 | 内容 |
|------|------|
| 春（センバツ）期間 | 2025年: 3/20〜4/6。阪神ホームは `venueNote: "kyocera"` を付与（京セラドーム代替）。オリックスは同期間中ホームゲーム不可（アウェイ配置） |
| 夏（甲子園大会）期間 | 2025年: 8/4〜8/24。同上 |
| 2026年以降 | 春: 3月第3土曜〜4月第1日曜。夏: 8月第1木曜〜8月第4日曜。自動算出 |

#### 交流戦

| 項目 | 内容 |
|------|------|
| 対象期間 | `schedule[gameDay].isInterleague === true` の試合日（計18日） |
| ホーム配分 | 偶数ラウンド（0,2,4）: PAホーム、奇数ラウンド（1,3,5）: CEホーム。各チーム9H/9A |
| 2025年実績カード | scheduleParams.js の `interleagueRound1PaHosts` で初戦カードを固定（日本ハム-阪神 等） |
| 表示 | ハブ画面上部に「🔄交流戦」バッジを表示 |

---

### 4.2 試合モード

| モード | 説明 |
|--------|------|
| **戦術モード** | イニング単位でリアルタイム采配。投手交代・代打・盗塁・バント等を選択 |
| **オートシム** | 1試合を即座に自動シミュレーション |
| **5試合一括** | 5試合まとめてシム、結果サマリーを表示 |
| **全試合シム** | 残り全143試合を一括シム |

---

### 4.3 選手（Player）

#### 打者能力値（1〜99）

| 属性 | 意味 |
|------|------|
| `contact` | ミート力・安打確率 |
| `power` | 長打力・本塁打率 |
| `eye` | 選球眼・四球率 |
| `speed` | 走力・三塁打確率 |
| `arm` | 肩の強さ |
| `defense` | 守備力 |
| `catching` | 捕手専用守備 |
| `stealSkill` | 盗塁成功率 |
| `baseRunning` | 走塁効率 |
| `clutch` | 勝負強さ（得点圏での補正） |
| `vsLeft` | 対左投手補正 |
| `breakingBall` | 変化球対応力 |
| `stamina` | 疲労耐性 |
| `recovery` | 試合後の回復力 |

#### 投手能力値（1〜99）

| 属性 | 意味 |
|------|------|
| `velocity` | 球速・奪三振率 |
| `control` | 制球力・四球抑制（逆スケール：値が高いほど四球が少ない） |
| `stamina` | 投球回数耐性 |
| `breaking` | 変化球の切れ |
| `variety` | 球種の多様性 |
| `sharpness` | 球の鋭さ（WHIP相関） |
| `tempo` | 投球テンポ |
| `clutchP` | 崩れにくさ（ERA相関） |
| `recovery` | 中継ぎ向け連投耐性 |
| `durability` | 怪我のしにくさ |

#### 人格（0〜100）

| 属性 | 意味 |
|------|------|
| `money` | 年俸重視度 |
| `winning` | 勝利・優勝重視度 |
| `playing` | 出場時間重視度 |
| `hometown` | 地元球団への愛着 |
| `loyalty` | 球団への忠誠心 |
| `stability` | 長期契約の安心感重視度 |
| `future` | 若いチームで成長したい度 |
| `overseas` | 海外志向（≥70: 国内FAをスキップし海外FA権取得まで待機） |

#### キャリアフェーズ

| フェーズ | 年齢 | 成長傾向 |
|----------|------|----------|
| `growth` | ≤24歳 | 大幅成長（+8〜+13 + ポテンシャルボーナス） |
| `peak` | 25〜29歳 | 安定成長（+4〜+8） |
| `earlyDecline` | 30〜33歳 | 微衰退（-1〜+4） |
| `decline` | 34歳〜 | 衰退（-9〜-5） |

#### その他フィールド

| フィールド | 型 | 意味 |
|------------|-----|------|
| `serviceYears` | number | UI表示用の換算登録年数（`Math.floor(daysOnActiveRoster / 120)`。FA判定はdaysOnActiveRosterで行う） |
| `daysOnActiveRoster` | number | 一軍（players配列）に在籍した累積日数。毎年リセットしない。FA権取得後も保持。 |
| `entryAge` | number | 入団時年齢 |
| `entryType` | string | 入団区分: `"高卒"` / `"大卒"` / `"社会人"` / `"外国人"`。FA閾値の判定基準。`entryAge` による推測を廃止しこの値で判定する |
| `ikuseiYears` | number | 育成契約年数（最大3年。超過で自動解雇） |
| `registrationCooldownDays` | number | 一軍登録抹消後の再登録不可残日数（抹消時10をセット・毎日デクリメント。怪我による自動降格にも適用） |
| `stats2` | object | 二軍成績（PA/H/HR/IP/ER/K の6統計のみ。一軍statsとは別フィールド） |
| `morale` | number(0〜100) | 個人モラル。打撃・投球能力に `(morale-70)/250` を加算 |
| `recentPitchingDays` | number[] | 直近7試合の登板 gameDay 配列（投手専用） |

#### 選手タイプ（フレーバー）

- **打者**: 天才肌 / ガッツ型 / 技巧派 / パワーヒッター / 俊足巧打 / 守備の名手 / 走塁のスペシャリスト / 勝負強い打者
- **投手**: 本格派 / 技巧派 / 速球派 / 変化球のスペシャリスト / 制球の鬼 / エース候補 / 抑えの切り札 / 二刀流候補

---

### 4.4 試合シミュレーション

#### 打席解決フロー

1. 打者能力と投手能力を **50/50 で平均** してマージ確率を生成
2. 各結果（HR, T, D, S, BB, HBP, K, GO, FO, SAC）の確率を算出
3. 状況補正を適用（下記参照）
4. 乱数で結果を決定
5. 走者進塁・得点を計算して試合状態を更新

#### 打席結果と走者進塁

| 結果 | 走塁ルール |
|------|-----------|
| HR | 全走者生還、打者生還 |
| T (三塁打) | 全走者生還、打者→三塁 |
| D (二塁打) | 三塁・二塁走者は生還、一塁走者は40%確率で生還（否なら三塁へ）、打者→二塁 |
| S (単打) | 三塁走者は生還、二塁走者は55%確率で生還（否なら三塁へ）、一塁走者→二塁、打者→一塁 |
| BB/HBP | 満塁: 三塁走者生還・他は1つ進塁・打者→一塁。それ以外: 順に押し出し進塁 |
| K/GO/FO | アウト |
| SAC | アウト、一塁走者→二塁 |

#### 状況補正

| 補正名 | 説明 |
|--------|------|
| **疲労補正** | `calcEffectiveFatigue(pitchCount, pitcher)` でスタミナ×コンディション補正後の疲弊度（0〜100+）を算出。疲弊度 83以上: 警告、100以上または130球以上: 強制交代推奨。スタミナ50/コンディション100の標準投手では従来通り約100球で警告、約120球で強制交代 |
| **球場補正** | 球場の `hrMod` に基づきHR↔二塁打変換（甲子園 0.90、横浜 1.20 など） |
| **クラッチ補正** | 得点圏×接戦時に打者の `contact`・`power` を強化 |
| **モメンタム** | 1〜100のモメンタム値によりチーム全体の打者能力を ±数%調整 |
| **コンディション** | 選手コンディション（60〜100）が打者能力に直接乗算 |
| **対左投手（vsLeft）** | 左投手対戦時に `(vsLeft - 50) / 300` を contact・power に加算 |
| **連投疲労（試合またぎ）** | 中継ぎ投手の `recentPitchingDays` に基づき連続登板ペナルティを付与（2試合連続: -5、3試合以上: -15） |
| **個人モラル** | 各選手の `morale`（0〜100）を打者・投手能力に加算（`(morale-70)/250`。70が中立、100で+12%、40で-12%） |

#### 投手統計（試合結果集計）

| 統計 | 付与条件 |
|------|---------|
| **W（勝利）** | 先発が5回以上（outs≥15）投げていれば先発に付与。5回未満でKOされた場合は最初の中継ぎに付与 |
| **L（敗戦）** | 失点してリードを失った投手に付与（引き分けは除外） |
| **SV（セーブ）** | 1〜3点差でゲームを締めた最終投手（勝利投手を兼ねる場合は除外） |
| **HLD（ホールド）** | セーブシチュエーションを保持して交代した中継ぎ投手（勝利投手を兼ねる場合は除外） |
| **BS（ブローセーブ）** | セーブシチュエーションを失った投手（引き分け時は除外） |
| **QS（クオリティスタート）** | 先発が6回以上・自責3点以下で投げ切った試合 |

#### 戦術選択肢

| 戦術 | 効果 |
|------|------|
| 通常 | 標準打席 |
| バント | 65%の確率でアウト扱いだが走者を進塁（SAC） |
| エンドラン | 打席と同時に一塁走者が走る |
| 敬遠 | 意図的四球を与える |
| 盗塁 | 走者が盗塁を試みる（speed vs control の対決） |

---

### 4.5 契約システム

#### オファースコア計算（0〜100）

各要素を加算し合計が **55 以上** で契約成立。

| 要素 | 最大値 | 条件 |
|------|--------|------|
| 年俸スコア | 35 | 提示年俸 ÷ 現在年俸の比率 × 人格.money |
| 勝利スコア | 25 | 勝率・リーグ順位 × 人格.winning |
| 出場スコア | 20 | スタメン在籍か × 人格.playing |
| 地元スコア | 10 | 出身地と球団都市が一致 × 人格.hometown |
| 忠誠スコア | 15 | 現チーム在籍年数 × 人格.loyalty |
| 安定スコア | 10 | 複数年契約（3年以上で85点、1年で40点） × 人格.stability |
| 将来スコア | 10 | 平均年齢が若い × 人格.future |

#### CPU 自動更改（オフシーズン）

- 契約残年数が 0 の選手を対象に予算内で自動オファー
- トレード価値 ≥ 70 の選手: 年俸を **15%増額** してオファー
- オファースコア < 55 → **FA 移籍** 扱い
- 更改後年俸は `MAX(計算年俸, MIN_SALARY_SHIHAKA)` で最低年俸を保証

#### FA 資格（NPB協約準拠）

FA判定は `entryAge` による推測を廃止し、`entryType` フィールドで行う（`daysOnActiveRoster` 累積日数方式）。

| `entryType` | `entryAge` | 国内FA取得（累積日数） | 海外FA取得（累積日数） |
|-------------|-----------|----------------------|----------------------|
| `"高卒"` | 18 | 8年 × 120日 = **960日** | 9年 = 1080日 |
| `"大卒"` | 22 | 7年 × 120日 = **840日** | 9年 = 1080日 |
| `"社会人"` | 24–25 | 7年 × 120日 = **840日** | 9年 = 1080日 |
| `"外国人"` | 22–28 | 8年 × 120日 = **960日** | 9年 = 1080日 |

- `overseas ≥ 70` の選手: 国内FA権があっても行使せず **海外FA権取得まで待機**
- `overseas ≥ 70` かつ海外FA資格あり: NPB離脱

#### 外国人選手のFA権と外国人枠免除（NPB協約 第82条準拠）

外国人選手も上記と同じ `daysOnActiveRoster` 累積日数でFA権を取得できる。

| 条件 | 内容 |
|---|---|
| `daysOnActiveRoster >= FOREIGN_EXEMPTION_DAYS`（960日） | FA権取得と同時に外国人枠から自動除外（翌シーズンから日本人扱い） |
| FA移籍時の補償 | なし（国内選手のFA補償ランク制度は適用されない） |

```javascript
// 外国人枠免除判定（フィールドは追加しない・毎回導出する）
const isForeignExempt = (p) =>
  p.isForeign && (p.daysOnActiveRoster ?? 0) >= FOREIGN_EXEMPTION_DAYS;  // = 960

// promote() での外国人枠チェック変更後
const foreignActive = team.players.filter(x => x.isForeign && !isForeignExempt(x)).length;
if (p.isForeign && !isForeignExempt(p) && foreignActive >= MAX_外国人_一軍) { ... }
```

UI: PlayerModal の外国人バッジを `外国人枠免除まであとX日` で表示。免除済みは `元外国人` バッジに変更。

#### 育成契約（ikusei）

| 項目 | 内容 |
|------|------|
| 最低年俸 | `MIN_SALARY_IKUSEI` = 240万円 |
| 在籍上限 | `ikuseiYears ≥ 3` で自動解雇 |
| 一軍出場 | 不可（`育成:true` のままでは promote 不可） |
| 支配下登録変換 | 手動操作。`MAX_ROSTER(28名)` 空きと予算(`差額分`)が必要 |

#### 最低年俸定数（NPB協約 第89条）

| 定数 | 値 | 表示 | 適用対象 |
|------|----|------|---------|
| `MIN_SALARY_SHIHAKA` | 4,200,000 | 420万 | 支配下登録選手全員 |
| `MIN_SALARY_IKUSEI` | 2,400,000 | 240万 | 育成契約選手 |

---

### 4.6 トレードシステム

#### トレード価値計算式

```
// 打者
base = (contact*1.2 + power + eye*0.9 + speed*0.7 + clutch*0.5) / 4.3

// 投手
base = (velocity*1.2 + control*1.3 + breaking + stamina*0.8 + clutchP*0.5) / 4.8

// 年齢補正
ageMod = ≤24歳: 1.15 / 25〜28歳: 1.00 / 29〜31歳: 0.85 / 32歳〜: 0.65

// ポテンシャル補正
potMod = 0.7 + (potential / 100) * 0.3

tradeValue = round(base * ageMod * potMod)
```

#### CPU 自動オファー

- 通常時は試合ごとに **15%** の確率で CPU がオファーを送ってくる
- チームニーズ（先発不足・球威不足・ミート不足・若手不足）を分析してターゲットを選出
- 価値差が 10 以上の場合、差額を **現金** で補填

#### トレードデッドライン（Tier 11 ㊳）

- **トレード期限**: `gameDayToDate(gameDay, schedule).month > 7`（8月以降）で新規トレードを禁止（TradeTabの新規提案ボタンも無効化）
- **デッドライン期間（7月）**: CPU→プレイヤーのオファー確率を引き上げ（前半: 25% / 後半: 40%）
- **買い手/売り手分類**: リーグ順位と勝率で `buyer / seller / neutral` に分類。買い手は若手を対価に即戦力を要求
- **CPU vs CPU デッドライントレード**: 7月中のみ、1試合あたり 12% で CPU 間トレードを試行し、成立時はニュースタブへ移籍速報を配信

#### カウンター交渉（Tier 5 ⑭）

プレイヤーが提案したトレードを CPU が部分的に受け入れる「カウンターオファー」機能。

| ラウンド | accept 閾値（fair 時） | CPU の追加要求倍率 |
|---------|----------------------|-----------------|
| Round 1 | 55% | × 1.0 |
| Round 2 | 30%（厳しくなる）  | × 1.5 |
| Round 3 | 50%（最終判定）   | ― |

- CPU は交渉理由（「対価が不足」「投手補強を優先したい」「若手選手が欲しい」等）を最大2件表示
- 「✏️ 修正して再提案」ボタンで条件を変えて再交渉可能（ラウンドカウントは維持）
- Round 3 で accept されなければ最終拒否
- `favorable`（diff ≥ 8）は全ラウンドで即座に承認

---

### 4.7 ドラフトシステム

#### ドラフトプール構成（計 80 名）

| 枠 | 人数 | 内訳 |
|----|------|------|
| 投手 | 30 | 先発 12、中継ぎ 10、抑え 8 |
| 野手 | 50 | 各ポジション × 約 6 名 |

加えてスカウト発掘済みの選手がプールに追加される。

#### ドラフト進行

1. **抽選**: 逆順（勝ち数が少ないほど上位指名権）
2. **指名**: 6巡 × 12チーム = 最大 72 指名
3. **確認**: 指名選手一覧表示
4. 指名選手は **育成（ファーム）** 扱いで入団

#### スカウト予算配分（Tier 5 ⑯）

ドラフト展望画面の「⚙️ 予算配分」タブでスライダーにより投手/野手スカウトへの予算比率（10〜90%）を設定。

| 配分比率 | 自動開示数（種別ごと） | 能力値ノイズ |
|---------|------------------|------------|
| 10% | ~1名（上位から） | ±9 |
| 50% | ~4名 | ±7.5 |
| 90% | ~7名 | ±5.5 |

- 自動開示数 = `round(share × 8)`（最高ポテンシャルから優先）
- 能力値ノイズ = `budgetFactor = 1.0 - share × 0.5` を `scoutedValue(val, id, key, 10, bf)` に適用
- `fromScout`（事前スカウト済み）の選手は常に真の能力値を表示

---

### 4.8 財務システム

#### 収入計算（試合ごと）

```
ticket  = round(budget * 0.3 * (0.6 + popularity/200 + winPct*0.4) / SEASON_GAMES * 1000 * stadiumMult)
sponsor = SPONSOR_TABLE[勝利数] / SEASON_GAMES  // 0W=5k, 30W=15k, 60W=40k, 90W=90k
merch   = ticket * 0.08
```

#### 球場レベルによるチケット収入倍率（Tier 5 ⑮）

| Lv | 倍率 | 投資コスト（前レベルから） |
|----|------|------------------------|
| 0（初期） | 1.00x | ― |
| 1 | 1.25x | 500万 |
| 2 | 1.60x | 1,000万 |
| 3 | 2.00x | 2,000万 |

- チケット収入のみに倍率が適用される（スポンサー・グッズ収入は非対象）
- 財務タブに「🏟️ 球場投資」カード（現在レベル・アップグレードボタン）と「📈 シーズン収益サマリー」カード（累計/予測）を表示

#### シーズン収益追跡（Tier 5 ⑮）

- チームオブジェクトに `revenueThisSeason` を追加（試合ごとに累積）
- 3つのゲーム終了ハンドラ（オートシム / 戦術モード / バッチシム）すべてで累積
- 年度切り替え時に 0 にリセット、`stadiumLevel` はシーズンをまたいで保持

#### 主な支出

| 項目 | タイミング |
|------|-----------|
| 選手年俸 | シーズン中に分割 |
| スカウト費用 | 派遣時に即時 |
| コーチ月給 | 毎月（`salary` × グレード） |
| トレード現金 | トレード成立時 |
| 球場投資 | アップグレード時に即時 |

---

### 4.9 スカウトシステム

| 地域 | 費用 | 能力レンジ | 期間 | 外国人 | regionFactor |
|------|------|-----------|------|--------|--------------|
| 国内一軍候補 | 5,000 | 65〜82 | 4週 | ✗ | 0.8（精度高） |
| 国内独立リーグ | 3,000 | 50〜72 | 6週 | ✗ | 0.9 |
| 北米メジャー | 12,000 | 70〜90 | 8週 | ✓ | 1.2 |
| 韓国 KBO | 8,000 | 60〜78 | 6週 | ✓ | 1.1 |
| 中南米 | 9,000 | 55〜85 | 10週 | ✓ | 1.3（精度低） |

- 期間経過後にスカウト結果タブへ候補者が表示される
- 外国人選手は **外国人枠（一軍最大 4 名）** に加算される

#### スカウト能力値ノイズ（Tier 3 ⑧）

スカウト結果画面では選手の能力値に **誤差（ノイズ）** が乗った推定値を表示する。

```
effectiveRange = round(noiseLevel × budgetFactor × regionFactor)
scoutedValue  = trueValue ± random(0, effectiveRange)   ← シード固定で再現性あり
```

| パラメータ | 説明 |
|-----------|------|
| `noiseLevel` | 地域基本ノイズ（国内: 10、海外: 15） |
| `budgetFactor` | 予算が多いほど小さく（0.7〜1.0）、少ないほど大きく（1.0） |
| `regionFactor` | 地域係数（上表参照） |

- 推定値には `?` マークを付与して表示
- 実際に入団させた後は真の値が判明する（`estimated:false`）

---

### 4.10 怪我システム

#### 発生確率

```
base = 0.3% / 試合
× ageMod  (年齢>33: 2.0、年齢>29: 1.4、それ以外: 1.0)
× condMod (コンディション<70: 1.6、それ以外: 1.0)
```

#### 怪我の種類

| 種類 | 期間 | 確率（重み） |
|------|------|------------|
| 軽微 | 5〜14日 | 55% |
| 筋肉系 | 15〜30日 | 30% |
| 骨折 | 31〜60日 | 12% |
| シーズンエンド | 143日 | 3% |

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

- 怪我中の選手は試合ロスターから自動除外
- 毎試合 `tickInjuries` で残日数が 1 減る
- `recovery` 能力値が高いほど条件面での事前補正あり

---

### 4.11 引退システム

#### 引退意欲スコア（0〜100）

| 条件 | 加算値 |
|------|--------|
| 42歳以上 | +80 |
| 41歳 | +65 |
| 40歳 | +50 |
| 38〜39歳 | +28 |
| 36〜37歳 | +12 |
| 35歳 | +3 |
| シーズンエンド怪我（injuryDaysLeft ≥ 100） | +25 |
| 出場機会が少ない | +15 |
| モラル < 40 | +10 |
| 契約切れ | +20 |

スコアが **40 以上** になると引退候補。`retireStyle` ≥ 70 でスコアを 1.4 倍、≤ 30 で 0.6 倍。

#### 引退イベント

- 試合ごとに **4%** の確率で引退表明イベントが発生（対象: 35歳以上、スコア≥40）
- 監督は **慰留（成功率 = 乱数 > retireStyle%）** を試みられる
- 慰留失敗または希望すれば引退
- **引退セレモニー**（50,000 円のボーナス収入）を提供可能

---

### 4.12 育成システム（年度末）

#### 成長バジェット（1シーズン分）

| 年齢 | バジェット範囲 |
|------|--------------|
| ≤20歳 | +8〜+13（+ ポテンシャルボーナス） |
| 21〜24歳 | +12〜+18（+ ポテンシャルボーナス） |
| 25〜27歳 | +4〜+8 |
| 28〜30歳 | -1〜+4 |
| 31〜33歳 | -5〜-2 |
| 34〜37歳 | -9〜-5 |
| 38歳〜 | -12〜-8 |

#### コーチボーナス

| グレード | ラベル | 月給 | ボーナス |
|----------|--------|------|--------|
| 1 | 平凡 | 3,000 | +1 |
| 2 | 経験豊富 | 7,000 | +2 |
| 3 | 一流 | 15,000 | +3 |
| 4 | レジェンド | 30,000 | +5 |

コーチボーナスは**成長フェーズのみ**加算される（衰退フェーズには影響しない）。

#### 能力値の変化

- 成長バジェットをランダムに各能力へ振り分け
- **トレーニング集中**設定済みの能力は優先配分（成長: +4〜+10、衰退: 0〜-2 で抑制）
- 全能力値は `1 ≤ 値 ≤ potential` にクランプ
- 5% の確率で **ブレイク（成長量 2 倍）**、3% で **スランプ（0 成長）**

#### 投手衰退ウェイト（PITCHER_DECLINE_WEIGHTS）

衰退フェーズの投手は能力ごとに異なる重みで能力が低下する。

| 能力 | 重み | 意味 |
|------|------|------|
| `velocity` | 1.4 | 最も優先して低下 |
| `stamina` | 1.2 | 次いで低下 |
| `sharpness` | 0.9 | 標準 |
| `control` | 0.8 | 比較的維持 |
| `breaking` | 0.7 | 維持されやすい |
| `variety` | 0.6 | 最も維持 |

#### 晩年ブレイクスルー

28〜34歳の選手で成長バジェットが負（衰退）の場合、**2% の確率**で衰退量を反転して1.5倍の成長に転換する。

#### peakAbilities スナップショット

`growthPhase` が `"peak"` → `"earlyDecline"` に遷移する際、その時点の能力値（打者: batting、投手: pitching）を `player.peakAbilities` として保存する。衰退後の下限計算（peak値 × 0.6）に使用。

---

### 4.13 モラルシステム（Tier 3 ⑨）

#### シーズン末モラル変動

各選手のモラルはシーズン終了時に以下の要素で変動する。

| 条件 | 変動量 |
|------|--------|
| PA ≥ 400 または BF ≥ 200（十分な出場機会） | +3 |
| PA ≥ 300 または BF ≥ 150 | +5 |
| PA < 200 かつ BF < 80（出場機会不足） | `playing > 65` で -12、それ以外 -8 |
| 勝率 ≥ 0.6 | +5 |
| 勝率 < 0.4 | `winning > 65` で -8、それ以外 -5 |
| 年俸が市場価値より 10% 以上高い | +3 |
| 年俸が市場価値より 10% 以上低い | `money > 70` で -8、それ以外 -5 |
| 在籍 5 年以上 | +3 |

変動後は `clamp(morale + delta, 0, 100)` で 0〜100 に丸める。

#### 試合中の影響

`moraleMod = (morale - 70) / 250`

- 打者: contact・power・eye 等すべての打撃能力に加算
- 投手: applyFatigue 内で control・velocity・breaking を調整

---

## 5. データモデル

### Player オブジェクト

```js
{
  id,            // UUID
  name,          // 選手名
  age,           // 年齢
  pos,           // ポジション (例: "捕手", "先発")
  isPitcher,     // boolean
  isForeign,     // boolean（外国人枠）

  salary,        // 年俸（整数）
  contractYears, // 契約年数
  contractYearsLeft, // 残年数
  育成,          // boolean（ファーム所属）
  isFA,          // boolean（FA選手）

  potential,     // ポテンシャル上限 (55〜99)
  growthPhase,   // "growth" | "peak" | "earlyDecline" | "decline"
  morale,        // モラル (0〜100)
  trust,         // 信頼度 (0〜100)
  condition,     // コンディション (60〜100)
  trainingFocus, // トレーニング集中対象能力名 (nullable) ← devGoal 設定時は自動更新
  devGoal,       // 育成目標 (nullable string): "top_team"|"batting"|"defense"|"speed"|"promotion" (野手) / "rotation"|"velocity"|"control"|"breaking"|"stamina"|"promotion" (投手)
  retireStyle,   // 引退スタイル (0〜100)
  hometown,      // 出身地（都市名）
  serviceYears,  // 通算在籍年数
  entryAge,      // 入団時年齢

  personality: { money, winning, playing, hometown, loyalty, stability, future },

  // 打者のみ
  batting: { contact, power, eye, speed, arm, defense, catching, stealSkill,
             baseRunning, clutch, vsLeft, breakingBall, stamina, recovery },

  // 投手のみ
  hand,          // "left" | "right"
  subtype,       // "先発" | "中継ぎ" | "抑え"
  pitching: { velocity, control, stamina, breaking, variety, sharpness,
              tempo, clutchP, recovery, durability },
  recentPitchingDays, // 直近7試合の登板 gameDay 配列（連投疲労計算用）

  peakAbilities, // peak→earlyDecline 遷移時にスナップショット保存（打者: batting値コピー、投手: pitching値コピー）

  // 成績（シーズン累積）
  stats: {
    PA, AB, H, D, T, HR, RBI, BB, K, HBP, SB, SF,
    IP, ER, BBp, HBPp, Kp, HRp, Hp, BF, W, L, SV, HLD, QS, BS   // 投手
    // ※ CS, R, BS, evSum/evN/laSum/laN は careerLog では省略（コンパクト形式）
  },
  playoffStats,  // 同上・プレーオフ分
  careerLog,     // [{ year, teamId, teamName, stats, playoffStats }, ...]
                 // stats/playoffStats は25フィールドのコンパクト形式（PA/AB/H/D/T/HR/RBI/BB/K/HBP/SF/SB/IP/ER/BBp/HBPp/Kp/HRp/Hp/BF/W/L/SV/HLD/QS）

  injury,        // 怪我名称（文字列）または null
  injuryDaysLeft,// 残怪我日数
  allStarSelections, // 通算オールスター選出回数（キャリア累積）

  playerType,    // フレーバータイプ名
  playerComment, // フレーバーコメント
}
```

### Team オブジェクト

```js
{
  id,          // 0〜11
  name, short, league, emoji, city, color,
  budget,      // 現在予算
  popularity,  // 人気度 (0〜100)

  players,     // 一軍選手配列（最大 MAX_ROSTER=28）
  farm,        // 二軍選手配列（最大 MAX_FARM=30）
  lineup,      // 打線：打者IDの配列（9名）
  rotation,    // ローテ：投手IDの配列（最大6名）
  rotIdx,      // 現在ローテインデックス
  pitchingPattern, // 継投パターン: { closerId, setupId, middleOrder[] } — 未設定時はスコアベース自動選択

  wins, losses, draws,
  rf, ra,      // 総得点・総失点

  coaches,     // [{ type, typeName, emoji, name, grade, label, salary, bonus }]
  scoutMissions, // [{ id, name, weeksLeft, qMin, qMax, cost, foreign }]
  scoutResults,  // スカウト発掘済み選手配列

  stadiumLevel,       // 球場レベル (0〜3)。Lv が上がるとチケット収入倍率UP
  revenueThisSeason,  // シーズン累積収益。試合ごとに加算、年度末にリセット

  history,     // OB名簿: [{ player, exitYear, exitReason, tenure }]
}
```

### GameState オブジェクト（試合中）

```js
{
  inning,           // 1〜12
  isTop,            // boolean（表=CPU攻撃、裏=自チーム攻撃）
  score: { my, opp },
  outs,             // 0〜2
  bases: [1B, 2B, 3B], // null or 選手ID

  myLineup, opLineup,  // 出場打者配列
  myBatIdx, opBatIdx,  // 現在打席インデックス

  myPitcher, opPitcher,
  myPitchCount, opPitchCount,

  myBullpen, myBench,
  usedBullpen, usedPH, usedPR,

  momentum,         // 1〜100
  stopped,          // boolean（戦術停止中）
  stopReason, stopData,

  log,              // 打席ログ配列
  inningSummary,    // イニング別得点サマリー

  gameOver,
  teamMorale, stadium, leagueEnv,
  myInningRuns, opInningRuns,
}
```

### News / Mail オブジェクト

```js
{
  id, timestamp,
  type,      // "game" | "interview" | "season" | "trade"
  headline, source, dateLabel, body,

  // interview 型のみ
  question,
  options: [{ text, popMod, moraleMod, label }],

  // トレードオファー（メールボックス）
  from,      // 申し出チーム名
  offer: { from, want: [players], offer: [players], cash },
}
```

---

## 6. セーブ・ロード

| キー | 内容 |
|------|------|
| `baseball_manager_v1` | ゲーム全状態（JSON） |
| `baseball_manager_v1_meta` | クイック表示用メタデータ |

#### 保存内容

- 全12チームの完全データ（選手・成績・コーチ・予算・スカウト等）
- `myId`（プレイヤーチームID）、`year`、`gameDay`
- FA プール、ドラフト結果
- ニュース・メールボックス履歴
- プレーオフ構造

#### セーブのタイミング

- 手動セーブボタン押下
- ハブ画面遷移時に自動セーブ

---

## 7. ゲームバランス定数

| 定数名 | 値 | 説明 |
|--------|----|------|
| `SEASON_GAMES` | 143 | 1シーズンの試合数 |
| `BATCH` | 5 | 一括シムの試合数 |
| `MAX_ROSTER` | 28 | 一軍出場選手登録上限 |
| `MAX_FARM` | 30 | 二軍ロスター上限 |
| `MAX_SHIHAKA_TOTAL` | 70 | 支配下登録選手の球団総数上限（一軍+二軍合計、NPB協約準拠） |
| `MAX_外国人_一軍` | 4 | 一軍外国人枠上限 |
| `INJURY_AUTO_DEMOTE_DAYS` | 10 | この日数を超える怪我は自動二軍降格（≤10日は確認ダイアログ） |
| `ACTIVE_ROSTER_FA_DAYS_PER_YEAR` | 120 | FA年数1年分の基準一軍在籍日数（NPB145日/181日ルール準拠の換算値） |
| `FOREIGN_EXEMPTION_DAYS` | 960 | 外国人選手が外国人枠から免除される累積一軍在籍日数（= 8 × 120、NPB協約第82条準拠） |
| `ACCEPT_THRESHOLD` | 55 | 契約成立に必要なオファースコア |
| `PITCH_NORM` | 120 | `calcFatigue` 正規化分母（スタミナ50基準の球数スケール） |
| `PITCH_HARD_CAP` | 130 | 投球数の絶対上限（疲弊度に関わらず強制交代） |
| `FATIGUE_WARNING` | 83 | 疲弊度警告閾値（スタミナ50/コンディション100 時 ≈ 100球相当） |
| `FATIGUE_LIMIT` | 100 | 疲弊度強制交代閾値（スタミナ50/コンディション100 時 ≈ 120球相当） |
| `DRAFT_ROUNDS` | 6 | ドラフトラウンド数 |
| `DRAFT_POOL_SIZE` | 80 | ドラフト候補者数 |
| `MIN_SALARY_SHIHAKA` | 4,200,000 | 支配下選手最低年俸（420万円 / NPB協約 第89条） |
| `MIN_SALARY_IKUSEI` | 2,400,000 | 育成選手最低年俸（240万円 / NPB協約） |

---

## 8. セイバーメトリクス計算式

### 使用定数

| 定数 | 値 | 意味 |
|------|----|------|
| `LG_WOBA` | 0.315 | リーグ平均 wOBA |
| `WOBA_SCALE` | 1.15 | wOBA スケーリング係数 |
| `FIP_C` | 3.20 | FIP 定数 |

### 打者指標

| 指標 | 計算式 |
|------|--------|
| AVG | H / AB |
| OBP | (H + BB + HBP) / (AB + BB + HBP + SF) |
| SLG | (H - D - T - HR + 2*D + 3*T + 4*HR) / AB |
| OPS | OBP + SLG |
| ISO | SLG - AVG |
| BABIP | (H - HR) / (AB - K - HR + SF) |
| wOBA | 独自ウェイトによる加重出塁率 |
| wRC+ | ((wOBA - LG_WOBA) / WOBA_SCALE + 1) × 100 |
| WAR | ((wOBA - LG_WOBA) / WOBA_SCALE) × PA / 10 |

### 投手指標

| 指標 | 計算式 |
|------|--------|
| ERA | ER × 9 / IP |
| WHIP | (BB + H) / IP |
| FIP | (13×HR + 3×BB - 2×K) / IP + FIP_C |
| xFIP | (13×推定HR + 3×BB - 2×K) / IP + FIP_C ※推定HR = BIP × 0.030 |
| WAR | (FIP_C - FIP) × IP / 9 × 0.3 |

---

## 9. 賞・記録・殿堂

### シーズン表彰

| 賞 | 選出基準 |
|----|----------|
| **MVP（セ）** | セ・リーグ打者の WAR×0.6 + OPS×18 + RBI×0.04 + チームボーナス が最大の選手 |
| **MVP（パ）** | パ・リーグ打者の同計算式 |
| **沢村賞** | FIP 最小の投手（130 IP 以上・ERA ≤ 3.50・10 勝以上） |
| **新人王** | WAR 最大の若手（27歳以下・通算打席<60 または通算投球回<60） |
| **ベストナイン（セ）** | セ・リーグのポジションごとに WAR 最大の選手 |
| **ベストナイン（パ）** | パ・リーグのポジションごとに WAR 最大の選手 |

### 個人タイトル（`calcTitles`）

セ・リーグ / パ・リーグそれぞれで以下8タイトルを選出し `standingsSnap.awards.titles` に保存:

| タイトル | 選出基準 |
|---------|---------|
| 首位打者（avg） | 打率最高（規定打席 PA ≥ 400） |
| 本塁打王（hr） | 本塁打最多 |
| 打点王（rbi） | 打点最多 |
| 盗塁王（sb） | 盗塁最多 |
| 最優秀防御率（era） | ERA 最低（規定投球回 IP ≥ 130） |
| 最多勝（win） | 勝利数最多 |
| 最多奪三振（so） | 奪三振最多 |
| 最多セーブ（sv） | セーブ最多 |

### 殿堂入り基準

| 条件 | 閾値 |
|------|------|
| 通算本塁打 | 200 本以上 |
| 通算投手勝利 | 100 勝以上 |
| 通算打席 | 3,000 PA 以上 |

いずれか 1 つを満たした引退選手が殿堂入り候補となる。

---

## 10. 球場情報

| 球場名 | チーム | 左翼 | 中堅 | 右翼 | HR 補正 | タイプ |
|--------|--------|------|------|------|---------|--------|
| 神宮球場 | ヤクルト | 97m | 120m | 97m | 1.15 | 屋外 |
| 横浜スタジアム | DeNA | 94m | 117m | 94m | 1.20 | 屋外 |
| マツダスタジアム | 広島 | 101m | 122m | 100m | 0.95 | 屋外 |
| 甲子園 | 阪神 | 95m | 118m | 95m | 0.90 | 屋外 |
| 東京ドーム | 巨人 | 100m | 122m | 100m | 1.05 | ドーム |
| バンテリンドーム | 中日 | 100m | 122m | 100m | 0.85 | ドーム |
| みずほペイペイドーム | ソフトバンク | 100m | 122m | 100m | 1.00 | ドーム |
| 楽天モバイルパーク | 楽天 | 100m | 122m | 100m | 1.00 | 屋外 |
| ベルーナドーム | 西武 | 98m | 118m | 98m | 1.05 | ドーム |
| ZOZOマリンスタジアム | ロッテ | 99m | 122m | 99m | 0.95 | 屋外 |
| エスコンフィールド | 日本ハム | 96m | 120m | 96m | 1.10 | ドーム |
| 京セラドーム大阪 | オリックス | 100m | 122m | 100m | 0.90 | ドーム |

HR 補正: 1.0 より大きいと HR になりやすい、小さいと HR が二塁打に変換される確率が上がる。

---

## 11. チーム一覧

| ID | チーム名 | 略称 | リーグ | 初期予算 | 本拠地 |
|----|----------|------|--------|---------|--------|
| 0 | 東京ヤクルトスワローズ | ヤクルト | セ | 500,000 | 東京 |
| 1 | 横浜DeNAベイスターズ | DeNA | セ | 480,000 | 横浜 |
| 2 | 広島東洋カープ | 広島 | セ | 350,000 | 広島 |
| 3 | 阪神タイガース | 阪神 | セ | 600,000 | 大阪 |
| 4 | 読売ジャイアンツ | 巨人 | セ | 650,000 | 東京 |
| 5 | 中日ドラゴンズ | 中日 | セ | 420,000 | 名古屋 |
| 6 | 福岡ソフトバンクホークス | ソフトバンク | パ | 580,000 | 福岡 |
| 7 | 東北楽天ゴールデンイーグルス | 楽天 | パ | 360,000 | 仙台 |
| 8 | 埼玉西武ライオンズ | 西武 | パ | 400,000 | 所沢 |
| 9 | 千葉ロッテマリーンズ | ロッテ | パ | 370,000 | 千葉 |
| 10 | 北海道日本ハムファイターズ | 日本ハム | パ | 450,000 | 札幌 |
| 11 | オリックス・バファローズ | オリックス | パ | 460,000 | 大阪 |

---

## 12. 変更履歴

> 変更履歴は [`CHANGELOG.md`](../CHANGELOG.md) に分離しました。

---

## 13. 計画中システム（Tier 7〜12）

> 以下はすべて **未実装** の計画段階の仕様。実装完了後に各節を正式に移動・詳細化する。
> 優先度: 🔴最優先 / 🟡高 / 🟢中

---

### 13.1 複数年フランチャイズ（Tier 7）— ✅ 実装済み（c1c404b）

> §3・§4.11・§4.12・§5・§9 に詳細を移動。

**実装済み機能:**
- `handleNextYear` 完全実装（予算リセット・選手加齢・ローテ引き継ぎ）
- `NewSeasonScreen` — 引退サマリー・ドラフト結果・ブレイクアウト選手の開幕前画面
- `calcRetireWill` 精緻化（§4.11 参照）
- `PITCHER_DECLINE_WEIGHTS` / 晩年ブレイクスルー / `peakAbilities`（§4.12 参照）
- RecordsTab 5サブタブ再編 / `calcTitles` / セ/パ別 MVP（§9 参照）
- `careerLog` コンパクト25フィールド形式（§5 参照）
- CPU チーム引退選手の `t.history[]` アーカイブ修正

---

### 13.2 ファームシステム拡張（Tier 8）🟡

#### ㉔ 二軍簡易シミュレーション

**リーグ分類（NPBリーグ名準拠・ゲーム内簡略化）**
- セ球団（6チーム）→ イースタン・リーグ
- パ球団（6チーム）→ ウエスタン・リーグ
- ※ NPB実態の7+5構成はゲームのセ/パ前提設計と整合しないため採用しない

**シミュレーション粒度（確率的シム）**
- 新規 `farmSimGame(teamA, teamB)` で処理（`quickSimGame` のフルイニング制は不使用）
- 打者/投手の平均能力値から期待得点を計算 → W/L と基本スタットを乱数生成
- 打席単位の解決なし。1試合を数行の計算で完結させる（処理負荷を最小化）
- 二軍選手はprocedural生成のまま（リアル選手データの取り込み不要）

**成績管理**
- 二軍成績は `player.stats2`（PA/H/HR/IP/ER/K の6統計）に蓄積。一軍 `stats` とは別フィールド
- 二軍タイトル（HR王・最多勝・首位打者）をリーグ別に年度末に表彰

---

#### ㉕ 育成→支配下昇格とFA管理

**entryType フィールドの新規追加**

`entryAge` 数値による推測（`≤19` → 高卒）を廃止し、明示的な `entryType` フィールドで入団区分を管理する。

```javascript
entryType: "高卒" | "大卒" | "社会人" | "外国人"
```

| entryType | entryAge | FA国内閾値 | 特徴 |
|---|---|---|---|
| `"高卒"` | 18 | 960日（8年×120） | 長期育成型。Tier 10 ㉝ で成長カーブ差を実装予定 |
| `"大卒"` | 22 | 840日（7年×120） | 標準 |
| `"社会人"` | 24–25 | 840日 | 即戦力型 |
| `"外国人"` | 22–28 | 960日 → FA取得で外国人枠免除 | 詳細は §4.5 参照 |

- `getFaThreshold()` を `entryType` ベースに変更（`contract.js` と `PlayerModal.jsx` の不整合を解消）
- ドラフト候補・生成選手に `entryType` を付与（`draft.js` / `player.js`）
- Draft UI に入団区分バッジを表示（詳細な体験は Tier 10 ㉝ に委ねる）

**FA権判定の累積日数方式**

> `serviceYears` 年単位カウントを廃止し、`daysOnActiveRoster`（累積日数）でFA権を判定する。
> NPB規則: 145日/年（5ヶ月）の一軍登録で1年カウント。ゲーム内換算: **120日/年**

```javascript
// contract.js getF aThreshold（変更後）
export function getFaThreshold(p) {
  const base = (p.entryType === '高卒' || p.entryType === '外国人') ? 8 : 7;
  return {
    domestic: base * ACTIVE_ROSTER_FA_DAYS_PER_YEAR,   // 高卒・外国人=960 / 大卒・社会人=840
    overseas: 9 * ACTIVE_ROSTER_FA_DAYS_PER_YEAR,      // 全員=1080
  };
}
```

- `daysOnActiveRoster` は一軍（`players` 配列）にいる gameDay ごとに +1
- 累積・リセットなし（FA取得後も記録を保持）
- `serviceYears` はUI表示用に残す: `Math.floor(p.daysOnActiveRoster / 120)` で換算表示

**昇格フロー改善**
- `convertIkusei()`（育成→支配下変換）後、続けて「一軍昇格する」ボタンを表示する1フロー化
- 選手カードに「FA資格: あとX日（Y年相当）」を表示
- 昇格判断材料: 「今年昇格するとFA資格がN年に早まります」を明示
- 外国人選手には「外国人枠免除まであとX日」を追加表示

---

#### ㉖ 怪我降格・登録抹消10日ルール・支配下70人枠

> **NPB準拠**: NPBに故障者リスト（MLB式IL）の概念はない。怪我した選手は「出場選手登録抹消＋二軍降格」が実態。

**怪我時の挙動（`injuryDaysLeft` で分岐）**

| `injuryDaysLeft` | 挙動 |
|---|---|
| **> `INJURY_AUTO_DEMOTE_DAYS`（10日）** | 自動で `players → farm` 移動 + `registrationCooldownDays = 10`（手動降格と同一ロジック） |
| **≤ 10日（短期）** | 確認ダイアログ「N日の怪我です。二軍降格しますか？」→ Yes なら降格+クールダウン |
| **手動降格（怪我なし）** | `registrationCooldownDays = 10` |

- farm 内でもリハビリ進行（`tickInjuries` を `t.farm` にも適用）
- 回復後（`injuryDaysLeft = 0` かつ `registrationCooldownDays = 0`）: 枠の有無に関わらず「X選手が回復しました。一軍昇格できます」通知を表示

**ロスター空き通知**
- `players.length < MAX_ROSTER`（1枠でも空き）かつ昇格可能なfarm選手がいる場合: 能力値上位の候補を自動推薦（完全自動昇格はしない）

**支配下70人枠**
- 一軍 + 二軍の支配下選手合計 ≤ `MAX_SHIHAKA_TOTAL = 70`
- 育成選手は別枠（上限外）
- 70名到達時は補強・ドラフト指名不可。ロスタータブに「支配下 XX / 70」を常時表示

---

#### ㉗ 選手育成目標設定 ✅ 実装済み

`player.devGoal` フィールドで育成目標を管理。`resolveTrainingFocusFromGoal(player)` が devGoal → trainingFocus を自動変換する。

| devGoal（野手） | trainingFocus |
|---|---|
| `"top_team"` / `"promotion"` | 最弱能力（contact/power/eye/speed/arm/defense から自動算出） |
| `"batting"` | contact と power の低い方 |
| `"defense"` | defense |
| `"speed"` | speed |

| devGoal（投手） | trainingFocus |
|---|---|
| `"rotation"` / `"promotion"` | 最弱能力（velocity/control/stamina/breaking/variety/sharpness から自動算出） |
| `"velocity"` | velocity |
| `"control"` | control |
| `"breaking"` | breaking |
| `"stamina"` | stamina |

- UI: RosterTab の二軍タブに「育成目標」列を追加。野手/投手で選択肢が異なるセレクタを表示
- `setDevGoal(pid, goal)` で設定と同時に trainingFocus を自動更新

---

### 13.3 フロント・メディア・選手関係（Tier 9）🟡

#### フロント目標・信頼度
```javascript
// Team オブジェクトに追加するフィールド
{
  ownerGoal: "cs" | "pennant" | "champion" | "rebuild",  // 今季目標
  ownerTrust: 50,   // 0-100、達成度で変動
}
```
- 信頼度 < 30: 翌年予算 -20%
- 信頼度 > 80: 翌年予算 +15%

#### 選手個別コミュニケーション
- 会話タイプ: `praise` / `playing_time` / `contract` / `trade_rumor`
- 結果: `player.morale += delta`（-20 〜 +20）
- 月1回まで同一選手と会話可能

#### グローバル選手詳細モーダル（→ §15.1 参照）

---

### 13.4 NPB固有システム（Tier 10）🟡

#### ポスティングシステム
- 発動条件: 球団が `postingApproved=true` に設定
- MLB入札シミュレーション: `baseValue × rand(0.8, 1.5)` で入札額決定
- 選手の `overseas` 値が高いほど応じやすい（閾値: overseas ≥ 60）
- 移籍金: 落札額の20%が球団収入に

#### ドラフト区分拡張
```javascript
// DraftProspect に追加するフィールド
{
  prospectType: "high_school" | "college" | "independent" | "social",
  entryAge: 18 | 22 | 24 | 25,
  readinessScore: 0-100  // 即戦力度。social=高, high_school=低
}
```

#### オールスターゲーム
- ゲームDay 70〜75 の月曜〜水曜（3日間）を休止日に設定
- 出場選手: 各リーグ上位 wOBA / FIP から自動選出（2名 + 監督推薦3名）
- 試合結果: 簡易シミュ（スターター3回、その後リリーフ）
- 記録: `player.allStarSelections++`（当該シーズンの選出全58名）
- 発火タイミング: `calcAllStarTriggerDay(schedule, allStarSkipDates)` が返す gameDay 到達時（allStarSkipDates の最初の日直前の最終公式戦）。通常進行では専用 `allstar` 画面を表示、バッチシム中はニュース追記のみで1回実行
- 選出ルール（各リーグ29名）:
  - ファン投票: 野手8枠（各守備位置wOBA1位）＋投手5枠（先発3名FIP順・中継ぎ1名HLD順・抑え1名SV順）
  - パ・リーグのみDH1枠を追加（wOBA順）
  - 監督推薦: セ=投手9+野手7、パ=投手9+野手6（既選出除外。投手FIP順/野手wOBA順）
- 重複防止: `allStarDone` フラグで同シーズン多重実行を防止し、`handleNextYear` でリセット

#### 外国人選手獲得
- 開幕時に `generateForeignFaPool(count)` を実行し、`FOREIGN_FA_COUNT_MIN〜MAX`（5〜10）名の外国人FA選手を市場へ追加
- 生成仕様: `isForeign=true` / `entryType="外国人"`、能力レンジは即戦力帯（q=62〜82）、年齢22〜32、年俸8,000〜25,000（万円）
- 名前・出身地は `FOREIGN_PLAYER_NAMES` / `FOREIGN_NATIONALITIES` から抽選
- FAタブに「外国人FA市場」を分離表示し、`FOREIGN_DEADLINE_DAY=100` 超過後は交渉不可（7月末相当）
- 代理人交渉は2ラウンド制:
  - Round 1（年俸）: 代理人要求 `salary × FOREIGN_AGENT_SALARY_RATIO(1.2)`。基準年俸交渉は `FOREIGN_AGENT_ACCEPT_PROB(0.55)` で成否判定
  - Round 2（年数）: `age<=30` は2年、`age>30` は1年の最低年数要求
- 契約成立時は外国人枠を「一軍登録上限」として扱い、上限4名超過なら獲得自体は許可し二軍（farm）配置
- CPU の `processCpuFaBids` でも外国人獲得を許可し、同様に一軍枠超過時は farm 配置

---

### 13.5 グローバル選手詳細モーダル ✅ 実装済み（d7885d0）

> **どのタブ・どの画面からでも** 選手名クリックで選手詳細を表示する。

#### コンポーネント仕様
- **ファイル:** `src/components/PlayerModal.jsx`
- **State:** `App.jsx` に `selectedPlayerId` (string|null) を追加
- **開き方:** `handlePlayerClick(id)` を `onPlayerClick` props として各タブに配布
- **閉じ方:** ESCキー / モーダル背景クリック / ×ボタン

#### モーダル内タブ構成
| タブ | 表示内容 |
|------|---------|
| 基本情報 | 名前・年齢・ポジション・球団・コンディション・モラル・利き腕 |
| 能力値 | 全能力値（数値 + A/B/C グレード表示）。スカウト未開示は `?` 表示 |
| 今季成績 | 打者: AVG/OBP/SLG/OPS/HR/RBI/WAR。投手: ERA/WHIP/W-L/SV/FIP |
| 契約情報 | 年俸・残年数・FA資格年・ポスティング可否・育成/支配下区分 |
| キャリア履歴 | `player.careerLog[]` の年度別成績推移グラフ |

#### PlayerLink コンポーネント
既存の選手名テキストを統一的に `<PlayerLink>` に置き換える。

```jsx
// src/components/ui.jsx に追加
export function PlayerLink({ player, onOpen }) {
  return (
    <span
      className="player-link"
      onClick={() => onOpen(player.id)}
      style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
    >
      {player.name}
    </span>
  );
}
```

**置き換え対象ファイル:** `Tabs.jsx`（全タブ内の選手名）, `TacticalGame.jsx`（ラインナップ表示）, `Draft.jsx`（指名リスト）

---

## 14. 保守性・技術的負債

> エラーが起きづらく、長期的に保守しやすいコードベースを維持するための施策。

### 14.1 IndexedDB 移行（P1 / Tier 8 着手前）

**背景:** localStorage の上限は約5MB。複数年の選手履歴・シーズン記録が蓄積すると超過する。

> **現状（2026-03-25）**: careerLog をコンパクト25フィールド形式に変更したことで、25年以上のプレイでも5MB上限に余裕があることを確認。優先度を P0 → P1 に引き下げ、Tier 8 着手前に再評価する。

**移行方針:**
```javascript
// saveload.js を以下の構造に差し替え
await set('save_meta',    { year, gameDay, myId })   // 軽量メタ情報
await set('save_teams',   teams)                      // チームデータ
await set('save_history', seasonHistory)              // 年度別履歴（分離）
```

**バージョニング:** `SAVE_VERSION` 定数を管理し、旧バージョンのマイグレーション関数を用意する。

**推奨ライブラリ:** `idb-keyval`（軽量、1KB、IndexedDB の薄いラッパー）

### 14.2 React Error Boundary ✅ 実装済み（fb47d0f）

```jsx
// src/components/ErrorBoundary.jsx
// App.jsx で HubScreen / TacticalGame 等をラップ
// エラー発生時にセーブせず「前の画面に戻る」ボタンを表示
```

### 14.2.5 セーブデータバリデーション ✅ 完了（T5）

- `validateAndMigrateSave()` / `migratePlayer()` を `saveload.js` に実装
- ロード時に選手・チームの欠落フィールドにデフォルト値を補完（旧セーブとの後方互換）
- ローリングバックアップ2世代（`bk1` / `bk2`）。破損時に自動フォールバック

### 14.3 ファイル分割 ✅ 完了

| ファイル | 結果 |
|---------|------|
| App.jsx（旧 63KB） | `src/hooks/useGameState.js`（258行）/ `useSeasonFlow.js`（402行）/ `useOffseason.js`（259行）の3フック + App.jsx 198行の render coordinator に縮小 |
| Tabs.jsx（旧 81KB） | `src/components/tabs/` 以下に12コンポーネント分割。Tabs.jsx は13行のバレルファイルに縮小 |

### 14.4 テスト（P2）🔶 部分実装

**ツール:** Vitest（既存 Vite 環境と統合、設定最小限）

**実装済み（`src/engine/__tests__/`）:** `contract.test.js` / `simulation.test.js` / `utils.test.js`

**残りの優先テスト対象:**
```
simulation.js:   resolveAtBat(), calcEffectiveFatigue()
contract.js:     calcOfferScore(), FA資格判定ロジック
scheduleGen.js:  143試合の整合性（重複・漏れ）
player.js:       加齢・能力変化（Tier 7 実装後）
awards.js:       MVP/沢村賞の選出ロジック
```

---

## 15. UI改善計画

> 既存機能の使いやすさ向上。OOTP/FM レベルの情報密度を快適に扱えるUIを目指す。

### 15.1 グローバル選手詳細モーダル ✅ 実装済み（d7885d0）

→ §13.5 参照。

### 15.2 ダッシュボード画面（U2）✅ 実装済み（345c0f3）

ハブ画面のランディングページ。`src/components/DashboardTab.jsx` を新規作成し、デフォルトタブ（`"dashboard"`）として表示。

#### 表示ブロック

| ブロック | 内容 |
|---------|------|
| チーム概況 | 順位・GB・勝率・得失差（±表示）・勝敗・予算 |
| 次の試合 | 日付・対戦相手・ホーム/アウェイ・交流戦フラグ |
| 直近5試合 | W/L + スコアバッジ（ホバーで相手名と詳細スコア） |
| 要対応アクション | 枠超過/契約満了/トレード/未読メール/負傷/FA → クリックで該当タブ遷移 |

#### 実装詳細

**新規 state（App.jsx）:**
```js
const [recentResults, setRecentResults] = useState([]);
// 型: {won, drew, oppName, myScore, oppScore, gameNo}[]
```

**更新箇所:** `handleAutoSimEnd`・`handleTacticalGameEnd`・`runBatchGames` の計3パス

**DashboardTab props:**
`myTeam, teams, schedule, gameDay, year, recentResults, mailbox, faPool, onTabSwitch`

**デフォルトタブ変更:** `useState("roster")` → `useState("dashboard")` / `handleSelect`・`handleLoad`・リセット処理も統一

### 15.3 通知バッジシステム（U3）✅ 実装済み（345c0f3、U2 と同時）

| タブ | 色 | 条件 |
|------|----|------|
| `roster` | 🔴 赤 | ロースター枠超過（`players.length > MAX_ROSTER`） |
| `contract` | 🟡 黄 | 契約満了選手あり（`contractYearsLeft <= 1`、育成除く） |
| `trade` | 🟠 橙 | 未読トレードオファーあり |
| `mailbox` | 🟡/🟠 | 未読メールあり（トレードあり→橙、他→黄） |
| `fa` | ⚪ グレー | FA市場に選手あり |

**実装:** `tabBadges` useMemo を App.jsx に追加。タブ配列レンダリング時に統一的にバッジ表示。旧: mailbox 専用ハードコードバッジを tabBadges に統合して削除。

### 15.4 選手能力グレード表示 ✅ 実装済み（c1c404b）

`PlayerModal.jsx` の `abilityGrade(v)` + `AbilityBar` コンポーネントで能力値を S〜E グレードに変換して色付きバッジ表示。

| グレード | 能力値範囲 | バッジ色 |
|---------|----------|----|
| S | 90〜100 | 紫（#e879f9） |
| A | 80〜89 | 緑（#34d399） |
| B | 65〜79 | 黄（#f5c842） |
| C | 50〜64 | グレー（#94a3b8） |
| D | 35〜49 | オレンジ（#f97316） |
| E | 0〜34 | 赤（#f87171） |

### 15.5 選手比較ツール

- 2〜4名を横並びで比較
- 各能力値の差分をカラーハイライト（高い方が緑・同等が白・低い方が赤）
- トレード・FA判断・スターター選定に活用

### 15.6 日程タブ UI 改善 ✅ 実装済み（2026-04-02）

#### 週グリッドカレンダー
- 月曜始まり 7列グリッドで月別に表示
- ホーム（緑）/ ビジター（青）/ 交流戦（紫）でセルを色分け
- 今日の試合セルはゴールドボーダーでハイライト

#### 過去試合スコア表示・結果モーダル
- 消化済み試合のセルに ○/●/△ + スコアバッジを表示
- スコアをクリックすると結果サマリーモーダルをオーバーレイ表示（日付・対戦相手・スコア・勝敗）
- `gameResultsMap`（`{[gameNo]: result}`）を `useGameState` に追加し、シングル/バッチ/タクティカルの3経路で蓄積

#### シーズン進捗バー
- タブ上部に X/143 試合消化・勝敗・勝率を表示するプログレスバーを追加

### 15.7 その他 UI 改善（中長期）

| 機能 | 概要 |
|------|------|
| ラインナップ D&D | @dnd-kit/core で打順をドラッグ&ドロップ変更 |
| バッチシム結果サマリー | ハイライトメッセージ・順位変動・負傷情報を5試合分まとめて表示 |
| ダーク/ライトモード | CSS変数ベースで切り替え。localStorage にテーマ設定を保存 |
| ペナントレース推移グラフ | 全12球団の順位変動折れ線グラフ（gameDay × 順位） |
