# CI #427：取引上限試験と未読メールの保存通知

head `a5436c50dab3a144e361ceac10d001c128e62c5b` の[CI #427](https://github.com/shotaro-hue/baseball-manager/actions/runs/39092934161)はBuild・全Unit1,418件成功（既存任意2skipを維持）。財務/取引E2Eは23件成功・1件失敗し、成功扱いにしない。

失敗したのは他球団70人へ2対1の取引を拒否するE2E。traceの未読メール選択218178ms→承諾218287ms→直後snapshot218880msの通知が「💾 オートセーブ」であり、上限警告を上書きしている。未読の`onRead`がmailboxを更新して実オートセーブを起動する。手動保存通知だけを待つ従来の準備では、この後発保存を避けられない。

`e2e/trade.spec.js`で、実UIでメール開封→実保存→既読trueのassert→通知終了→実再ロードを済ませ、その既読メールを開いてから承諾する。元の上限警告、全teams・seasonHistoryの不変、メールresolved=falseのassertを維持し、Chromium・workers1・retries0・repeat3で3件成功（46.6秒）。製品ソースは変更せず、固定378ファイルと完了済み3シード×10年の厳密再検査も成功した。

製品の汎用通知競合自体は未修正の既存P2であり、この試験準備で解消したとは扱わない。未読を開いて直ちに承諾する操作では背景保存通知が警告を上書きし得る。取引拒否による所属・財務・履歴の原子性とは区別する。

`failure.log.gz` は失敗ジョブ全ログ、`local-green.log.gz` は3回の成功ログ、`trace-observation.json.gz` は該当する実traceレコードの抜粋。抜粋は全traceの連続再生を保証しない。元artifact/traceの識別子・hashを含め、各保存ファイルのSHA-256は `evidence-manifest.json` に記録する。最終headのCI結果はPR本文を正本とする。
