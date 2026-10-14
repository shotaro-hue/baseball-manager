# UI-03D 成長レポート — 2026-10-14

final result: passed

対象は承認された成長レポートの情報整理と既存画面への実装。以下は今回のローカルChromium描画・操作だけの結果。下段のCalm Dugout記録は過去資料で、今回の合否とは別。

## 比較対象と条件

- source visual truth: [承認モック](./docs/validation/ui-03d/approved-mock.png)（853×1844px）。390×844pxへ密度を正規化。縦比の丸め差は約1px。
- implementation: [390px初期画面](./docs/validation/ui-03d/after-viewport-390.png)（390×844px、CSS390×844、deviceScaleFactor=1）。成長レポートの埋め込み、記録全員、個別内訳なし。
- [同一入力での全画面比較](./docs/validation/ui-03d/comparison-390.png)と[フィルター・選手行の拡大比較](./docs/validation/ui-03d/comparison-records-390.png)を開いて確認。別々の画像だけで一致判定しない。
- モックは架空の12記録・代表4行。本fixtureは同じ4選手・同じ変化量から4記録（急成長1／成長2／下降1）。人数差は想定どおり。コピーされたBMヘッダーは追加せず、実Appでは既存の編成シェルを使用。画面自体の外枠差をピクセル不一致として採点しない。
- [360px](./docs/validation/ui-03d/after-viewport-360.png)、[PC一覧](./docs/validation/ui-03d/after-viewport-1440.png)、[PC内訳](./docs/validation/ui-03d/detail-1440.png)も確認。旧画面と新画面は同じ4記録を用い、旧画面では全区分を展開。詳しい受け入れ条件・前後画像は[要件・検証記録](./docs/implementation/ui-03d.md)。

## 指摘と修正履歴

1. **P2・余白と密度**: [最初の比較](./docs/validation/ui-03d/qa-pass1-comparison-390.png)では要約帯約105px、標準行約96pxで、共通注記が初期表示外へ押し出された。要約帯の上下余白、行の余白・行高を画面内へ限定して調整。現在の要約帯約77px・標準行80px以上、名前16px・主変化14px・44px操作を維持。修正後の全画面／拡大比較で4行と共通注記を確認。
2. **P2・表の書体**: [初回PC内訳](./docs/validation/ui-03d/qa-pass1-detail-1440.png)で数値にブラウザ既定の書体差があった。`table`にも明示的に継承を指定。修正後のPC内訳と実ブラウザcomputed styleで表・tbody・tr・tdがNoto Sans JP／sans-serifになることを確認。
3. **P1・長い一覧の詳細入口**: 28行の最後から選ぶと、スマホで一覧が隠れる、PCで一覧の高さが制限される際に内訳先頭が画面外へ残った。PC修正前の戻るボタンy=-133.66pxを回帰テストで再現。全幅で内訳先頭へスクロールするよう修正し、7幅で戻るボタンが画面内に入ること、元の位置とフォーカス復帰を確認。独立再レビューでCritical／Important残件なし。

修正後の比較に追加のP0／P1／P2なし。

## 必須の比較面

| 面 | 結果 |
|---|---|
| 書体・階層 | DES-01のNoto Sans JP／sans-serif。見出し26px、名前16px太字、主変化14px、補助12px。長名は省略せず折り返す。数値は右寄せ・tabular-nums |
| 余白・配置 | スマホは一覧／選んだ1人を切り替え、PCは2列。最大2項目で行を短く保ち、80px以上・操作44px以上。モックの32px程度のフィルターは44pxへ広げた意図的な差 |
| 色・トークン | DES-01の#0E263B／#FFFFFF／#1766DA。モックの装飾的なグラデーションを使わず、共通トークンの平面色。下降は文字と区分で伝え、色だけに頼らない |
| 画像・アイコン | 写真・アバターなし。モックのBMロゴは本画面の追加対象外。詳細入口は既存PhosphorのCaretRight。新しい手描き画像・SVG・疑似ロゴなし |
| コピー・内容 | 一軍登録選手の記録、保存された変化量、最大2項目、下降は放出の推奨ではないことを短く記載。共通説明は一つの開閉領域へ。架空人数やモック注記を本番へ転記しない |

## 操作・異常状態・限界

- 既存UI-02C成長画面入口3件が初回CIで旧summaryラベルを探して失敗。入口だけを新しい選手一覧へ接続し、既存の詳細・年度・キーボード・レイアウト・背景スクロールの期待を維持。対象3件が成功し、独立レビューで弱体化なし。製品UIの追加変更なし。
- Unit43件、対象E2E10件成功。通常・長名・空・欠測・部分記録・選手なし・0・現在値なし・28行、7幅（360/390/760/761/1023/1024/1440）を検証。横溢れ、44px操作、初期行、絞り込み、個別表、Enter、戻る、選手詳細、Escapeとフォーカス、独立画面の処理拒否と再試行を確認。
- 実App360×800／390×844／1440×900で既存保存APIを通したfixture、埋め込み開閉、詳細、保存・再開を確認。teams・成長記録・二軍記録が閲覧前後で不変。pageerrorは0、既存progressionのconsole error／保存失敗監視も維持。
- モックにない欠測・エラー・PC内訳は、既存データの意味と確定した受け入れ条件を基準に検証。
- 共有プレビューはERR_BLOCKED_BY_CLIENTで開けず、共有プレビュー確認は未完了。本結果は上記ローカルChromiumの画像と操作の範囲に限る。iPhone実機、Safari/WebKit、スクリーンリーダー、200%拡大は未検証。

