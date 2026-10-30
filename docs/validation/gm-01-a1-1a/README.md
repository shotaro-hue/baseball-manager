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
