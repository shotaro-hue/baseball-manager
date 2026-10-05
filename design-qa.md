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

Comparison dialogs, team details and management screens (mail/news/contracts/trade/scouting/finance) still need visual unification. Some deeper player-profile sections retain legacy styles. No Sites publication, merge, simulation changes or fabricated data.
