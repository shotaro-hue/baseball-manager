# ROADMAP — NPB Franchise Manager

> 最終更新: 2026-10-30（#515マージ済みmainをA1-0で監査。接続設計・後続PR計画・検証仕様を文書化。新制度は本番未接続。完全バックアップ・復元は保留）
> 目的: **OOTP / Football Manager のように「何年も遊べる、意思決定が積み重なる経営シミュレーション」**を作る。

> 現在の進捗は第1節を参照。第2・3・5節の旧チェックリストと期日は2026-05-01時点の履歴であり、現在の完了認定ではない。UI/UX改革の一次監査・推奨PR分割は [全体改革の青写真 v1](./docs/REFORM_BLUEPRINT_V1.md)、現行の設計方針は [UI/UX設計基準](./docs/DESIGN_SYSTEM.md) を参照。着手時には最新mainと再照合する。

---

## 0. プロダクトの北極星（立ち返り）

このゲームの面白さは、次の4つが同時に成立したときに生まれる。

1. **不確実性**（情報が完全ではない）
   - スカウト情報は誤差を含み、実力は試合と時間でしか確定しない。
2. **トレードオフ**（何かを取れば何かを失う）
   - 今勝ちに行くか、将来へ投資するか。資金、枠、育成時間が常に不足する。
3. **連続性**（1年で終わらない）
   - 選手の成長・衰退・契約・引退・球団史が繋がり、意思決定に履歴が残る。
4. **人間性**（数字だけで終わらない）
   - モラル、首脳陣、メディア、ファン、オーナー評価が勝敗以外の圧力を生む。

以後の機能追加は「この4つを強化するか？」を採用基準にする。

---

## 1. 現在地サマリ

GM-01 A1-0: main `b255d2c2482dd50cba49f9620405e669c7f159b5`（#515マージ済み）で23経路を[監査](./docs/design/gm-01-a1-0/audit.md)。契約正本、年度許可/留保、共通world、旧開始残高、保存移行/復旧、CPU/Worker、年次状態遷移を[接続設計](./docs/superpowers/specs/2026-10-30-gm01-a1-integration-design.md)へ具体化し、[A1-1〜4の最低14PR計画](./docs/superpowers/plans/2026-10-30-gm01-a1-integration.md)と[検証マトリクス](./docs/validation/gm-01-a1-0/README.md)を追加。今回の差分は文書のみ。人/CPU/年度更新/保存が揃うまで一般プレイの切替を閉じ、次の未開始オフから移行する方針。関連26ファイル940回帰＋観測1件とbuildを確認したが、新制度の実App/長期/実iPhoneは未検証。後続実装へは自動着手しない。

GM-01C-2G-2：#514マージ済みmain `4be891dcc75f58fa90f812ae9c36da9a4ed04453`から、確定保護名簿を使う人的補償の一括指名と裁定を追加。同一獲得球団/開始年度の受諾済みpending案件を同時に受け、競合は同一リーグ・低い勝率の順で解決する。勝者だけ契約・将来給与・減額金銭の両側を原子的に移管し、敗者は再指名待ちを維持。オフは翌2月1日効力・加入待ち、翌春に二軍へ一度だけ加入。元年俸/期間/保証と過年度給与、旧budgetを維持し、全年度予算・新人/FA/人的加入待ちを含む70人枠を再検査する。過年度のdraft割当の再活性化をRED→GREENで修正。新制度は引き続き本番未接続。[設計](./docs/superpowers/specs/2026-10-30-gm01c2g2-fa-personnel-design.md)／[検証と限界](./docs/validation/gm-01c-2g2/README.md)。次はFA獲得人数/期限・海外離脱を整理して年度更新/保存adapter、その後CPU判断・UI・本番接続へ。最終公開head・独立レビュー・全CIは対象PR本文を正本とする。

GM-01C-2G-1：#513マージ済みmain `521d64b98447d68509b58f0fa3f9e6eaf81f379f`から、人的補償の段階追加へ。FA補償案件（proposalId）ごとに独立した保護名簿（各0〜28名）を共通取引で保存し、元の対象と現在資格の積集合から候補を照会する。原取引・snapshot・receiptを照合し、所属変化/新人/FA・トレード加入者・JSON・再適用を検査。G-1-FIXで同オフ加入者の一律除外と球団年度の名簿共有を撤回し、新人除外をdraft情報と受諾済みrookie契約履歴へ限定する。G-1だけでは人的補償は成立せず、選手移管・減額金銭・競合指名優先順位はG-2へ分割する。新制度は本番未接続で、CPU判断/操作画面/年度更新/旧保存移行はその後。[設計と判断](./docs/superpowers/specs/2026-10-29-gm01c2g1-fa-protection-design.md)／[検証と限界](./docs/validation/gm-01c-2g1/README.md)。最終公開headの独立レビューと全CIは対象PR本文を正本とする。

GM-01C-2F：#512マージ済みmain `9c645f6b41806ee91d908769f0fb87ada77e8090`から、A/B FAの旧年俸・初回/反復の明示根拠と金銭補償を追加。提示で全年度給与＋初年度補償を留保し、受諾後も補償債務を維持する。旧球団の金銭のみ選択で支払/受取を一度だけ確定し、精算後に翌春加入を許可。根拠未記録のA/Bは受諾保留を継続する。新規116件、関連23ファイル797件成功、配信44ファイルはmainとパス/SHA-256一致。[制度調査と設計](./docs/superpowers/specs/2026-10-29-gm01c2f-fa-cash-design.md)／[検証と限界](./docs/validation/gm-01c-2f/README.md)。最終公開headの独立レビューと全CIは対象PR本文を正本とする。人的補償/保護名簿・FA獲得人数・期限・海外離脱を別PRで設計し、その後に年度更新/保存と本番人/CPU/Workerを接続する。今回も本番未接続。

GM-01C-2E：#511マージ済みmain `3a7d57b02452556f19638b8bb95634ca913db764`から、市場区分（国内FA/海外FA/自由契約）を任意の明示情報として整理。既存資格・海外志向・旧市場を維持し、提示日/回答日/効力日を分け、オフの全年度留保→将来sign確定→翌春の二軍加入を共通quote/applyへ追加。加入待ちの支配下枠を新人と合算し、JSON再読込・再適用・競合解放・期中月割りを検証する。A/B他球団移籍は補償取引実装まで受諾保留。本番hook/CPU/委任/Worker、旧保存移行・全体年度更新・UI・コーチ・動的校正・実iPhone確認は未接続のまま。[設計と一次資料](./docs/superpowers/specs/2026-10-28-gm01c2e-offseason-design.md)／[検証と限界](./docs/validation/gm-01c-2e/README.md)。最終headの独立レビューとCIは対象PR本文を正本とする。次は補償/海外離脱の共通取引設計、期限/年度移行adapter、保存と本番人/CPU接続の順に進める。

