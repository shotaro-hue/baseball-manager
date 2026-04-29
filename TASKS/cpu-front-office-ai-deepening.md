# CPU球団フロントAI深化 実装仕様書

## 背景
ROADMAP「D. CPU球団フロントAIの深化」を実装し、CPU球団の補強判断を“順位依存”から“時間軸を持つ経営判断”へ進化させる。

目的は以下の3点。
- 買い手/売り手の判定精度を上げる
- 将来価値を織り込んだトレード意思決定を導入する
- 再建期に一貫した行動（売却→育成→勝負）を取る

---

## スコープ

### In Scope
1. **球団戦略ステートの導入**
   - `contend`（優勝狙い）
   - `retool`（短期再編）
   - `rebuild`（中長期再建）
   - `neutral`（様子見）

2. **戦略判定ロジック（毎月更新）**
   - 勝率・ゲーム差・得失点差
   - 25歳以下/30歳以上の比率
   - 主力の契約残年数（1年以内の人数）
   - チームWAR（既存メトリクスに準ずる簡易推定でも可）

3. **トレード価値モデルの拡張**
   - 現在価値（今年〜来年の貢献）
   - 将来価値（若手のポテンシャル、年齢減衰）
   - 契約価値（年俸/残年数に応じた価値調整）

4. **再建期行動ルール**
   - 30歳以上かつ契約残1年の選手を放出候補に加点
   - 26歳以下で将来値の高い選手の獲得優先
   - 高年俸・低パフォーマンス契約の整理優先

5. **ログ/可視化最小追加**
   - ニュースまたはトレードログに「CPU方針変更」メッセージを追加
   - 例: `広島: neutral → rebuild（高齢化率・勝率低下のため）`

6. **テスト追加**
   - 戦略判定ユニットテスト
   - トレード評価の回帰テスト
   - 再建期の獲得傾向テスト（若手偏重になること）

### Out of Scope
- UIでの詳細戦略設定（人間操作画面）
- 新規データベース導入
- 複雑な機械学習モデル

---

## 実装対象（推奨）
- `src/engine/trade.js`
- `src/engine/simulation.js`
- `src/engine/frontend.js`（必要に応じてログ表示導線）
- `src/engine/__tests__/trade.test.js`
- 必要なら `src/engine/sabermetrics.js` の既存評価関数を再利用

※ 実際の責務に応じてファイル追加/分割可。

---

## 仕様詳細

### 1) 球団戦略ステート

各CPU球団に `frontOfficePlan` を持たせる。

```ts
interface FrontOfficePlan {
  mode: 'contend' | 'retool' | 'rebuild' | 'neutral';
  confidence: number; // 0..1
  updatedAtDay: number;
  reasons: string[];
}
```

保存先は既存のチーム状態オブジェクト配下。
セーブ/ロード互換のため、未定義時は `neutral` をデフォルト。

### 2) 戦略判定スコアリング

月次（またはトレード判断前）で以下を数値化し、合成スコアで判定。

- `rankScore`: 順位と首位との差
- `trendScore`: 直近30日勝率
- `ageScore`: 高齢化（30+比率）と若手比率（<=25）
- `contractRiskScore`: 主力の契約残1年人数
- `runDiffScore`: 得失点差

合成例:

```txt
contendIndex = 0.30*rankScore + 0.25*trendScore + 0.20*runDiffScore + 0.15*contractSecurity + 0.10*primeAgeBalance
rebuildIndex = 0.35*agingPressure + 0.25*contractRiskScore + 0.25*lowPerformance + 0.15*farmPromise
```

判定ルール例:
- `contendIndex >= 0.62` → `contend`
- `rebuildIndex >= 0.60` かつ `contendIndex < 0.50` → `rebuild`
- 中間帯は `retool` / `neutral`

ヒステリシス（頻繁な切替防止）:
- 前回モードとの差が閾値未満なら維持
- 最低30日はモード固定

### 3) トレード価値評価

既存の選手価値関数を以下へ分解。

```txt
totalValue = currentValue * currentWeight + futureValue * futureWeight + contractValue * contractWeight
```

重みは球団モードで変更:
- contend: current 0.55 / future 0.20 / contract 0.25
- retool:  current 0.40 / future 0.35 / contract 0.25
- rebuild: current 0.20 / future 0.60 / contract 0.20
- neutral: current 0.40 / future 0.30 / contract 0.30

受諾判定:
- 相手提案価値 - 放出価値 >= `acceptThreshold(mode)`
- `rebuild`は将来価値が一定以上なら閾値を緩和
- `contend`はシーズン中盤以降、即戦力不足ポジションで閾値を緩和

### 4) 再建期の行動ループ

`rebuild` 時は候補抽出時に補正:
- 放出候補: 年齢、契約切れ近さ、サラリー効率で加点
- 獲得候補: 26歳以下、ポテンシャル高、コスト低で加点

また、同一シーズン内で以下を保証:
- 高齢主力を1人放出した場合、同シーズン内の獲得は若手寄り
- 2件以上のトレードで戦略が矛盾しない（ログ検証可能にする）

### 5) ログ

方針変更時に1回だけイベントを発火:
- `teamStrategyChanged`
- 表示文: `[{team}] フロント方針を {oldMode} から {newMode} に変更 ({reasonSummary})`

既存ニュース/メールボックス系に乗せられる最小実装で可。

---

## 受け入れ条件（Acceptance Criteria）

1. CPU各球団が `frontOfficePlan.mode` を持ち、シーズン中に更新される
2. `rebuild` 球団は平均で若手取得比率が `neutral` より高い
3. `contend` 球団は期限前に即戦力獲得を優先する傾向が出る
4. トレード受諾が順位のみで決まらず、契約残/年齢構成に応答する
5. 既存セーブデータを壊さない（未定義フィールドのフォールバックあり）
6. 追加テストがすべて通る

---

## 実装ステップ（推奨順）

1. 型/データ構造追加（`frontOfficePlan` + フォールバック）
2. 戦略判定関数追加（純関数でユニットテスト先行）
3. トレード価値関数をモード対応へ拡張
4. 再建期バイアスの候補抽出ロジック追加
5. 方針変更ログ導入
6. 統合テスト/回帰テスト更新

---

## テスト観点（具体）

- **strategy classification**
  - 高勝率・得失点プラス・主力契約安定 → `contend`
  - 低勝率・高齢化・主力契約切れ多い → `rebuild`

- **trade behavior by mode**
  - 同一提案でも `contend` と `rebuild` で受諾結果が分かれる

- **consistency**
  - 30日以内にモードが往復しない（ヒステリシス有効）

- **save compatibility**
  - `frontOfficePlan` がない旧セーブを読み込んでもクラッシュしない

---

## リスクと緩和

- リスク: AI挙動が極端化してトレード成立数が減る
  - 緩和: モード別閾値に上下限を設け、成立率を既存比±20%内に調整

- リスク: 評価計算が重くなる
  - 緩和: 月次更新＋キャッシュ（当日中は再利用）

---

## 完了時の成果物

- 実装コード一式
- ユニット/回帰テスト
- CHANGELOG追記（CPUフロントAI強化）
- 必要なら簡易デバッグフラグ（開発用）
