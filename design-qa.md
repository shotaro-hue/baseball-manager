# Mobile Calm Dugout — schedule, results and league screens (pass 3)

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
