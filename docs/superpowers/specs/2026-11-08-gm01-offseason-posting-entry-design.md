# 引退予約から12/1ポスティングへの接続

基準main `7f01546f9a113bf0cedf5f5303501d5854785cab`（#556マージ済み）。

プレイヤーはannualの保存済み12/1の引退整理画面で、既存の引退予約と対象球団を確認し、
予約確定→全球団の希望生成→CPU判断→海外市場を一候補・一revisionで保存できる。
自球団のポスティング承認は受信箱で待つ。当年成績・能力を使い、成長・加齢・成績リセットはしない。
引退者は既存finalize-retirementの履歴・保証残債・career保存を使う。

## 範囲と正本

`teams/players/farm/stats`と契約台帳、期中の`retirementReservations`が正本。
実データ入口は`bootstrapTeams.createInitialTeams`→annual作成/保存・読込→useGameState→
useOffseason→引退整理画面。公開ゲートOFF、schema1/DB5、legacyを維持する。
画面の旧引退抽選・任意の判断を台帳予約へ暗黙変換しない。

今回の独立工程は**既存12/1時計での予約確定とposting接続**。調査でgameDay144は
公式戦日程を指さず、未実装の年度Worker/postseason producerが明示時計を供給する必要があると確認した。
日数から12/1を推測せず、その時計生成・期末の新規引退判断・予算forecast producer・
成長/要求額/FA/翌春builder/Workerは対象外。open-offseason全体・通常プレイの年度完走は未完成。

## 構成と安全条件

native `prepare-offseason-posting`を共通取引へ追加。未確定予約を型付きID順で既存
finalize-retirementへ渡し、その後に既存advance-posting-phaseを実行する。
各子は既存審査を通し、引退の強制確定で生じた留保不足をpostingの支出基準へ持ち越す。
postingがその不足をさらに悪化させることは#556のCPU判断・最終予算審査で拒否する。
子worldを作ってrevisionを書換える方式は使わない。

親receiptは今回確定した予約/子IDと既存posting phase参照だけを保持する。保存検証で
子の存在・順序・署名・年度、全予約確定、親の後付け禁止を確認する。
既存phaseがある場合は改変・再評価しない。未確定予約が残っていたら順序不整合として失敗する。
新規の単独advance-posting-phaseも未確定予約があると拒否し、受信箱には予約確認画面へ戻る導線を表示する。
受信箱を先に開く通常操作で、後から予約確定できない新しい履歴を作らせない。
過去12/1セーブは任意の新フィールドを要求せず読める。
共通barrier、save/epoch/revision/session、保存後採用、部分保存なし、冪等性を維持する。
年度全体の成功は返さず、次年度への既存ガードを維持する。
保存公開後に応答/採用確認が失敗した場合は、この画面の明示復旧ボタンで共通recoverを呼ぶ。
復旧完了までは再準備・画面移動を止め、保存済み候補の再保存/再抽選をしない。
復旧待ちは共通hookのread-onlyな一時状態で表示し、復旧の再失敗でも操作を残す。永続形式へ追加しない。
annualのオフ読込では、残る公式戦カーソルを理由に期中記者会見を新規生成しない。
この副作用が元worldをdirtyにして保存を追加するため、既存effectのphaseと取消を防御する。
時計を持たない明示legacy envelopeの読込はoptionalな時計参照で維持する。

## 受入

実予約の一軍/二軍/CPU確定、当年成績・残存保証、CPU予算不足、人の判断待ち、
一回の保存/career公開、保存失敗/再試行/競合、旧receipt保持、不正入力/順序矛盾、
実12球団入口の性能、Chromium/WebKitと360/390/1440pxを確認する。
独立レビューと最新HEADの必須CIで止め、マージ・自動マージは行わない。実機iPhoneは別工程。
