# 校正・失敗・中断の原本

ここにある実行は最終3seed×10年の受入へ含めない。

- `initial-three-years`は初期実装668afebのseed20261015×3年。実終了0・statuspassed、各年のCPU70人0/11・0/11・0/11。独立レビュー修正前なので最終版の結果へ読み替えない。
- `before-local-interrupted`は基準mainのローカル実行。seed15の7年とseed16途中までしか年度記録がない。controllerの停止結果はexit130。並行負荷・環境のOOMカウンターは観測したが、出力末尾が欠落した個別プロセスの終了原因は断定しない。
- `fast-local-nonzero`は途中版の全体fast試験で実終了1。末尾が欠落しており全件成功とは主張しない。最終の品質判定には正確な提出headの標準CIを使用する。
- `browser-initial-failed`は存在しないhub保存ボタンを独立画面で待った120秒の試験実装ミス。市場終了時の実自動保存を観測する旅程に修正した。`browser-retest-prefix`のstdoutには末尾欠落がある。tool session29632の実終了0およびPlaywrightのstatuspassedを確認したが、原本へ合格footerを生成しない。

各gzipのSHA-256はmanifest.json。前後比較の正式原本とは別管理する。独立レビューと追加の市場継続の指摘は回帰テストでREDを確認してから修正し、失敗をテスト削除/skip/期待値緩和で隠していない。

- `earlier-comparison/`はrun39102462481の旧改善後3×10年。70人13/330 (3.9%)、指名1,372、指名0最長1年。後から発見した連続市場獲得の予約ID問題を含むため、最終改善後16/330 (4.8%)・1,386指名とは区別する。改善後原本3本・固定ソース・ログ・比較metadataを保持する。元比較の改善前3本は最終`../final/`と同じなので複製しない。
- `qa-d1-ci-connection-reset`はrun39102828646/job117602422995、WebKit1440のページ初回GET `/src/hooks/useGameState.js`を計測用`route.fetch`で取得する際の`ECONNRESET`。25成功/1失敗。製品assertに達する前の通信失敗であり、正確な接続切断要因までは特定していない。実ログと失敗traceを保持する。
- `source-transport-red/green`はローカルHTTPサーバーが実接続を切断する回帰。修正前は2失敗/1成功。計測用取得だけにPlaywrightの`maxRetries:1`を指定して修正後3成功。再試行対象はECONNRESETのみで、HTTP500は1回で500のまま、再切断は2回で失敗する。製品テストのretry/timeout/assertは変更していない。greenログには集計回帰3件も含む。
- `qa-d1-chromium-corrected`は同じ生成ドラフト計測ケースのChromium1440で1成功 (17.2秒、retries0)。WebKitのローカル実行はバイナリ未導入のためlaunchで失敗し、`qa-d1-webkit-local-missing`として保持する。WebKit結果は最終headのCIで判定する。
