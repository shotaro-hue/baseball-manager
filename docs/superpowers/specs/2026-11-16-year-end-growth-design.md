# GM-01 A1-3b 年度末成長・要求年俸

最新main ffbf4114（#562マージ済み）。ユーザーの詳細要件・AGENTSに従い実装から独立レビュー、保存/画面検証、最終CI、PRまで担当。公開OFF/schema1/DB5を維持。

## 目的・境界
nativeの正常open-offseasonと引退確定後、全球団の一軍/二軍の生存選手について年度Yの成長と要求額を一度保存し、理由を確認できる。salary/成績/career/契約/保証/正式留保は維持。加齢・成績初期化・CPU更改・翌春・通常annual公開は非対象。

## 構成と選択
別の成長state/保存ファイルを作る案は二重正本となるため不採用。legacy年度writerを流用する案は加齢や契約更新まで混ざるため不採用。既存transactionに一回限りの入力/結果reportを置き、能力はteamsへ適用する。reportは過去時点の証跡であり現在能力の正本ではない。developPlayersに任意乱数context factoryを追加し、既存呼出しは維持。要求は成長前選手と年度Yの記録済み表彰でsalaryDemandを呼ぶ。

新規open receiptには年度Yのコーチtype/bonusの観測のみを任意追加。旧9field receiptをそのまま読める。旧open済み・posting前は現在coachesを旧年の観測として使う（過去の雇用変更の復元はしない）。新規冬の後年コーチを成長へ混ぜない。annual冬の旧hire/fire操作を成長前に拒否する。

新規順序はopen→引退判断→成長/要求保存→posting。共通APIと受信箱/引退画面で防止。既にpostingを保存した旧冬は読込/replay/従来postingを維持し、成長を遡及挿入しない。開始receiptなし旧native/legacyも変更しない。

## 証跡と検証
transactionの固定IDは年度ごと。commandへ対象IDリスト、reportへ最小成長/給与入力、コーチ観測、給与context、結果を保存。履歴検証は記録入力だけを使い、後年の年齢/所属/成績を参照しない。公開済みreceiptは既存append-only履歴検証で変更禁止。現行名簿を過去の母集団へ流用しない。

既存保存barrierで保存→公開root検証→React採用→ack。失敗時は元worldを保持し同じ操作乱数で再試行。cold/backup復旧後もreportを読む。

## 独立レビュー後の補強
共通APIは直接end-contract(reason:posting)/complete-postingを含む全posting入口を成長前に拒否。reportの旧年俸/区分/元契約/球団と母集団を、11/30の歴史雇用と成長より前の退出証跡から照合する。退出は選手IDでなく元契約IDで差引き、同年release後の別契約での再獲得を維持。openコーチ観測とも一致を要求。後続postingや翌年の名簿を過去へ参照しない。

## 2026-11-19 更改提示の順序修正

PR #563レビューの経路を実producerで再現。成長前に新規人間更改が保存されるとturn0/dueTurn2（評価により2〜4）、成長保存は回答待ちで拒否される。取消は可能だが、現native UIにはオフターン進行が未接続で、不要な取消を強いる。clock/回答モデルは今回変更しない。

`requiresYearEndGrowth`を使う共通理由関数を人向け更改reducer、world共通offer/replace（自球団のみ）、更改画面へ接続する。新規提示・差替えを拒否し、成長画面への導線を出す。replayを先に認め、既存提示の取消・回答・復旧、シーズン中、旧native/旧posting済み/legacy、CPU raw提示は維持。保存済み履歴を遡及無効化しない。成長後は固定要求額で提示でき、今回新たにpostingを更改の必須条件にはしない。
