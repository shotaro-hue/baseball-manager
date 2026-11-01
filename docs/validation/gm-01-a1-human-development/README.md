# GM-01 A1-2b-2 人の育成選手の支配下登録

基準main: `40876c74ffcf7e1d3fc5bb8020b98987c63dfd28`（#532マージ）。
一般公開ゲートはOFFのまま。annual fixtureで実際の `useGameState → HubContentRouter → RosterTab → FarmDevelopmentPanel` を通す。

## 変更と確認観点

- 人の支配下登録を既存の取引reducerと共通確定保存へ接続。7/16に240→420万円なら当年給与322万円、翌年以降420万円。終了2028年度・保証・二軍配置を維持し、600万円の年俸は減らさない。
- 当年/将来年度の予算、70人枠、7/31期限、将来育成契約・更改留保との競合を再検証。確認画面の人数には新人・FA・人的補償の加入待ちも含む。
- 二重クリック、同一操作の再試行、古いrevision/sessionを確認。保存失敗では旧world/rootを維持し、保存後の画面反映失敗はダイアログ内・閉じた後の両方から復旧可能。cold reload後も取引履歴は1件。
- legacy登録処理は従来どおり。新人翌春加入、トレード、発掘、CPU、年度更新、activation/fenceは対象外。

## ローカル検証

| 検証 | 結果 |
| --- | --- |
| 新規pure/hook/UIと既存farm UI（4ファイル） | 47 passed |
| 関連する既存契約・育成・更改・獲得・保存回帰（18ファイル） | 663 passed |
| `npm run build` | 成功（既存のchunkサイズ・mixed import警告あり） |
| 最終Chromium / WebKit、各360/390/1440px＋ack復旧 | 8 passed、skip/flaky/failure 0 |
| `git diff --check` | 成功 |

対象Vitest:

```sh
npx vitest run src/engine/__tests__/developmentRegistration.test.js src/hooks/useGameState.economyDevelopment.test.js src/components/annualDevelopmentRegistration.test.js src/components/farmDevelopmentDesign.test.js
```

対象Playwright（1 worker、retryなし）:

```sh
DEVELOPMENT_CAPTURE=docs/validation/gm-01-a1-human-development/screenshots npx playwright test save-generations.spec.js --grep 'human development' --project=chromium --project=mobile-webkit --workers=1 --retries=0
```

Work環境では不足するWebKit共有ライブラリを一時ディレクトリへ展開し、`LD_LIBRARY_PATH`を設定。依存チェックがそのパスを参照しないためチェックだけをスキップし、実ブラウザを起動して検証した。CIは通常の`playwright install --with-deps`を使用する。

全単体・統合・負荷・物理演算テストと重要E2EはPRの同一HEAD CIで確認する。ローカルで全セットを重複実行しない。iPhone実機は未検証。

## 画面証拠

`screenshots/{chromium,mobile-webkit}-{360,390,1440}-{before,after,failed,reload}.png` の24枚。
beforeは同じ選手・日付・人数でlegacy表示のみを切り替えた比較fixture（旧登録の実行はしない）。afterはannual確認、failedは主保存への書込失敗、reloadは登録後の再読込。両ブラウザ・全幅で横はみ出しなしを検証した。

| 幅 | 変更前 | 変更後 | 保存失敗 | 再読込 |
| --- | --- | --- | --- | --- |
| Chromium 360 | [before](screenshots/chromium-360-before.png) | [after](screenshots/chromium-360-after.png) | [failed](screenshots/chromium-360-failed.png) | [reload](screenshots/chromium-360-reload.png) |
| Chromium 390 | [before](screenshots/chromium-390-before.png) | [after](screenshots/chromium-390-after.png) | [failed](screenshots/chromium-390-failed.png) | [reload](screenshots/chromium-390-reload.png) |
| Chromium 1440 | [before](screenshots/chromium-1440-before.png) | [after](screenshots/chromium-1440-after.png) | [failed](screenshots/chromium-1440-failed.png) | [reload](screenshots/chromium-1440-reload.png) |
| WebKit 360 | [before](screenshots/mobile-webkit-360-before.png) | [after](screenshots/mobile-webkit-360-after.png) | [failed](screenshots/mobile-webkit-360-failed.png) | [reload](screenshots/mobile-webkit-360-reload.png) |
| WebKit 390 | [before](screenshots/mobile-webkit-390-before.png) | [after](screenshots/mobile-webkit-390-after.png) | [failed](screenshots/mobile-webkit-390-failed.png) | [reload](screenshots/mobile-webkit-390-reload.png) |
| WebKit 1440 | [before](screenshots/mobile-webkit-1440-before.png) | [after](screenshots/mobile-webkit-1440-after.png) | [failed](screenshots/mobile-webkit-1440-failed.png) | [reload](screenshots/mobile-webkit-1440-reload.png) |

## 独立レビュー

加入待ちFA・人的補償の人数が確認画面から漏れるP2を1件検出。登録可否のengine判定は既に正しかったが、表示が1人少なくなった。正規の取引履歴で作ったpreseason fixtureに対するpure/UIの4テストをRED→GREENにし、表示を修正した。その他の修正必須指摘なし。

