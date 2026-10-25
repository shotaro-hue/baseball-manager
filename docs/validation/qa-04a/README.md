# QA-04A — 実進行・保存再開の検証

2026-10-25。基準main `e1cb7ab0511bd36a8ee81a9a7789a606a62efb7c`（#501マージ）、tree `472054415c34e5b044e3cbb9d158d76545725243`。[対象と非対象](../../implementation/qa-04a.md)、[実行計画](../../superpowers/plans/2026-10-25-qa04a.md)。

## 検出した製品不具合

新規1試合→100試合まとめ進行で12球団の勝敗は101試合になったが、`allTeamResultsMap`は21試合しか残らなかった。Chromium/WebKitとも同じassertionで失敗。球団詳細の日程はこのmapを参照するため、まとめ進行の前半のスコアが欠落する。

原因は`seasonBatchCore.js`が全球団のスコア要約も最大120試合の`batchBoxScores`から最後に生成していたこと。6試合/日なので100日進行後に残るのは直近20日。自球団の詳細結果mapと勝敗累積は別経路であり、100試合の結果画面だけでは検出できなかった。

修正は、各試合終了時に軽量スコアを既存`allTeamResultsPatch`へ追加するもの。詳細ボックススコアの120試合上限と軌道データの非保持を維持。乱数・試合・CPU/金銭ルール・保存スキーマは変更しない。**すでに欠落した旧セーブのスコアを勝敗から推測復元しない**。

### 単体のRED→GREEN

既存100試合payloadテストへ、12球団それぞれ1〜100戦の全スコア、日程との一致、相手側の反転スコア、勝敗/引分と得失点の累積一致、詳細最大240球団行を追加。

- 修正前：seed1、`club 0 score history`で100件に対し20件、10.34秒で失敗。
- 修正後：`vitest run src/workers/__tests__/seasonBatchPayload.test.js src/workers/__tests__/seasonBatchCore.test.js`、**2ファイル・6件成功、20.90秒**。100試合をseed1/42/20260911で検査。
- payloadは18.00 / 18.36 / 17.44 MiBで既存30 MiB未満を保持。球ごとの軌道を保持せず、各選手の打球イベント上限80を維持。物理ディスク/RAM容量の計測ではない。

## 通常CI外の8spec

着手時の`.github/workflows/ci.yml`と全44specを突合し、`batch-100`、`batch`、`contract-renewal`、`game`、`hub`、`tactical-actions`、`title`、`ui-foundation`の8本・20ケースをChromiumで実行。**変更前16成功/4失敗、2.9分**。

失敗は旧要素指定：`100試合`の部分一致が見出しと注記の2つに一致、削除済み勝敗chip、日付付き旧1試合ボタンの2ケース。見出し、保存された実勝敗に対応するヘッダー、現行の試合入口へ追随。試合数・保存再開の比較を強化し、手動采配の作戦/投手交代/ログ増加のassertionは維持した。

対象5ケースの初回追随では4成功、100試合ケースは月次記者会見を回答せず保存を押そうとして失敗。会見を通常UIで回答してから保存する手順を追加し、当該1ケース成功（55.58秒）。初回失敗・途中診断を成功数へ加算しない。最終headの全ケースは提出CIで確認する。

## 受入と継続ゲートの対応

| 対象 | 実行する製品経路とテスト |
|---|---|
| 新規・5分類・9機能・通知/設定/記録/OB | `initialization` / `hub-navigation` / `club-reading`、閲覧による全球団の金額・所属不変、一覧復帰、保存再開 |
| 通常・まとめ・手動采配・試合履歴 | `progression.smoke` / `match-history` / `game` / `batch` / `tactical-actions`、実試合と試合数・記録・UIの一致 |
| 一軍/二軍成績とCPU編成 | `first-team-stats` / `leaderboard` / `farm-rankings` / `farm-development` / `ai03-roster-cycle` / 新規`annual-journey` |
| 価格/投資/財務 | `finance` / `posting`、全球団署名・取消不変・明示確定・予算と保存再開 |
| 契約/FA/取引/スカウト | `management-decisions` / `management-lists` / `trade` / `progression.smoke`内FA・計画、更改と所属・金銭・二重反映の防止 |
| オフシーズン/ドラフト/年度 | `offseason-save-*` / `draft*` / `qa-d1-draft` / `progression.smoke` E2、新規`annual-journey`で初日から143実試合と翌年初戦 |
| 保存失敗/復旧/競合/不変archive | `save-generations` / `core-reliability` / `save-capacity*` / archive関連専用config、既存の失敗注入・別タブと再開のゲート |

新規`annual-journey.spec.js`と既存8specを通常CIの`annual-and-extended`に追加。新旅程はChromiumと390px WebKit。全既存suite・timeout/retry0を保持し、既存全suiteをローカルで重複実行しない。

## 実143試合の旅程

新規生成→単試合1→フル自動編成のまとめ100→保存/再読込→まとめ42→ポストシーズン→引退→編成計画/FA→自動ドラフト→年度更新/キャンプ→翌年初戦。終盤への日付書換えや架空結果のfixtureは使わない。main threadの生成seedは20261025。Workerは製品の乱数経路をそのまま使い、異なるengine間で結果そのものの一致は要求しない。

チェックポイントで全12球団の試合数、全期間スコア件数、重複所属IDなし、有限の予算、一軍実測、二軍カード6件/日、保存receipt全参照の完全性を検査。101試合後と翌年開幕時は全球団・年度履歴・試合履歴・二軍のSHA-256とreceiptを実再読込前後で比較。二軍未実施は理由付きカードとして別記し、全試合実施と偽認しない。

実旅程の最終結果と提出headのCIは確認後に追記する。途中診断では未回答の会見に保存クリックが遮られたため中断し、正規の回答操作を追加。初回の実101試合は上記のスコア欠落を検出して両engineで失敗した。この失敗はテストの期待値を緩めず、製品修正で解決する。

## 実行環境と限界

ローカルはPlaywright1.56、Chromium141/build1194、WebKit26/build2215。環境移行でブラウザ本体がなかった最初の20起動失敗はアプリ未実行。公式配布の代替ミラーから取得した。WebKit依存のシステム導入はsetgroups制限で失敗したため、前工程のユーザー領域の公式UbuntuライブラリとWPE launcherを使い、lddの不足なしを確認した上でhost依存チェックを省略。製品コード/CIのブラウザを変更するものではない。

実iPhoneのタッチ・速度、複数年の実進行耐久、全seedのCPU編成/経済バランスは未認定。完全バックアップ/復元と#494設計凍結は保留。QA-04AをQA-04Bの全画面/実機受入や無期限保存の保証へ広げない。