## 実装チェック

- [x] 同一入力の全画面・拡大比較と修正後再確認
- [x] 一覧・絞り込み・1人の内訳・復帰・既存詳細
- [x] 欠測と0、長名、レスポンシブ境界、保存・再開
- [x] 今回の要件と画像をPRへ添付。ゲーム計算・保存形式の変更なし

---

# Mobile Calm Dugout — schedule, results and league screens (pass 3)

> 履歴資料：旧UIの要件・提案・検証記録。現在の開発指示や現行ナビ、今回の検証結果として使わない。最新の方針は [UI/UX設計基準](./docs/DESIGN_SYSTEM.md) を参照する。Calm Dugoutは最終デザインとして採用しない。

final result: blocked

## Scope

Continues merged PR #392 (main 4941e0d), using the approved white/pale-blue/navy mobile direction.

- Schedule: monthly list by default, optional locally scrollable calendar, month/year selection, preserved current/archive result routing, home/away, interleague, venue notes and All-Star data.
- Current results and archived box scores: light surfaces, larger text, locally scrollable tables with fixed headers/identity columns. Existing deferred aggregation and return actions retained.
- Score dialogs: accessible names, Escape, focus containment/restoration and background scroll lock. Mobile box-score dialog fills the viewport.
- League leaders, standings and records: shared theme, wrapping, keyboard sorting and selected-state semantics.
- Correct zero-rate display/sorting (including ERA 0.00), perfect winning percentage, and schedule win percentage excluding draws. Keep schedule hook order stable across loading and loaded states; archived home-only box scores open the detailed view.

## Verification status

User explicitly chose to perform visual review themselves. No browser capture, browser interaction, console check or pixel comparison was performed this pass. Prior managed preview failed to resolve vite. Automated checks are not visual QA; mobile overflow, sticky positioning and fidelity remain unverified. Handoff is a draft for user review.

Approved direction references remain the four mobile mockups from pass 1, in /workspace/scratch/66c5379939ed/generated_images/. There is no separately approved exact calendar mock.

## Automated checks

Earlier full run: 297 tests passed. On resume, full run: 296 passed and one existing unseeded simulation sampling test failed (stuff=99 versus stuff=1 mean exit velocity). A targeted rerun of that simulation file and result/schedule UI files passed all 41 tests without code changes. This indicates nondeterminism, not a proven fix; the physics code/tests were not changed. Production build passed with the existing large-chunk warning. Five new tests cover monthly/current result routing, archived home-only box score routing, loading-to-ready hook order, zero ERA ranking/player navigation and perfect win percentage.

## Manual review

- At 360/390px: list/calendar/month/year switching, long names, venue notes, off days and All-Star data; horizontal scrolling stays inside calendar/table regions.
- Open current/archived results, close by button/Escape, Tab/Shift-Tab through dialogs, verify focus and scroll restoration.
- Individual result batting/pitching tabs and extra innings; return while details are processing.
- League filters, qualification checkbox, sorting, comparison and player/team detail entry points.
- All record tabs, empty histories and desktop regressions.

## Remaining work

Management screens (mail/news/contracts/trade/scouting/finance) still need visual unification. Some deeper player-profile sections retain legacy styles. Team details and comparison surfaces are addressed below. No Sites publication, merge or simulation changes.


## 球団詳細・比較（PR393後）

- 基準: GitHub main `4b8554c35b50316e9e1b1f07e83cba8e879a530a`。取得済みソースのtree `47450ad4d589ecba759c590f8ca21c1cfe66b8d8` がGitHubと一致。
- 対象: TeamDetailScreen、TeamComparisonPanel、PlayerComparisonDialog / Tray。Calm Dugout、44px以上の操作、表内スクロール、名前列固定、球団比較の初期折り畳み。
- 表示修正: 勝率1.000、投手ERA/WHIP・打者OPSの実測0、体調/モラル0、未記録値、算出条件を満たさない打球指標、投打混在時の指標名と単位。
- `npm test`: 全302件成功。`npm run build`: 成功（既存の大きいチャンク警告あり）。
- Playwright: 今回の375px幅・ダイアログ操作2ケースを追加。ブラウザ未導入から導入を試行、通常Chromiumは取得できたが `socket() failed: Operation not permitted` で起動不可。E2Eは未検証。目視確認も未実施（ユーザー担当）。
- 目視確認項目: 球団詳細→投手/野手→名前→復帰、球団比較の開閉、日程/月/結果ダイアログ、移籍履歴、トレード入口、選手比較の2名選択/解除、下部ナビとの重なり、375px幅と長い名前。
- 次のまとまり: 契約/トレード/FA/スカウト、メール/ニュース/財務、選手詳細の深い階層。旧TeamModalは現在の参照元がないため今回は未変更。
- エンジン、PR389/390の継投仕様、Sitesには変更なし。physics-hr-report.jsonとnode_modulesはコミット対象外。
