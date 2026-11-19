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
- WebKitも同じ9件すべて成功、Chromiumと合計18件成功。OS管理者インストール不可。公式v2215と署名済みDebian索引由来の不足ライブラリを/tmpへ配置し実起動確認。事前ldconfig検査のみ省略。実iPhoneではない。

## 保存互換性・限界

新規optional transactionとopen receipt観測のみ。schema/DB変更・既存セーブの一括変換なし。旧9field open、旧native冬、期末判断済み旧冬、posting済み旧冬、legacyを読込/replay可能なまま維持する。既postingへ成長を遡及挿入しない。

旧open receiptにコーチ観測がなければ処理時のcoachesをYの観測として使う。旧データに存在しない年度付き雇用履歴は復元できない。この互換限界を隠して翌年度コーチと判別可能とは扱わない。既存の#562 continued根拠完全性の既知限界は本工程で解消したとはしない。

実試合のannual Worker、実際の年度完走、複数年バランス、実iPhone Safari/モバイル性能は未検証。翌年engine投影は翌春builderの完成を意味しない。最終HEAD/必須CIの正本はPR本文。

最終独立追認: core19/history2/hook5の26件成功。実12球団の実保存/再読込も成功し、当初4指摘と再獲得回帰の解消を確認。新規ブロッカーなし、最終同一HEADの必須CI成功を提出条件とする。

[360結果](screenshots/360-result.png) / [390結果](screenshots/390-result.png) / [1440結果](screenshots/1440-result.png)

## 2026-11-19 PR #563レビュー修正

- 開始HEAD `baa30d7a77022b85551c5b4bcaf28b0edeafc147`、main `ffbf4114`、CI #742成功を確認。
- 指摘P2を再現: 実native new-game/閉幕/open/引退確定→人向け新規更改保存成功→turn0/dueTurn2/dueDate:null→成長保存拒否。`decisionClock`は2〜4ターン待ち。native hookの年度進行は翌春未接続として停止し、オフターンを進める画面操作はない。取消できるため永久的deadlockとはしないが、不要取消を強いる進行阻害。
- 原因は新規更改入口が成長の前提を確認せず、成長入口だけがpending更改を拒否していたこと。共通理由関数（既存requiresYearEndGrowthを再利用）をhuman reducer/共通world API/画面に追加し、offer/replaceだけ拒否。保存済みreplayを先に扱い、取消/回答/復旧は制限しない。
- RED: human offerのopen直後/引退確定後2件、同期/非同期world API2件、画面1件で修正前の成功/操作可能を確認。GREENへ修正。修正前実producerから生成したpending保存を固定fixtureとして保持し、旧提示の読込/replay/差替拒否/取消/回答を検証。
- シーズン中、オフ開始前からの期日到来済み提示、旧native、実producerの旧posting済み進行、固定旧posting保存、CPU raw提示を維持。成長後はposting未実行でも固定要求で提示できる。既存の保証/正式留保テストは期待結果を変えず、提示元だけを正規のオフ開始前へ更新。
- 実保存hookで拒否時root/world不変、成長保存失敗→cold再読込でも制約維持→成長保存成功→固定要求で提示→replay一回、読込一致を確認。
- 画面では新規/差替え確認だけ停止し、理由と「年度末成長の保存へ」を表示。既存取消/回答/復旧は維持。確認中にopenへ変わった古い確認画面も送信しない。
- 独立レビューでquote/直接replace同期非同期/偽replay/teamId偽装/CPU/旧replay/成長後提示を追加実証し、P1/P2なし。P3の不正cycle時に停止表示より前に例外になる回帰は、RED→GREENで既存停止表示を維持するよう修正。
- 旧コーチ観測の欠測限界、年度完走・長期成長表示/モバイル性能・実iPhone未検証は継続。schema1/DB5/公開OFF、既存保存barrierを維持。新規PR/main push/merge/auto-mergeなし。今回追加コミットの最終SHA・必須CIと画面結果はPR本文を正本とする。
- ローカル検証: 関連8ファイル179件成功、P3修正後の契約画面10件成功。Chromium/WebKitそれぞれ360/390/1440pxの3件、合計6件成功。実契約画面→成長画面リンク→保存失敗→再読込して制約保持→成長保存→固定要求で提示→保存再開を確認。変更前/後の画面は各ブラウザレポートの `blocked` / `saved` 添付。WebKitは既存の/tmp配置済み公式ブラウザ/不足ライブラリで実行し、事前OS検査だけを省略。実iPhoneではない。
- 最初の追加修正CI #743は全ブラウザ群がテスト開始前のOS依存インストールで停止した。ログ: `Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.56.0` / `Playwright does not support chromium on ubuntu26.04-x64`。成功済み#742の実行ログはUbuntu24.04を確認。ブラウザmatrixのruns-onだけを`ubuntu-24.04`に固定し、既存Playwright/テスト一覧/worker1/retries0/全timeoutを維持する。#743の未実行ブラウザを成功扱いせず、追加修正後の同一HEADで必須CI全体を新しく確認する。
- CI #744は単体/統合4,931件が成功し、新規画面6件も両ブラウザで成功したが、EC2ミラーのOS依存取得が30分上限を消費し一部群が停止。ログで`us-east-2.ec2.archive.ubuntu.com`の取得遅延を確認し、Azureだけを対象としていた既存ミラー処理にEC2地域ホストも追加。sources/listとmirrorlistを再現するPython回帰でRED→GREEN、署名鍵・security/Microsoft源・優先度の維持と冪等性を確認。既存の公式HTTPS archive取得方針を適用するだけで、timeout/retry/worker/既存テスト/必須ゲートは変更しない。
