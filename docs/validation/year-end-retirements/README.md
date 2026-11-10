# native期末引退判断 — 検証と引継ぎ

基準main `259c200b18518a228f69abd12274c304be57a027`（PR-C #561マージ済み）。[設計](../../superpowers/specs/2026-11-09-year-end-retirements-design.md)／[計画](../../superpowers/plans/2026-11-09-year-end-retirements.md)。最終HEAD・必須CIは提出PR本文を正本とする。

## プレイヤーができることと完成範囲

保存済みnative 12/1の引退整理で、自球団の一軍/二軍の期末引退候補を確認し、受入/慰留の意向を選んで保存する。CPU判断も同時に確定し、結果と保証を確認後、別操作で既存の海外挑戦希望確認へ進む。保存失敗は同じ意向で再試行、公開後の中断は同じ画面から復旧できる。

**今回はnative期末引退判断の工程。通常プレイのannual年度完走、Task7/A1、ポスティング全体は未完成。** 通常Appの公開OFF/schema1/DB5を維持する。通常/戦術/Workerのannual進行と途中postseason時計、成長/要求年俸、FA/更改計画への年次接続、翌春builder、初年度policy/移行/公開、長期・実iPhoneは残る。次は引退済み選手を除いた旧年成長/要求額の保存接続を、最新mainの依存と照合して選ぶ。

## 正本と保存経路

| 対象 | 正本/生成/利用先 |
|---|---|
| 年度・閉幕・予算 | 保存world → PR-Cのopen-offseason → 同一year/12/1/翌年度枠 |
| 引退対象 | 同じworldの一軍/二軍・既存予約・年齢・出場/モラル/残年数。人は35歳以上/意欲30以上、CPUは35歳以上 |
| 判断と乱数 | 人のaccept/retain意向のみ入力。既存calcRetireWill、economyRandomContext/rngf、年度・選手・操作・用途別scope |
| 期末source | 既存retirementReservationsのorigin=year-end。明示12/1通知/効力日、元雇用は11/30で照合。期中1〜143の通知日は変更しない |
| 引退効果 | 共通finalize-retirement → 元年成績/career/球団履歴、配置除去、保証retain/欠員留保。正式留保・将来契約の自動取消なし |
| 一度だけの判断 | engine.transactionsの親yearEndRetirements + 既存のreserve/finalize子receipt。0人も親を記録。新root/別ロスター/乱数cursorは追加しない |
| 保存/採用 | human adapter → useGameState既存commitEconomyOperation → saveloadの保存・公開root照合 → React採用確認 → ack。careerは同じ世代公開 |
| 次の利用 | 保存結果を既存引退画面へ表示 → 別操作で予約確定済みの既存posting。新規引退判断をpostingの後に追加しない |

```mermaid
flowchart TD
  W[保存済みnative12/1] --> I[人の受入・慰留意向と旧年のCPU対象]
  I --> C[操作別乱数・元契約を検証 / 一候補・一revision]
  C --> R[期末判断・予約確定・履歴・保証]
  R --> S[既存世代保存と公開root照合]
  S --> A[採用確認 / 保存結果表示]
  A --> P[別操作で既存posting]
  S -->|公開前失敗| I
  S -->|公開後中断| E[同画面の既存復旧 / 追加公開なし]
  E --> A
```

## 検証根拠

