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
