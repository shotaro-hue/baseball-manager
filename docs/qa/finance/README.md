# 財務契約年俸：画面・検証記録

2026-10-09。基準main `c398825`。Chromium、360×800 / 390×844 / 1440×900。

## 固定状態と比較

`e2e/finance.spec.js` は `new-game.json.gz` を実保存APIで読み込み、一軍を1〜28万円、二軍を1000〜1027万円（先頭のみ育成）に設定する。未契約スカウト候補は999999万円。日付・球団・編成は同じ。保存通知の表示タイミングは画像間で異なる場合がある。

| 幅 | 修正前（main） | 修正後 |
|---|---|---|
| 360px | [before](before-360.png) | [after](after-360.png) |
| 390px | [before](before-390.png) | [after](after-390.png) |
| 1440px | [before](before-1440.png) | [after](after-1440.png) |

未記録・不正値・実測0・二軍支配下0人: [360px](incomplete-360.png)。

内訳の数値と所属、合計、順位を目視・自動検証。年俸領域が画面幅内に収まり横方向にはみ出さず、金額文字が14px以上であることを確認。億円表記の小数丸めは既存fmtSalを維持し、内部の合計は内訳の厳密な合算。

## 回帰テストと実行

- 修正前: FinanceTab 2件失敗（対象不足、freezeした元配列へのsort）。新しい集計関数の6件も未実装で失敗。E2Eの3幅とも新しい年額領域がなく失敗。
- 修正後: 年俸集計6件、FinanceTab描画5件が通過。分類・重複IDの競合・匿名選手・0/欠損/不正値・昇降格・契約/獲得/放出・freeze・mounted rerenderを含む。
- 専用E2E: `npm run test:e2e -- finance.spec.js --workers=1 --retries=0` → 4件成功、失敗0、skip0。実保存・再読込、2回表示、球団データ全体（編成・予算を含む）の一致、3幅の内訳/上位を確認。pageerrorなし。
- `npm ci` 成功。`npm run build`、`npm test -- --maxWorkers=2 --minWorkers=1`、`npm run validate:physics-hr` は終了コード0。physicsは1件成功。全単体では既存benchmarkのskip2件を確認（今回追加したskipなし）。全単体の最終件数はPRのCIログに記録。
- 最初の同時実行ではbuildが強制終了し、単体実行を中断。その結果を合格扱いにせず、制限した単体worker数と順次実行で再検証。
- smoke（1 worker / retry0）: 19成功・2失敗・skip0。ポスティング承認のchunked v4 / legacy inline v4が30秒のテスト全体制限で失敗。traceの最後は保存確認で、金額不一致のassertionは観測していない。今回との差分によるものか、既存/環境依存かはこの段階では未確定。
- 全E2Eと最新head CIの最終結果、失敗の切り分けはPR本文に記録する。未実行や失敗を成功に数えない。

## レビューと未検証範囲

独立レビューでCritical/Important指摘なし。金額文字サイズ、匿名選手のReact key、重複契約の競合fixture、mounted rerenderの不足を補った。

財務のWebKit専用E2Eは未実施。既存mobile-webkitは進行smoke E1のみ。レスポンシブ境界は変更せず、境界両側の画面確認は未実施。年俸以外の旧ダークカード、支払タイミング、コーチ精算、収入予測は本PRの解決対象ではない。
