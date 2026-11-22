# GM-01 A1-3c-2 CPU契約整理

起点main: `88f2767810e1b46a010267ea1b6d7b4fc45e800c` (#564)。着手時未マージPRなし。

## 接続と対象
annual契約画面の「CPU球団の契約を整理する」から、既存の編成計画・要求額・受諾評価を使い、正式更改留保→受諾、満了/自由契約のenter-market、国内/海外のdeclare-faへ接続する。既存年俸や財布を直接変更する旧cpuRenewContractsは呼ばない。子取引の確定・親receipt・契約台帳・名簿・市場・予算は一candidate/revision、#564と共通のdirty base flush/CAS/root検証/採用復旧barrierで保存する。

自球団の提示/回答は既存schedulerを維持し、CPU整理ではその時計・回答予定・判断を変えない。新規nativeは成長/要求保存→既存CPU posting保存→CPU整理の順。既存将来契約は継続、CPUの回答待ち・未確定引退・pending/approved postingは整理を拒否する。FAランクを確定できない場合も全体を未変更に戻す。

通常ゲームのlegacy契約画面は変更しない。annualセーブでは既存契約画面から使えるが、**通常annual公開はOFF、通常annual Worker・翌春builder・年度切替・年度完走は未接続**。CPU市場獲得、FA補償の新たな自動判断、海外FAの移籍成立は含めない。CPU整理済み表示は保存した整理結果であり、自球団の未判断/回答待ちを含む工程全体の完成を意味しない。

## 実12球団
`createInitialTeams()`（実データ12球団、初期1,034選手）→既存閉幕/予算/open→期末引退→成長/要求保存→既存posting→実useOffseason/useGameStateのCPU保存→loadGameを検証する。通常annual Workerによる年度完走とは区別する。

2026-11-22の性能修正後計測: CPU対象940人、更改851・継続34・国内FA3・満了52。保存・再読込・照合の計測37.6秒、テスト本体39.8秒、生成/fixture準備を含むファイル全体54.7秒（ローカルNode/fake-indexeddb）。[集計](real12-result.json)。対象数は生成時の引退結果により変わる。自球団、年/12月1日、現在給与/登録区分、既存取引を維持し、CPU全件が将来雇用または正式市場履歴に対応すること、再読込後の全engine/名簿/市場、全チームの年度別quoteと表示予算を照合した。stockデータの生成結果だけで全FA枝の資格を保証しないため、資格済みfixtureで国内/海外FAを別に検証する。

再現: `CPU_VALIDATION_DIR=/tmp/cpu-validation npx vitest run src/hooks/useOffseason.cpuContracts.test.js`。指定時のみsource.json/result.jsonを出力する。実データ生成はbeforeAll、保存前のfixture読込はbeforeEachへ置き、CPU操作テストの60秒上限は緩和しない。既存テストの削除・skip追加・timeout/retry緩和なし。

## 保存・異常系
engineでは全将来年度の予算不足→単年fallback/満了、育成区分/3年満了、既存受諾の重複回避、編成計画の正式release、国内/海外FA、補償順位境界による全体拒否、旧annualの未確定引退・CPU留保拒否、request世代/revision/自球団偽装、receipt/台帳欠落を確認する。

hookではroot書込失敗→cold reload→再試行→replay、二重入力/旧session、公開root採用失敗→復旧、満了の市場/名簿/履歴一括保存、人間pendingの維持を確認する。通常mutable/cold/spread派生入力を不変snapshotのcacheとして信用しない回帰も置く。

## 性能と独立レビュー
初期の実データ検証は60秒上限を超過。profileで給与行/日付の再計算、未更改計画の全台帳探索、受諾履歴の反復検査を確認した。CPU専用のclone+deep-freeze済み台帳/提案/支出snapshotだけ計算を共有し、通常mutable/cold入力は毎回検査する。予算・既存債務・ledger全体ID/期間重複・変更入力の審査は省略しない。既存検査後の同一ledger/record参照については同じ署名の再構築を省き、登録済みimmutable ledgerへのsnapshot作成も冪等化する。未公開バッチ内では正式reserve/commitが再検査する同じ留保の外側重複審査を省き、通常取引列との正常/拒否比較で一致を確認する。上限予算の早期判定は不可能な条件の拒否だけに使い、受諾は必ず正式留保と全年度審査を通す。

別コンテキストでP2を再現し修正: 更改receiptと実受諾台帳の同時欠落、native契約年投影による編成放出抑止、旧CPU未確定引退の見逃し、検証cacheのmutable record汚染。すべて回帰を置く。追加レビューは台帳移管/増額/保証、遅延受諾、FA補償、予算赤字と通常取引列の一致も確認。最終SHAと必須CI結果はPR本文を正本とする。

## 画面
Chromium/WebKitそれぞれ360/390/1440pxの3ケース、合計6ケースで保存失敗→未変更→cold reload→再試行→結果保存→cold reload→理由表示を確認。全ケース横溢れ/pageerrorなし。両ブラウザworkers=1/retries=0、既存30秒設定。

この環境はDebian13でroot権限なし。WebKitの不足共有ライブラリを/tmpへ展開したコピーを使用した。ldconfigに登録できないためホスト依存チェックだけ環境変数で省略し、**テストとWebKit本体はすべて実行**した。製品/Playwright設定・テスト期待値・待機時間・retryは変更しない。実iPhone Safari/実機性能は未検証。

操作前・保存失敗・再開後の画像は、Work環境の `/workspace/annual-cpu-validation/screenshots/` に `webkit-{360,390,1440}-{before,failure,saved}.png` として保持する。GitHubへの大型画像の直接アップロードは自動承認レビューで拒否されたため、PRのソースには画像を含めない。CIの既存management-ui Playwrightレポートでも各ケースの画像添付を生成する。最終CI/レポートのリンクはPR本文へ記載する。
