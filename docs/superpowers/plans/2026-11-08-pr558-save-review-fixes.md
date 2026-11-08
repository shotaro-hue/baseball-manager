# PR #558 保存整合性の修正計画

**目的:** 一括シムの最終公式戦と日付付きpostseasonを同じ保存候補へ確定し、保存・読込・年度終了で結果の検証基準を揃える。
**対象:** `useSeasonFlow.js`、postseasonの検証、既存保存入口と関連テスト。
**非対象:** schema変更、旧未記録履歴への日付補完、UI・Worker・年度機能の拡張、CI設定変更、新規PR・mainへのpush・マージ。
**根拠:** ユーザーのPR #558レビュー修正指示と既存postseason calendar設計。

## 確認した起点

- PR HEAD `c61a65ff0b32f1051b7d98c47aa7310db31e1c0d`、main `bb77dad693769c0eef454eb4422326b0d0545635`。CI #723の全14ジョブ成功、レビューコメント0件。
- Workerはsnapshotを展開してnextStateを作るため旧offseasonPlan（通常null）を返す。handleSaveはpayloadを最後に展開する。
- 保存は既存のqueue、request/session token、dirty tracker、世代生成・公開・backup復旧を使用する。
- 保存入口は日付だけを検査し、終了selectorは途中seriesでreturnするため、後続seriesの矛盾も未検査になる。
- 修正前の関連4ファイル25テスト成功。

## 作業

- [x] P1: 実hook・実保存で142→143戦の即時保存を再現するテストを追加し、REDを確認。
- [x] P1: React更新を待たず、新しいplanを最終戦の採用・保存候補へ含める。既存queue・token・保存optionを維持しGREENを確認。
- [x] P2: 正常途中/完了/旧形式、得点・勝敗・勝数・終了・引分上限・勝ち上がり・参加球団・優勝・日付の正常/拒否例を追加し、REDを確認。
- [x] P2: playoff側の結果再生を共通検証へ抽出し、保存・読込・hydration・終了selectorで共用。未完了を正常に扱い、旧形式は現状維持。
- [x] 実保存で不正候補拒否・唯一root保持・backup復旧、保存競合回帰を確認。
- [x] Chromium/WebKitで一括最終戦の保存直後reloadと既存の最終戦→翌年E2Eを実行。
- [x] 別コンテキストの独立レビューと必要な指摘修正。

提出工程: 既存PRのブランチだけを更新し、最新HEADの必須CI全体を確認する。発行後のHEAD/CIの正本はPR本文とA〜F形式の最終報告とし、マージせずレビュー待ちで停止する。

## 検証記録

- P1: Workerの旧planはnull、liveには日付付きplanがあるのに保存はnullとなるREDを実Worker core→hook→実保存で確認。修正後は冷読込・hydrationまで成功。
- P2: 保存・読込の破損拒否とbackup復旧で43件のREDを確認。共通検証後はcalendar/save/統合の72件成功。関連全体は19ファイル284件成功。
- 本番ビルド成功（既存の500kB超チャンク警告あり）。Chromium/WebKitの対象8件成功、timeout/retry/既存期待値変更なし。
- 一括最終戦のE2Eへ既存142試合の自球団/全球団履歴の保持検査を追加し、該当2件も両ブラウザで成功。
- `npm test`: 4709件成功、7件失敗、既存2件skip。失敗はqa-d1のgit起動、ZIPのPython起動、source-instrumentationのlocalhost待受のEPERMに限定。制限外で同じ3ファイルを再実行して13件すべて成功。最終HEADの全件の正本はGitHub CIとする。生成されたphysics reportは差分から除外。
- ローカルE2E初回は実行中のVite HMRで保存moduleが分岐。固定後の次回は開発依存キャッシュの504 Outdated Optimize DepでDraftの遅延importが失敗した。依存キャッシュを再生成し、対象8件の成功を確認。本番コードによる回避は追加していない。
- WebKitの不足ライブラリは公式Debianパッケージをユーザー所有のブラウザへ展開。ldconfigに登録しないためローカルだけPLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1を使用し、実ブラウザの起動・描画・全対象操作を検証した。CI設定は変更しない。
- 独立レビュー: 確定P1/P2指摘なし。正常途中14状態・次series未生成・他方リーグのみ進行・live球団変更を受理、入力無変異を確認。完了履歴1000回は約0.18ms/回。
- 残存: 実機iPhone Safari未実施。既存の同率順位判定は自球団day別mapをteamId別mapとして参照する配線のため記録不足fallbackになり得るが、今回導入した不具合ではなく、この修正では変更しない。annual全体の完成範囲は元設計の非対象を維持する。

## レビュー重点

- 途中の最初のseriesが未完了でも、他方リーグを含む全保存seriesを検査する。
- frozen参加球団の成績から決まるadvantageを使い、live球団の可変編成は照合しない。
- 正常な未完了と未生成seriesを受け入れ、結果や日付を黙って修正しない。
- 保存失敗・遅い保存完了・別sessionでdirty状態を誤って消さない。
- backupと旧セーブの読込を新しい検証が破壊しない。
