# GM-01 A1-3c-2 CPU契約整理

起点: main 88f2767810e1b46a010267ea1b6d7b4fc45e800c (#564)、未マージPRなし。

## 目的と範囲
annualの契約画面からCPU契約整理を明示実行し、CPUの満了選手が翌年契約済みか正式市場へ供給済みとなる。自球団の提示・回答は#564のまま保持する。全CPUを一つのcandidate/revisionで保存し、cold reload/retry/replayでも重複しない。

## 方式
旧cpuRenewContractsは直接給与/財布更新のため使用しない。planCpuRenewals、calcPlayerDemand、evaluateRenewalOffer、既存annual更改留保/受諾・enter-market・declare-faを再利用する。既存集約取引と同じgeneratorで子取引を実行しyieldする。新規nativeは成長保存と既存CPU posting確定後に実行し、先行更改で海外希望を消さない。成長保存前は拒否、旧annualは保存を推定変換せず明示実行できる。既存将来契約は継続扱い、CPUの回答待ち留保は未解決として全体拒否。最大3ラウンド、若手は2年→1年、他は単年。要求年俸は保存済み成長評価を優先。全年度の留保/予算審査を通す。編成計画の放出はrelease、交渉不成立はexpiry、資格に基づく本人意思は国内/海外FA宣言へ接続する。FAランク境界等が確定できなければ全体失敗として理由を表示する。

集約receiptには対象名簿と各結果・交渉評価・失敗理由・子取引IDを記録し、正式台帳/子取引との整合を読込時に検証する。自球団IDはworld境界で照合する。

## 選択肢
既存旧CPU処理の流用は直接更新と二重計上を招く。world reducerを選手数分呼ぶ方式は全world投影を反復する。既存集約取引に従う方式を採用する（実装判断）。保存barrierは#564と共通。

## 制約・非対象
schemaVersion1、DB5、公開OFF、既存セーブ互換を維持。自球団判断、翌春builder、加齢/成績初期化/年度切替、通常annual Worker、CPU市場獲得、無関係UI変更は含めない。annual機能全体と年度完走は未完成。

## 受入
正常/予算拒否/育成/継続/FA/満了、保存失敗と再試行、cold reload/replay、旧annual/legacy、二重操作/旧session、自球団未変更、実12球団で契約・名簿・予算・市場・履歴を照合。独立レビューと最新HEADの必須CIを確認しPR提出、マージしない。

## 性能上の実装判断
実12球団での反復探索を避けるため、clone+deep-freezeした専用snapshotだけ台帳・支出・不変回答の計算結果を共有する。mutable/cold入力は通常検査し、cacheの受諾recordは専用ledger snapshot由来に限定する。CPU子取引では正式reserve/commitが所有権を変えず同じ留保を台帳へ置換する重複審査だけを省く。予算上限の早期拒否は自身のactive forecastと最大一枠のfloor返金を加算する保守的上限で、受諾の代用にはしない。保存前後の全体検査と元入力非変更を維持する。
