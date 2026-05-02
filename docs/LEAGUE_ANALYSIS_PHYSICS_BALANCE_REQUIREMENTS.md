# League Analysis Tab Physics Balance Requirements

## 0. 結論

リーグ分析タブは、確率テーブル時代の「安打補正 / 本塁打補正 / ABILITY_RANGE表示」から、物理演算主導の検証画面へ作り替える。

今回の目的は、HR過多の原因をUI上で再現・検証・調整できるようにすること。

## 1. 背景

現行の打席ロジックは、BB / HBP / K を確率で処理し、それ以外を inplay として物理演算に渡す構造になっている。
そのため、従来の `hrMod` や `hitMod` は `calcPAProbs()` では計算されても、最終的な HR / H / OUT 判定にはほぼ効かない。

結果として、リーグ分析タブにある以下のUIがミスリードになっている。

- リーグ補正スライダーの `hitMod` / `hrMod`
- 現在のバランス設定値の `ABILITY_RANGE.contact.hi` / `ABILITY_RANGE.power.hi`
- クイックシムの 800 PA × 3 パターン

## 2. ゴール

リーグ分析タブを「物理演算バランス検証画面」に変更する。

### 必須ゴール

1. HR過多の原因を UI から確認できること
2. power別に HR/PA、HR/BIP、600PA換算HRを確認できること
3. EV / LA / 飛距離 / contactQuality 分布を確認できること
4. スライダーが実際の物理演算結果に効くこと
5. 調整前後の結果をクイックに比較できること
6. Codex / Claude / 人間が見ても、現在のバランス状態が判断できること

## 3. 非ゴール

以下は今回やらない。

- 投手の詳細ピッチング物理演算
- 球種別の変化量・回転数シミュレーション
- 守備AIの全面改修
- 球場ごとの詳細フェンス形状データ追加
- 実在NPBデータとの完全一致
- 確率テーブルで HR / H / OUT を直接決める方式への回帰

## 4. 対象ファイル候補

主に以下を確認・修正する。

```txt
src/components/tabs/BalanceTab.jsx
src/engine/simulation.js
src/constants.js
```

必要に応じて、物理演算用の定数を分離してもよい。

```txt
src/engine/physicsBalance.js
src/engine/physicsConstants.js
```

ただし、過剰分割は避ける。

## 5. 現行UIの扱い

### 5.1 リーグ補正スライダー

現行のスライダーは以下。

```txt
hitMod
hrMod
kMod
bbMod
```

物理演算主導では、`hitMod` と `hrMod` は最終結果にほぼ効かないため、表示を変更する。

### 5.2 新スライダー案

以下の物理演算向けスライダーに差し替える。

| key | 表示名 | 初期値 | 範囲 | 目的 |
|---|---:|---:|---:|---|
| `evMod` | EV補正 | 1.00 | 0.90〜1.10 | 打球速度全体の補正 |
| `laMod` | LA補正 | 0.00 | -5.0〜5.0 | 打球角度の加算補正 |
| `barrelRateMod` | バレル率補正 | 1.00 | 0.50〜1.50 | barrel発生率の補正 |
| `hardRateMod` | 強打球率補正 | 1.00 | 0.70〜1.30 | hard発生率の補正 |
| `wallHeightMod` | フェンス高さ補正 | 1.00 | 0.80〜1.30 | HR判定の厳しさ調整 |
| `catchMod` | 捕球補正 | 1.00 | 0.80〜1.20 | 外野守備による安打/アウト調整 |
| `kMod` | 三振補正 | 1.00 | 0.70〜1.30 | 既存K率補正 |
| `bbMod` | 四球補正 | 1.00 | 0.70〜1.30 | 既存BB率補正 |

`hitMod` と `hrMod` は原則UIから外す。
互換性のため state に残すのは可。ただし表示名としては使わない。

## 6. leagueEnv の拡張

`DEFAULT_LEAGUE_ENV` に以下を追加する。

```js
export const DEFAULT_LEAGUE_ENV = {
  hitMod: 1,
  hrMod: 1,
  kMod: 1,
  bbMod: 1,

  // physics balance modifiers
  evMod: 1,
  laMod: 0,
  barrelRateMod: 1,
  hardRateMod: 1,
  wallHeightMod: 1,
  catchMod: 1,
};
```

既存セーブデータに `leagueEnv` の一部キーがない場合でも壊れないように、必ずマージする。

```js
const safeLeagueEnv = {
  ...DEFAULT_LEAGUE_ENV,
  ...(team?.leagueEnv || {}),
};
```

## 7. 物理演算への反映ルール

### 7.1 `evMod`

EV生成後に乗算する。

```js
const ev = clamp(rawEv * safeLeagueEnv.evMod, 50, 190);
```

### 7.2 `laMod`

LA生成後に加算する。

```js
const la = clamp(rawLa + safeLeagueEnv.laMod, -25, 55);
```

### 7.3 `barrelRateMod`

`sampleContactQuality()` 内で barrel 発生率へ乗算する。

