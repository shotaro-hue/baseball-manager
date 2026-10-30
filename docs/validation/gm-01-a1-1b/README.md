# GM-01 A1-1b legacy開始残高

基準main: `749c61d6992f7ea407acfd58293856e3a73c87bd`（#518マージ）。対象はA1計画Task 2のみ。一般公開ゲートはOFF。

## 実装範囲

- `prepareEconomyMigration(world, boundary)` は全12球団・市場のID/所属、旧年俸/残年数を検査する純粋な**契約部分の候補作成**。`candidate.scope='contracts-only'` とし、annual world、承認予算、保存、モード切替は生成しない。
- boundaryは `{season, stage:'unstarted-offseason', legacyOffseasonStarted:false}`。既存オフ/plan、不明な境界、未回答の旧更改（両メール型）、検査できないmailbox、annual入力を拒否する。永続boundary token、完了planとの区別、実際の移行適格判定・公開はA1-1d。
- native台帳v1を維持し、台帳v2に`kind:'legacy-opening'`を追加。署名年・総契約年数・保証booleanを合成せず、元の記録は`sourceFields`へ保持する。
- `remainingContractAfterSeason`の既存投影を再利用。2026年に残3年を観測した場合、2026年署名なら2029年末、前年以前/署名未記録なら2028年末まで維持。nativeの期間ルールは変更しない。
- 11月30日は所属の観測日。給与行は翌年以降だけを作り、過去の給与支払・FA支払/返金・市場の債務を推定しない。旧budgetは比較証跡だけであり支出許可へ転用しない。
- 現行legacyに保証の正本フィールドはないため`guaranteeStatus:'unknown'`のみを取り込む。将来known状態を受理するには対応する証拠の検証が必要。途中退団では保守的に残額を維持し、waiveには新しい`terminationAgreement:{id,agreedDate}`を終了イベントへ記録する。
- 雇用・負担・ID・名簿投影の共通selectorで、更改、トレード、育成転換、人的補償を接続。通常取引から開始残高を追加・変更できない。

## 検証

追加テスト: `src/engine/__tests__/economyMigration.test.js`。

| 検証 | 結果 |
| --- | --- |
| 初回RED | 30失敗・1既存拒否成功。台帳v2未対応と移行関数未実装を確認 |
| 追加境界RED | 読み込み時の型違いID衝突、通常取引への開始残高追加の2件が失敗 |
| 直接/関連回帰 | 8ファイル380件成功（開始残高58、台帳30、更改50、人的57、world79、支出55、取引39、旧回答12） |
| 独立レビュー | Important 2件。未回答旧更改・不正育成フラグの再現16失敗を確認後、修正して全58追加ケース成功。Critical/Minorなし |
| JSON保存表現の往復 | 開始残高・保証unknown・残数・所属・取引の再実行を維持。失敗は入力非変更 |
| 全体・Build・ブラウザ | PRの同一head CIで確認する。実セーブへの移行は未接続 |

育成区分の入力は、記録された両aliasをbooleanとして検査し、欠損は既存の支配下扱いを維持する。文字列・数値・null・配列・オブジェクトを区分へ変換しない。

年俸0は記録済みの値として最低年俸違反を返し、欠損とは区別する。入力を切り上げたり、残年数を7年へ切り詰めたりしない。