GM-01C-2D：#510マージ済みmain `daddaf8a17f14e533ce290e1ec20ec0d74640779`から、同一年度のFA後日受諾を共通取引へ追加。元の提示条件・合意フェーズ・満了年を保全し、受諾日の効力日と実月割り給与を既存の解決履歴・台帳へ一括確定する。開幕前→同年シーズン、競合解放、期限後取消、見積後の予算/市場/引退/区分/登録枠/配置変更、JSON再適用を検証。追加68件、関連9ファイル433件成功。[設計](./docs/superpowers/specs/2026-10-28-gm01c2d-delayed-fa-design.md)／[検証と限界](./docs/validation/gm-01c-2d/README.md)。最終CI・独立レビューは対象PR本文を正本とする。オフFAの翌年効力・加入、人/CPU/委任/Workerの本番接続、Dの年度更新・保存/UI/コーチ、動的校正・実iPhone性能は後続。基盤だけで新制度を本番有効化しない。

#510は新人・育成の留保/辞退/入団と、重複する正当な候補間の引継ぎ属性の整合性修正を含めマージ済み。新人120件、最終CI全14ジョブ成功。新制度stateのJSON往復と実ゲームの年度更新/保存移行は区別する。

GM-01C-2C：#509マージ済みmain `ea9457d269b0199db7d9af871798884b11b75fbc`から、新人・育成の実年俸留保、辞退による留保と受諾済み枠の解放、翌春の契約台帳・二軍名簿への入団を共通quote/applyへ追加。獲得球団・明示区分を再検査し、支配下70人目の二重計上と、育成入団による区分消失を防ぐ。追加52件、関連7ファイル297件成功。[設計](./docs/superpowers/specs/2026-10-28-gm01c2c-rookie-design.md)／[検証と限界](./docs/validation/gm-01c-2c/README.md)。全件CI・独立レビューは対象PR本文を正本とする。FA遅延回答、本番hook/CPU/委任/Worker、年度更新・保存移行・UI/コーチ、校正と実iPhone性能は後続。本番の育成ドラフトや新制度有効化は行わない。

#509は更改の共通取引と、将来育成更改・当年支配下転換の競合拒否を含めマージ済み。更改50件＋転換46件成功、最終CI全14ジョブ成功。年次E2E初回の未回答引退ダイアログによる保存クリック遮蔽は未修正として記録されている。今回の新人基盤で解消したとは扱わない。

GM-01C-2B：#508マージ済みmain `2dc7cf10fee292ba1669e67236feba06aa7bed2e`から、更改の提示・差し替え・受諾・取消、シーズン中／オフの翌年効力・予算、将来契約付き移籍を追加。現在の年俸・配置・年数投影を維持し、同年途中加入を台帳満了で判定する。追加38件のうち28件REDを既存CIで確認。最終headの結果はPR本文、手順・範囲は[検証記録](./docs/validation/gm-01c-2b/README.md)。新人／FA遅延回答・本番hook／CPU／委任／Worker、Dの年度更新／保存／UIと校正・実iPhone性能は後続。

GM-01C-2A-FIX：#508への追加修正で、受諾済み新人の獲得球団・区分と契約留保を照合し、複数球団への重複受諾を拒否。明示区分付き契約は既存の最低年俸定数で検証し、未記録のC-1・ゼロ金額台帳は維持する。追加24件、19件RED→GREEN、関連19ファイル417件成功。[検証記録](./docs/validation/gm-01c-2a-fix/README.md)。最終headのCIはPR #508本文を正本とし、C-2/Dへの本番接続はまだ行わない。

最新追加：2026-10-27、#507マージ済みmain `818ae5025dd749b9bb254bbfcdcd7ba4ceb5cbc9`からGM-01C-2Aへ。契約正本に任意の支配下/育成区分を追加し、台帳の効力日で区分と年俸を転換する。共通取引で70人上限・年度別負担/最低維持費・二軍名簿・確定IDを一度に更新。7月16日240→420万円で当年322万円、元の契約終了年・保証を維持。一軍昇格は別操作。[範囲・検証](./docs/validation/gm-01c-2a/README.md)。

C-2AはC-2の先行部分で、本番hook/Worker・保存・UIは未接続。未記録の旧基盤データは従来の名簿分類を継続し、転換に必要な区分は推測しない。後続C-2で更改/新人/本物の育成加入・翌年効力/非同期回答・人/CPU/委任/Workerを接続、Dで年度切替/保存移行/UI/コーチ、最後に動的校正と実iPhoneの連続見積性能を確認する。未接続・未校正の新制度を本番有効化しない。

最新追加：2026-10-27、#506マージ済みmain `e591de1428020da0d42f9c3a88ab94146a03e8bc`からGM-01C-1へ。[共通取引・FA/トレード代表経路](./docs/validation/gm-01c-1/README.md)を実装。実名簿/市場と契約/年度予算を一括候補へ接続し、取引ID再適用・両側金銭・最低維持費を検証。本番hookへの接続と新制度有効化は未実施。C-2（非同期/オフ・更改/新人等・人/CPU全経路）、D（年度切替/保存/UI/コーチ）、接続後の動的校正へ続く。

GM-01C-1-FIX：育成新人を支配下70人枠・420万円最低維持費から除外し、契約留保実額は維持。現行ドラフトの支配下加入上限も保護。追加21件、関連324件の回帰と合成負荷を検証。C-2では本番の呼出頻度と実iPhone Safariの見積/確定性能を必須確認とする。新APIは引き続き本番未接続。詳細・最終CIは[検証記録](./docs/validation/gm-01c-1/README.md)とPR #507を参照。

同PRの追加修正：支配下化と一軍昇格を分離し、一軍満員でも二軍に残した支配下化を許可。更改・満了・FA対象・契約表示は両育成フラグの共通判定へ統一。CPU引退補充での育成一軍化を防止し、既に誤配置された旧状態はオフの境界で二軍へ戻して満了等を処理する。追加36件、関連24ファイル372件成功。育成ドラフト、契約台帳への契約種別/転換履歴の接続、通常途中の旧誤配置の読込時修復は本修正に含めない。

