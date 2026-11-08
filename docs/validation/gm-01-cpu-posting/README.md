# CPUポスティング・年度入口の接続

基準main `114181dc34a11bdb558277df8ba48c3b03b70f92`（#555マージ済み）。
[設計](../../superpowers/specs/2026-11-08-gm01-cpu-posting-design.md)／
[実装計画](../../superpowers/plans/2026-11-08-gm01-cpu-posting.md)。
最新HEAD・必須CIは提出PRを正本とする。

## プレイヤーに見える範囲

一般公開OFFのannualの12月1日、受信箱→「海外挑戦の希望を確認する」で、
全球団の希望とCPU球団の承認/拒否・海外交渉を一括保存する。
自球団の判断・交渉は既存の受信箱操作を待つ。
「CPU球団の判断・交渉結果」を展開すると、各選手の理由と終端状態を確認できる。
成立したCPU選手だけ、所属・元契約・譲渡金・翌年度限定枠が共通確定処理で変わる。

## 実データと実呼出経路

- 実名簿: `bootstrapTeams.createInitialTeams` → `playerMaster2026`/`realplayer` → 保存teams.players/farm。
  当年stats、年齢、元契約投影を参照。新規annual factory/fixtureに明示年度予算を与え、名簿給与は補正しない。
- 契約正本: `engine.spending.ledger`。正式留保と将来契約を検証し、年末名簿は11/30雇用を参照する。
- 年度入口: `AppScreenRouter`のretire_phase.onNext → `useOffseason.handleRetirePhaseNext`のannual分岐。
  12/1の必要clockを持つannual worldでposting段階だけ実行。引退判断の未接続入力を無視しない。
- 受信箱: `HubContentRouter` → `AnnualPostingRequests` → `useGameState.commitPostingGenerationRequest`。
- 共通候補: `reducePostingGenerationRequestAsync` → `reduceEconomyCommandAsync` → native
  `advance-posting-phase` → 全球団generate-posting-requests → 全CPU decide-posting → run-posting-market。
  同期APIも同じgeneratorを完走する。将来の市場成否をCPU判断へ渡さない。
- 保存: `commitEconomyOperation`の既存barrier → `commitEconomyCandidate` → `saveGame`公開 → 採用。
  preparing中もbarrierを保持し、保存前にlive所属/契約/進行を変えない。公開後の採用中断は既存復旧へ。
- 再開: cold load → 親子receipt/入力/root/契約/結果検証 → read model。確定判断を現在戦力から再計算しない。

年度producerが守る順序は、退職予約の固定（予約者は除外）→12/1 posting→更改留保/将来契約・FA→
当年成績の保存→翌春の加齢/成績リセット。古いlegacyのCPU更改後に希望生成を差し込まない。
既に希望確認済みの自球団生成receiptも再利用し、CPU工程だけを追加できる。

## 今回の検証

- 基準回帰2ファイル18件成功。
- native接続: 未対応commandで9件RED→11件GREEN。三市場結果、将来赤字、非ゼロ過年度、
  順序独立、非同期yield一致を追加。CPU policyの承認/拒否理由も検証。
- 実年度handler/保存接続: 2件RED（CPU工程欠損）→GREEN。
- 共通保存・実hookの初回46件、追加の非同期barrier/unmountを含む24件成功。
  inline/chunked、希望ゼロ、保存失敗→同じ結果で再試行、採用復旧、親後付け拒否、stale identity/sessionを含む。
- Chromium初回6件成功: 360/390/1440、保存失敗/再試行/再開、自球団の既存判断・市場、年度入口と翌春停止。
- 最終対象回帰・WebKit・実12球団ブラウザ測定・独立レビュー・最新HEADのCIは後段へ記録する。

## 性能と環境

Node24.22.1。実12球団の自然な性格・名簿に引退予約・正式更改留保・受諾済み将来契約を作り、
共通候補/保存/再読込まで確認。育成と上記競合の除外、12の生成receipt、一revision、一回のprimary公開を検証。
最初の1測定: 希望131、CPU判断121、市場92、同期候補5298ms、commit5901ms、公開1回。
これは現実の年間成立数や実iPhone性能の推定ではない。

この観測から、判断ごとの同じ台帳の再検証を一度へまとめ、UI経路では同じnative generatorの
球団・案件境界で既存yieldToBrowserへ制御を返す。保存と変更のbarrierは候補準備から保持する。
価格・乱数・ID・判断/結果・全年度審査は同期経路と一致する。Workerは追加・変更しない。
共通保存境界の全体検証/圧縮は同期区間を含み、ブラウザの最大応答間隔も測定して残す。

## 未接続・未検証と次工程

今回の完了はposting段階の統合であり、ポスティング全体/Task7/A1全体の完成ではない。
annualのオフ開始clock/退職・成長producer、翌春builder、年度Worker全体、長期経済、実iPhone、公開判断は残る。
`handleRetirePhaseNext`はposting保存後もfalseで停止理由と受信箱の必要操作を返す。
`handleNextYear`も未判断/未交渉を案内し、旧builderへfallbackせずfalseを返す。
実年度切替を変更していない。翌年度履歴テストはfixtureによる保存構造検証で、実Worker完走ではない。

次の優先工程は、annualのopen-offseason producerで退職予約・当年成績・12/1 clockと今回の工程を
正しい順序で保存する接続。更改/FA/翌春/Workerの一括再実装を本PRへ混ぜない。
公開OFF、schemaVersion1/DB5、legacy、#554数値v1/v2互換を維持。
main push・merge・automerge・履歴書換なし。ユーザーのマージ判断で止める。