- 変更前関連3ファイル77件成功。新core初回は8RED/既存拒否8PASS、実装後16件成功。新hook/UI5件は全RED→GREEN。
- 実createInitialTeamsの12球団/1,059人から既存財務143回・日付付きpostseason・PR-Cのopen-offseasonを通し、一軍/二軍・CPUを処理。観測例は19〜20人引退、candidateから検証まで約6.6〜7.9秒（サーバー、実端末性能ではない）。seed前のbootstrapには既存乱数があるため人数は固定主張しない。判断そのものは保存randomRootで固定。
- 成長/加齢を行わず生存選手を全フィールド保持。引退者の当年成績、career、元年給与と将来保証、期中予約との混在、人の慰留成功/失敗、0人、順序/JSON/入力不変/全体乱数独立、低意欲の除外、将来契約/正式留保の人・CPU対、合法な生存選手の後続変更を検証。
- 実IndexedDB/Reactでroot公開失敗→同意向再試行・一度だけの公開、career一回、旧session/新規postingへの近道拒否、公開後ack中断→無再公開の復旧、画面の意向/確認/保存結果を検証。cold reload/結果保持は実ブラウザでも確認。
- 追加の混在テストでatDate fixtureが元日程を置換してmatchupsを失ったため、実生成日程120の時計を使う準備へ修正。製品の時計/日程の条件は変更していない。
- Chromium/WebKitの360/390/1440px旅程と公開後復旧を既存save-generations必須CI内へ追加。画面は既存レイアウト/CSSを保ち、横溢れも確認する。timeout/retries/既存期待値/CI設定は変更しない。
- 最終の関連8ファイル195件成功。Chromium4件、WebKit4件成功。buildも成功（既存のchunk警告）。全suite/最新HEADの必須CIはPR本文を参照。
- WebKitは公式Debian13ブラウザと公式Debian依存を/tmpへ展開。配布ラッパーがLD_LIBRARY_PATHを置換するため、そのsys/libに依存を配置。ldconfig事前確認だけを省略し、実起動/操作で検証する。実iPhone Safariの確認とは区別する。

## 独立レビューと修正

別コンテキストが基準main..`082f55f`の全差分/実入口を読み、P0/P1なし、P2を一件確認した。親receiptだけ、または退職CPUの親candidateを消しても、子の期末引退が保存可能だった。保存済み慰留成功に直接の期末子commandで退職を後付けする再現も確認。

5ケース（親削除、CPU欠落、元予約/確定の逆順、期中予約の親claim欠落、慰留後の直接退職）をRED→GREENで修正。共通projectorは親付加前の子candidateも扱うため、親から子への検証に加え、**完全worldのtoAnnualStateで子から親への一意な所有を検証**する。元予約→確定→親の順と、期中予約をこの親で確定した履歴も照合する。親がなくても有効な旧期中引退は維持し、既存posting済み旧冬へ新規判断を要求しない。

レビューが追加未実行とした正式留保/将来契約の人・CPU対、低意欲除外・生存選手の後続変更は、実装側で対象検証を追加。最終HEADの全件/ブラウザ/CIをレビュー実施の代わりにはせず、結果をPRへ記載する。

提出前の追加確認で、reloadを挟まず引退保存→postingを同画面で続けると、旧useAdvanceの成功済みlockが残り二つ目を実行できないことを実装側で再現した。初期E2Eはcold reload後のpostingだけを確認していた。実hook/UIの連続操作をRED→GREENで修正し、二つの独立操作へそれぞれ既存useAdvanceを適用する。共通legacyのlockは変更しない。reloadなしの実ブラウザ回帰を追加し、両操作の一回保存/revisionを確認する。最終件数・最新HEADのCIはPR本文を正本とする。

この修正後は関連hook/UI3ファイル43件成功。Chromium5件/WebKit5件、計10件成功（再読込なしの連続操作を含む）。旧HEADのCI #735は停止し、修正後HEADのCIを最終受入に使う。ローカルの全suiteも旧HEADから開始した実行中に修正したため、最終HEAD全件の根拠として流用しない。

### 受信箱の別入口も同じ順序へ接続

追加の別入口確認で、新open-offseason直後に受信箱で希望生成すると期末引退全体を飛ばせるP1を再現した。別コンテキストも実producer/reducerで確認。`contractEconomy.runCommand`の共通world境界で、新規`advance-posting-phase`/`prepare-offseason-posting`/`generate-posting-requests`を未判断時に拒否する。既存IDの再利用・保存済み旧phaseは維持する。受信箱も同じpredicateで引退判断へ戻し、受信箱自体の閲覧は妨げない。

両準備API・直接生成・実保存拒否の4ケースと実受信箱旅程をRED→GREENで検証。最新追加はcore30/hook5、計35件。関連8ファイル160件成功（従来の引退単体群は前段で確認）。元のPR-C→posting統合は、新規判断を実取引で間に入れ、元の閉幕receipt/成績/引退/12球団/時計の期待値を保持する。追加操作分だけrevisionを3→4とした。

