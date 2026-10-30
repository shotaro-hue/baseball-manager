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

## PR #519 追加レビュー修正（A1-1b-FIX）

開始時head `590599229b5ad394bddafaa355b6e010d84203d4`、main `749c61d6992f7ea407acfd58293856e3a73c87bd`、既存CI成功とローカルtree一致を確認した。

1. `contractReplies.isPendingContractReply`の`!resolved`が、文字列`'false'`等のtruthy値を回答済み扱いにしていた。共通判定を`resolved !== true`へ変更し、移行事前検査と旧回答処理を揃えた。対象は既存の契約回答2型のみ。一般メール/ニュースは維持する。
2. `contractLedger.viewsFor`で解除合意IDを台帳全体で検査する。取引IDとは別の名前空間とし、既存のID規則同様に数値/文字列aliasも衝突として拒否する。native/openingを横断して重複を拒否し、通常の終了取引再実行は既存の冪等経路で許可する。さらに`terminationAgreement`の項目順を正規化し、同じ内容でキー順だけ異なる再実行も同一と扱う。
3. `contractYears:3 / contractYearsLeft:3 / contractSignedYear:2025`を保持したfixtureは既存処理でも一連の取引が成立した。一方、名簿の値と`sourceFields`が不一致の場合や、正本に記録がない場合に名簿の古い値が残ることを再現した。`seasonContract.projectEmploymentPlayer`をworld・トレード・支配下転換・人的加入で共有し、署名年/総年数はopeningの観測記録、nativeでは合意条件から投影する。観測値は一律削除せず保持し、未記録値は作らない。残年数・効力期間は引き続き台帳由来とし、旧署名年からnative期間を逆算しない。

### 追加検証

追加49ケース: 契約メール20、旧回答処理20、解除合意5、実セーブ属性の一連の投影4。

- RED: 3ファイルで26失敗/93成功を確認。追加で項目順による冪等性の1失敗を確認。
- GREEN: 同3ファイル119件成功。関連回帰24ファイル1,019件成功。
- 実セーブ相当の2025年/2026年署名を保持し、開始残高→2027年の残数→7月トレードの月割り→育成転換→満了時更改→native効力年度→JSON復元/再投影を検証する。旧証跡、年俸、所属、負担、区分を照合し、同じ取引の再実行で契約が増えないことを確認。
- 継続契約/更改対象の既存一覧モデルも投影後の残年数で検証する。ただし実際のannual進行・UI公開・保存移行を接続したという意味ではない。
- 全体テスト/Build/全E2Eは修正後headのCI結果をPR本文へ記録する。既存期待値の緩和やskip追加はない。

一般公開ゲートはOFF。保証unknown、旧持越ルール、過去給与を作らないこと、native v1の終了条件を維持する。年度更新の本番接続、予算生成、実セーブ公開は後続工程のまま。
