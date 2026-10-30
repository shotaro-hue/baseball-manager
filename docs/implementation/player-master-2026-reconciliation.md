# DATA-PLAYER-2026：開幕選手マスタの更新と検証

追補：新規ゲームにローカル名簿JSONを取り込む経路と、NPB ID別の全履歴抽出を追加した。公開同梱445名と外部名簿1,059名を混同しない。操作・更新手順・残項目は [ローカル名簿読込](../validation/data-player-2026/local-import.md) を参照。

基準日は2026-03-27、能力に使う確定成績は2025年以前。**全選手再構築は未完了**。標準同梱は実在445名、うち開幕時育成2名。外部名簿経路は公式公示から復元した1,059名を使用できる。全件の公開利用条件と給与・契約等の確認が未完了のため、標準同梱へは昇格していない。

球団別の前後人数、出典、訂正、検証と未達条件は [検証報告](../validation/data-player-2026/README.md) を参照。

## データの分離

- `npb2025.js`：従来の取得データを凍結。445名へ固定ソースIDを付与し、従来の外国人フラグを明示値にする。契約球団ID対応修正を維持。2026年成績は原本に存在するが新規能力へ使わない。
- `playerMaster2026Corrections.js`：根拠URL付きの開幕時属性訂正。
- `playerMaster2026.js`：新規ゲーム用アダプター。未確認年俸・守備・契約・履歴精度を区分し、原データを変更しない。
- `playerMaster2026.release.json`：検証済み完全マスタの差し込み口。現在は `null`。未検証候補で埋めない。
- `playerMasterSchema.js`：ID、12球団別人数、登録区分、出典、利用条件、属性型、年俸単位、契約年、成績年度と整数アウト数の検証。
- `realPlayerProjection.js`：新規ゲームに限り観測履歴から能力へ変換。2023/24/25を .35/.65/1 で加重し少標本を中立値へ縮約する。推定を観測履歴へ書き戻さない。

ソースIDとゲーム内所有IDは別物。既存セーブのIDや選手を新マスタで置換する経路は追加していない。

## 取得と照合

1. 利用条件と必要な許諾を確認する。公開に適さない原本HTML・全名簿・成績をコミットしない。
2. 12球団の支配下・育成登録公示24ページをローカル保存する。ファイル名は `registered_s.html` / `registereddev_s.html` など。コード順は `s,db,c,t,g,d,h,e,l,m,f,b`。
3. 開幕時点の候補を新しいファイルへ抽出する。

```bash
node scripts/player-master/registration.mjs /path/to/private-html /tmp/opening-candidate.json
```

登録日と抹消日から在籍期間を復元する。現在の取り消し線を開幕時点の退団と扱わない。出力は `reconstructed-not-independently-verified` であり、そのまま本番へ使えない。

4. 別資料と全選手単位で照合し、ID・球団・登録区分・出典を備えた参照を作る。`scope:"all"`, `asOf:"2026-03-27"`, `status:"verified"` は実際の確認後に設定する。監査CLI用には12件の `teams:[{teamId,controlled,development,verified:true}]` と各選手の `sourceUrl` も必要。
5. 属性・契約・成績を照合して正規化マスタを作る。800人以上という人数だけでは完全扱いしない。

| 区分 | フィールド・条件 |
|---|---|
| マスタ | `schemaVersion:1`, `asOf`, `status`, `teams`, `sources`, `players` |
| 出典 | `id`, `url`, `redistribution:"cleared"`, `rightsEvidence`。フラグだけで権利確認済みにしない |
| 選手 | 恒久 `playerId`, `teamId`, `name`, `registration`（controlled/development）, `kind`（batter/pitcher）, `sourceIds` |
| 属性 | `birthDate`（不明時は `gameAge`）, `throws`, `bats`, `pos`, 野手の `positions`（主位置100、副位置0–100） |
| 外国人枠 | `foreignQuotaStatus`（counts/domestic/exempt/unknown）。unknown時は `gameIsForeign` を明示 |
| 給与 | `salaryStatus`（official/reported/game-assumption）。前2者は `salaryManYen`、仮設定は `gameSalaryManYen`。年額・万円 |
| 契約 | 同様の `contractStatus` と `contractEndYear` / `gameContractEndYear` |
| 成績 | `history` は不明なら空配列。`year<=2025`、投手は正確な `outs` 必須。観測カウントは非負整数、欠測はゼロにしない |
| 入団・FA | 確認できた `entryType`, `entryYear`, `entryAge`, `daysOnActiveRoster`, `serviceYears`。履歴年数から推測しない |

投球回の変換は `inningsToOuts(value, encoding)`。野球表記12.1回は37アウト、十進数12.1とは区別する。海外成績は翻訳モデル未実装のため完全マスタでは拒否する。

## 安全な更新

SPAIA取得も明示的な新規出力へ行う。取得だけで完全性・権利・開幕日・契約を確認したことにはならない。

```bash
node scripts/fetch-spaia.cjs --output=/tmp/spaia-candidate.js
node scripts/player-master/stage.mjs --input=/path/to/normalized.json --reference=/path/to/verified-reference.json --previous=/path/to/previous-normalized.json --output=/tmp/new-master.json --report=/tmp/master-diff.json
```

初回の完全マスタでは `--previous` を省略可能。ただし移行時には既存445名の給与・契約終了年を別途比較する。stageは既知の契約区分がゲーム仮設定へ劣化する変更を拒否し、追加・削除・変更IDと球団別人数を報告する。給与・終了年の値を変更する場合も差分を人が確認する。

本番ソース配下や既存ファイルへの直接出力は拒否する。候補と差分のレビュー後、通常のコード変更として `playerMaster2026.release.json` に反映する。CLIは公開・コミットしない。

```bash
# 従来原本の監査。原本に残る2026年成績も報告する
node scripts/audit-player-master.mjs --output /tmp/legacy-audit.json
node scripts/audit-player-master.mjs --reference /path/to/verified-reference.json --output /tmp/full-audit.json --strict
npx vitest run scripts/audit-player-master.test.js scripts/player-master src/data/playerMaster2026.test.js src/data/playerMasterSchema.test.js src/engine/__tests__/realPlayerProjection.test.js src/engine/__tests__/initialRoster.test.js src/engine/__tests__/playerMasterBootstrap.test.js
```

原本監査と新規ゲーム用アダプターは対象が異なる。原本の人数をゲーム内訂正後の人数と取り違えない。

## 接続と公開条件

完全マスタは全選手を保持し、架空補充しない。支配下70名以内、育成は二軍。二軍捕手を残して一軍9野手・8守備位置が成立する候補を選び、成立しない完全データはエラーにする。架空補充や守備位置の書換えで調整しない。現行の不完全445名では守備・人数の架空補充を継続する。

同期/非同期初期化、契約・年度予算、全員保存、試合・年度更新、育成転換・FA・補償を検証する。合成1,080名の試験は収容能力の証拠であり、実在全員の照合完了の証拠ではない。iPhone実機と長期保存は別途必要。

既存セーブを変更せず、最新PR headのビルド・単体・重要E2Eを確認する。同じコミットの全スイートをローカルとCIで重複実行しない。全選手の利用可能性・属性・出典・権利・保存互換が揃うまで全面再構築完了としない。
