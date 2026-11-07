# ポスティングの球団判断・結果確認

基準main `e15c57d5f2f813e2223b777129f74027052c0b33`（#551・#552マージ済み）。[Task7の今回計画](../../superpowers/plans/2026-10-30-gm01-a1-integration.md)／[申請仕様](../../superpowers/specs/2026-11-04-gm01-posting-applications-design.md)／[市場結果仕様](../../superpowers/specs/2026-11-06-gm01-posting-market-results-design.md)。PR種別は統合。

## 親目標と今回の範囲

プレイヤーが申請→球団判断→海外交渉→成立/不成立→所属・契約・財務・翌年度反映まで完結することが親目標。今回は**保存済みの自球団申請を、通知→受信箱で判断し、保存された結果を確認する工程**を接続した。

- 判断待ちだけが要対応件数へ入り、既読とは分離する。球団承認・市場結果待ち、球団拒否、海外契約成立、提示なし、本人辞退を区別する。
- 球団判断は申請・保存ID/世代・revision・日付・自球団を再検査して共通取引/保存へ渡す。受信メールは判断権限の根拠にしない。承認だけでは退団・入金せず、拒否でも所属・契約・財務・モラルを維持する。
- 判断の正本は既存の申請event/receipt。派生した受信箱の行や状態を永続化せず、未読状態を新設しない。旧方式の通知はannualで操作不可、legacyでは従来どおり。
- 市場結果は既存の結果/退団/収入証跡から表示する。成立時の契約区分・米ドル額・保証の扱い・円の譲渡金・翌年度限定追加支出枠を示し、実測0を未記録と区別する。表示から価格や成立結果を再生成しない。
- 保存失敗では同じ確認内容を再試行する。別取引/セーブ切替で確認内容が古くなったら拒否し、保存済みの判断の反映中断は既存復旧経路を使う。

正本経路は `bootstrapTeams.createInitialTeams` → 共通request-posting → engine.postingApplications/transactions → humanPostingの自球団判断 → useGameStateの共通commit → 既存世代保存 → cold load/受信箱。結果表示はpostingMarketResults・postingDepartures・incomeReceipts。新しい保存形式・価格policy・乱数・CSS境界は導入していない。

## 技術検証

- RED: 新しい判断adapterの未実装と、annualでも旧「承認で即移籍・入金」の操作が出ることを先行テストで確認。
- 新規core/hook/UIは27件成功。承認/拒否、他球団・偽通知、古い保存identity/revision/日付/session、二重操作、実保存失敗→再試行→cold load、公開済み判断の反映復旧、状態更新後の確認拒否を含む。
- `createInitialTeams`の実名簿で固定realPlayerIdの支配下を判断・保存し、育成申請の拒否を対で確認。所属・契約・財務が判断だけで変わらないことを検証。
- 市場三結果と0契約金minorの表示、legacy非変更、将来年度の履歴表示を検証。将来年度fixtureは純粋な履歴検証であり、年度Workerの成功ではない。
- 関連12ファイル166件成功。ホーム通知の追加2件を含む最終HubShell22件も成功（対象全体の固有テスト168件）。全件ローカルVitest/物理演算は重複実行せず、exact HEADの必須CIを提出PRで確認する。
- 独立レビューで実12球団/1,059選手の確認再描画にP2性能問題を検出。render毎の仮想取引全体計算を小さな確認snapshotの照合へ置換し、保存時の共通reducer/全体検証を維持した。同じreact-test-renderer probeで、確認open 744.2→2.6ms、即時失敗API後の再描画2148.4→1.7ms。これはNode上のUI部品計測であり、実機の保存時間や年度進行ベンチマークではない。
- 性能修正後、対象unit/hook8件と両ブラウザの判断/再試行/再開・stale確認8件が成功。独立担当の追加5probeでも、複数申請の選択切替、同じ申請IDのcold hydration後のsession拒否、UI callback二重操作、保存失敗後の切替/戻り、実12球団のUI計測を確認した。最終SHAの独立レビュー結果は提出PRを正本とする。

## 画面・操作の検証

既存の受信箱の実描画経路（HubContentRouter/MailboxTab）、useGameState/useOffseasonとIndexedDB/世代保存を通すfixture。テスト用harnessでannual worldを読み込み、一般公開ゲートは変更しない。単体テストやbuildを実画面検証の代わりにしない。

| 幅 | mainの確認画面 | 今回の確認画面 |
| --- | --- | --- |
| 360px | [変更前](./screenshots/360-before.png) | [変更後](./screenshots/360-after.png) |
| 390px | [変更前](./screenshots/390-before.png) | [変更後](./screenshots/390-after.png) |
| 1440px | [変更前](./screenshots/1440-before.png) | [変更後](./screenshots/1440-after.png) |

同じ2026年12月1日の申請worldで比較。mainでは旧通知しか表示できず、新しい申請の判断・説明へ未接続だった。今回の派生申請行で球団判断を行う。CSS・760/1024px境界は変更していない。

ブラウザは最終23件成功（2.5分）。新9ケース×Chromium/WebKitの18件で判断→保存失敗→同じ判断の再試行→再読込、実名簿での拒否、古い確認の無効化、保存済み三結果/0金額を確認した。旧方式はD01の5件でlegacy inline/chunked保存の承認/拒否と既存予算保全を確認。360/390/1440pxに横はみ出しなし。別の両ブラウザ操作probeで長い選手名、確認見出しへのfocus、Escapeでの取消/詳細へのfocus復帰、取消時の取引なしを確認した。

実行は `playwright test --config /tmp/gm01-posting-human/playwright.config.mjs save-generations.spec.js posting.spec.js --grep 'save generations: posting|D01' --workers=1 --retries=0`。一時configは既存configを継承し、Chromium実行パスとレポート出力先を環境に合わせたもの。追加E2Eは `e2e/human-posting.cases.js` を既存save-generationsから読み込み、CIの両ブラウザでも必須実行する。成功時もスクリーンショットをレポートへ添付し、CIの既存save-integrity artifactから確認できる。独立レビューとexact HEAD CIの最終結果は提出PRへ記録する。

ローカルはsystem Chromiumと/tmpに取得したPlaywright WebKitを利用。WebKitの不足OSライブラリは/tmpへ展開し、bundleの検索先へリンクした。ldconfigがこの配置を認識しないためローカル実行だけ`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`を指定するが、ブラウザ操作・保存のassertion/timeout/retry/CI条件は変更しない。最初の環境未整備による失敗を検証成功に数えない。初期hookの自動保存とcold readが重ならないよう、検証では保存queue完了を待つ。

## 機能完成条件と残工程

通常プレイからの自動申請・価格決定・本人受諾/辞退の生成、CPU判断、年度Workerは未接続。一般公開ゲートOFF、schemaVersion1/DB5を維持する。今回の操作はannual保存fixtureの画面統合であり、通常の新規ゲームでポスティング全体が完結する機能の完成ではない。

次は価格・本人受諾・希望発生policyを具体化/校正し、再現可能な市場producerへ接続する。その後CPU/年度Worker、A1全体の統合プレイ・長期経済・実iPhone/公開判断が必要。保存互換は今回の判断/表示範囲と既存CIの対象で検証し、旧セーブ全件や実年度Workerを成功扱いにしない。
