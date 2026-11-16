# GM-01 A1-3b 年度末成長・要求年俸

## 今回の範囲

main `ffbf4114`（#562マージ済み）から、native 12/1の期末引退判断後に、全球団の一軍・二軍の生存選手の能力変化と要求額を保存する。引退画面で確認→明示保存→結果/理由→postingへ進む。保存後は折畳みで球団別・選手別の能力差、旧年齢/潜在/集中/旧コーチ、旧年俸と要求額、実績評価理由を確認可能。

公開フラグOFF/schemaVersion1/DB5。通常annual年度完走・Task7/A1・新契約制度全体の完成ではない。CPU更改・FA全体・実試合Worker接続・翌春builder（加齢/成績初期化/年度切替）・初年度policy/移行/公開・長期/実iPhoneは後続。

## 正本と保存境界

| 対象 | 正本・責務 |
|---|---|
| 現在能力/成績 | teams.players/farm。成長はbatting/pitching/growthPhase/peakAbilitiesだけを適用。年齢/成績/careerは保持 |
| 雇用/旧年俸/保証/将来契約/正式留保 | 既存ledger/reservations。要求額をsalaryへ上書きしない |
| 過去成長・給与要求 | engine.transactionsの固定year-end-growth IDの証跡。入力と結果を凍結し、新しいlive player正本を作らない |
| 旧年コーチ | 新規open receiptの任意growthCoaches観測。重複を含むtype/bonusを保全。reportとの一致をworldで照合 |
| 乱数 | 既存economyRandomContext。save/epoch/season/player/operation/purpose別。決定的経路のshuffleはブラウザ実装に依存しないFisher–Yates。legacyは従来ルール |
| 保存/採用 | human adapter→useGameState.commitEconomyOperation→既存保存barrier→公開root照合→React採用確認→ack/recovery |
| 要求額利用 | 既存salaryDemandを成長前のY実績/記録済み表彰/旧契約で計算。人向けrenewalは固定要求を参照、既存抵抗係数は維持 |

履歴検証はreportの当時入力だけでモデルを再現。母集団は11/30の歴史的雇用と成長より前の退出を元契約IDで照合し、元契約ID/球団/年俸/区分も検査する。現在名簿・現在成績・後年の年齢から過去を再計算しない。

## 検証記録

- RED→GREEN: 新規処理なし・posting先行を検出。独立レビューで直接end-contract/complete-postingの抜け道を再現し、全posting入口を新規成長前に拒否。旧saved replayには遡及しない。
- 独立レビューの証跡不整合3件（openingコーチ矛盾、旧年俸を台帳と矛盾する額へ変更、row+command member同時削除）をRED→GREEN。現在名簿ではなく既存の不変証跡で検査する。
- 関連engine/hook/給与要求/更改/旧引退/openの8ファイル184件成功。実12球団bootstrap、退職除外、active/farm人数と一意性、元年成績/career/保証、順序と操作乱数、正式留保/将来契約、後年engine投影、実績0/未記録/記録済みMVPを含む。
- 実12球団bootstrapを実save barrierで保存/公開/採用/再読込し、全生存者の能力とreportの完全一致を確認。
- 独立レビューで追加検出した同年release→別契約で再獲得の母集団誤除外を実producerでRED確認し、退出の元契約IDを使うよう修正。後続posting退出後に過去reportを保持する正常例も追加。
- 実保存hook: 失敗前の元root/world維持→同結果再試行→再公開なしreplay→cold backup復旧、公開後採用エラー→既保存結果復旧、posting後続を確認。
- Chromiumの新規成長3件+既存引退6件、9件成功。360/390/1440pxの失敗・再試行・cold reload・表示・横溢れなし、reloadなしposting、受信箱での引退/成長必須順序を含む。
- 初回ブラウザ検証ではテストが引退済み0人球団を開いていたため結果詳細を選べず失敗し、生存選手のいる球団を選ぶよう修正。途中ソース編集によるHMRでdialogが閉じた実行は成功に含めず、ソース固定後に再検証。待機上限・retry・期待値の緩和なし。
- WebKitはOS管理者インストール不可。公式v2215と署名済みDebian索引由来の不足ライブラリを/tmpへ配置し実起動確認。事前ldconfig検査のみ省略。実iPhoneではない。

## 保存互換性・限界

新規optional transactionとopen receipt観測のみ。schema/DB変更・既存セーブの一括変換なし。旧9field open、旧native冬、期末判断済み旧冬、posting済み旧冬、legacyを読込/replay可能なまま維持する。既postingへ成長を遡及挿入しない。

旧open receiptにコーチ観測がなければ処理時のcoachesをYの観測として使う。旧データに存在しない年度付き雇用履歴は復元できない。この互換限界を隠して翌年度コーチと判別可能とは扱わない。既存の#562 continued根拠完全性の既知限界は本工程で解消したとはしない。

実試合のannual Worker、実際の年度完走、複数年バランス、実iPhone Safari/モバイル性能は未検証。翌年engine投影は翌春builderの完成を意味しない。最終HEAD/必須CIの正本はPR本文。

[360結果](screenshots/360-result.png) / [390結果](screenshots/390-result.png) / [1440結果](screenshots/1440-result.png)
