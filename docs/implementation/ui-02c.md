# UI-02C — 選手詳細・比較

基準main: `dc5fc286e6fbb1132bac649ee3ca01544095ac38`（PR #456反映）。ユーザーの実装依頼を仕様とし、DES-01の確定済み範囲を移行する。

## 作業計画

1. 最新main・全呼出元・記録範囲を確認。既存関連テストで基準を確認。
2. 詳細・比較の表示回帰をREDで確認。読取専用の表示ガードを共有し、既存計算・formatterを保持。
3. 詳細・比較をDES-01へ移行。既存コールバック・比較2人制限・二軍selector・年度／通算の読込を維持。
4. 7幅・異常状態・実App操作・共通呼出元の回帰を確認し、独立レビュー後にPR作成。CIは最新headで照合。

## 判断・進捗

- 初期照合: GitHub mainと浅い新規cloneのSHAが一致。既存作業環境はgitの親オブジェクト欠落があったため、履歴を変更せず新規cloneから専用ブランチを用意。依存は同一package-lockの既存環境を再利用。
- 関連基準: PlayerModal.salary / detailScreens / clubComparisonFlow、14件成功。
- 表示ガードの共有範囲はPlayerModalとPlayerComparisonのみ。FIX-S3の計算・保存・二軍モデルは変更しない。
- 比較は既存の一軍今季値を使用。二軍比較モードを新設しない。両者に一軍の同じ年度を表示し、二軍と合算しない旨を明記する。

## 実装範囲

- PlayerModalの概要・今季・打球・年度別／通算と、既存2人比較をDES-01のネイビー・白・青へ移行。名前・所属区分・役割・負傷・条件と既存判断導線を維持。写真・装飾アバターは追加しない。
- `playerDetailMetrics`は読取専用の表示ガード。一軍statsを使用し、有限値・必要な分子／分母を検証して既存saber/formatterへ渡す。OPS/OBP/ERA/WHIPの実測0、欠測、分母0、対象外、不正年俸を区別。投手の打席・打数・安打・打点・OPS・犠打を保持。velocityは生成処理の能力評価値であり、従来比較のkm/h表記を外した。
- 二軍はFarmPlayerHistoryの既存selector・年度・球団間合計・途中記録・旧推定を維持。旧stats2を実測へ変換・合算しない。CareerTable/BattedBallAnalysisPanelの計算・ロード・期間切替を保持し、親の表示範囲とDES-01スタイルだけを変更。
- 比較の選択IDは既存一時stateを使用。teams/farm/FA市場の現在値を描画時に参照し、再照合不可は選択時情報と明記。年度変更時は比較を解除して前年のスナップショットを新年度値にしない。
- tab/panel関連付け、矢印/Home/End、Escape、フォーカス制御、元の画面への復帰を整備。比較の解除で元の比較ボタンがdisabledになった場合は、残る操作へフォーカスを戻す。

ゲームロジック・Worker・編成制約・保存形式・ナビID・FIX-S3の計算精度は変更していない。二軍育成・会話、成績・ランキング全画面、試合詳細・まとめ結果、UI-03全体は対象外。

## 検証中に見つかった問題と対応

- 6件の新規表示テストを変更前にRED確認。実測OPS 0の欠測扱い、欠落投手stats、記録範囲／対象外表示、tab/panelの不足を修正。選択時スナップショット保持も追加テストでRED→GREEN。
- 下部の旧sticky操作帯が内容を覆うことを画像と座標で再現し、通常フローの白い操作領域へ変更。内容と操作帯の重なりをE2Eで検出する。
- 旧`github-preservation`はソース文字列の位置・構文に依存していた。投手の打撃項目、具体的数値、既存saberのOPS、入力非変更を実描画でassertする試験に置換。既存項目の保護を弱めていない。年俸・比較テストの欠測期待値は明示理由の新表記に合わせ、実測0・入力保持のassertionは維持。
- 独立レビューでsummaryがTab対象から漏れる問題を実ブラウザで確認。共通dialog hookを可視のnative操作（summary/input/link等）に対応させ、負tabindex/hidden/inertを除外。オフシーズンのfooterなし詳細でRED→GREEN。比較解除後のフォーカスも旧hookを復元したREDで確認して改善。
- 共通FA呼出元の実操作で、スマホだけ詳細に進めない既存CSSの問題を再現。外側の非選択`.fa-market`が内側の選択済み市場の`.fa-detail`を隠す原因だった。非選択の直接レイアウトだけを対象に1 selectorを限定し、390/1440pxのFA・計画・成長詳細の実操作が成功。市場ロジックは変更しない。
- 実測二軍の表示用合成fixtureで、年度・途中記録・球団別内訳・旧推定の別表示を確認する。これは有効な複数年プレイや保存容量の検証ではない。

