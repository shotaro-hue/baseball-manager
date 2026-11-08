# CPUポスティング・年度入口の接続

基準main `114181dc34a11bdb558277df8ba48c3b03b70f92`（#555マージ済み）。
[設計](../../superpowers/specs/2026-11-08-gm01-cpu-posting-design.md)／
[実装計画](../../superpowers/plans/2026-11-08-gm01-cpu-posting.md)。
最新HEAD・必須CIは提出PRを正本とする。

## PR #556 P2: CPU承認前の将来予算審査（2026-11-08）

開始HEAD `bdc35ad89dfc9a0542432f8b812cdebe09aebe43`。最新mainは`114181dc`、#555マージ済み。
GitHubの差分・CI #709成功・コメント/スレッドなしを確認し、ユーザー指摘を現行コードで再現した。

- 原因: CPU v1は戦力・契約満了だけで承認し、移籍後の残存保証＋欠員補充留保の予算違反は市場後の一括審査で初めて判明した。同じseedで工程停止を繰り返せた。
- 新規判断v2: 全球団希望生成後、既存承認と新規承認を退団予定として累積し、元契約のretain退団を未公開の予算投影だけに作る。共通の年度別欠員留保投影と支出審査・赤字不悪化審査を再利用し、予算不可はCPU拒否`future-budget`とする。
- 市場の成否・抽選・提示額・将来譲渡金は参照しない。先の承認が後にno-offerでも、後続判断の予算を戻さない。市場成立後の最終一括審査は同じ条件で維持する。無効データの例外は捕捉してCPU拒否へ変換しない。
- 仮退団/仮留保は保存しない。一候補・一revision・一回のprimary公開と既存CAS/session/原本保護を維持する。自球団は引き続き人の判断待ち。
- 保存互換: schema1/DB5は変更なし。親receiptのpolicyVersionでv1/v2を区別する。v1入力/評価を固定し、新規v2だけ共通審査結果`budgetAffordable`を判断入力へ保存する。修正前コードから固定した20件の親/CPU子receiptを検証・save/cold load/replayし、書換えを行わない。

検証（この追記以降の最終HEAD/CIはPR本文を参照）:

- 修正前基準23件成功。2028予算21,000万円・給与保証21,000万円・追加留保420万円による工程失敗と、2選手の累積過剰承認の2件RED→GREEN。
- native29件成功。余力840万円の承認/市場、420万円で単独可・累積不可、既承認の累積、2027/2028の保証と420万円/退団の留保、正式更改留保/受諾済み将来契約の余力消費、異なる市場seedで判断一致、人の権限、破損失敗を確認。既存の予算違反拒否テストを維持。
- 関連回帰34ファイル674件成功（既承認累積の追加1件はその後native再実行）。契約台帳・全年度支出・更改・ポスティング・実hook・共通保存/復旧を含む。保存失敗時のroot原本保持、同一再試行、primary公開1回、v1冷読込を確認。build成功。
- Chromiumの追加テスト初回1件はsummaryの件数付き表示に対するexact locatorの誤りで失敗。snapshot/traceで確認し、表示要素の指定だけを修正して当該1件成功。他8件も成功。
- Chromium/WebKitの対象は追加2ケースを含む各9ケース、**18件すべて成功**。ローカルWebKitは公式Debianライブラリを/tmpへ展開し、同じ配布WebKit2215にライブラリ・bundleパスを渡して実行。初回は共有Viteを所有するChromium終了後に6件がConnection refusedとなったため、専用サーバーで該当6件を再実行して成功。timeout/retry/skip/CI構成は変更なし。
- 実12球団の各1測定: Chromium開始〜採用20,095ms/最大timer間隔1,247ms、WebKit28,024ms/1,248ms。primary公開はともに1回、一revision。事前の全年度審査により所要時間は増える。自然生成が異なるworldのため、厳密な速度比較ではない。保存を含む同期区間と実機性能の課題は残る。
- 独立レビュー対象`c0b15cdc1065aed97479a964078f7aa643a2cd81`（修正開始`bdc35ad8`からの差分）。別コンテキストへSHA/差分・要件・実名簿/実入口を渡し、確定P0/P1/P2/P3指摘なし。レビュアー自身の5ファイル147件と、既存赤字の不悪化/欠員追加時の拒否も成功。ブラウザ/実機の独自再実行はしていない。レビュー後のproduction変更なし。
- 実iPhone Safari・年度切替/Worker/翌春・長期経済は今回も未実施。承認前審査は譲渡金を見込まない保守的な判断であり、実際の成立後なら資金が足りる案件も拒否し得る。

