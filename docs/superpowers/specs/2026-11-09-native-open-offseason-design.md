# PR-C native open-offseason 接続

基準main `a61be5da7d90487134c8098089d190e4e9e2926e`（PR-B #560マージ済み）。着手時open PR 0、作業変更なし。ユーザーの三工程指示のPR-Cのみを実行する。

## 目的と完成範囲

親目標は、閉幕した年度の記録を保ち、翌年度の更改・補強に使う承認枠を保存後に利用できること。本工程はnative worldの閉幕→12/1の接続を完成させる。通常プレイのannual切替、期末の新規引退判断・成長・要求年俸、翌春builder、annual Worker全面接続は実装しない。公開ゲートOFF、schemaVersion 1、DB version 5を維持する。

通常Appはannualを公開していない。入口は内部native worldと`useGameState`の専用commit API。既存の年度handlerから呼べるようにするが、成功後も旧引退/成長/翌春handlerへ進めない。画面の新設・公開は含まない。

## 正本と処理

- 年度・名簿・契約・収入は、現在保存されている同一saveId/epoch/revisionのworld。
- 閉幕は`offseasonPlan.playoff`の全試合結果を既存`postseasonClosingDate`で検証する。plan年度/球団、元日程、完了した公式戦数、出場球団の凍結成績も照合する。144という数から日付を推測しない。
- 既存clockのphaseは増やさない。`phase=season / gameDay=144 / cycle.stage=postseason`は、保存された日付付き完了結果がありclock.dateがその閉幕日と一致する場合だけ有効にする。`economyClockFor`の公式戦1〜143制限は維持。日付なし旧履歴・未完了・7月All-Star行への参照・推測値は拒否する。この入力を実ゲームから作るannual Workerは後続工程。
- 翌年度予算はPR-B `forecastNextAnnualBudget`を現在のclubFinanceと検証済み収入から生成する。記録済み係数/支援を使い、欠測は推定のまま。過年度財務archiveはないため外部履歴・独自係数・既製quoteをrequestで受け取らない。根拠不足は非変更で拒否する。
- candidateではY年を維持し、clockだけY年12/1・offseasonTurn 0、budgetSeason Y+1、cycle.stage offseason-openへ進める。現在/過去の承認行を保ち、必要な将来承認・許可・人数行を既存形式へ置換する。旧budget/nextClubBudgetは使わず、budget表示は既存台帳から再投影する。postingの年度限定追加枠は既存quoteを使う。
- 既存`cycle.transitionReceipts`へ固定ID `[saveId,epoch,Y,'open-offseason']`のreceiptを一度追加する。閉幕日、元/新revision、審査年度範囲を記録し、読込時の検証と上書き時の履歴保持を行う。未知の古いreceiptは変更しない。forecast/evidenceを新規root/stateへ保存しない。
- `reduceOpenOffseasonRequest`は純粋な単一candidateを返す。同じ操作は再生、別identity・revision・閉幕根拠は拒否。hookは既存`commitEconomyOperation`と`commitEconomyCandidate`を使い、保存→公開root再読込→identity/revision照合→React採用確認の順を保つ。失敗前採用・二段階domain更新・新たなstate管理機構を作らない。
- 12/1の引退予約確定→postingは別操作として既存native経路へつなぐ。本操作自体で引退抽選・成長・投稿市場・翌春を実行しない。

## 受入条件

1. 実bootstrap名簿/既存財務計上/実日付付きpostseason producerを使った成功例。全12球団・翌年から必要最終年度までの承認を保存・再開後も保持する。
2. 公式戦時計/旧履歴の拒否を維持し、矛盾した試合・年度・日程・時計・receipt・承認の改ざんを拒否する。
3. 保存失敗は元world/rootを保持、同じrequestの再試行は同じcandidate。重複は一receipt/一revision。古いsession、保存中の操作、公開root差替えは採用しない。
4. 公開後の採用失敗は既存明示復旧から同じ保存済みcandidateを採用し、再公開しない。backup回復・cold reload・旧セーブを検証する。
5. 新規回帰のRED→GREEN、関連テスト、実ブラウザ保存テスト、独立レビュー、最新HEAD必須CIを確認してPRを提出する。実iPhone Safariは別途未検証として記録する。
