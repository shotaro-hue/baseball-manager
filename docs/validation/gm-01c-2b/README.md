# GM-01C-2B 更改・翌年度契約・将来契約付き移籍

基準main: `2dc7cf10fee292ba1669e67236feba06aa7bed2e`（#508マージ済み）。実施日：2026-10-28。対象PR：[#509](https://github.com/shotaro-hue/baseball-manager/pull/509)。

## 実装

既存quote/applyへ更改の提示・差し替え・受諾・取消を追加。現在契約ID・所属・台帳上の当年満了・明示区分・最低額・既存育成期間制限・全対象年度予算を確定時に検査する。同年途中加入を旧contractSignedYear/contractYearsLeftだけで除外しない。

提示はrenewal留保、受諾は翌年2月1日開始のsign台帳へ置換する。当年の給与・旧名簿の契約ID/年数/配置・旧budgetはそのまま。日をまたぐ回答と同年オフの回答を許可し、オフは `budgetSeason=season+1`。12月は11月30日時点の保有契約で満了対象を照合し、給与対象を12月へ延ばさない。

通常トレードは未回答提示を取消履歴へ移す。合意済み将来契約は元の効力日に移管し、現在と将来の契約ID・終了年・保証を維持する。将来給与・所属を現在名簿へ投影しない。既存無金銭例外へ留保取消を混ぜず、必要なら先に提示を取り消す。

## REDの証拠

[CI run 40604012157](https://github.com/shotaro-hue/baseball-manager/actions/runs/40604012157)、job `122538897766`、head `60c3c1d085f04aeb5ea8c7e7fa05780df5e40fa9`。設計・テストのみで、製品コードはmainと同一。

- 追加38件のうち28件が未対応コマンドの `ok:false` でRED。残り10件は不正入力拒否を保護。
- 既存2,175件成功、既存条件付きベンチマーク2件skip。追加ファイル以外の失敗なし。ビルド成功。
- [件数・失敗一覧](./red-evidence.json)。テスト削除、skip追加、期待値緩和なし。

## 最終検証

ローカル実行環境が利用不可のため、ローカルのVitest・ビルド・`git diff --check`は実行したと扱わない。既存GitHub CIの最終headで単体・統合・負荷・物理演算・ブラウザを検証し、**結果・独立レビュー・マージ可否はPR本文の最終品質ゲートを正本**とする。ワークフローと依存は変更しない。V8の構文解析・変更行の末尾空白検査は実行テストと区別する。

再現コマンド：

```bash
npx vitest run src/engine/__tests__/annualRenewalTransactions.test.js src/engine/__tests__/annualDevelopmentTransactions.test.js src/engine/__tests__/annualTransactions.test.js src/engine/__tests__/annualSpending.test.js src/engine/__tests__/contractLedger.test.js src/engine/__tests__/seasonContract.test.js src/engine/__tests__/contractCalendar.test.js src/engine/__tests__/monthlyPayroll.test.js src/engine/__tests__/rosterCapacity.test.js
npm run build
git diff --check
```

通常CIは上記対象を含む `npm test`・ビルド・既存ブラウザ12群と集約を実行する。

## 残課題

C-2の一部。本番hook、CPU/委任/Worker、新人・育成加入、FA遅延回答、年度更新、旧保存移行、UI/コーチ、係数校正、実iPhone性能は後続。更改時の区分変更と開幕前の新契約投影も対象外。既存本番の転換1年契約仕様・育成ドラフトは変更しない。これらの接続と校正・実機確認が揃うまで新制度を有効化しない。マージ・自動マージは行わない。
