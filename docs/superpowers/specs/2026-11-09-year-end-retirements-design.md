# native期末引退判断

基準main `259c200b18518a228f69abd12274c304be57a027`（#561マージ済み）。AGENTS.mdの「次へ進めて」の工程選定規則に従う。親目標は、閉幕した選手の判断と記録を更改・補強へ引き継ぐこと。今回は保存済みnative 12/1から、既存引退画面で人の受入/慰留意向とCPUの引退判断を保存し、結果確認後に既存postingへ進める。

## 選定と制約

実試合/Workerのannual接続は途中postseason時計・scheduler・全進行protocolまで広がる。成長/要求額を先に行うと引退者にも旧年成長を適用するため、既存年次計画の退職→成長の順に従い期末引退を先に接続する。独立した読取レビューでも同じ範囲を推奨。

公開OFF/schema1/DB5、legacy・旧native冬・既存予約を維持。成長/要求額・FA判断・翌春・Worker・移行/係数校正は非対象。通常annual年度完走やポスティング全体の完成と報告しない。依存追加、旧セーブの暗黙書換え、日付推測はしない。

## 設計

- 入力正本は同じsaveId/epoch/revisionの保存world。人は自球団の一軍/二軍35歳以上の未予約選手について、既存calcRetireWillが30以上ならaccept/retainの意向を必須入力する。結果accepted/retained/retain_failedをUIから受け取らない。低スコアは対応不要、予約済みは再慰留しない。
- CPUは同じ旧年の一軍/二軍35歳以上を既存スコア確率で判定する。乱数は既存economyRandomContextとrngfを使い、年度・選手・操作・用途別に固定。慰留は既存retireStyle（未記録50）の成功規則を維持する。0を欠測へ置換しない。
- 新規判断は12/1、posting希望/phase生成前だけ。旧posting済み冬に後付け判断を要求しない。新しい操作は期末判断0人も一度保存する。
- 新open-offseason年度の未判断はworld共通入口でposting phase/準備/球団別希望生成を拒否し、受信箱も同じ判定で引退画面へ戻す。既存receiptの再利用と旧冬の保存済みpostingは維持する。
- prepare-year-end-retirementsが、既存未確定予約の確定→新規判断/明示期末記録→引退確定を既存子取引の審査で合成する。一candidate/一revision。人の未回答・将来契約・正式留保競合は非変更で拒否し、勝手に取消さない。
- 期中reserve-retirementは1〜143/12月より前のまま。新reserve-year-end-retirementは明示origin=year-end、通知日=効力日=12/1として既存retirementReservationsに記録する。元雇用の照合日は旧年11/30。期中の通知・日程を捏造しない。finalize-retirement、career書込、球団履歴、保証retain、配置参照除去、引退専用支出審査を再利用する。
- 親receiptは既存engine.transactionsに入力スコア根拠・人の意向・結果・子ID/順序を記録する。新root/envelope/並列stateは追加しない。load/保存で再検証し、既存履歴削除/変更・子の後付けを拒否する。過去のCPU判断は現在ロスターで再抽選しない。
- 既存commitEconomyOperation/commitEconomyCandidateで保存→公開root照合→React採用確認→ack。失敗は元world/root保持、同意向再試行は同結果、公開後中断は既存復旧で追加公開しない。
- 既存引退画面内で意向を選択し最終確認、一括保存後に人/CPUの結果と保証を説明する。別操作で従来のpostingへ進む。既存CSS/画面構成を維持し、360/390/1440pxと異常/再開を確認する。

## 受入

実bootstrap→既存閉幕fixture/PR-C open-offseasonを主入力とし、受入/慰留成功・失敗、CPU・farm・予約混在、0人、保証残/欠員、将来契約競合、改ざん、順序・JSON・無変異・乱数独立を検証。実IndexedDB/Reactで保存失敗→同意向再試行、session/revision/barrier、cold reload/backup、career、公開後復旧を検証。対象Chromium/WebKit、独立diffレビュー、exact HEAD必須CIを確認してPRを提出。マージ・自動マージ・main pushはしない。実iPhoneは未検証と記録する。
