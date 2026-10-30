# GM-01 A1-1a 共通world・clock

基準: `b1768455da07704aaa77ecd41b2f805c595959a5`（#517マージ済み）。[設計](../../superpowers/specs/2026-10-30-gm01-a1-integration-design.md)と[計画Task 1](../../superpowers/plans/2026-10-30-gm01-a1-integration.md)を実装する。一般プレイはlegacyのまま。保存確定・移行・CPU・年次の接続は後続PR。

## 実装境界

- `toAnnualState / fromAnnualState`が唯一のteams/faPoolと既存draft結果を共通v2取引状態へ往復する。engineへ名簿・市場・draftContextを複製しない。台帳はこの段階ではnative v1のみ。
- `quoteEconomyCommand / reduceEconomyCommand`の入力は `{saveId, epoch, baseRevision, transaction}`。既存v1 commandを`transaction`へ渡す。quote/失敗は非変更。同一save/epochの同一receiptだけ再実行可能で、revisionを増やさない。別内容・型衝突・古い新規取引を拒否する。
- 実scheduleの暦日を使用。preseasonは2/1、offseasonは同年12/1＋明示turn。日付・年度欠損を試合数で補わない。
- 今季給与・年数・登録区分とbudget表示を正本から投影し、翌年度更改で今季salaryを上書きしない。新nativeは初期/人/CPUすべて保証付き。v2へ直接渡した非保証入力も拒否し、v1 fixtureの既存動作を保持する。
- Reactの名簿/年度/市場/オフ計画/メール/日程を同じReducerで保持する。`APPLY_ECONOMY_WORLD`は同一save/epochと直前revisionを照合する。現段階でannualを採用する公開hookはなく、通常`APPLY_PROGRESS`からのannual投入は拒否する。公開root証明/保存barrierはA1-1dの未実装要件。
- 初期factoryのpolicyは明示した`authorizations / rosterRequirements / budgetPolicies`。年度枠の計算はA1-1cで追加する。旧budgetや暗黙の係数は使わない。通常新規ゲームはこのfactoryを呼ばない。

## 試験

新規Vitestはengine 40件＋hook/reducer 3件。初回は未実装moduleによるRED、その後Reducerの3件のREDを確認。v2直呼び保証免除、pending契約IDの`0`/`"0"`衝突、取消済み契約IDの別選手への再利用、offseasonPlan欠損も別途RED→GREENを確認した。

- 見積/失敗の参照とJSON不変、乱数消費0、ID 0、同ID再実行、改変receipt、古いepoch/revision、見積後の予算不足。
- 現在と将来の契約投影、draft辞退の正本への反映、engineとmail/market/teamsの単一action、旧partial write/降格拒否。
- 明示した合法seedの12球団×65人＝780契約を一度に構築。元年俸/残年数/所属を維持。これは現行bootstrapそのものの新制度適合試験ではない。
- Chromiumの通常新規→5試合→保存/再開→1試合E2Eに新制度未有効のassertionを追加。WebKitはローカルで`libgstreamer-1.0.so.0`欠損により起動不能、依存インストールも実行環境の権限制限で失敗した。両browserの最終結果は公開headのCIで確認する。
- 対象回帰/ビルドと同一headの全Vitest・重要E2Eの最終結果はPR本文へ記載する。過去のCIを今回の合格へ転用しない。

独立レビューのP2（回答待ち契約IDの型衝突）は再現試験を追加し修正。保存候補の公開確認を今回のReducerだけで達成したとは扱わない。

## 発見した有効化前の課題

現行`createInitialTeams()`には**支配下扱いで年俸240万円の生成選手や300万円の実名seed**が存在する。新nativeの最低420万円と両立しないため、現在の名簿をそのままannualへ渡すと初期化を拒否する。実bootstrapの拒否・非変更も試験した。