最新照合：2026-10-27、main `6be20cef7aba1637f457e588fa27fe68f67c4a68`（#505マージ済み）。[GM-00/01A](./docs/validation/gm-00/README.md)から、[GM-01Bの期間付き負担・保証残債・年度別支出/留保](./docs/validation/gm-01b/README.md)へ進めた。月割り計算を共通台帳/予算審査へ接続し、受諾の二重計上・赤字時の無金銭交換・7年目の不足を検証。ゲーム・CPU/UIへの新制度接続、旧セーブ移行、係数校正は未完了。完全バックアップとPA/BF0個別診断は引き続き対象外。

| 次工程 | 狙い | 状態 |
|---|---|---|
| GM-00 | 全取引の年度別費用・契約効力年度・**2〜11月月割り実負担**・登録期限・コーチ費用の確認 | 初回実証済み。主要取引・実hook年度境界・12球団の静的候補表。賞金/ポスティング/残債の全経路実証は接続時に残す |
| GM-01 | 年度枠・契約正本・月割り・留保・人/CPU/トレード・コーチ年俸を統一 | A/B: 月割り・契約年度・保証残債台帳・年度別支出/留保/7年審査を実装。C: 市場/CPU/登録資格→D: 年度切替/保存/UI/コーチ/校正が次。新制度は未接続 |
| GM-02 | 役割と将来負担を補強計画へ接続、スカウトの時計/精度を統一 | GM-01後。未実装 |
| GM-03 | 育成配分・主任コーチ・実戦機会を上限付き成長へ接続 | 別工程で成長を校正。未実装 |
| GM-04 | 球場積立・追加配分・オーナー/人気/会見の整合 | 基礎の安定後。未実装 |

既存のゲーム処理・係数・保存形式は変更していない。追加した関数は本番経路へ未接続。次の負担台帳/取引/年度切替/保存/UI接続と動的校正が揃うまで有効化しない。旧年度非遡及を維持し、既存の二軍/補強留保/方針を再実装しない。以下の過去照合は作成時点の記録として残す。

最新照合：2026-10-25、main `632a19c7ef51fe36ace02ee3a855f6cc33ff5454`（#502マージ済み）。UI-04DとQA-04A後、利用者が③「CPU・財務の長期品質」を選択。[現行mainの3seed×10年検証](./docs/validation/cpu-finance-long-20261025/README.md)で360球団年度の収支・330 CPU球団年度の予算・保存再開140回を確認した。単年の打席/対戦打者0が2人年度あり、健康状態・選出理由を含む個別診断が次の候補。下記の過去照合と最新状態を区別する。

照合日：2026-10-21。基準main：`46d75e21b1f6e27c0f60274a38cd7619a80d951d`（PR #489マージ後）。GitHubのmainとマージ状態を確認。QA-D1は#472、FIX-S3は#473、捕手不足の原因分析は#474、捕手層の編成方針は#475、一軍空き枠の補足修正は#476、共通人数基盤は#477、可変ドラフトは#478、65人方針は#479、AI-03は#480、球団収支FIX-M1は#481でマージ済み。各工程の対象範囲・実測・限界は[QA-D1](./docs/implementation/qa-d1.md)・[FIX-S3](./docs/implementation/fix-s3.md)・[捕手不足の原因分析](./docs/implementation/farm-catcher-shortage.md)・[捕手層のレビューと次工程](./docs/implementation/catcher-depth-review.md)・[収支検証](./docs/validation/club-finance/README.md)を参照。全機能・全年度・実機の完了認定ではない。

保存工程の最新照合: 2026-10-24、main `bed66fb2ad1f9e3e4b94e3fdacd8727bece7287d`（#500マージ後）。#499の再試行/集計原子性修正に加え、#500で3保存世代・生存タブを保護した孤立version回収を実装。PR head19c65b6のCI全13ジョブ成功。合成20年履歴の保持と回収を確認したが、実20年進行・実機物理容量の保証ではない。利用者は元の保存失敗が実利用で改善したと報告。今回は利用者の選択でUI-04Dを先行し、完全バックアップ/復元は保留する。設計の正本は未マージの[#494](https://github.com/shotaro-hue/baseball-manager/pull/494)。

### UI-04 球団経営・ナビゲーション刷新（今回確定）

「ホーム／編成／日程／成績／経営」を承認済み方針として採用。既存9機能を経営・共通通知・記録/球団史・設定へ再配置する。[要件/画面遷移/完了条件](./docs/implementation/ui-04.md)／[390・1440px構成案](./docs/design/ui04/wireframes.html)／[UI-04A検証記録](./docs/validation/ui-04a/README.md)。