## PR #533 レビュー懸念の再調査（A1-2b-2-FIX）

調査開始HEADは `b22d6271c629099fcd23dd8d5e90488223197403`。mainは
`40876c74ffcf7e1d3fc5bb8020b98987c63dfd28`。開始時のレビューコメントはなし、CI #631は成功。
GitHubのtree `4c40390440579b493400e9f8822aa39e326a41d2` とローカル調査ソースの一致を確認。

| 懸念 | 判定 | 根拠・対応 |
| --- | --- | --- |
| 支配下人数の二重計上 | 問題なし | `evaluateRosterCapacity` は全球団の所属IDを除外して新人をID重複排除。`inspectAnnualAcquisitions` / `inspectFaPersonnelMoves` は加入済みを返さず、未加入の所属重複も拒否。`faPersonnelCapacityContext` は人的補償で退団した選手の古い指名を除外する。previewと`annualTransactions`の枠検証は同じ対象を合算している。製品コード変更なし。 |
| 古い確認画面から異なる条件の確定 | 問題なし | dialogは最新gsで見積を再計算する。各描画の`convertIkusei`は当該worldのrevision/epochとsessionを保持し、`commitEconomyOperation`は最新の確定済みsnapshotへrequestを適用する。別の確定によるrevision変更は拒否、hydrateによるsession変更も拒否。最新callbackは最新表示条件でのみ確定する。期限と全年度予算もengineで再検査。製品コード変更なし。 |

追加したVitestは32件（pure 25件、実hook＋実panel 7件）。新人・FA・人的補償が同時に加入待ちの状態を正規取引から作り、
3種類の加入前後の全8組合せ×69/70人で表示と登録可否を確認。古い指名結果と重複新人snapshotも含む。
年俸600万円・満了年度・70人・期限・epoch/sessionの変更、別契約の保存で更新された予算の表示と古い確定handlerの拒否を検証。
Playwrightにも別契約の保存→表示更新→古いcallback拒否→最新条件で確定→cold reloadを追加（両ブラウザ各1件）。

追加テストは既存実装の安全性を確認するもので、製品不具合のREDは再現していない。
初期のテスト用契約fixture／非同期完了待ちの誤りを修正した後、以下の最終検証を実施した。
不要な再確認UI、人数の独自集計、保存形式の変更は加えていない。

| 最終ローカル検証 | 結果 |
| --- | --- |
| 関連Vitest（以下の25ファイル） | 906 passed、0 failed、0 skipped |
| Chromium / mobile-webkit（360/390/1440px、保存失敗・再試行・再読込・ack復旧・別契約との競合） | 10 passed、0 failed、0 skipped、retryなし |
| production build | 成功（既存のchunkサイズ・mixed import警告あり） |
| `git diff --check` | 成功 |

```sh
npx vitest run \
  src/engine/__tests__/developmentRegistration.test.js \
  src/engine/__tests__/developmentRegistration.review.test.js \
  src/hooks/useGameState.economyDevelopment.test.js \
  src/components/annualDevelopmentRegistration.test.js \
  src/components/farmDevelopmentDesign.test.js \
  src/engine/__tests__/annualDevelopmentTransactions.test.js \
  src/engine/__tests__/annualRookieTransactions.test.js \
  src/engine/__tests__/annualRenewalTransactions.test.js \
  src/engine/__tests__/annualTransactions.test.js \
  src/engine/__tests__/annualSpending.test.js \
  src/engine/__tests__/annualBudgetPolicy.test.js \
  src/engine/__tests__/annualOffseasonAcquisitions.test.js \
  src/engine/__tests__/annualFaPersonnel.test.js \
  src/engine/__tests__/annualFaProtection.test.js \
  src/engine/__tests__/annualFaCompensation.test.js \
  src/engine/__tests__/faPersonnelMoney.test.js \
  src/engine/__tests__/annualDelayedFaTransactions.test.js \
  src/engine/__tests__/rosterCapacity.test.js \
  src/engine/__tests__/contractEconomy.test.js \
  src/engine/__tests__/contractLedger.test.js \
  src/hooks/useGameState.economyCommit.test.js \
  src/hooks/useGameState.rosterCapacity.test.js \
  src/hooks/useOffseason.economyRenewal.test.js \
  src/hooks/useOffseason.economyRookies.test.js \
  src/hooks/useOffseason.economyAcquisition.test.js

npx playwright test save-generations.spec.js --grep 'human development' \
  --project=chromium --project=mobile-webkit --workers=1 --retries=0
npm run build
git diff --check
```

保存後にReactの描画がsuspendして採用されない場合も、共通commit経路の既存テストで未ack→明示復旧→root非再書込を再確認。
独立した最終コードレビューでも、2件の懸念について修正必須のP1/P2は検出されなかった。
追加コミットのCI結果・HEADはPR本文を正本とする。
実iPhoneは未検証。annual一般公開ゲートはOFF、未接続の春加入／CPU／年度更新の本番進行は今回の保証範囲外。