詳細計画: [budget fix](../../superpowers/plans/2026-11-08-gm01-cpu-posting-budget-fix.md)。

### CI #710で検出した計算負荷と追加修正

`ec1355a9`の[CI #710](https://github.com/shotaro-hue/baseball-manager/actions/runs/42446713036/job/128627056928)はbuild成功、全件4,604件成功/1件失敗/既存2 skip。
失敗は既存の`runs the real twelve-club phase through one publication and preserves retirement/renewal conflicts`の60秒超過であり、追加の予算投影による負荷との関係を認めて修正した。単なるflakyとは扱わず、再試行だけでは済ませない。

CPU profileで年度ごとの同じ台帳の検証・投影と、全契約のID線形検索が支配的と確認した。必要な共通予算評価として次だけを追加する。

- `contractEmploymentsAt`で一つの同期評価内の複数年度を同じ検証済み投影から読む。毎呼出で台帳全体を検証し、呼出をまたぐcacheは持たない。元データ破損の見逃しを防ぐ。
- 支出審査の契約ID照合をMap化し、同じ球団の登録枠評価も一つの年度投影内だけ再利用する。全履歴・全年度・赤字不悪化の審査条件は変更しない。
- 複数日での移管/昇給/retain終了と、前回正常でも次回の破損を拒否する追加2テストをRED→GREEN。最適化初回の対象5ファイル173件成功。最新HEADの関連回帰・両ブラウザ・CI結果はPR本文へ記録する。
- 共通審査が既に返した年度行を不悪化チェックへ使い、CPUの固定起点の行も工程内だけ保持する。最終確定のquote出力は従来どおり。最終差分の関連回帰34ファイル677件とbuildが成功し、60秒制限の実12球団保存テストも32.3秒で成功した。負荷・名簿で時間は変わるため、最終CIで同じテストを必須のまま確認する。

上記の最適化は最初の独立レビュー後のproduction変更であり、そのレビュー範囲とは区別する。追加差分のレビュー結果はPR本文を正本とする。timeout/retry/期待値/skipは緩和していない。

以下はP2修正前の接続工程の記録として保持する。

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
- 最終対象回帰: **26ファイル426件成功**（下記コマンド）。既存更改/FA/新人/トレード/育成、
  共通commit/復旧、#554数値互換、legacyを含む。テスト削除/skip追加/timeout変更はしていない。
- ブラウザ: 対象7ケース×Chromium/WebKitの**14件成功**。Chromiumは初回6件と、同一production sourceでの
  画面記録3件＋追加12球団1件で検証。重複実行分を件数へ加算しない。
- 全件test/build/必須E2Eの結果は最新HEADの提出PR本文へ記録する。ローカルで同じ全セットを重複しない。

```sh
npx vitest run src/hooks/useGameState.economy*.test.js src/hooks/useOffseason*.test.js src/engine/__tests__/annualPosting*.test.js src/engine/__tests__/generatedPostingRequests.test.js src/engine/__tests__/cpuPosting.test.js src/engine/__tests__/postingMarketNumericCompatibility.test.js tests/economy-commit*.test.js tests/generated-posting-*.test.js
npm run test:e2e -- save-generations.spec.js --grep 'annual posting wishes|annual posting entry|twelve-club CPU posting' --workers=1 --retries=0
```

ローカルWebKitは不足Debianライブラリを/tmpへ取得・展開した。既存ラッパーがLD_LIBRARY_PATHを
上書きするため、同じWebKit2215の配布binaryを一時ラッパーから起動し、ライブラリとbundle場所だけを指定。
host事前確認の代わりに実binaryの依存を解決した。アサーション/timeout/retry/skip/CI設定は変更なし。
最初の起動失敗7件は不足ライブラリによるもので、成功へ算入していない。CIは通常構成。

## 独立レビュー

対象SHA `314d9b25949012d62732efaee29275e2758ecdea`、base `114181dc`。
別コンテキストへSHA/差分、要件、設計/計画、実名簿入口と実年度handler/受信箱/保存経路を渡した。
**確定P0/P1/P2/P3なし、修正指摘なし**。レビュアー自身のnative/CPU policy 23件も成功。
共有async commit barrier、複数承認の役割維持、判断前に市場を参照しないこと、親子/prefixと歴史、
未接続年度処理を成功扱いしないことを確認した。実save/browserを独立担当が再実行したとは報告しない。
レビュー後は検証文書と画像のみを追記し、production sourceは変更していない。

## 性能と環境

Node24.22.1。実12球団の自然な性格・名簿に引退予約・正式更改留保・受諾済み将来契約を作り、
共通候補/保存/再読込まで確認。育成と上記競合の除外、12の生成receipt、一revision、一回のprimary公開を検証。
最初の1測定: 希望131、CPU判断121、市場92、同期候補5298ms、commit5901ms、公開1回。
これは現実の年間成立数や実iPhone性能の推定ではない。

この観測から、判断ごとの同じ台帳の再検証を一度へまとめ、UI経路では同じnative generatorの
球団・案件境界で既存yieldToBrowserへ制御を返す。保存と変更のbarrierは候補準備から保持する。
価格・乱数・ID・判断/結果・全年度審査は同期経路と一致する。Workerは追加・変更しない。
共通保存境界の全体検証/圧縮は同期区間を含む。

| 実12球団・ブラウザ各1測定 | 確認開始〜採用 | timer更新回数 | 最大応答間隔 | primary公開 | CPU判断 / 市場 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium141 | 10,407ms | 265 | 1,223ms | 1 | 120 / 98 |
| WebKit26.0 | 14,252ms | 237 | 2,472ms | 1 | 119 / 93 |

測定は20ms timerで行い、native処理中にも更新が続くことを確認。初期名簿の生成乱数を含む別worldなので
ブラウザ間の件数/時間を同一seedの比較へ転用しない。選手ごとの保存はなく、失敗/復旧も同じ一括候補を使う。
**同期の保存検証には秒単位の応答停止が残る**。画面停止ゼロ/実機快適性の保証はせず、
一般公開前の性能改善・実iPhone確認を残す。

## 画面記録

#555のmain上の同じ合成world/同じ幅の生成前画面と、今回の生成前/再開後を比較。
新規CSS/表示境界の変更なし。360/390/1440の画像を開き、文字・主操作・横はみ出しを確認した。
テスト内のlegacy非表示参照は比較前のmain画面とは区別し、ここではmainの既存記録を使う。

| 幅 | #555後mainの生成前 | 今回の生成前 | 保存失敗 | 再開・CPU結果と自球団判断待ち |
| --- | --- | --- | --- | --- |
| 360 | [main](../gm-01-posting-request-generation/360-after.png) | [after](./360-after.png) | [failure](./360-failure.png) | [reload](./360-reload.png) |
| 390 | [main](../gm-01-posting-request-generation/390-after.png) | [after](./390-after.png) | [failure](./390-failure.png) | [reload](./390-reload.png) |
| 1440 | [main](../gm-01-posting-request-generation/1440-after.png) | [after](./1440-after.png) | [failure](./1440-failure.png) | [reload](./1440-reload.png) |

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