```js
const barrelRate = clamp(baseBarrelRate * safeLeagueEnv.barrelRateMod, 0.003, 0.12);
```

### 7.4 `hardRateMod`

`sampleContactQuality()` 内で hard 発生率へ乗算する。

```js
const hardRate = clamp(baseHardRate * safeLeagueEnv.hardRateMod, 0.05, 0.35);
```

### 7.5 `wallHeightMod`

HR判定時のフェンス高さへ乗算する。

```js
const effectiveWallHeight = wallHeight * safeLeagueEnv.wallHeightMod;
```

### 7.6 `catchMod`

外野捕球判定、またはアウト/安打判定の守備成功側へ反映する。
未実装なら今回のUIには表示してもよいが、「未接続」と明記すること。
接続済みと表示して、実際は効かない状態にしてはいけない。

## 8. クイックシム改修

### 8.1 現行

```txt
800 PA × 3パターン
```

これは HR 検証にはサンプル不足。

### 8.2 新仕様

```txt
10,000 PA × 5パターン
```

初期実装で処理が重い場合は、UI上で選択式にする。

```txt
軽量: 2,000 PA
標準: 10,000 PA
精密: 50,000 PA
```

デフォルトは `10,000 PA`。

### 8.3 検証プロファイル

| label | power | contact | pitcher |
|---|---:|---:|---|
| 平均打者 | 50 | 50 | velocity/control/breaking=60 |
| 準主力 | 60 | 55 | velocity/control/breaking=60 |
| 中距離 | 70 | 55 | velocity/control/breaking=60 |
| 主力長距離 | 80 | 60 | velocity/control/breaking=60 |
| 球界トップ級 | 90 | 60 | velocity/control/breaking=60 |

### 8.4 出力項目

最低限、以下を表示する。

| 指標 | 説明 |
|---|---|
| PA | 試行打席数 |
| BIP | インプレー数 |
| HR/PA | 全打席あたりHR率 |
| HR/BIP | インプレーあたりHR率 |
| 600PA HR | 600打席換算の本塁打数 |
| team HR/game | 1試合38PA換算のチームHR |
| AVG EV | 平均打球速度 |
| AVG LA | 平均打球角度 |
| AVG DIST | 平均飛距離 |
| weak% | 弱い打球率 |
| normal% | 通常打球率 |
| solid% | 良質打球率 |
| hard% | 強打球率 |
| barrel% | バレル率 |

## 9. 目標レンジ

以下を UI 上で判定する。

| profile | HR/BIP 目安 | 600PA HR 目安 |
|---|---:|---:|
| 平均打者 power50 | 0.5〜2.0% | 3〜10本 |
| 準主力 power60 | 1.0〜3.5% | 6〜18本 |
| 中距離 power70 | 2.0〜6.0% | 12〜32本 |
| 主力長距離 power80 | 4.0〜9.0% | 24〜48本 |
| 球界トップ級 power90 | 6.0〜12.0% | 35〜60本 |

上限を大きく超えた場合は赤表示にする。
下限を大きく下回った場合は青または灰色表示にする。

## 10. 判定ロジック

例：

```js
function judgeRange(value, min, max) {
  if (value < min) return 'low';
  if (value > max) return 'high';
  return 'ok';
}
```

表示例：

```txt
OK
HR過多
HR不足
```

HR過多のときは、推奨アクションも表示する。

```txt
推奨: barrelRateModを下げる / evModを下げる / wallHeightModを上げる
```

## 11. 現在のバランス設定値の差し替え

既存の `ABILITY_RANGE` 表示は、物理演算主導では優先度が低い。
以下の表示に差し替える。

### 11.1 表示すべき物理定数

| 項目 | 表示内容 |
|---|---|
| EV補正 | `leagueEnv.evMod` |
| LA補正 | `leagueEnv.laMod` |
| Barrel補正 | `leagueEnv.barrelRateMod` |
| Hard補正 | `leagueEnv.hardRateMod` |
| Wall補正 | `leagueEnv.wallHeightMod` |
| Catch補正 | `leagueEnv.catchMod` |
| Stadium | `tokyo_dome` など |
| Fence LF/CF/RF | 球場距離 |
| HR判定方式 | フェンス通過時高さ判定かどうか |

### 11.2 表示から外すべきもの

以下は今回の主目的に合わないため、優先表示から外す。

```txt
一流打者 安打率天井
一流打者 HR率天井
単打抑制係数
```

完全削除ではなく、折りたたみの「旧確率モデル定数」に移動するのは可。

## 12. UI構成案

リーグ分析タブは以下の順序にする。

```txt
1. 現在のリーグ実績
2. 物理バランス検証サマリー
3. 物理補正スライダー
4. Power別 Monte Carlo 検証
5. Contact Quality 分布
6. 現在の物理定数
7. 旧確率モデル定数（折りたたみ）
```

## 13. 物理バランス検証サマリー

Monte Carlo 結果がある場合、上部に要約を表示する。

例：

