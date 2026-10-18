# CI #428：同じE2Eを8ジョブ内で再配置

head `88d5f13b8ef9e279ad5cbced377e983b4dd9ee13` の[CI #428](https://github.com/shotaro-hue/baseball-manager/actions/runs/39093761923)はBuild・全Unit1,418件と他5群のE2E195件が成功したが、初期化/進行が30分のジョブ上限でcancelled、集約ゲートはfailure。合格とは扱わない。ジョブは03:28:52開始、準備完了03:29:54、03:59:06に打ち切り。123件中122件成功、個別assert失敗の記録は0だが、残り1件と完了footerは未確認である。

同一製品ソースの前headでは同群123件が21.3分、さらに前のCI #426でも28.5分で完走している。今回は準備だけの遅延ではなく、試験29分12秒でも最後まで届かなかった。30分ぎりぎりの配置を繰り返さず、試験の実行先を再配分する。

`.github/workflows/ci.yml`で `draft.spec.js`、`draft-decision.spec.js`、`batch-results.spec.js` を初期化/進行から履歴の群へ移す。初期化/進行123→91件、履歴47→79件、他4群は26／82／24／16件のまま。遅い実行の観測値では移動対象が約8分、履歴群は約11分だったため、双方を約20分程度へ分散できる見込み。実際の完走は更新後CIで確認する。

**全318件の内容と重複数は完全一致。** 移動前後の6群を実際のPlaywright `--list --reporter=json`で収集し、project・file・親suite・titleの多重集合を比較した。削除・skip・grep追加・assert緩和・並列worker増加・リトライ・個別/ジョブのタイムアウト延長は行わない。CIは同じ8ジョブ、各E2E workers1・retries0、30分上限、安定した集約ゲート名を維持する。製品・長期ハーネスの固定378ファイルも不変である。

`cancelled-job.log.gz`、`timing-review.json` は未完了の原記録、`ci-before.yml` は移動前workflow、`inventory-comparison.json.gz` は318件の完全な比較原本。各hashは `evidence-manifest.json`。証跡CIは全ファイルと現在のmatrixの一致、未完了122件を成功123件へ読み替えていないことを再確認する。最終headのCI合否はPR本文を正本とする。