旧有効順序は、修正前`e636103`の実producerから固定した[旧posting済みfixture](../../../src/engine/__tests__/fixtures/yearEndOldPosting.md)でcold validation/replayを確認する。修正後の入口を抜け道で動かして旧fixtureを捏造しない。別コンテキストが修正差分とfixtureの由来を再確認し、両準備拒否・直接生成拒否・旧保存の4件を独立に成功。修正に未解消の確定指摘なし。

旧CI #736も旧HEADとなったため停止。最終HEAD/必須CI/ブラウザ件数はPR本文を正本とする。

共通入口修正後の最終ブラウザ検証は、Chromium6件/WebKit6件、計12件成功。受信箱の未判断誘導→判断保存→受信箱からの希望生成、reloadなしの連続操作、3幅の保存失敗/再試行/cold reload、公開後復旧を同じ最終ソースで確認した。既存timeout/retries/期待値は維持する。

### 提出CIでの追加確認

`0eb7891`のCI #737で、受信箱E2Eの保存済み表示と処理中表示が同時に存在し、汎用`status`が2要素へ一致して失敗した（同群220件成功）。結果表示を文言で特定し、その後に処理中表示の消失も確認する。保存結果・revisionの期待値、timeout/retries/CI設定は変更しない。修正後のChromium6件/WebKit6件、計12件成功。限定差分の独立レビューでも、期待を弱めず保存終了まで確認する修正と確認された。

同CIの単体テストは新規35件を含む4,871件成功、既存open-offseasonの最初の保存テストだけ10秒で時間切れだった。基準mainと対象HEADで公開後・React採用前のハッシュ計算を待たせても双方が全期待値に成功し、待機helperのデッドロック仮説は否定した。基準mainの同じテストをCPU並列負荷下で実行すると同じ時間切れが再現した。単体テストや製品の待機条件を変更せず、最新HEADの必須CIで改めて確認する。#737の成功済み11ブラウザ群も、最新HEADの必須CIの代用にはしない。

## 同一状態の画面比較

12球団の小規模native fixture、同じ保存済み12/1から比較。変更前は基準mainの既存画面を描画、変更後は実AppScreenRouter/実hookを使用。比較撮影だけの一時moduleは削除した。

| 幅 | 変更前 | 新規判断 | 保存結果 |
|---|---|---|---|
| 360px | [変更前](screenshots/360-before.png) | [判断](screenshots/360-review.png) | [結果](screenshots/360-saved.png) |
| 390px | [変更前](screenshots/390-before.png) | [判断](screenshots/390-review.png) | [結果](screenshots/390-saved.png) |
| 1440px | [変更前](screenshots/1440-before.png) | [判断](screenshots/1440-review.png) | [結果](screenshots/1440-saved.png) |

保存失敗の確認dialog保持/同じ意向の再試行とcold reloadはE2E添付画像/traceも記録する。表示境界/CSS変更はない。モバイル判断画面とdesktop結果も画像を開いて確認した。

受信箱内の「年度の海外挑戦」パネルも、同じnative world・同じwrapperで比較した（修正前componentと修正後component。実ナビ操作は別途E2E）。

| 幅 | 受信箱の変更前 | 受信箱の変更後 |
|---|---|---|
| 360px | [変更前](screenshots/360-inbox-before.png) | [判断への案内](screenshots/360-inbox-after.png) |
| 390px | [変更前](screenshots/390-inbox-before.png) | [判断への案内](screenshots/390-inbox-after.png) |
| 1440px | [変更前](screenshots/1440-inbox-before.png) | [判断への案内](screenshots/1440-inbox-after.png) |

## 互換と残る限界

旧native冬の親receiptなし/空予約は読み込み・従来postingを継続できる。旧posting希望/判断を遡って変更しない。一般legacyは既存画面/年度処理を維持する。新規の期末引退は保存された明示元雇用を使用し、未知保証をtrueや免除へ変換しない。

通常annualの実試合→閉幕snapshotはまだfixtureで代替している。ここでの実名簿・実保存・実画面の成功を、Workerからの年度完走や一般プレイ公開の証拠にしない。実機/長期/成長・要求額/翌春は未検証・未接続。main push・マージ・自動マージは実施しない。
