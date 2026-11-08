# CPU posting future-budget fix

Goal: PR #556のCPU自動承認による予算停止を解消する。ユーザーのP2修正指示とAGENTS.mdを実装・既存ブランチへの追加commitの承認とする。

Design: 市場前の仮退団（retain、譲渡金ゼロ）を安定順で累積し、共通の欠員留保投影と全年度支出審査を再利用する。最終市場成立後の審査も維持する。新規CPU判断のみv2へ進め、v1の保存済み入力・判断・子receiptは従来規則で検証する。

Alternatives: 現年度残額だけの判定は将来保証を見落とす。市場を先行実行する方法は抽選先読みとなる。共通審査を用いた市場に依存しない仮退団が今回の制約に適合する。

Scope: annualPostingPhase / cpuPosting / annualTransactionsと直接対応するテスト・検証記録。Worker、価格モデル、年度切替、save schemaの変更なし。新規PR/main push/merge/automerge/履歴書換なし。

- [x] 1. 最新HEAD・差分・CI・コメント、正本/保存経路を確認。基準回帰を実行し、v1確定receiptを修正前コードから固定する。
- [x] 2. 将来余力ゼロ/余力あり/累積/既存予約・契約/人の権限/破損の実nativeテストを追加しREDを確認する。既存の成立後審査拒否テストは保持する。
- [x] 3. 共通審査の条件を変えずに予算投影・審査関数を分離し、CPU v2に接続する。v1検証を固定し、GREENを確認する。
- [ ] 4. 保存失敗・再実行・cold load・v1互換、Chromium/WebKit E2Eとbuildを検証する。契約/予算/保存の関連回帰を実行する。
- [ ] 5. 差分/SHA/実名簿と実入口を渡して独立レビュー。指摘を再現・修正し、既存PRへpush、最新HEADの全必須CIを確認。実iPhoneは未実施と明記し、再レビュー可能な状態で停止する。

Review focus: 不正台帳をCPU拒否にしない。先の承認は市場不成立でも留保する。過去の承認を新規方針で覆さない。既存赤字の不悪化と新規債務の審査を両方維持する。履歴とsession/CASの防御を変更しない。

Evidence: 開始HEAD `bdc35ad89dfc9a0542432f8b812cdebe09aebe43`、remote main `114181dc`、既存CI #709成功。GitHubコメント/スレッドなし。基準23件成功。予算ゼロの工程停止と累積過剰承認の2件RED→GREEN。追加を含むnative29件成功、関連回帰34ファイル674件成功（後から既承認累積の1件を追加しnative再実行）、build成功。最終CI/E2E/独立レビューは検証文書・PRへ記録する。
