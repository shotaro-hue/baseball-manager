# GM-01 A1-3c-2 CPU契約整理

起点main: `88f2767810e1b46a010267ea1b6d7b4fc45e800c` (#564)。着手時未マージPRなし。

## 接続と対象
annual契約画面の「CPU球団の契約を整理する」から、既存の編成計画・要求額・受諾評価を使い、正式更改留保→受諾、満了/自由契約のenter-market、国内/海外のdeclare-faへ接続する。既存年俸や財布を直接変更する旧cpuRenewContractsは呼ばない。子取引の確定・親receipt・契約台帳・名簿・市場・予算は一candidate/revision、#564と共通のdirty base flush/CAS/root検証/採用復旧barrierで保存する。

自球団の提示/回答は既存schedulerを維持し、CPU整理ではその時計・回答予定・判断を変えない。新規nativeは成長/要求保存→既存CPU posting保存→CPU整理の順。既存将来契約は継続、CPUの回答待ち・未確定引退・pending/approved postingは整理を拒否する。FAランクを確定できない場合も全体を未変更に戻す。

通常ゲームのlegacy契約画面は変更しない。annualセーブでは既存契約画面から使えるが、**通常annual公開はOFF、通常annual Worker・翌春builder・年度切替・年度完走は未接続**。CPU市場獲得、FA補償の新たな自動判断、海外FAの移籍成立は含めない。CPU整理済み表示は保存した整理結果であり、自球団の未判断/回答待ちを含む工程全体の完成を意味しない。

## 実12球団
`createInitialTeams()`（実データ12球団、初期1,034選手）→既存閉幕/予算/open→期末引退→成長/要求保存→既存posting→実useOffseason/useGameStateのCPU保存→loadGameを検証する。通常annual Workerによる年度完走とは区別する。

2026-11-25の保存検証修正後計測: CPU対象943人、更改756・継続35・国内FA6・満了146。保存・再読込・照合の計測26.1秒、テスト本体28.4秒、生成/fixture準備を含むファイル全体44.0秒（ローカルNode/fake-indexeddb）。[集計](real12-result.json)。対象数は生成時の引退結果により変わる。自球団、年/12月1日、現在給与/登録区分、既存取引を維持し、CPU全件が将来雇用または正式市場履歴に対応すること、再読込後の全engine/名簿/市場、全チームの年度別quoteと表示予算を照合した。stockデータの生成結果だけで全FA枝の資格を保証しないため、資格済みfixtureで国内/海外FAを別に検証する。

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

## CI #750での性能指摘の追補
初回HEAD `cca292d3` のCI #750は実12球団hookの60秒超過1件で単体群が失敗した。閾値/skip/retryは変えず、CPUのfinal-floor wrapperを既存snapshotへ接続し、検査済み同一plans/回答のJSON比較を重複させない。snapshotはexact clone+deep-freezeした台帳を一度だけ全検査し、その正規化済みprojectionを共有する。保存barrierのprofileで大きかった退団履歴確認は、検査呼出し内だけ球団別の全alumni snapshotを一度ずつ読む形へ変更した。回帰は旧10回→4回のRED→GREENと、次回検査でのhistory改変拒否を確認。関連136件・別コンテキスト61件成功。旧CIを修正後HEADの成功の代用にせず、最終CIはPR本文を正本とする。

## CI #751での継続した性能指摘
前回HEAD `02768fcc` でも全件CIは実12球団hookの60秒超過1件、5005件成功・既存skip2件だった。実hookのprofileでは、専用immutable recordにもviewを作り直す処理、apply後のraw検査とsnapshot検査の二重化、各更改提示での全12球団の登録枠再計算を確認した。cached viewはdeep-freeze済みのものだけ共有し、専用snapshotへのapplyは新action・closed-year・全record ID/型/期間重複を検査したsnapshotを返す。通常mutable/coldの戻り値は変えない。登録枠は非公開CPUバッチ内だけteams/draftContext/faPersonnelMovesの同一参照で共有し、退団後は再計算する。財務のfunded人数・新人の未資金枠は各提示で計算し直す。

新規回帰は不変入力からの取引結果の隔離とcold改変拒否、8件更改の登録枠計算重複（46回から削減）および最終重複名簿拒否のRED→GREEN。関連170件・実hook6件、別コンテキスト17件成功。保存barrier・全体検査・上限・skip/retryは変更しない。最終HEADでCIを実行し、結果はPR本文へ記録する。

## CI #752と保存検証の隔離
HEAD `ed4507a2` のCI #752は、全ブラウザ12群と集約が成功、単体群は5006件成功・実12球団CPU整理60秒超過と既存bootstrapオフ開始10秒超過・既存skip2件だった。保存validatorの1呼出し内だけexact clone+freezeした台帳を持つshadow worldを作り、既存の全inspectorと名簿/予算投影照合を同じ台帳へ向ける。返す値は従来のmodeだけで、元worldや保存payloadは置換しない。次回のmutable/cold入力は再コピー・全検査する。独立レビューで追加root metadataへのfreeze漏れを再現し、records以外のmetadataもcloneして隔離した。

同じprofileで確認した重複として、日付別の雇用は呼出し内で球団別に一度だけ索引化し、全年度の資金枠計算を維持する。同一台帳の新action探索は、両入力のprepareとextension検査後に空と判定する。保存barrier・検査内容・閾値・skip/retryを維持。metadata非freeze、cold/混在入力の後変更、台帳/回答の同時欠落、日付別雇用の重複読取に回帰を追加した。関連327件・hook21件（実CPU6件と既存オフ開始15件）・別コンテキスト74件、build成功。ローカルCPU本体29.4秒、既存bootstrap本体4.5秒。最終HEADの必須CI成功を確認するまでdraftを維持する。

## CI #753の検証結果と画面検証の競合
HEAD `e25d8fb6` では全単体/統合5014件が成功・既存skip2件。実12球団CPU本体48.7秒と既存bootstrapオフ開始7.9秒で既存上限内を確認した。CPU画面のChromium/WebKit各3幅も全6件成功したが、management群は115成功・既存pre-growth gate360px Chromiumの1件失敗だった。artifact traceのcall@199は結果表示直後の直接setScreen('hub')がfalse（保存barrierによる拒否）、続くturn button不存在を記録している。

保存結果の描画と保存確認完了は異なるため、既存ナビゲーション『受信箱へ』がenabledとなる条件を確認してから画面を切り替え、setScreenの成功値trueも新たにassertする。元の成長gate/再読込/ターン/横溢れ/pageerrorの期待、5秒expect・30秒テスト上限・workers1/retries0、製品barrierは維持する。独立レビューはtraceとbusy/commit解放の実行経路を照合し、新規P1/P2なし。最終HEADのCI結果はPR本文を正本とする。

修正後、Chromium/WebKit各360/390/1440pxで成長gate・旧pending救済・CPU整理の計18件が成功（2.1分、既存上限、workers1/retries0）。製品コードは前HEADから変更していない。最終HEADの必須CIを再実行する。

## CI #754と実行リソースの固定
製品コードが同じ#753/#754で、全単体群の実行時間は548秒→850秒、CPU本体は48.7秒成功→60秒超過に変動した（#754は5013成功・CPU超過1件・既存skip2）。各閾値は変更せず、CIのnpm testへmaxWorkers=2/minWorkers=2を指定してCPU競合を抑える。全テストのinclude/exclude・各timeout・retry・25分job上限・E2Eは維持する。最終CIでは5016件の全対象、stress/physics、実CPUの60秒以内成功を再確認する。

private CPUバッチは翌2/1の更改と12月の退団だけなので、11/30時点の雇用を一度索引化する。各子取引の現在roster所属、team/player/source契約ID・満了年・登録区分・正式予算審査は維持し、public経路は毎回fresh lookupのままとする。8更改の11/30照会は27回→12回のRED→GREEN。同じ937人入力のcore測定は15.28秒→15.03秒で、完全な候補world（全契約/名簿/予算/市場/履歴/receipt）の値も一致した。これは小改善で、CI安定化をローカル計測だけで成功扱いしない。給与group集計の試作は15.48秒で改善せず、コード/新APIは採用していない。

2 workersで関連348件、別コンテキスト99件、Chromium/WebKit各3幅のCPU画面6件、buildが成功。直前の成長gate/旧pending/CPU18件も成功しており、5秒expect・30秒E2E・retry0を維持する。最終SHAと必須CI結果はPR本文へ記録する。