このPRで年俸を切り上げたり育成へ付け替えたりせず、既存ゲームの価格/人数を維持する。A1-4aで新規annual専用の初期条件を確定し、生成経路と実名seedの区分/年俸を整合させ、実12球団factoryの成功を検証するまでA1-4bを有効化しない。旧セーブへの遡及補正とは分離する。

#517の保存B/C競合、翌年更改最終年までの枠、8/1以降の更改回答は、それぞれA1-1d/1c/2a以降の担当のまま。実装済み・実機合格・長期安定とは扱わない。

## PR #518 レビュー修正（A1-1a-FIX）

修正開始head: `69ff9587eb383c05a166d17a1a2f2ca0ec992993`。mainは`b1768455da07704aaa77ecd41b2f805c595959a5`、開始時CIは成功。今回の追加コミットの最終CI結果はPR本文の対象SHAと照合する。

- annualの`SET_MAILBOX / SET_NEWS`は契約・未知の通知の追加/改変/削除を拒否する。`season`は怪我と契約更改/FA/解雇/ポスティングが混在するため、推測で通常通知に分類しない。`interview`もチームへの副作用があるため保護する。契約条件・通知の変更は`APPLY_ECONOMY_WORLD`で一括採用する。
- 単独更新できる表示通知はnewsの`game / allstar / record`、mailboxの`championship / hof / morale_warning`。保護対象のメールも`read`だけは変更できる。契約回答の`resolved / resolution / decision`は変更不可。許可した変更でもrevisionを進め、古いworld候補による通知の巻き戻りを拒否する。同内容の再適用はno-op。
- annualの関数型updaterはコピーに適用してから検証し、拒否時の元worldの参照・内容・revisionを維持する。不正な配列/重複ID/未知mode/安全整数を超えるrevisionも拒否。legacyのsetter、保存形式、新制度OFFは維持。
- 初期factoryは全ての入力済み予算行を型付き球団ID・年度で照合し、両側の承認額を必須の非負安全整数として検査する。未記録、不正値、不一致、片側のみの行、重複を拒否する。0は実際の承認額として保持し、旧budgetから補完しない。必要年度より先の入力行も検査するが、年度生成は行わない。

### 再現・回帰

- 本番修正前: 対象2ファイル66件中19件失敗・47件成功。契約通知の部分更新、元配列を変更するupdater、revision競合、policy不一致/欠損の検証を含む。
- 修正後: 同じ2ファイル66件成功（engine47件、hook/reducer19件）。元の43件から23件追加。12球団×65人の合法seed初期化は引き続き成功。
- Chromium E1: 通常新規→5試合→保存/再開→1試合成功。独立ポート5188で今回のcheckoutを起動し、保存データに新制度がないことを確認。
- ローカルmobile-webkit E1は`libgstreamer-1.0.so.0`欠損でブラウザ起動不能。最終headのCIで同シナリオを確認する。ローカル成功とは扱わない。
- `npm run build`成功。既存の大きなbundleに関する警告あり。
- 関連11ファイル165件成功（保存/再開、試合進行、契約回答、面談、給与、年度取引/支出）。`npm test`は255ファイル2831件成功、既存の明示実行用ベンチマーク2ファイル2件skip。最終headのCIはPR本文に記録する。
- 追加差分の独立コードレビュー: 今回の範囲で追加のP1/P2指摘なし。

### 後続接続時の必須確認

A1-1aでは公開hookへのannual採用経路がなく、一般プレイはlegacy。A1-1dで公開worldを接続する際は、旧`setNewsState`がupdaterをlive refへ先行適用する経路を流用せず、採用済みworldから通知refを同期する。旧`addNews(...slice(0,50))`が契約通知を押し出す場合も、このguardを緩めず、通知生成/保持/削除を共通worldのcandidateへ組み込む。混在する`season`通知も生成責務を分ける。これは一般有効化前の接続要件であり、今回annualの一般公開が完了したことを意味しない。

A1-1b（legacy開始残高）へ進める条件は、今回の最終headのCI成功と本PRのマージ。マージ操作は本修正に含めない。
