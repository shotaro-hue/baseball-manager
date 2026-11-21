# GM-01 A1-3c-1 オフターン・回答接続

基準main defb3ebf（#563済み）、未マージPRなし。ユーザー要件12とAGENTSに従い合理的な範囲選定・実装・PRまで継続する。

## 目的と完成条件
契約更改画面から現在ターン・回答待ち・回答予定を確認し、1ターン進めて更改/獲得の回答を受け取り、保存再開しても維持する。成長前の旧pendingも取消を強要せず解決する。新規提示の成長ガードは維持。

## 調査・経路・正本
通常annualは公開OFF。内部native経路はpostseasonの閉幕日→予算forecast→open(12/1,turn0)→引退→成長保存→posting。成長後の人間更改はposting完了を待たない。既存human更改/獲得はdecisionsに固定評価・回答予定、reservationに正式留保、ledgerに現/将来契約を持ち、economyDecisionsが両回答を一candidateで確定する。useGameStateのcommitEconomyOperation→commitEconomyCandidate→公開root検証→採用ack/復旧を再利用。メールは投影。

## 構成と比較
全更改・CPU・満了・FAを同時実装する案は複数取引の評価・保存・完了条件が拡大する。時計だけを先に保存する案は回答と不整合になる。ユーザーが許可した分割を選び、時計と既存schedulerの一candidateだけを先行PRとする。CPUの旧cpuRenewContractsは純粋planCpuRenewals等と旧salary/budget writerが混在するため今回は呼ばない。後続で評価を再利用し、ledger/reservation成立を接続する。

## 最小実装
厳密なsaveId/epoch/baseRevision/actionを持つadvance-offseason-turn要求。旧画面・重複要求はrevision/sessionで拒否。元world検証→現在期日の回答→時計+1→新期日の回答→revisionを元+1へ統一。上限37、旧37超保存は既存回答確認を利用し時計を進めない。成長保存前（requiresYearEndGrowth）は正当な自球団更改/獲得pendingがある操作だけ進め、pendingがなくなれば空進行を拒否する。成長後・旧native/旧postingは従来どおり1ターン進む。乱数再抽選/新規receipt/保存正本は追加しない。保存失敗は元world維持・同要求で再試行、採用失敗は既存復旧。

契約画面の既存表示・確認・エラー/復旧UIを利用。ターン、全自球団更改/獲得pending件数と各予定を表示。第30まで提示、第31以降は回答待ち、第37で最終回答と未接続工程を明記。期限で未判断者を自動放出しない。新規更改/CPU/FA操作をターン進行が勝手に起こさない。

## 非対象・依存
CPU更改/満了判断/市場供給・工程完了判定・翌春/年度切替は後続。このPR提出後に停止。取得済みFA・補償・加入待ちは既存scheduler/台帳の規則を維持。schema1/DB5/公開OFF、旧nativeに成長を遡及生成しない、legacy経路不変。

## 受入
engine: 1刻み/同ターン複数回答/更改と獲得/持越date/成長前旧pending/固定要求/30・31・37/旧超過/不正要求。
hook: 保存失敗再試行・冷再開/backup・二重操作/stale session・公開後復旧、実12球団bootstrap→既存年度producer→成長→提示→回答。
画面: Chromium/WebKit各360/390/1440、提示・再開・進行失敗/再試行・回答・再提示/取消、横溢れとスクリーンショット。WebKitを実iPhoneとは扱わない。独立レビューと最終HEAD全必須CI。


## 2026-11-21 PR #564 P2修正

旧HEAD 0ac5626の実open→空turn31→引退/成長保存→更改提示で期限拒否を再現（RED）。原因は成長前の新規提示ガードと、空turnを許す進行条件の不整合。

共通offseasonTurnGrowthIssueをeconomyDecisionsに置き、engineは既存world/decisions検証後・回答処理前、契約UIは同じhelperの理由とdisabledを利用する。requiresYearEndGrowth自体の意味は変更しない。旧pendingは現在期日→+1→新期日の既存順序を維持する（既にdueのpendingもその操作で確定可能）。最後のpendingが解決したら次の空進行を拒否し、直接の回答確認/取消/既存replayは制限しない。上限37以降の既存回答確認も維持。時計の巻戻し・期限変更・遡及成長・新しい永続証跡は追加しない。

対象はこの順序不整合のみ。CPU更改・市場供給等へ広げず、同じPRへ追加コミットする。新規native open/引退後・旧更改/獲得混在・due済み/37/38・取消/replay・cold/保存失敗・成長後30/31/37・旧native/旧posting/legacyを回帰対象とする。
