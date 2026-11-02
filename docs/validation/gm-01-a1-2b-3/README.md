# GM-01 A1-2b-3 人のトレード確定

基準main: `7b2d860ab6f46452ef7aebeccde815aebfef24fa`（#533マージ）。
annual一般公開ゲートOFF。実際の `useGameState → HubContentRouter → TradeTab / MailboxTab` をannual fixtureで検証。

## 変更

- 手動提案・逆提案・受信オファーの承諾を既存`trade`へ接続。金銭±500万円は`oneOffCosts`へ一度だけ記録し、旧wallet控除を併用しない。
- 7/16移籍の年俸10000万円は元球団5484万円・移籍先4516万円。現在年俸、元の終了年度/保証、受諾済み将来契約を維持。移籍選手の給与分担と双方の年度別追加余力を表示。
- 確認時のrequest/revision/date/sessionを固定。別契約や再読込による変更は確定を止める。受諾後の保存再試行は同じrequestで、交渉抽選を繰り返さない。
- 名簿/台帳/予算/両球団の退団履歴/ニュース/年度移籍履歴/メール承諾を同じworldで保存。辞退は金銭・所属を変えず、同じ確定保存でメール判断のreceiptを記録。
- `seasonHistory`の世代再利用と採用確認を拡張。従来は取引がこのchunkを変更しなかったため、今回の接続テストで履歴だけが旧世代のままになる問題をREDにして修正。Reactの描画中断中はackせず、復旧後に一度だけ進行tokenを更新。
- 未回答の更改がある移籍対象選手は、先に契約画面で提示を取り消す。native tradeによる自動取消で人の回答予定を孤立させないための明示的な前提。無金銭の赤字交換も、双方の当年/将来負担が悪化しない場合だけ許可。
- 独立レビューで、未読メールを2件続けて開くとオートセーブの60秒待機中にlive revisionだけが進み、確定と再試行が`economy_candidate_stale`になるP2を再現。取引のrequest/session検証後、同じ更新ロック内で既読情報など未保存のbaseを通常の追跡付き保存へ渡してから候補を確定する。主保存の競合検証は維持し、古いrequestはbase保存前に拒否。保存失敗時に交渉抽選を繰り返さない。

## 検証

| 対象 | 結果 |
| --- | --- |
| 契約/育成/更改/FA/人的/新人/枠/保存/legacy回帰、30ファイル | 981 passed、0 failed、0 skipped |
| 新規pure最終（加入待ちFA/人的＋新人、69/70境界を追加） | 32 passed |
| 新規real hook/UI | 最終18 passed。pure32＋表示1件と合わせ51 passed |
| 独立レビュー後の共通commit/更改/獲得/新人/育成/保存回帰、10ファイル | 120 passed、0 failed、0 skipped |
| オートセーブ待機中の2件目の既読から確定 | 承諾/辞退と保存失敗→再試行の3件をRED→GREEN。古いsession/revision・別root・二重クリックの拒否も検証 |
| 増額後の確認年俸 | 初期契約年俸の表示をRED→GREEN。現在の台帳年俸を表示 |
| 同年に複数回移籍した選手の給与分担表示 | 第三球団の誤表示をRED→GREEN |
| production build | 成功。既存のchunkサイズ/mixed import警告あり |
| Chromium | 7ケース成功。オートセーブ待機中の2件目の未読メール経由も承諾/辞退・保存失敗後の再試行成功 |
| WebKit | 最終7ケース成功。Chromiumと合わせ14ケース確認済み。メール以外5件＋メール操作修正後2件、各retries 0 |
| `git diff --check` | 成功 |

全単体/統合/負荷/物理演算と重要E2EはPRの同一HEAD CIで確認する。実iPhoneは未検証。
WorkのWebKitは不足する共有ライブラリを一時ディレクトリへ展開し、ブラウザbundleの`sys/lib`から参照。
CIは通常の`playwright install --with-deps`を使用。ブラウザ未導入/共有ライブラリ不足による初回起動失敗は製品テスト成功に含めない。
2件目のメールを開くE2Eを追加した際、モバイルでは詳細から一覧へ戻る操作が必要なため、初回WebKitは対象ボタンを見つけられず失敗した。実操作に合わせて一覧へ戻る手順を追加し、メール承諾/辞退4件を両ブラウザで再実行して成功。製品コードやassertionの緩和は行っていない。

```sh
npx vitest run src/engine/__tests__/humanTrade.test.js src/hooks/useGameState.economyTrade.test.js src/components/management/AnnualTradeTerms.test.js
npx playwright test save-generations.spec.js --grep 'human trade' --project=chromium --project=mobile-webkit --workers=1 --retries=0
npm run build
git diff --check
```

E2Eは3幅で確認→主保存失敗→同条件再試行→cold reload、別契約後の拒否、保存後ack復旧、受信箱→承諾/辞退を検証する。受信箱では1件目の既読を保存後、60秒以内に2件目を開きlive revision 2 / saved revision 1を確認してから確定する。再読込後の取引/金銭/履歴/ニュースは各1件（両球団金銭は±の2行）。

## 画面証拠

同じfixtureのlegacy表示をbefore、annual確認をafter、主保存書込失敗をfailedとして比較。レイアウト境界は変更せず、既存色/部品を維持。3幅ともページ全体の横はみ出しなし。日本語フォント導入後に撮影。

| Chromium | 変更前 | 変更後 | 保存失敗 |
| --- | --- | --- | --- |
| 360×800 | [before](screenshots/360-before.png) | [after](screenshots/360-after.png) | [failed](screenshots/360-failed.png) |
| 390×844 | [before](screenshots/390-before.png) | [after](screenshots/390-after.png) | [failed](screenshots/390-failed.png) |
| 1440×900 | [before](screenshots/1440-before.png) | [after](screenshots/1440-after.png) | [failed](screenshots/1440-failed.png) |

## 対象外・判断

親計画Task 6は分割継続。発掘契約は次工程、春加入/年度更新/CPU自動成立・生成/全経路の試合成立検査/本番activationは後続。既存legacyの交渉閾値と反応を維持する。
人の受信済みオファー判断は接続するが、annual CPUが新たな提案を作る経路の完成を意味しない。
履歴も確定worldに含めたため、annual保存では履歴chunkも書き込む。履歴400件上限を維持。

独立最終レビューと最新HEADのCI結果はPR本文を正本とする。マージ/自動マージは行わない。