```txt
判定: HR過多
主因候補: barrel率過多 / 平均EV過多 / power80以上のHR/BIP過多
推奨調整: barrelRateMod 0.85、evMod 0.97、wallHeightMod 1.05
```

判定は `power70/80/90` を重視する。

## 14. 実装上の注意

### 14.1 シム関数の二重呼び出しに注意

現行の `runPASim()` は `simAtBat()` の後、`result === 'inplay'` の場合に `_resolveBattedBallOutcomeFromPhysics_TEST()` を別途呼んでいる。

もし `simAtBat()` 側ですでに物理結果まで解決している場合、二重計算になる。
Codexは以下を確認すること。

- `simAtBat()` が返す `result` は最終結果か
- `simAtBat()` が返す `result` は中間結果 `inplay` か
- `_resolveBattedBallOutcomeFromPhysics_TEST()` はテスト専用か、本番と同じロジックか

理想は、検証用に単一の公開関数を用意すること。

```js
simulatePhysicsPAForBalance(batter, pitcher, stadiumKey, leagueEnv)
```

返却例：

```js
{
  result: 'hr',
  isBip: true,
  ev: 161.2,
  la: 24.3,
  distance: 118.4,
  quality: 'barrel',
  sprayAngle: 41.2,
  yAtFence: 7.1,
}
```

### 14.2 TEST名の本番UI利用を避ける

`_resolveBattedBallOutcomeFromPhysics_TEST` を本番UIで使い続けるのは命名上よくない。
内部実体は共通化し、UIからは通常名を呼ぶ。

推奨：

```js
resolveBattedBallOutcomeFromPhysicsForBalance
```

または

```js
simulatePhysicsBipForBalance
```

### 14.3 既存保存データを壊さない

`leagueEnv` のキー追加により、既存チームデータが壊れないようにする。
未定義キーは `DEFAULT_LEAGUE_ENV` で補完する。

## 15. 受け入れ条件

以下を満たせば完了。

### 機能要件

- [ ] リーグ分析タブから `hitMod` / `hrMod` の主表示が消えている
- [ ] 物理用スライダーが表示される
- [ ] `evMod` を下げると平均EVとHR/BIPが下がる傾向になる
- [ ] `barrelRateMod` を下げるとbarrel率とHR/BIPが下がる傾向になる
- [ ] `wallHeightMod` を上げるとHR/BIPが下がる傾向になる
- [ ] K/BB補正は従来通りK率/BB率に効く
- [ ] 10,000 PA × 5プロファイルの検証ができる
- [ ] 600PA換算HRが表示される
- [ ] team HR/gameが表示される
- [ ] quality分布が表示される
- [ ] power80/90で異常HRが出た場合、UI上で赤表示される

### 品質要件

- [ ] `npm run build` が通る
- [ ] 既存セーブデータでリーグ分析タブを開いても落ちない
- [ ] スライダー変更後に即時再検証できる
- [ ] NaN / Infinity が表示されない
- [ ] 乱数ブレを考慮し、軽量/標準/精密の試行回数を選べる

### 回帰防止

- [ ] power50/70/90 の検証関数に単体テスト、または最低限のスモークテストを追加する
- [ ] `leagueEnv` の欠損キー補完テストを追加する
- [ ] HR/BIP が明らかに異常な場合に警告表示される

## 16. Codexへの実装指示

以下をそのままCodexに渡してよい。

```txt
このリポジトリでは、打席結果のうち BB/HBP/K 以外を物理演算で解決する方針です。
そのため、リーグ分析タブにある従来の hitMod / hrMod / ABILITY_RANGE 表示は、HR過多問題の分析に対してミスリードになっています。

docs/LEAGUE_ANALYSIS_PHYSICS_BALANCE_REQUIREMENTS.md を読み、リーグ分析タブを物理演算バランス検証画面に作り替えてください。

優先順位は以下です。
1. leagueEnv に物理補正キーを追加し、既存データを壊さず補完する
2. BalanceTab のスライダーを物理用に差し替える
3. 10,000 PA × 5プロファイルのPower別Monte Carlo検証を追加/強化する
4. HR/PA、HR/BIP、600PA換算HR、team HR/game、平均EV、平均LA、平均飛距離、quality分布を表示する
5. 現在のバランス設定値を ABILITY_RANGE ではなく物理定数・物理補正値表示に変更する
6. TEST名の関数を本番UIから直接呼ばないよう、必要なら検証用関数を正式名で公開する
7. npm run build を通し、NaN/Infinity/既存セーブ破壊がないことを確認する

HR/D/S/OUTを確率テーブルで直接決める方式には戻さないでください。
HR過多対策は、evMod、laMod、barrelRateMod、hardRateMod、wallHeightMod、contactQuality分布、フェンス判定の調整で行ってください。
```

## 17. 最終確認コマンド

```bash
npm install
npm run build
```

可能なら追加で以下を確認する。

```bash
npm test
```

テストが未整備の場合は、最低限、リーグ分析タブが開けること、Monte Carlo検証ボタンが動くこと、スライダー変更で結果が変わることを手動確認する。
