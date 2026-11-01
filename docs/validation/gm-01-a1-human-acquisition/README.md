# GM-01 A1-2a-2 人の市場交渉の接続

基準main `e26d4f2664a56052fbd71161c239032f672006af`（#530マージ済み）。次の人間プレイヤー操作として、明示した市場区分を持つ候補への提示・差替・取消・回答を、既存の年度別留保／契約台帳／保存・React採用確認へ接続する。

## 変更と範囲

- 年次fixtureのハブ市場とオフ市場を専用画面へ接続。旧`salary × years`の即時控除・局所Mapの交渉へ流さない。legacy画面は維持し、年次モードの未接続フェーズ完了は拒否する。
- 提示時の要求年俸・最低受諾額・総合評価を既存モデルから固定。保存済み市場成績と旧球団の文脈を使用し、獲得先の優勝成績を過去年俸へ加点しない。新たなグローバル乱数消費なし。新条項なし。
- 75点以上2日/turn、55点以上3日/turn、55点未満4日/turn。更改と時計の判定を共通化し、旧更改v1の回答・期限は変更しない。
- 期日到達後はpure reducerで取消・差替を拒否。7月31日の受諾は当年給与へ反映し、8月1日以後は未回答の期中獲得を失効。同じschedulerでも翌年度更改は受諾できる。オフは30turnまで提示、37turnまで回答。
- 受諾時に市場情報・登録枠・全対象年度の予算を再検査。条件が変われば理由付きで失効し、留保を解放。オフ受諾は翌春の加入待ち、A/B補償は既存の根拠と金銭留保を保持する。未分類市場候補・補償根拠未記録は推測せず提示不可。
- 差替の取消＋再提示や一括回答は、全取引を含む一つの未公開candidate、一回の保存、一つのrevision。保存側が`baseRevision + 1`を要求するため、個別取引数だけrevisionを増やす不一致を修正（複数更改回答にも共通）。同じ古い回答callbackの再実行は、全due処理済みの場合だけ読み取り確認として成功し、新たなdueを古いrevisionで処理しない。
- 正式提示／未保存ドラフト／回答／翌春加入待ちを別表示。保存失敗で入力を保持し、保存・採用確認の前に成功表示しない。メールを削除してもdecisionが回答正本。receiptと固定条件を照合し、既存履歴を消せない。

公開ゲートはOFF。CPU・Worker・日次／オフturn進行、候補生成／退団、翌春加入、補償選択UI、年度繰越、activation anchor、storage fenceの本格接続は後続。A1-2a全体の完了や現実のFA日程を再現したとの主張ではない。

## RED → GREEN と回帰

新規engine/UIの未実装import、未接続hook7件でRED。接続後に差替の複数revision保存失敗を再現し、一つのrevisionへ修正してGREEN。独立レビュー中に、更改画面だけFAの回答を残す経路（1件RED）と、同一callback再試行の不一致（2件RED）を確認して修正。

ローカルVitestは重複再実行を除き23ファイル・724件成功。

- 新規：`acquisitionDecisions.test.js` 24件、`useOffseason.economyAcquisition.test.js` 9件、`AnnualMarketTab.test.js` 5件。
- エンジン：既存更改、期中／オフ獲得、補償、年度別支出、world adapter。7/1受諾の5000/10000/10000万円、7/31と8/1、オフ加入待ちとAランク補償、期日境界、受諾直前70人枠、育成1年、最終年度の予算競合、固定回答／乱数禁止／receipt改変を検証。
- 保存／hook：migration146件、save generations、saveload/scopes、migration projection、既存commit18件、更改11件、市場hook8件。実ストレージの保存失敗→旧root/world維持→再読込→回答再試行、古いsession、二重クリック、公開後ack復旧、差替と混合回答の単一revisionを検証。
- 画面：正式提示の再読込初期値、別候補への切替、失敗時ドラフト保持、回答後の履歴、未知候補の閲覧のみ、両描画ルートの年次分岐、旧市場／旧オフフロー／選手リストを回帰。

`npm run build`成功。既存の500kB chunk警告は残る。

## ブラウザーと画面

既存CI対象`e2e/save-generations.spec.js`に追加。実React hook・DOM・IndexedDB・localStorageを使用し、障害注入箇所以外はmockしない。

- 新しい市場E2E：Chromium 7件＋WebKit 7件成功。
- 360/390/1440pxで提示、保存失敗、再試行、cold reload、保存条件初期化、差替、取消、年度別表とページ横overflowなし。
- メールなしの期中受諾／オフ加入待ち／期限切れを保存・再読込。ack障害で成功表示せず、復旧後もrootと取引数を維持。
- 共通回答経路変更後、既存更改の回答・再読込も両ブラウザーで成功。オフ市場の独立canvasは既存デザインtokenで背景色も確認。
- WebKitは前工程で一時配置したOS共有ライブラリを利用し、ldconfig一覧の事前検出のみ省略して実ブラウザーを実行。CIは標準依存導入を使用する。

同じfixture候補を選択した前後比較。beforeは従来市場、afterは年次市場の12000万円×3年ドラフト。年次公開gateを有効化しないtest-only DOM harnessであり、年次モード全体のjourney・実iPhone性能・補償UIの検証ではない。

| 幅 | Chromium | WebKit |
| --- | --- | --- |
| 360 | [前](chromium-360-before.png) / [後](chromium-360-after.png) / [保存失敗](chromium-360-write-error.png) / [保存後](chromium-360-pending.png) | [前](mobile-webkit-360-before.png) / [後](mobile-webkit-360-after.png) / [保存失敗](mobile-webkit-360-write-error.png) / [保存後](mobile-webkit-360-pending.png) |
| 390 | [前](chromium-390-before.png) / [後](chromium-390-after.png) / [保存失敗](chromium-390-write-error.png) / [保存後](chromium-390-pending.png) | [前](mobile-webkit-390-before.png) / [後](mobile-webkit-390-after.png) / [保存失敗](mobile-webkit-390-write-error.png) / [保存後](mobile-webkit-390-pending.png) |
| 1440 | [前](chromium-1440-before.png) / [後](chromium-1440-after.png) / [保存失敗](chromium-1440-write-error.png) / [保存後](chromium-1440-pending.png) | [前](mobile-webkit-1440-before.png) / [後](mobile-webkit-1440-after.png) / [保存失敗](mobile-webkit-1440-write-error.png) / [保存後](mobile-webkit-1440-pending.png) |

独立レビューは差分だけでなく既存の取引／補償／保存・採用境界／旧ルートまで確認。指摘された共通回答経路を修正し、未解消P1/P2なし。最終HEADの全件CIはPR本文を正本とする（ローカルで全件を重複実行しない）。
