# Baseball Manager 2025 — 仕様書

> 最終更新: 2026-03-25（T2・U1・F2/F3/F4 実装記録。U2+U3 計画仕様追加）

> **運用ルール**: コードに改修を加えた際は、仕様への影響を確認し、影響がある場合のみ本文を更新する。
> 変更の有無にかかわらず `変更履歴` に日付・内容を追記し、**過去の記録は削除しない**。

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
12. [変更履歴](#12-変更履歴)
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
| **状態管理** | React useState / useCallback / useMemo（Context なし）→ **useReducer 移行計画中** |
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
└── src/
    ├── App.jsx              # メイン状態管理・画面ルーティング（分割計画中 → state/screens/）
    ├── main.jsx             # React エントリポイント
    ├── constants.js         # ゲームバランス定数・チーム定義・テンプレート文字列
    ├── utils.js             # 乱数(rng)・clamp・uid・名前生成 など汎用関数
    ├── styles.css           # グローバルスタイル
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
    │   └── scheduleGen.js   # NPBシーズン日程生成エンジン（143日分事前生成）
    ├── data/
    │   ├── npb2025.js       # 実NPB 2025年ロスターデータ（オプション）
    │   └── scheduleParams.js# 年度別シーズンパラメータ（開幕日・交流戦・甲子園制約等）
    └── components/
        ├── TacticalGame.jsx # 戦術モード（イニング制御）UI
        ├── BatchResult.jsx  # 5試合一括シム結果表示
        ├── Screens.jsx      # モード選択・試合結果・プレーオフ等の画面
        ├── Tabs.jsx         # ハブ画面のタブ群（ロスター・ニュース・トレード等）（分割計画中 → tabs/）
        ├── Draft.jsx        # ドラフト画面（抽選→指名→確認）
        ├── PlayoffScreen.jsx# プレーオフシリーズ管理
        ├── RetireModal.jsx  # 引退処理モーダル
        ├── PlayerModal.jsx  # グローバル選手詳細モーダル（どのタブからでも開ける）✅ 実装済み
        ├── DashboardTab.jsx # 【計画中】ハブ用ダッシュボードタブ（U2 対応）
        └── ui.jsx           # 小型共通コンポーネント（OV・CondBadge・HandBadge 等）
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
    引退処理 → 選手育成 → ウェーバー →  FA市場 → ドラフト → 新シーズン
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
| `earlydecline` | 30〜33歳 | 微衰退（-1〜+4） |
| `decline` | 34歳〜 | 衰退（-9〜-5） |

#### その他フィールド

| フィールド | 型 | 意味 |
|------------|-----|------|
| `serviceYears` | number | 支配下登録年数（FA資格カウント用。育成期間はカウントしない） |
| `entryAge` | number | 入団時年齢（高卒≤19 / 大卒≥22 で FA 閾値を決定） |
| `ikuseiYears` | number | 育成契約年数（最大3年。超過で自動解雇） |
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

| 入団区分 | 国内FA取得 | 海外FA取得 |
|----------|-----------|-----------|
| 高卒（`entryAge ≤ 19`） | 8年 | 9年 |
| 大卒・社会人（`entryAge ≥ 22`） | 7年 | 9年 |
| `entryAge` 未設定 | 大卒扱い（7年） | 9年 |

- `overseas ≥ 70` の選手: 国内FA権があっても行使せず **海外FA権取得まで待機**
- `overseas ≥ 70` かつ海外FA資格あり: NPB離脱

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

- 試合ごとに **5%** の確率で CPU がオファーを送ってくる
- チームニーズ（先発不足・球威不足・ミート不足・若手不足）を分析してターゲットを選出
- 価値差が 10 以上の場合、差額を **現金** で補填

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

- 怪我中の選手は試合ロスターから自動除外
- 毎試合 `tickInjuries` で残日数が 1 減る
- `recovery` 能力値が高いほど条件面での事前補正あり

---

### 4.11 引退システム

#### 引退意欲スコア（0〜100）

| 条件 | 加算値 |
|------|--------|
| 40歳以上 | +50 |
| 38〜39歳 | +30 |
| 36〜37歳 | +15 |
| 35歳 | +5 |
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
  growthPhase,   // "growth" | "peak" | "earlydecline" | "decline"
  morale,        // モラル (0〜100)
  trust,         // 信頼度 (0〜100)
  condition,     // コンディション (60〜100)
  trainingFocus, // トレーニング集中対象能力名 (nullable)
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

  // 成績（シーズン累積）
  stats: {
    PA, AB, H, D, T, HR, RBI, BB, K, HBP, SB, CS, R, SF,
    evSum, evN, laSum, laN,           // 打球速度・角度の累積（平均算出用）
    IP, ER, BBp, HBPp, Kp, HRp, Hp, BF, W, L, SV, HLD, QS, BS   // 投手
  },
  playoffStats,  // 同上・プレーオフ分
  careerLog,     // [{ year, stats, playoffStats }, ...]

  injury,        // 怪我名称（文字列）または null
  injuryDaysLeft,// 残怪我日数

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
| `MAX_ROSTER` | 28 | 一軍ロスター上限 |
| `MAX_FARM` | 30 | 二軍ロスター上限 |
| `MAX_外国人_一軍` | 4 | 一軍外国人枠上限 |
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
| **MVP** | WAR×0.6 + OPS×18 + RBI×0.04 + チームボーナス が最大の打者 |
| **沢村賞** | FIP 最小の投手（130 IP 以上・ERA ≤ 3.50・10 勝以上） |
| **新人王** | WAR 最大の若手（27歳以下・通算打席<60 または通算投球回<60） |
| **ベストナイン** | ポジションごとに WAR 最大の選手 |

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

> 最新エントリが最上部。過去のエントリは削除しない。
> 仕様本文を変更した場合は「旧 → 新」を明記、内部バグ修正のみの場合は概要のみ記録。

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

## 13. 計画中システム（Tier 7〜12）

> 以下はすべて **未実装** の計画段階の仕様。実装完了後に各節を正式に移動・詳細化する。
> 優先度: 🔴最優先 / 🟡高 / 🟢中

---

### 13.1 複数年フランチャイズ（Tier 7）🔴

**概要:** 単年シーズンを超えた長期フランチャイズ経営の実現。OOTPの核心機能。

#### マルチシーズン継続
- `year` カウンタを年度をまたいで更新
- シーズン終了後に「次のシーズンへ」遷移
- 選手全員の `age++`, `serviceYears++`
- ローテーション・ラインナップを引き継ぎ（退団・引退選手は除去）

#### 選手加齢・引退
- 35歳以上: 毎年末に引退確率 = `(age - 34) × 0.15 + 乱数補正`
- careerPhase=decline の選手は確率上昇
- 引退選手は `awards.js` の殿堂入り判定を通過
- 殿堂入りならニュース通知・球団史に記録

#### 能力自然変化
```
growth期 (≤24):   各能力 ± rand(0, +3) × potentialFactor
peak期 (25-29):   各能力 ± rand(-1, +1)
earlydecline期 (30-33): 各能力 rand(-2, 0)
decline期 (34+):  各能力 rand(-3, -1)
```

#### 歴史データベース
```javascript
// seasonHistory[] の各要素に追加するフィールド
{
  year: 2025,
  champion: "阪神タイガース",
  standings: [...],          // 12球団の最終順位
  awards: { mvp, sawamura, rookie, bestNine },
  records: { teamHR, individualHR, wins, era },
  hallOfFame: [playerId, ...]
}
```

---

### 13.2 ファームシステム拡張（Tier 8）🟡

#### 二軍簡易シミュレーション
- 一軍シーズン進行に連動して二軍143試合を自動バッチ処理
- 使用する選手: `team.farm[]` + 一軍出場機会のない支配下選手
- 二軍成績は `player.stats2` に蓄積（別フィールドで一軍と分離）
- 二軍タイトル（HR王・最多勝・首位打者）を年度末に表彰

#### オプション制度
- `player.optionYears`: 支配下登録後3年間の降格可能回数（初期値3）
- 降格時: `optionYears--`。0になった選手を降格するにはウェーバー公示が必要
- UI: ロスタータブで「オプション残: N年」を表示

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
- 記録: `player.allStarSelections++`

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

### 14.1 IndexedDB 移行（P0 / Tier 7 着手前）

**背景:** localStorage の上限は約5MB。複数年の選手履歴・シーズン記録が蓄積すると超過する。

**移行方針:**
```javascript
// saveload.js を以下の構造に差し替え
await set('save_meta',    { year, gameDay, myId })   // 軽量メタ情報
await set('save_teams',   teams)                      // チームデータ
await set('save_history', seasonHistory)              // 年度別履歴（分離）
```

**バージョニング:** `SAVE_VERSION` 定数を管理し、旧バージョンのマイグレーション関数を用意する。

**推奨ライブラリ:** `idb-keyval`（軽量、1KB、IndexedDB の薄いラッパー）

### 14.2 React Error Boundary（P0）

```jsx
// src/components/ErrorBoundary.jsx
// App.jsx で HubScreen / TacticalGame 等をラップ
// エラー発生時にセーブせず「前の画面に戻る」ボタンを表示
```

### 14.3 ファイル分割計画（P1）

| 現状 | 目標 |
|------|------|
| App.jsx (63KB) | state/useGameState.js + state/useSeasonFlow.js + screens/HubScreen.jsx 等 |
| Tabs.jsx (81KB) | components/tabs/RosterTab.jsx, StatsTab.jsx, TradeTab.jsx ... |

### 14.4 テスト計画（P2）

**ツール:** Vitest（既存 Vite 環境と統合、設定最小限）

**優先テスト対象:**
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

### 15.2 ダッシュボード画面（U2）🔜 計画策定済み

ハブ画面のランディングページとして実装。`src/components/DashboardTab.jsx` を新規作成し、デフォルトタブ（`"dashboard"`）として表示する。

```
┌─────────────────────────────────────────┐
│  チーム概況: 2位 GB-1.5 .571  予算3200万  │
├─────────────────────────────────────────┤
│  次の試合: 4月15日 vs 巨人 (ホーム)       │
│  直近5試合: W3-1 L2-5 W4-2 L1-3 W7-2   │
├─────────────────────────────────────────┤
│  要対応アクション                         │
│  🔴 ロースター枠超過 +1人 → [ロースター]  │
│  🟡 契約満了 3人 → [契約]               │
│  🟠 トレードオファー 2件 → [メール]       │
└─────────────────────────────────────────┘
```

#### 実装方針（承認済み）

**新規 state（App.jsx）:**
```js
// 直近5試合の結果履歴（試合終了の全パスで更新）
const [recentResults, setRecentResults] = useState([]);
// 型: {won, drew, oppName, myScore, oppScore, gameNo}[]
```

**更新箇所:** `handleAutoSimEnd` / `handleTacticalGameEnd` / `runBatchGames`（setBatchResults の直後）の計3箇所

**DashboardTab props:**
`myTeam, teams, schedule, gameDay, year, recentResults, mailbox, faPool, onTabSwitch`

**順位計算:** `StandingsTab` と同ロジックで `teams.filter(t=>t.league===myTeam.league).sort(勝率,得失差)` を使用

### 15.3 通知バッジシステム（U3）🔜 計画策定済み（U2 と同時実装）

| タブ | 色 | 条件 |
|------|----|------|
| `roster` | 🔴 赤 | ロースター枠超過（`players.length > MAX_ROSTER`） |
| `contract` | 🟡 黄 | 契約満了選手あり（`contractYearsLeft <= 1`） |
| `trade` | 🟠 橙 | 未読トレードオファーあり |
| `mailbox` | 🟡/🟠 | 未読メールあり（トレードなら橙、他は黄） |
| `fa` | ⚪ グレー | FA市場に選手あり |

**実装方針:** `tabBadges` useMemo を App.jsx に追加し、タブ配列のレンダリング時に統一的に バッジ表示。既存の mailbox バッジ（行798）は tabBadges に統合して削除。

### 15.4 選手能力グレード表示

OOTP 方式の A〜E グレード変換（数値の直感的把握のため）:

| グレード | 能力値範囲 |
|---------|----------|
| S | 90〜100 |
| A | 75〜89 |
| B | 60〜74 |
| C | 45〜59 |
| D | 30〜44 |
| E | 0〜29 |

### 15.5 選手比較ツール

- 2〜4名を横並びで比較
- 各能力値の差分をカラーハイライト（高い方が緑・同等が白・低い方が赤）
- トレード・FA判断・スターター選定に活用

### 15.6 その他 UI 改善（中長期）

| 機能 | 概要 |
|------|------|
| ラインナップ D&D | @dnd-kit/core で打順をドラッグ&ドロップ変更 |
| バッチシム結果サマリー | ハイライトメッセージ・順位変動・負傷情報を5試合分まとめて表示 |
| ダーク/ライトモード | CSS変数ベースで切り替え。localStorage にテーマ設定を保存 |
| ペナントレース推移グラフ | 全12球団の順位変動折れ線グラフ（gameDay × 順位） |
