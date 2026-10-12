# FIX-S1 — 一軍シーズンランキング

基準: `main` / `d08e5a1002bae266df46a135fcda5c471009feae`。対象は `LeaderboardTab.jsx`、回帰テストと本記録。

## 原因と修正

- 一軍で出場した選手を二軍へ移すと、`team.players` だけを走査するランキングから消えていた。既存の `seasonParticipants(team)` を使用し、一軍 `stats` が記録された二軍所属者を含める。二軍のみの `stats2` は集計しない。
- SV/HLD/QS/Kp の `|| "-"` が実測0を欠測表示にし、ソートの `parseFloat(v) || 0` が欠測を0と同順位にしていた。表示する計数項目（PA/HR/RBI/SB/W/SV/HLD/QS/Kp）は有限の数値をそのまま表示し、欠測・非有限値は既存の `-` を使う。欠測は昇順・降順とも末尾、上位3カードとメダルの対象外。実測0は対象。
- 打者10 PA・投手5 IPの最低条件、進行日から求める規定条件、規定トグルは率指標のみ、リーグ絞り込み、既定ソートと同値の入力順を維持。ID 0、選手詳細、比較操作と入力配列・statsの非変更をテストする。

OPS精度、StatsTab、球団比較、試合結果、保存形式、CSS・ナビ・レイアウトは変更しない。`seasonParticipants.js` の変更も不要。

## 現行コードのS01〜S08照合

| 課題 | 判定 | 根拠と残る範囲 |
|---|---|---|
| S01 降格選手のランキング欠落 | 実装済み（本変更） | REDでID 0の欠落を再現し、打者・投手の表示と保存再開でGREEN。StatsTabはS08へ分離 |
| S02 OPSの小数第2位丸め | 再現可能・未変更 | `saberBatter` は1安打/3打数のOPSを0.67で返す。生値は2/3 |
| S03 球団比較のERA 0欠測化 | 再現可能・未変更 | `buildTeamMetrics` の9 IP/0 ER先発ERAはnull |
| S04 球団比較の年俸母集団 | 再現可能・未変更 | 一軍年俸0＋二軍年俸100の比較年俸は0。`contractPayroll` は100と未記録件数を保持。財務表示は既対応 |
| S05 球団比較の一軍限定集計 | 再現可能・未変更 | 同一打者をplayersからfarmへ移すと比較OPSが0.67→null |
| S06 SV/HLD/QS/Kpの0欠測化 | 実装済み（本変更） | 計数列の実測0、undefined/null/NaN/Infinity、両方向ソート、上位3を回帰テスト |
| S07 勝敗投手の結果画面での再推定 | 未検証 | ResultScreenはログから独立再推定している。正式記録との不一致を起こす実試合シナリオは本変更で実証していない |
| S08 StatsTabの表示母集団 | 設計判断待ち | 現行は一軍ロスター。現在所属の一覧か、一軍シーズン出場者の成績かを決めてから別変更で扱う |

S02〜S05の照合は既存関数への一時的な読み取り専用スクリプトで実施。本表の「再現可能」はその最小入力での結果を示し、全画面の確認済みを意味しない。

## 検証

| コマンド／シナリオ | 結果 |
|---|---|
| `npx vitest run src/components/tabs/LeaderboardTab.test.js`（修正前） | 10件中9失敗／1成功。欠落・欠測ソートをRED確認 |
| `npx vitest run src/components/tabs/LeaderboardTab.test.js src/engine/__tests__/awards.test.js src/components/clubComparisonFlow.test.js` | 3ファイル／25件成功 |
| `npm run test:fast` | 130ファイル成功／既存条件付き2ファイルskip、922件成功／2件skip |
| `npm run build` | 成功。既存の500kB超チャンク警告あり |
| `npm run test:e2e -- leaderboard.spec.js --project=chromium --workers=1 --retries=0` | 360×800・390×844・1440×900の3件成功。各ケースで実saveGame→続きから→ランキング→手動保存→再読込→ランキングを確認 |

ブラウザ検証は競合作業を避ける一時configでwebServer/baseURLを5174へ指定し、上記E2Eコマンドへ `--config .fix-s1-playwright.config.mjs` を追加して実行した。リポジトリのPlaywright/CI設定は変更しない。新specは通常 `test:e2e` のChromium対象で、既存のコアCI限定リストには追加しない。

同じfixtureの変更前後を3幅で撮影。変更後はページ全体の横はみ出しなし、pageerrorなし。二軍 `stats2.HR=99` に対して一軍 `stats.HR=3` を表示し、二軍のみ野手を除外する。投手の実測0は上位カードに残り、nullの未記録投手は両方向の末尾に残る。保存後の所属・一軍statsも確認する。

| Chromium表示寸法 | 変更前（基準main） | 変更後 |
|---|---|---|
| 360×800 | [変更前](./validation/fix-s1/leaderboard-before-360.png) | [変更後](./validation/fix-s1/leaderboard-after-360.png) |
| 390×844 | [変更前](./validation/fix-s1/leaderboard-before-390.png) | [変更後](./validation/fix-s1/leaderboard-after-390.png) |
| 1440×900 | [変更前](./validation/fix-s1/leaderboard-before-1440.png) | [変更後](./validation/fix-s1/leaderboard-after-1440.png) |

画像は全文キャプチャで、同じfixture・投手ビュー・奪三振昇順。変更前は基準mainのコンポーネントへ一時的に戻して取得後、修正を復元し、上記の保存再開E2Eを再実行して3件成功（31.2秒）。環境の一部絵文字は代替字形で描画される。

未検証: このコミットのGitHub CI、full Vitest・全E2E、WebKit/iPhone実機、スクリーンリーダー、実試合から降格に至る一連の操作。保存互換性は既存のマイグレーションを保持し、欠落したstatsキーを0で補う既存ロード処理は変更しない。E2Eの未記録値は保存可能なnullを使い、undefinedはコンポーネント回帰テストで確認する。
