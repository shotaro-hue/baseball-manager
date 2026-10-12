# FIX-S4 — 結果画面のW/L/S整合性

基準main: `b2d353d2c8af61e4114fefdd3765bdcb85f7e501`（PR #452マージ後、2026-10-12に再取得）。

## 再現と原因

相手の打席を先発が抑え、自軍が無得点、その後救援投手が決勝のソロ本塁打を被弾する固定ログで確認した。
既存の`computeBoxScore`と`applyGameStatsFromLog`は救援へLを記録する一方、`ResultScreen`は得点経過を参照せず先発へLを付けていた。相手救援の失点、自軍が一度リードを回復した試合でもホーム／アウェイともに再現した。

## 修正範囲

`ResultScreen.jsx`のW/L/SのID取得を`computeBoxScore`の投手行へ接続し、勝敗投手カードと投手成績表に使用する。自チーム視点とホーム／アウェイのスコア・選手配列を対応付ける。
`isTop`を持たない旧ログだけ、既存`scorer`から表裏を補うコピーを表示用に作る。元のログや保存データを書き換えない。イニング表は既存の描画を維持し、この呼び出しには空のイニング配列を渡す。

エンジンの勝敗・セーブ条件、公式成績更新、シミュレーション、保存形式、ナビ、CSS、DES-01方針は変更しない。これは既存の記録判定へ表示を合わせる修正で、現実の野球ルール全体の再定義ではない。

## 検証

- 修正前の回帰Vitest: 15件中8件が期待した敗戦投手の不一致で失敗、7件成功。
- 関連Vitest: **43件成功、0件失敗**（新規15件を含む）。`npx vitest run src/components/resultPitcherDecisions.test.js src/components/resultScreen.test.js src/components/BoxScoreModal.test.js src/hooks/postGameConsistency.test.js`。
- 固定ログブラウザ: **6件成功**（各ケース内で6種のログを照合、計36組）。`npm run test:e2e -- match-history.spec.js --grep FIX-S4 --workers=1 --retries=0`。救援敗戦、相手救援敗戦、リード回復後の敗戦、5回を投げた先発勝利＋セーブ、短い先発後の救援勝利＋セーブ、引き分けを360/390/1440px×ホーム／アウェイで照合。画面の横溢れ、投手成績ボタン、試合詳細モーダルの開閉も確認。
- 実App: **6件成功**（新規オートシム2件＋既存戦術4件）。`npm run test:e2e -- match-history.spec.js --grep 'FIX-S4 auto|confirmed tactical' --workers=1 --retries=0`。オートシム2件で結果カードと保存済み`allTeamResultsMap`のW/L/S・両球団の公式成績増分を照合し、保存→ロード→次試合進行を確認。既存の戦術4件（DH有無×ホーム／アウェイ）へ結果カードと保存履歴の照合を追加。既存assertionは維持。
- `npm run build`: **成功**（既存の500kB超チャンク警告あり）。全Vitest・中核E2Eは同一headのGitHub CI全6ジョブで確認する。

固定ログfixtureは実コンポーネントを描画する表示検証専用で、実試合・永続化の成功とは区別する。実保存検証は既存のセーブAPI・Worker・App経路を使用する。

## 同じ固定ログの画面比較

敗戦投手が先発から救援へ変わり、スコア・配置・投手の他成績は維持される。

| 幅 | 修正前 | 修正後 |
|---|---|---|
| 360px | [画像](../validation/fix-s4/before-360.png) | [画像](../validation/fix-s4/after-360.png) |
| 390px | [画像](../validation/fix-s4/before-390.png) | [画像](../validation/fix-s4/after-390.png) |
| 1440px | [画像](../validation/fix-s4/before-1440.png) | [画像](../validation/fix-s4/after-1440.png) |

## 対象外・残課題

他の画面のDES-01移行（UI-01C以降）、保存方式変更、エンジンのW/L/Sルール変更は対象外。条件付き経済ベンチマークと手動フルE2EのCI対象外specは今回の変更で再実行しない。
