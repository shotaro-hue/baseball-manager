# UI-01C — 1試合結果のDES-01移行

基準main: `c03c58b10ca758bbc29dae313872c7c92b42cfd1`（PR #453マージ後、2026-10-12に再取得）。
仕様: `docs/DESIGN_SYSTEM.md`、承認済み `des01_result_360/390/1440.png`。対象は既存1試合の結果画面で、基本構成の移行を依頼・承認済み。新画面、データモデル、ルートは作らない。

## 目的・実装範囲

試合後にスコア、勝敗投手、個人成績を読み、ホームや編成の見直しへ戻れるようにする。
`AppScreenRouter`の既存`result`分岐が描画する`ResultScreen`を置換。自軍／相手の打者・投手、イニング、HR、W/L/Sと元の戻るボタンを維持する。
`_source`に応じたホーム・日程・バッチ結果への戻り先はRouterの既存処理に委譲し、名前も保持する。新たな「次の試合」操作は追加しない。

- ネイビーの勝敗要約、白い表、青い切替・戻る操作。写真・装飾アバター・影・グラデーションなし。
- 1024px未満は縦配置、1024px以上はイニング・勝敗投手・HRとボックススコアを左右配置。
- 既存`Button`、`StateLabel`、`DataTableFrame`とDES-01トークンを再利用。新CSSは`.result-screen`内だけ。`calm-results.css`の旧2指定は移行画面を除外し、他画面の適用を保つ。
- 数値右揃え、tabular-nums、44pxの行／操作、球団・選手名列の固定、局所横スクロール、名前の折返し。今季AVGとこの試合の記録を明示する。
- ビジターをイニング表の先頭にし、Xは勝利したホーム側の未実施最終回だけに表示。スコアやイニングの計算・保存は変更しない。
- 個人成績ログがない試合のHを0へ補わず「—」。欠落結果を完了した引き分けとして表示しない。集計失敗後に読み込み表示・Hの「…」を残さず、戻る操作を保持。

## 維持するものと承認画像との差

FIX-S4の`computeBoxScore`接続、既存の詳細集計・公式成績・Worker・エンジン・保存・ナビは維持する。
AVG/IP等の既存フォーマットと列（PC/K/BB/ERを含む）を削らない。選手名のクリック操作は元画面にないため新設しない。
承認PNGのブランドバー・保存済みラベルは、結果ルートに対応する実保存確認情報がないため追加しない。球団・第N戦・ホーム／ビジターを実データから表示する。年・記録種別は推測しない。
既存E2E・利用者が識別するVICTORY/DEFEAT/DRAWを補足文字として保持し、日本語の勝利／敗北／引き分けを要約に追加した。
ゲームログを持つ相手球団の表も元画面通り表示する。モックの抜粋行数や架空選手・成績は本番へ入れない。

まとめ進行結果、試合詳細モーダル、戦術試合中の画面、UI-02/03は全面刷新しない。ただし、バッチ・日程から同じResultScreenを開く経路はこのデザインを共有する。

## 検証

- 新規Vitest: 結果見出し・勝敗3種・欠落・未記録H・先攻順／ホームXの7件。見出し／状態4件のRED、未記録HのREDを確認して修正。
- 関連Vitest: `npx vitest run src/components/resultDesign.test.js src/components/resultScreen.test.js src/components/resultPitcherDecisions.test.js src/components/BoxScoreModal.test.js src/components/batchResult.test.js src/hooks/postGameConsistency.test.js` — 52件成功。
- 状態・操作: `npm run test:e2e -- match-history.spec.js --grep 'UI-01C result design' --workers=1 --retries=0` — 7件成功、8状態×7幅の56組。集計失敗後の読み込み表示とHの「…」はブラウザREDを確認して修正した。FIX-S4固定ログの関連6件も成功し、W/L/Sの表示一致を維持。

- UI7幅: 360/390/760/761/1023/1024/1440px。勝利・敗北・引き分け・長い名前・未記録・結果欠落・処理中・集計失敗、実ボタンのクリックとEnter、固定列、44px操作、局所スクロール、ページ横はみ出しを確認。
- 実App: `npm run test:e2e -- match-history.spec.js --grep 'UI-01C real|FIX-S4 auto' --workers=1 --retries=0` — 5件成功。360/390/1440pxで実オートシム→結果→投手表→ホーム→保存→ロードを確認。W/L/Sと保存履歴、両球団の成績一致、結果CSS読込前後のホームヘッダーcomputed style一致。FIX-S4のホーム／アウェイ2件で次試合への再開も確認。
- `npm run build`成功（既存の500kB超チャンク警告）。全Vitest・中核E2Eは同一headのGitHub CI全6ジョブで確認する。既存テスト・assertionは削除／skip／弱体化しない。
- 独立コードレビューの重大指摘なし。ロードマップ表の書式指摘を修正。

通常CIの既存`match-history.spec.js`へhelperを一重登録し、CI設定・他のspecの実行範囲・リトライ条件は変更しない。通常CIが既存のバッチ→個別結果→戻る、戦術4組、保存・再開を保護する。

## 同じ固定データの前後

画像は投手タブを選択した同じ固定データの比較。表示fixtureは描画検証専用。試合成功・実保存を示すものではなく、実App検証と区別する。

| 幅 | 前 | 後 |
|---|---|---|
| 360px | [画像](../validation/ui01c/before-360.png) | [画像](../validation/ui01c/after-360.png) |
| 390px | [画像](../validation/ui01c/before-390.png) | [画像](../validation/ui01c/after-390.png) |
| 1440px | [画像](../validation/ui01c/before-1440.png) | [画像](../validation/ui01c/after-1440.png) |

## 未検証・残課題

iPhone実機、結果画面専用のSafari/WebKit、読み上げ、200%拡大、全画面の全状態は未検証。CIをこれらの合格として扱わない。条件付きベンチマーク、CI外の手動フルE2Eは今回再実行しない。UI-01全体やQA-01の完了認定はしない。
