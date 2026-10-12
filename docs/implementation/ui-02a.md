# UI-02A — 一軍・二軍の共通編成概要

基準main: `0cd1977cedda9960c29174ea4aa33b13a69aadb8`（PR #454反映後、2026-10-12に再取得）。仕様は `docs/DESIGN_SYSTEM.md`。承認済みの配色・文字・表・操作・状態の共通仕様に従う。二軍参考画像の架空選手・数値・機能構成はコピーしない。

## 目的・対象

試合結果から編成へ戻った際に、所属・役割・状態を比較し、既存の起用操作へ進めるようにする。
`HubContentRouter`の`roster`分岐 → `RosterTab` → `MobileRoster`が実際の経路。名前はMobileだがPCにも表示されている共通概要であり、この既存部品を移行する。

- ネイビーの一軍人数・二軍人数（育成含む）・全所属負傷人数。白い表、青い切替／選手／操作。`MetricBand`、`DataTableFrame`、`Button`、既存トークンを使用。
- 打線、入替候補、投手、二軍の4一覧。ベンチ野手は従来の入替候補経路を維持する。
- 760px以下は選手名の下に守備・指標／所属・状態を移し、打順と入替を画面内に保つ。情報を消さず同じ値を配置し直す。PCは列で比較し、表内スクロール時は名前列を保持する。1024px境界でも確認。
- 14pxの表、16pxの主操作、44px以上の操作、名前の折返し、キーボード操作。ボタンの入替／起用文字を小さくせず1行表示する。
- 能力0、打率0.000、HR0、状態0を保持。状態欠落を普通70へ、HR欠落を0へ補わない。AB分母不足／H欠落は打率「—」。打率は共通`fmtAvg`を再利用し、丸め済み千分率を従来の小数表示に合わせる。UIの表示ガードで、計算・保存を変更しない。
- 一軍成績と二軍実測を混ぜない。二軍は既存`FarmRecordScope`／`FarmRecordSummary`／selectorを再利用し、年度・途中記録・未記録・旧推定の区別を維持。育成所属・登録クールダウンは保存されている値から表示する。

## 維持・対象外

既存のコールバック、ID=0、打順、DH、守備配置を引き継ぐ入替、負傷候補の禁止、選手詳細を維持する。元チームや配列を表示だけで変更しない。CSSは`.roster-overview`内のみで、グローバルCSSやRosterTabの詳細設定は変更しない。
`RosterTab`の詳細設定にある昇降格、再登録禁止、支配下登録、継投、育成、起用方針、会話、自動編成は既存経路に残す。詳細設定の全体刷新・選手詳細／比較・ランキングは後続で、UI-02全体の完了とはしない。
候補の守備適性の確認方法も従来通り。適性のない入替は既存の試合開始チェックが止める。候補の自動除外、ゲームバランス、シミュレーション、CPU編成、保存形式、ナビIDは変更しない。

## 検証

- 新規Vitest5件。表・所属文脈と欠落状態で修正前2件REDを確認。追加レビューで1.000の誤表示をREDで再現し、共通formatterの千分率を表示側で数値へ戻して補正。0.000・0.333・1打数1安打・1.000への丸め境界も照合。ID=0の変更・守備継承・負傷ガード・DH・投手役割・詳細コールバックも実コンポーネントで照合。
- 関連: `npx vitest run src/components/mobileRosterDesign.test.js src/components/mobileFlow.test.js src/components/FarmRecordSummary.test.js src/components/tacticalRosterRoute.test.js src/hooks/useSeasonFlow.cpuRoster.test.js` — 28件成功。
- 表示・操作: `npm run test:e2e -- match-history.spec.js --grep 'UI-02A roster' --workers=1 --retries=0` — 7件成功。360/390/760/761/1023/1024/1440px×通常・長い名前・状態欠落・実測0・空・負傷×野手／投手／二軍。入替の画面内配置と1行ラベル、表示切替、打順、入替、負傷候補禁止、44px操作、局所スクロール、名前列、ページ横溢れを確認。入替が画面外になるRED・文字が2行になるREDを確認して修正。
- 実App: `npm run test:e2e -- match-history.spec.js --grep 'UI-02A actual' --workers=1 --retries=0` — 360px1件＋390/1440px2件、計3件成功。打順変更→適性のある控えへ入替→降格→クールダウンで再昇格不可→別の選手を昇格→詳細→保存→ロード→実1試合進行。全チーム・二軍記録の復元、ホームヘッダーのCSS不変を照合。
- 試験の初回は守備適性のない候補を選び、既存の開始ガードが停止した。テストを同じ守備を担当できる候補へ修正して再確認。ゲーム側の判定やテストの待機時間は変更しない。
- `npm run build`成功（既存の500kB超チャンク警告）。全Vitest・中核E2Eは同一headのGitHub CI全6ジョブで確認する。既存spec／assertionは削除・skip・弱体化しない。

新E2E10件は既存CI対象の`match-history.spec.js`にhelperを一度だけ登録する。CI設定、他specの対象、リトライ条件は維持する。

独立コードレビューで打率フォーマットの共通化と、状態欠落・0・負傷fixtureの二軍への適用を反映。再レビューで見つかった1.000表示の回帰も限定adapterと追加テストで修正。二軍の状態0と成績の実測0は別の検証であり、成績の出典・未記録表示は既存selectorテストと実App経路で照合する。

## 同じ表示データの前後

fixtureは既存new-game保存fixtureから表示で使用するプロパティを抜粋したもの。値は変更せず、実昇降格・保存の成功証拠とは区別する。実操作は上のApp経路で検証した。

| 表示 | 前 | 後 |
|---|---|---|
| 打線360px | [画像](../validation/ui02a/before-batters-360.png) | [画像](../validation/ui02a/after-batters-360.png) |
| 打線390px | [画像](../validation/ui02a/before-batters-390.png) | [画像](../validation/ui02a/after-batters-390.png) |
| 打線1440px | [画像](../validation/ui02a/before-batters-1440.png) | [画像](../validation/ui02a/after-batters-1440.png) |
| 二軍390px初期表示 | [画像](../validation/ui02a/before-farm-390.png) | [画像](../validation/ui02a/after-farm-390.png) |

## 未検証・残課題

iPhone実機、編成概要専用Safari/WebKit、読み上げ、200%拡大、全所属／全異常状態は未検証。CI外の手動フルE2E・条件付きベンチマークは再実行しない。詳細設定の旧UI、選手詳細／比較、FIX-S3の成績精度・selector一致は後続に残す。
