# 海外挑戦の希望生成 → 受信箱

基準main `b022485111ae5d447d7c3f7b0f37c3b88e27f102`（#554マージ済み）。
[設計](../../superpowers/specs/2026-11-07-gm01-posting-request-generation-design.md)／
[計画](../../superpowers/plans/2026-11-07-gm01-posting-request-generation.md)／
[PR #555・最新HEADと必須CI](https://github.com/shotaro-hue/baseball-manager/pull/555)。

## 今回のプレイヤー経路

annualの12月1日、通知から受信箱→「海外挑戦の希望を確認する」→確認して保存→
生成された申請の承認/拒否→既存の海外交渉・結果説明へ接続する。
これは一般公開OFFのannual経路。旧ゲームへ新制度を有効化せず、読込・閲覧だけで取引を生成しない。

希望生成では支配下の一軍/二軍を同じ条件で評価する。年齢は保存済み出生日根拠から計算。
海外志向60以上を入口にする既存確率を維持し、24〜30歳/士気/PA・BFの出場量を反映する。
未記録の海外志向は既存市場と同じゲーム推定。推定を本人の実測値として書き戻さず、
申請本文へ推定区分を表示する。PA/BFの欠測はsnapshotにnull、実測0は0で保存する。
少出場への係数はモデル上の仮定であり、現実の申請率の実証ではない。

育成、引退/予約、正式留保、受諾済み将来雇用、当年既申請と旧postingRequestedは対象外。
生成時の入力/確率/draw/子申請IDを親receiptに保持し、ゼロ件も年一度の判定済みとして保存する。
選手・年・用途別の乱数はcaller IDや候補順序に依存しない。金額/承認/市場結果はこの操作の入力にしない。

## 正本と保存

`createInitialTeams`/保存名簿→共通`generate-posting-requests`→既存`request-posting`の子取引→
`engine.postingApplications/transactions`→人adapter→`commitEconomyOperation`→
`commitEconomyCandidate`/共通復旧→cold load→受信箱のread model。
新しいメール正本や保存経路は追加しない。希望生成はpostingRequestedだけを変更し、
所属・給与・保証・モラル・財務を維持する。生成親と子は同じrevision/保存候補で公開し、
公開済み子申請への親の後付けを拒否する。既存履歴のprefix保護・保存rootの同一性を維持する。
後日の性格/能力/配置の変更から過去の希望を計算し直さない。

## 技術検証

ローカルは関連12ファイル合計195件成功（重複実行分を除く）。

```text
vitest run src/engine/__tests__/generatedPostingRequests.test.js tests/generated-posting-requests-commit.test.js src/hooks/useGameState.economyPosting.test.js src/engine/__tests__/postingMarketNumericCompatibility.test.js
# 4 files / 55 tests
vitest run src/engine/__tests__/annualPostingApplications.test.js src/engine/__tests__/postingMarketModel.test.js src/engine/__tests__/annualPostingMarketResults.test.js src/engine/__tests__/postingMarketInputs.test.js tests/generated-posting-market-commit.test.js src/engine/__tests__/humanPosting.test.js src/components/tabs/MailboxTab.posting.test.js src/hooks/useOffseason.posting.test.js
# 8 files / 140 tests
```

native producerは未実装時11件RED→GREEN。その後、既存市場との推定志向一致を追加して12件成功。
人hook/UIは新3件のRED→GREENと既存12件を確認。ゼロ、明示0/欠測、実12球団の育成除外、
既申請/退職/予約、順序独立、入力・draw・確率・ID・root改変拒否、翌年度の履歴保持を含む。
実save/load/commitはinline/chunked・希望あり/ゼロ、失敗→cold load→同じ判定、
公開済み候補の採用復旧、親後付け拒否、stale save/epoch/team/revision/date/seasonを検証。
人UIの希望生成→承認→市場は実hookと共通保存を通す。

年度保持テストは既存の翌年度fixture helperを用いた保存構造の検証であり、実年度Workerの完走ではない。
全件/build/重要E2Eは最新HEADの必須CIを正本とし、同じ全セットをローカルで重複実行しない。

## 独立レビュー

対象source `7764aa3d6083d8cc3604403bdd4cb6907d93d4ff`。
別コンテキストのレビュアーに基準SHA/差分、設計・計画、実名簿入口を渡した。確定P1/P2なし。
追加probeで自然な性格データの12球団をそれぞれ実行し、球団あたり63〜69候補、5〜17希望。
生成＋検証は約0.96〜1.22秒。これは年間成立数の予測、保存/年度Workerの性能測定ではない。
未回答更改の対象除外、拒否済みの非ゼロ生成履歴の翌年度保持と性格/士気変更も確認した。

レビュー後のproduction差分は確認領域のアクセシブル名とフォーカス復帰。
確認中も起点ボタンを保持し、共通部品が起点を復元できるようにした。
ブラウザ回帰で一意の確認region・見出しフォーカス・Escape後の起点復帰を検証する。

## 画面・操作検証

既存`HubContentRouter`→`MailboxTab`→実`useGameState`/保存を使用。
360×800、390×844、1440×900で同じ保存状態を比較する。
beforeは同じデータで追加のannual生成操作を表示しない参照、afterは操作を表示した状態。
CSS/表示境界は変更しない。以下の画像とブラウザ結果は本PRの検証用annual worldであり、
一般公開ゲームの年度一周や実iPhoneの確認ではない。

| 幅 | 変更前 | 変更後 |
| --- | --- | --- |
| 360 | [before](./360-before.png) | [after](./360-after.png) |
| 390 | [before](./390-before.png) | [after](./390-after.png) |
| 1440 | [before](./1440-before.png) | [after](./1440-after.png) |

`save-generations.spec.js`から新しいケースを既存CIへ読み込む。
変更後のChromium/WebKitは新5ケース×2で10件成功（360pxの2件＋残り8件、同じproduction source）。
希望あり/なし、保存失敗と同一再試行、再開、既存の承認→市場へ接続、コンソール/横はみ出しを確認する。
確認見出しへのフォーカス、Escapeで起点ボタンへ戻ること、Enterで再度開くことを検証する。
実名簿ブラウザcaseは自然な性格/出生日を持つ2球団を使用し、他球団の非変更も確認する。
12球団生成/除外/入力の確認は上記native回帰と独立probeが所有し、各ブラウザで長い12球団保存を重複しない。

ローカル環境はNode24.22.1、Playwright Chromium141/WebKit26.0（build2215）。
WebKitの不足Debianライブラリを/tmpへ展開し、同じ配布binaryを参照する一時ラッパーで起動。
host事前確認のみ省略し、assertion・timeout・retry/CI条件は変更しない。CIは既存通常構成を維持。
最終の両ブラウザ結果と最新HEADの必須CIはPRへ記載する。

## 機能全体の残作業

CPU判断、年度Workerからの希望/市場呼出、年度切替の統合、長期経済校正、実iPhone、公開判断は未完了。
Task7/A1・ポスティング機能全体は未完成。公開OFF/schema1/DB5を維持する。
次は同じproducerと申請→結果の経路をCPU/年度進行へ接続する。
main直接push・merge・automerge・ブランチ削除・履歴書換をせず、PRのマージ判断はユーザーへ返す。
