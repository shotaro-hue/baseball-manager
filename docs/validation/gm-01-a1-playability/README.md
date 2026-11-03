# A1-2c-2a — 取引後の試合成立判定

基準main: `792bbcd2dc7a33decc7985d1247bb25ba9528993`（#537）。

## 対象

`assessPostTransactionPlayability(team, {round})` に取引後の球団snapshotを渡し、最小の一軍と残りの二軍が同時に成立することを検査する。成功時の `team` は証明用配置であり、そのまま採用・保存するための編成ではない。通常の編成方針・疲労・投手数目標の代替にも使わない。呼出側の登録日・契約・枠・予算・取引の原子性検査は引き続き必要。

判定は一軍9野手＋1投手、二軍9野手＋1投手と捕手適性を最低条件にする。一軍の実捕手を確保し、他守備位置の適性不足は既存の緊急配置警告で表現する。一軍の外国人制限と育成・故障・再登録待機を守り、二軍では育成と待機中の選手を利用できる。退団・移籍後のsnapshotだけを評価し、将来加入、故障回復、待機解除、支配下転換を仮定しない。元から一軍の選手の待機値は一軍継続を妨げない。

## 検証

- 新規25件: 最小人数、ID 0、捕手/投手/野手不足、副適性捕手、故障・引退、育成両表現、再登録待機、外国人代替、元一軍捕手の二軍配置、不正データ、round境界、JSON再読込、凍結入力の非変更。
- `e2e/fixtures/new-game.json.gz` の全球団と現行 `createInitialTeams()` のbundled全球団で両軍のvalidatorが成功し、選手データ・給与・契約・予算を維持。fixtureから捕手適性を除いた対照では拒否。
- 対象＋ `annualDepartures` / 同performance / `catcherDepthPolicy` / `bootstrapTeams.farm` の5ファイル96件成功（bundled追加前の対象24件を含む）。bundled追加後は対象25件成功。
- `npm run build` 成功。既存のchunk-size警告あり。
- 最新HEADの必須CIと独立レビューはPR本文へ記録する。

## 残工程

期中 `enter-market/end-contract`、年末効力の引退予約とreceipt、債務維持・保存再開、人のhook/UI、CPU/Worker、年度更新は未接続。今回の関数だけで期中退団を有効にしない。年次の新制度公開ゲートOFF、schema/DB version、旧保存と旧スカウト終了方針を維持する。Task 7/A1全体は未完了。実ブラウザ・実iPhone・長期耐久は今回の変更対象外。