## 変更前後の画像

同じ自球団・選手・2026年・通常状態、Chromium 141の表示。変更前は基準mainのソースで同じ表示fixtureを使用。日本語はOSフォールバック。画像だけで操作・保存の合格とはしない。

| 幅 | 選手詳細 前 / 後 | 2人比較 前 / 後 |
|---|---|---|
| 360px | [前](../validation/ui02c/before-detail-360.png) / [後](../validation/ui02c/after-detail-360.png) | [前](../validation/ui02c/before-compare-360.png) / [後](../validation/ui02c/after-compare-360.png) |
| 390px | [前](../validation/ui02c/before-detail-390.png) / [後](../validation/ui02c/after-detail-390.png) | [前](../validation/ui02c/before-compare-390.png) / [後](../validation/ui02c/after-compare-390.png) |
| 1440px | [前](../validation/ui02c/before-detail-1440.png) / [後](../validation/ui02c/after-detail-1440.png) | [前](../validation/ui02c/before-compare-1440.png) / [後](../validation/ui02c/after-compare-1440.png) |

## 残課題・引継ぎ

iPhone実機・スクリーンリーダー・200%拡大は未検証。ローカルWebKitはブラウザ取得後もOSライブラリが欠け、実行を成功認定しない。既存CIのWebKit保存・進行は維持し、UI-02C専用Safari検証の完了とは扱わない。通算の既存率算出やFIX-S3の精度は今回の改修・完了認定に含めない。

`player-detail.spec.js`を既存roster-settings CI群に追加。他のCI/E2E対象、timeout、workers=1、retries=0、全成功を要求する集約ゲートは保持する。

## 最終検証の補足

- 全Vitest: `npm test -- --maxWorkers=2 --minWorkers=1`、1056成功・既存条件付きskip 2。build成功（既存の500kB超チャンク警告）。
- Chromiumの関連E2E: `npm run test:e2e -- player-detail.spec.js roster-settings.spec.js contract-renewal.spec.js club-comparison.spec.js --workers=1 --retries=0`、35件成功（UI-02C 16、UI-02B 11、比較6、更改2）。ローカルは既存サーバーとの衝突を避けるため、コード／testDirは同じでポート5187だけを変えた一時configを使用。
- 画像比較後、比較表の固定480pxがスマホで片方の数値を隠すことを座標assertのREDで確認。3列を画面内に収め、両選手の数値が同時に見えることを7幅で再検証し、UI-02C＋既存比較の22件が成功（単独実行、2.6分）。局所スクロール枠・キーボードフォーカスは維持。
- 通常のGit pushはCLI認証がなく失敗したため、GitHub連携で各blobを保存。local git blob SHA・全tree SHAとの完全一致を確認してPR #457を作成。PRのコミットSHAはGitHub生成のためlocalとは異なるが、内容のtreeが一致する。
- 初回35件の実行は旧比較テストが追加した「戻る」buttonを末尾操作として認識しない失敗を含み、中断したため成功認定しない。既存テストは末尾→先頭の循環と表へのfocusの両方を確認する形へ更新し、単独の最終35件実行で成功した。別の共有呼出元実行・RED試験のログを合算して35件と数えていない。

- 初回CI #363の財務系では、欠測年俸の旧完全一致`未記録`がChromium/WebKitの2件で失敗した。新表記の年俸行`— 未記録`を直接検証するように修正し、可視性・選手名・保存データ非変更のassertionを維持した。次のCIは最新headで照合する。

- 既存F03閲覧テストの`二軍成績`region名との互換性不足を360pxでRED再現。見出し／regionを既存名に維持し、年度別実測の説明を本文へ置く修正を実施。既存F03の二軍記録・保存再開assertionは変更しない。

- 最終補足: 既存F03 360/390/1440px＋二軍実測年度切替2件の計5件が成功。財務の欠測年俸→詳細→保存非変更1件もChromiumで成功。最新の関連Vitest 19件成功。初回CI #363は欠測年俸2件・F03 region名3件で失敗し、他のジョブは成功。これらを修正後の同一PRへ反映し、最新headのCI結果をPR本文で報告する。