| 工程 | 優先度 | 状態 | 依存・完了条件 |
|---|---|---|---|
| UI-04A | — | [#482](https://github.com/shotaro-hue/baseball-manager/pull/482)マージ済み | 5分類・9機能への入口。旧本文の移行完了とは区別 |
| UI-04A-FIX | — | [#483](https://github.com/shotaro-hue/baseball-manager/pull/483)マージ済み | 通知サブタブの履歴重複・画面復帰を修正。[検証](./docs/validation/ui-04a-fix/README.md) |
| FIX-M2 | — | [#484](https://github.com/shotaro-hue/baseball-manager/pull/484)マージ済み | #483後のmain。試合前需要で収益計上、主催区分/Worker一致、負予算下の無金銭トレード・支出制約・年度/保存。[要件](./docs/implementation/fix-m2.md) |
| UI-04B | — | [#485](https://github.com/shotaro-hue/baseball-manager/pull/485)マージ済み。[記録](./docs/validation/ui-04b/README.md) | A-FIX・FIX-M2マージ。経営指標、実績/予測/欠測、価格下書き→比較→確定、投資比較・保存再開 |
| UI-04C | — | [#486](https://github.com/shotaro-hue/baseball-manager/pull/486)マージ済み。[記録](./docs/validation/ui-04c/README.md) | 補強/契約の判断・確認・結果、通知対象・解決済み表示 |
| UI-04C-FIX | — | [#487](https://github.com/shotaro-hue/baseball-manager/pull/487)マージ済み。[要件](./docs/implementation/ui-04c-fix.md)・[性能/画面/回帰](./docs/validation/ui-04c-fix/README.md) | #486後。軽量一覧・検索/所属/ポジション/年俸/満了ソート、選択後の詳細だけ描画、片側トレード選択/比較、派遣と報告の分離、通知・ID・位置/フォーカス復帰。後置の保存成功通知によるWebKitの59pxずれも修正。ゲーム/保存/金銭/CPUを維持 |
| UI-04C-FIX2 | — | [#488](https://github.com/shotaro-hue/baseball-manager/pull/488)マージ済み。[検証](./docs/validation/ui-04c-fix2/README.md) | FA領域800pxを単一基準としてCSS/行生成を整合。761〜799px・狭い埋め込み・領域のみのリサイズ・一覧復帰を検証。実iPhoneの指追従確認は未完了 |
| FIX-CORE-01 | — | [#489](https://github.com/shotaro-hue/baseball-manager/pull/489)マージ済み。[原因/検証](./docs/validation/fix-core-01/README.md) | メタデータなしの再開、記者会見の重複効果防止、保存移籍履歴の表示 |
| FIX-CORE-02 | — | [#490](https://github.com/shotaro-hue/baseball-manager/pull/490)マージ済み | [原因/検証](./docs/validation/fix-core-02/README.md)。#491〜#493の保存容量修正もmain反映済み。実機受入は別途 |
| SAVE-01A | P1 | [#494](https://github.com/shotaro-hue/baseball-manager/pull/494)で設計継続、未マージ | ZIP第一候補。B-0の限定受入と設計確定/v1凍結を分離。root/不変archive対応、旧版タブ、全展開メモリ、実iPhone/Files、完全復元とGC保護は未完了 |
| SAVE-01B-0 | — | [#495](https://github.com/shotaro-hue/baseball-manager/pull/495)限定実証マージ済み | [証跡](./docs/validation/save-01b0/README.md)。隔離journal・共通ロック参加probe・16/64 MiB ZIPの独立全バイト検証。製品完全バックアップの完成ではない |
| SAVE-01B-0A | — | [#496](https://github.com/shotaro-hue/baseball-manager/pull/496)マージ済み | [検証](./docs/validation/archive-lock/README.md)。write/retry/backfill/deleteを共通archiveロックへ統合。最終head CI13ジョブ成功。旧版タブのfenceとroot対応は別工程 |
| SAVE-01B-0B | — | [#497](https://github.com/shotaro-hue/baseball-manager/pull/497)マージ済み | [検証](./docs/validation/storage-version-fence/README.md)。DB v3→v4で全行を保全し版指定旧openを拒否、妨害/待機/旧版を原因別に失敗。最終head CI13ジョブ成功。無版指定raw IDB・localStorage直接書込・進行済み旧公開は別課題 |
| SAVE-01B-0C | — | [#498](https://github.com/shotaro-hue/baseball-manager/pull/498)マージ済み、追加修正あり | [検証](./docs/validation/batted-ball-receipts/README.md)。採用receipt/不変履歴を4経路・保存再開へ接続。CI/再試行の残問題は下記修正工程で扱う |
| SAVE-01B-0C-FIX | — | [#499](https://github.com/shotaro-hue/baseball-manager/pull/499)マージ済み | [計画](./docs/implementation/archive-retry-order-plan.md)・[検証](./docs/validation/archive-retry-order/README.md)。再試行/集計原子性/保存別警告/捕手診断を修正。PR CI全13ジョブ成功 |
| SAVE-CAPACITY-2 | — | [#500](https://github.com/shotaro-hue/baseball-manager/pull/500)マージ済み | [計画](./docs/implementation/archive-retention-plan.md)・[検証](./docs/validation/archive-retention/README.md)。3保存root・生存タブを保護して孤立versionを回収。保持年数の変更なし |
| SAVE-01B-1 / B-2 | 保留 | 今回は実施しない | 完全バックアップ/復元は利用者の指示で後回し。再開時は#494の設計・v1凍結と残ゲートを再確認 |
| QA-04A | — | [#502](https://github.com/shotaro-hue/baseball-manager/pull/502)マージ済み。[要件](./docs/implementation/qa-04a.md)・[検証](./docs/validation/qa-04a/README.md) | 新規の実143試合・年度更新・保存再開と通常CI外E2Eを検証。長いまとめ処理の全球団スコア欠落を修正。最終head CI全14ジョブ成功 |
| UI-04D | — | [#501](https://github.com/shotaro-hue/baseball-manager/pull/501)マージ済み | [要件](./docs/implementation/ui-04d.md)・[検証](./docs/validation/ui-04d/README.md)。通知/ニュース/記録/OB/設定の本文をDES-01へ移行。既読と要対応、選択詳細と一覧復帰、保存された旧年度を維持 |
| QA-04B | P1 | UI-04D後、未着手。**実iPhone確認未完了** | 360/390/760/761/799/800/1023/1024/1440px、Chromium/WebKit、キーボード、保存/復帰。実iPhoneのタッチ・連続スワイプ・速度は別途実施 |

今回の対象は **CPU・財務の現行main長期検証**。既存の本番エンジン/hookハーネスを変更せず3seed×10年を完走。二軍未実施・負予算・新人初年度/複数年連続の出場機会0は0、補強後捕手6〜9人、指名0の連続は最長1年だった。途中年度の単年出場機会0が2人年度あるため、全員毎年の出場を保証したとは扱わない。[原本・集計・次課題](./docs/validation/cpu-finance-long-20261025/README.md)。Nodeの検証用保存先と固定利用者方針による診断であり、実App/プレーオフ/immutable receiptを含む複数年耐久と実iPhoneのQA-04Bは別途。完全バックアップ/復元と#494の設計凍結は保留を維持する。各工程は専用PR、人間がマージ判断。

**二軍の実測基盤は実装・マージ済み。CPUの編成判断は段階的に改善中。新デザインの全画面移行と長期バランスの完了には至っていない。**

### mainへ反映済みの成果

| 項目 | 完了した範囲 | 根拠PR |
|---|---|---|
| 保存整合性 F3-B | 通算履歴の保存世代統合、年度更新・新規ゲームの保護 | [#430](https://github.com/shotaro-hue/baseball-manager/pull/430) |
| テスト運用 | 棚卸し、Workの段階的検証、CI分割 | [#431](https://github.com/shotaro-hue/baseball-manager/pull/431) |
| DOC-01 | 開発・UI/UX方針の正本と運用基準を整備 | [#433](https://github.com/shotaro-hue/baseball-manager/pull/433) |
| FIX-T | トレードの金額・逆提案・成立時検証 | [#434](https://github.com/shotaro-hue/baseball-manager/pull/434) |
| FIX-D | 手動／全自動ドラフトの抽選・登録枠・保存再開 | [#435](https://github.com/shotaro-hue/baseball-manager/pull/435) |
| F-01 | 二軍日程・選考・軽量試合ドメイン | [#437](https://github.com/shotaro-hue/baseball-manager/pull/437) |
| F-02 | 独立記録、旧セーブ移行、保存復元・年度遷移 | [#438](https://github.com/shotaro-hue/baseball-manager/pull/438) |
| F-03 | 通常進行・Worker・保存と二軍実測の接続、最小閲覧 | [#439](https://github.com/shotaro-hue/baseball-manager/pull/439) |
| F-04 | 年度ランキング・実測表彰・archive、旧pending表示互換性 | [#440](https://github.com/shotaro-hue/baseball-manager/pull/440) |
| 編成の補足修正 | 初期捕手配置、複数故障時の二軍補充、日々の全自動管理での捕手確保 | [#441](https://github.com/shotaro-hue/baseball-manager/pull/441)、[#442](https://github.com/shotaro-hue/baseball-manager/pull/442)、[#443](https://github.com/shotaro-hue/baseball-manager/pull/443) |
| CPUドラフトの補足修正 | 確定指名を次巡へ反映。投手は一軍＋二軍＋確定指名の役割人数・先発年齢層を評価 | [#444](https://github.com/shotaro-hue/baseball-manager/pull/444)、[#445](https://github.com/shotaro-hue/baseball-manager/pull/445) |
| DES-01 | 正式デザインシステムと承認代表画面を確定。全画面移行は別工程 | [#436](https://github.com/shotaro-hue/baseball-manager/pull/436) |
| AI-01／AI-02 | 一軍運用・組織層・確定指名の読取専用評価、CPUドラフトの投手役割別判断 | [#447](https://github.com/shotaro-hue/baseball-manager/pull/447)、[#451](https://github.com/shotaro-hue/baseball-manager/pull/451) |
| FIX-S1／S2 | 降格選手の一軍ランキング・実測0、球団比較の成績・全所属契約年俸を整合 | [#448](https://github.com/shotaro-hue/baseball-manager/pull/448)、[#450](https://github.com/shotaro-hue/baseball-manager/pull/450) |
| UI-01A／B／C | 最小共通部品、スマホ・PCホーム、保存表示・共通進行設定、1試合結果を実装 | [#449](https://github.com/shotaro-hue/baseball-manager/pull/449)、[#452](https://github.com/shotaro-hue/baseball-manager/pull/452)、[#454](https://github.com/shotaro-hue/baseball-manager/pull/454) |
| UI-02A | 一軍・二軍の共通編成概要を移行。詳細設定・選手分析の全面移行は別工程 | [#455](https://github.com/shotaro-hue/baseball-manager/pull/455) |
| UI-02B | 野手・投手・共通の起用設定、自動編成確認、編成概要への復帰をDES-01へ移行 | [#456](https://github.com/shotaro-hue/baseball-manager/pull/456) |
| UI-02C | 選手詳細・2人比較をDES-01へ移行。記録範囲・欠測・キーボード・元画面への復帰を整備 | [#457](https://github.com/shotaro-hue/baseball-manager/pull/457) |
| UI-02D1 | 球団別一軍成績一覧を移行。記録条件・絞り込み・詳細／比較導線を整備 | [#458](https://github.com/shotaro-hue/baseball-manager/pull/458) |
| UI-02D2 | 一軍リーグランキングを移行。候補探索、指標・条件、詳細／比較導線を整備 | [#459](https://github.com/shotaro-hue/baseball-manager/pull/459) |
| UI-02D3 | 二軍ランキング・年度別記録を移行。実績球団と現在所属、記録から現役詳細・起用への導線を整備 | [#460](https://github.com/shotaro-hue/baseball-manager/pull/460) |
| UI-02E | 二軍育成・起用、支配下登録、既存一軍会話を移行。制約理由・確認・フォーカス復帰を整備 | [#461](https://github.com/shotaro-hue/baseball-manager/pull/461) |
| UI-01D | まとめシム結果・詳細復帰・編成見直し導線をDES-01へ移行。保存表示と打撃ハイライトの接続不整合は#464で修正 | [#463](https://github.com/shotaro-hue/baseball-manager/pull/463) |
| FIX-R1 | まとめシムの共通保存追跡・実ログの遅延集計・部分履歴失敗表示と再試行を整合 | [#464](https://github.com/shotaro-hue/baseball-manager/pull/464) |
| 結果画面の相手AVG | 試合後の現行球団の今季AB/Hを参照。開幕単試合オートと保存再開を検証 | [#462](https://github.com/shotaro-hue/baseball-manager/pull/462) |
| FIX-S4 | 結果画面のW/L/Sを既存ボックススコア判定へ接続。公式成績と表示を照合 | [#453](https://github.com/shotaro-hue/baseball-manager/pull/453) |
| UI-01E | 日程・球団詳細の試合履歴と保存ボックススコアをDES-01へ移行 | [#465](https://github.com/shotaro-hue/baseball-manager/pull/465) |
| UI-03A／B | オフシーズン編成・契約更改を移行し、方針表と契約更改を全選手の1一覧へ統合。可逆の放出候補・獲得済み表示・保存復帰を整備 | [#466](https://github.com/shotaro-hue/baseball-manager/pull/466)、[#468](https://github.com/shotaro-hue/baseball-manager/pull/468)、[#469](https://github.com/shotaro-hue/baseball-manager/pull/469) |
| UI-03D | 成長レポートを短い一覧・絞り込み・個別内訳へ整理。狭い埋め込みと復帰を整備 | [#467](https://github.com/shotaro-hue/baseball-manager/pull/467) |
| UI-03C | FA市場を契約更改と共通の一覧・個別条件確認・復帰へ移行 | [#470](https://github.com/shotaro-hue/baseball-manager/pull/470) |
| ドラフト評価・指名体験 | 公開／自球団レポート、調査通算、比較・確認・復帰、競合判断、指名時所見 | [#471](https://github.com/shotaro-hue/baseball-manager/pull/471) |
| QA-D1 | 通常生成20seed六巡・3seed×3年・42保存再開、候補一覧の性能・位置同期修正。最終head CI全8ジョブ成功 | [#472](https://github.com/shotaro-hue/baseball-manager/pull/472) |
| FIX-S3 | OPSの3桁精度、旧年度履歴・通算合算・一覧/詳細/比較/ランキングを整合。CPU判断の従来2桁入力と保存形式を維持。最終head CI全8ジョブ成功 | [#473](https://github.com/shotaro-hue/baseball-manager/pull/473) |
| 二軍捕手不足の原因分析 | 3seed×3年・223/7,722未実施カードを保有・負傷・昇降格から分解。全件健康捕手2人、余剰の見落としは検出せず | [#474](https://github.com/shotaro-hue/baseball-manager/pull/474) |
| 捕手層の編成方針 | 通常一軍3人・最低2人、支配下主捕手6人を補強目安に分離。初期生成・確定指名・旧保存互換を検証。3seed×3年で二軍未実施0/7,722カード、最終head CI全8ジョブ成功 | [#475](https://github.com/shotaro-hue/baseball-manager/pull/475) |

PR #432は未マージでクローズ。テスト運用の成果は#431として記録し、重複して数えない。

### 残っている範囲

| 項目 | 現在の状態 | 次に確認・実施する範囲 |
|---|---|---|
| CPU編成・補強AI | 部分完了 | FA・契約更改・戦力外にも二軍の人数・役割を考慮する判断が必要か、現行処理から確認する。#444/#445だけで補強AI全体を完了扱いにしない |
| ドラフト評価・指名体験 | #471でマージ済み | 公開／球団別観測、1位からの調査通算、比較・確認・復帰、CPU競合判断、指名時所見が対象範囲。QA-D1で通常生成20seedの六巡・12球団分布を追加測定。実機QA・長期バランス完成とは区別。[実装](./docs/implementation/draft-decision.md)／[QA-D1](./docs/implementation/qa-d1.md) |
| 長期検証・二軍バランス | 一部検証済み | 実1シーズン観測と合成5/20年容量検証を実施。複数seed・実複数年での編成維持、出場数・疲労・未実施率、実端末負荷を確認する |
| 二軍捕手不足の原因分析 | #474でマージ済み | 未実施223/7,722カードは全て健康捕手2人。一軍2人優先時に二軍0人となる。保有3/4/5人に対する負傷1/2/3人を161/55/7球団日で確認。原因分析だけで不足解消とはしない。[原因・検証記録](./docs/implementation/farm-catcher-shortage.md) |
| 捕手層の編成方針 | #475でマージ済み（対象範囲の実装完了） | 通常一軍3人・最低2人、支配下主捕手6人の目安。健康3人時は一軍2＋二軍1を優先。3seed×3年の二軍未実施0件を確認。過剰指名・健康2人以下・旧保存の即時補充・長期市場校正は残る。[実装](./docs/implementation/catcher-depth.md)／[レビューと次工程](./docs/implementation/catcher-depth-review.md) |
| 捕手配置後の一軍空き枠 | #476で補足修正をマージ済み | 余剰捕手の降格後に26〜27人となる回帰を再現。既存の昇格制約で28人まで補充し、候補が登録待機・育成・外国人枠で不可なら空きを維持。RED/GREENと実データ・代替生成100seedずつを検証。[レビュー記録](./docs/implementation/catcher-depth-review.md) |
| FIX-S | S1/S2/S3/S4は上記範囲でマージ済み | S3は欠測履歴の通算を確定値として作らない。実ユーザー全世代セーブ・実機の全検証とは区別する。[検証記録](./docs/implementation/fix-s3.md) |
| UI-04A | #482でマージ済み | 主要5分類・既存9機能移設・通知/設定・元画面の保持。通知サブタブ再訪の履歴重複は#483で修正済み。本文刷新・QA-04全体は未完了 |
| FIX-M1 | #481でマージ済み | 球団別の主催収入・年間契約・自動運営費・編成予算・予測・投資価格を接続。[記録](./docs/implementation/club-finance.md)。経営UIはUI-04、需要の更新順と負予算境界は別PRのFIX-M2。給与支払時期の統一は非対象 |
| FIX-V/Mほか | 残課題の再調査待ち | 保存状態表示等の疑義を再確認。既対応の契約年俸表示を再実装しない |
| DES-01 | 正式仕様はマージ済み | #436の確定と、各画面への移行完了を区別する |
| QA-D1 | #472でマージ済み。20seed六巡・3seed×3年・42保存再開を検証 | Chromium/WebKit 360/390/1440と性能比較を追加。検証範囲のP0なし、スクロール・順位計算・復帰と直後のキーボード保存の位置同期を修正。二軍捕手不足と登録枠充足、iPhone実機未確認を残す。独立PR・最終head CIは[記録](./docs/implementation/qa-d1.md)を参照 |
| UI-01〜03／QA-01 | 新方針での移行完了は未確認 | UI-01・UI-02とUI-03A/B/Dは上記範囲でマージ済み。方針一覧との統合は#469でマージ済み。FA市場UI-03Cは#470でマージ済み。ドラフトの初回範囲は#471でマージ済み。経営、UI-03全体、総合QAは未完了 |
| UI-01E | #465でマージ済み | 日程・結果、球団詳細の日程タブ、保存ボックススコアをDES-01へ移行。年度・日付・視点、未記録・実測0・部分記録と復帰を検証。[記録](./docs/implementation/ui-01e.md) |
| UI-03A | #466でマージ済み | オフシーズン編成の概要・方針一覧・結果確認・確認ダイアログをDES-01へ移行。保存失敗／再試行、実放出・FA予算・契約下書き保持を検証。[記録](./docs/implementation/ui-03a.md) |
| UI-03D | #467でマージ済み（対象範囲の移行完了） | 成長レポートの短い一覧・表示フィルター・選んだ1人の内訳、狭い埋め込みとスクロール／フォーカス復帰まで。成長計算・保存形式は維持。Safari/WebKit・実端末・総合QAの完了認定は含めない。[確定要件・記録](./docs/implementation/ui-03d.md) |
| UI-03B | #468でマージ済み（対象範囲の移行完了） | 契約更改の比較一覧、入力・確認・返答、折り畳み、一括下書き、復帰をDES-01へ移行。既存の交渉判定と保存形式を維持し、独立経路の既存session／view保存を接続。[記録](./docs/implementation/ui-03b.md)。最終head CIはPR本文に記録 |
| UI-03A/Bフォローアップ | #469でマージ済み | 方針表と更改の一覧統合、継続契約を含む比較、可逆の放出候補、重複概要の整理、獲得済み契約と成績の出所、フォーカス復帰。[検証記録](./docs/implementation/planning-unified-roster.md)。ゲーム処理・保存形式は維持 |
| UI-03C | #470でマージ済み（対象範囲の移行完了） | FA市場を更改と同じ一覧／個別条件・確認・復帰へ整理。主要成績と年俸の比較、詳細折り畳み、埋め込み概要の重複除去、自球団との比較選択をDES-01へ移行。既存契約ルール・先払い・保存形式は維持。[記録](./docs/implementation/ui-03c.md) |
| 経営・QA-01 | 未完了 | 経営のDES-01移行、旧CSS整理・総合QAは別工程。FA市場・ドラフトの対象範囲の実装だけでUI-03全体を完了扱いにしない |

健康な捕手が球団全体で2人だけのケースは、一軍2人を優先すると二軍カードが未実施となり得る。#443の実143round観測では69カードが該当した。この1ケースや、合成長期履歴の保存成功を「全試合成立・実20年プレイ・バランス完成」の証明にしない。詳細は [F-04検証記録](./docs/farm-f04-validation.md) と [日次捕手配置の検証](./docs/daily-farm-catcher-coverage.md) を参照。

### 支配下人数・ドラフト再定義の進捗

- 採用方針は[支配下70人・可変ドラフトの承認仕様](./docs/superpowers/specs/2026-10-16-roster-capacity-design.md)。
- **第1PR：[#477](https://github.com/shotaro-hue/baseball-manager/pull/477)でマージ済み**。支配下／育成両フラグ／受諾済み未所属指名を共通集計し、FA・スカウト・トレード・育成登録・指名反映と人数表示へ接続。予定放出と実際の残枠を区別。検証・独立レビュー・最終head CIは[実装記録](./docs/implementation/roster-capacity-1.md)とPR本文を参照。
- **第2PR：[#478](https://github.com/shotaro-hue/baseball-manager/pull/478)でマージ済み**。新会議10人・160候補、選択終了、拒否を含む年上限、CPU継続判定と旧6巡の保存互換。[計画](./docs/superpowers/plans/2026-10-17-variable-draft.md)／[検証記録](./docs/implementation/variable-draft.md)。20seedの会議で指名5〜10人、旧80候補・6巡の実保存再開と新方式4ブラウザ旅程を確認。最終head CIはPR本文に記録する。長期校正とは区別する。
- **第3PR：[#479](https://github.com/shotaro-hue/baseball-manager/pull/479)でマージ済み・最終3seed×10年の長期受入合格**。新規65人・CPU通常67人目標、補強予定、FA前の新人枠/最低年俸留保、特殊入力と捕手補充枠を修正。旧比較の9年連続無出場を二軍機会・年度管理日・一軍控えの実戦機会の3点で修正し、最終30年度・保存再開140回を追加完了。CPU652コホートの初年度0・複数年連続0、二軍未実施・予算負値は全て0。70人偏重と4年連続指名0・20点例外の最適性は後続P2であり、67人への強制収束は行わない。[実装記録](./docs/implementation/roster-planning-65.md)／[最終証跡・年度別集計](./docs/validation/roster-planning-65/farm-opportunities/README.md)。マージ判断は最新headの全CI成功も条件とし、SHAと結果はPR本文を参照。

### 次の作業順（人数基盤の後続以外は候補）

1. CPUドラフトの捕手過剰指名は第2PRで継続条件を分離して検証中。seed20261016・teamId=1では2026年ドラフト前後に6→8人、翌年8→11人へ増加した。充足後の加点停止と、選手評価・他位置の不足・年齢構成・育成機会を分けて検証する。6人を一律の獲得上限にする仕様は未確定。[根拠と受け入れ条件](./docs/implementation/catcher-depth-review.md)
2. 健康2人以下・旧保存の不足に対する補充を独立して扱う。国内FAの日次緊急獲得を含む方法は、70枠・予算・候補不足・登録待機・自球団の手動判断を踏まえて決める。現在の通常3人／非常時2＋1と保存形式を維持し、6人の目安だけで全カード成立としない。
3. 経営画面のDES-01移行。既存判断・財務ルールの変更とは分ける。捕手の過剰指名への対応と混ぜない。
4. CPU長期編成改善。上記の捕手指名を入口に、FA・契約更改・戦力外、登録枠充足・役割・年齢構成の不足を段階的に測定する。FAは不足加点がなくても評価点・予算・枠で獲得できるが、今回の11人への増加をFA由来とは扱わない。
5. 二軍・長期プレイのバランスと実端末負荷を追加検証する。3シーズンを長期完成認定にしない。
6. 残るFIX-V/Mの疑義を再確認。Safari/WebKitエミュレーションとiPhone実機QAを分け、未実施を完了扱いにしない。

#470・#471・#472・#473・#474・#475はマージ済み。#471の確定範囲は[要件](./docs/superpowers/specs/2026-10-15-draft-decision-design.md)・[実装記録](./docs/implementation/draft-decision.md)。QA-D1・FIX-S3・捕手層の編成方針の最終headとActions結果は各独立PR本文を正本とする。

**現時点の方針**: 大型機能の前に、プレイ体験の信頼性と「考える楽しさ」を優先する。

---

2026-10-22 SAVE-CAPACITY緊急対応: #490/#491マージ後main `756af98`でlocalStorage本体の複製容量がボトルネックと確認。大容量本体のIndexedDB参照化・検証後公開・バックアップ保全・孤立行回収・native圧縮・画面診断コピーを優先実装。設計PR #492と実装PRを分離。実iPhoneは未検証で、最終CI・実機確認が受入条件。[原因・容量・検証・実機手順](./docs/validation/save-capacity/README.md)。UI-04D/他の新機能より優先し、直接mainへpush/自動マージしない。

2026-10-21 保存障害の優先対応: 基準main `46d75e21b1f6e27c0f60274a38cd7619a80d951d`（#489）。#490の削除・読込競合は同PRで対応し、mainにも存在するオフシーズン保存失敗の理由表示・診断を独立PRで修正。最終P2では原因別の復旧案内と、共有成功後に届く古い手動保存エラーの非復活を検証。#490→#491の統合と最新head CIが受入条件。実iPhoneの元障害は未再現で、解決認定は保留。追加のWebKit容量確認では約112万文字のrootを3世代分置くとbackup更新のquota警告を確認し、最大サイズ3世代の容量限界を残す（元の63人セーブとは別条件）。通常CIの契約・財務群は全テスト成功後も30分上限に達したため、テスト・worker・制限時間を保ったまま管理UI群を分割。[調査・実装・回帰・限界](./docs/validation/offseason-save-failure/README.md)を参照。両PRとも未マージ・レビュー待ちとし、SAVE-01A/01B等の後続には進まない。

## 2. 当初の直近フォーカス（2026-05-01時点の履歴）

## Now（最優先: まず壊れない・嘘をつかない）

### A. シミュレーション信頼性の回復（P0/P1）
- [x] ドラフト指名反映の完全修正（全12球団・全巡目・重複制御）※2026-04-11対応
- [x] 投手成績集計の整合性修正（BF/WHIP/先発判定）※2026-04-11対応
- [x] 外国人960日到達後の国内扱い自動移行 ※2026-04対応

**完了条件**
- 10年オート検証で進行停止・主要集計崩壊が0件
- 主要アワード/タイトルが統計と矛盾しない

### B. 編成UIの意思決定体験改善（P1）
- [x] ロースター操作の誤操作防止（打順/守備/DHバリデーション）※2026-04-12対応
- [x] 投手管理画面の統合（情報分散を解消）※2026-04対応

**完了条件**
- 1週間シム前に必要な操作が1画面で完結
- 初見プレイヤーが「なぜこの結果になったか」を追跡可能

---

## Next（その次: 長期プレイの中毒性を上げる）

### C. スプリングトレーニング導入
- [x] 2〜3月の実戦評価フェーズ（キャンプレポート画面）
- [x] 開幕ローテ/開幕一軍の競争イベント化（ポジション争いUI・選手比較タブ）
- [x] 一時的コンディション変動と期待値調整（±15変動・台頭+20・不調-15）

**狙い**: 「開幕前にも意思決定がある」状態を作り、毎年のマンネリを防ぐ。

### AI-03 CPU編成循環・ドラフト枠最適化

- CPU更改前の実候補比較、保護された余剰満了選手の入替、比較対象なしの将来性基準、市場と実新人の機会費用、診断sinkを実装。独立レビューの不整合を回帰で修正。
- 改善前後3seed×10年を完走。70人273/330→16/330、指名0最長4→1年、将来比較0の例外284→0。補強後捕手6–9、複数年無出場/支配下超過/負予算/二軍未実施0。途中退団後の捕手不足・捕手9/投手38等の余剰は継続監視する。
- [#480](https://github.com/shotaro-hue/baseball-manager/pull/480)でマージ済み。[実装・判断](./docs/implementation/ai-03.md)／[固定比較と制限](./docs/validation/ai-03/README.md)。

### D. CPU球団フロントAIの深化
- [x] 買い手/売り手判定を順位だけでなく年齢構成・契約残年数でも判定
- [x] 将来価値（prospect value）を加味したトレード判断
- [x] 再建期の一貫戦略（高齢選手売却→若手育成→勝負年）

**狙い**: 人間プレイヤーが「リーグ全体と戦っている」感覚を作る。

---

## 3. 当初のマイルストーン（履歴。期日経過を完了とみなさない）

## M1: Gameplay Integrity（〜2026-05）
- P0/P1不整合バグ修正完了
- 自動検証シナリオ（1年/5年/10年）を定例化
- 既知の進行阻害バグをゼロ化

## M2: Decision UX（〜2026-06）
- ロースター/投手運用UI統合
- 試合結果→編成修正→次戦準備の導線短縮
- 「原因→結果」の可視化カード追加

## M3: Franchise Depth（〜2026-08）
- スプリングトレーニング
- CPUフロントAI強化
- 複数年でのリーグ物語（王朝/再建/スター流出）の発生率向上

## M4: Expansion Readiness（〜2026-10）
- カスタムチーム作成
- 統計エクスポート（CSV/JSON）
- パフォーマンス/モバイル最適化の着手

---

## 4. 優先順位ルール（実装判断の基準）

新規機能は以下で評価し、上から順に優先。

1. **没入阻害の除去**: バグ修正・整合性
2. **意思決定の質向上**: 比較・予測・検証しやすさ
3. **時間軸の面白さ**: 複数年で効いてくる仕組み
4. **演出強化**: 視覚的リッチさ（上記を満たした後）

---

## 5. 当初の具体バックログ（2026-05-01時点の履歴）

### P0（即対応）
- [x] ドラフト結果反映の完全性
- [x] 投手成績集計の正規化

### P1（短期）
- [x] 外国人枠の年数到達自動切替
- [x] ロースター/DHバリデーション
- [x] 投手・継投UI統合
- [x] スプリングトレーニング

### P2（中期）
- [x] CPU補強AIの戦略化
- [ ] 選手比較ツールの実戦投入
- [ ] モバイル最適化
- [ ] ゲーム速度設定

### P3（中長期）
- [ ] カスタムチーム
- [ ] コミッショナーモード
- [ ] 外部共有向け統計エクスポート強化

---

## 6. 開発運用ルール

- ROADMAPは**機能リスト**ではなく、**体験品質の約束**として扱う。
- 各項目は「実装したか」ではなく「面白さに寄与したか」で完了判定する。
- 週次で以下を確認:
  - 進行阻害バグ件数
  - 1シーズン完走率
  - テストプレイでの意思決定回数（悩める場面があるか）
  - 「来季も続けたい」と思えるかの主観評価

---

## 7. このROADMAPのゴール文（常にここへ戻る）

**「1試合の勝敗」よりも「5年後の球団像」を考えたくなるゲームにする。**  
それが、OOTPやFootball Managerに近い中毒性の核であり、本プロジェクトの最優先価値である。


### 物理演算打撃シミュレーション
- [x] Phase 1: EV/LA生成を能力値先行型に改善（2026-04-30）
- [x] Phase 2: EV/LA → 物理シム → 着弾ゾーンで結果逆算（2026-04-30）
- [x] Phase 3: lookup table 化 + モンテカルロ検証（2026-05-01）
