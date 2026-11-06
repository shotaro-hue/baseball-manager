# PR #549: initial FA history normalization

Baseline: `e63b622cd11072f4188bf78c340db9a3efbd6ebd`. Main remains `377987a8fa9ed4a26ca20420d31108bf198e6583` (#548 merged). Initial CI #689 was successful; the PR had no comments/review threads. Only the existing branch is updated, without merging or rewriting history.

## Reproduction and cause

For a 25-year-old legacy player with entryAge 20, unknown starting registration days, recorded counter/serviceYears zero and five 125-game seasons (2021–2025), `history: []` prevented careerLog lookup. The model fell back to 500 days rather than 725. A one-year history hid the other four seasons and yielded only 145 days.

The old expression selected one complete array with `??`. Related callers also discarded input: the exercise-cycle calculation filtered history/recent before looking at full career data; the migration's preliminary year/team Map collapsed anonymous split rows. Older fixed-key career archives were readable through the career UI but were not passed to first-time eligibility migration.

## Normalization policy

- Registration input, raw `history`, full `careerLog`, recent tail are separate sources in that priority order. Missing, empty or unusable containers/years do not hide usable lower-priority data.
- Flat `G` and nested `stats.G` take precedence over the existing model's PA/4 (batter) or wins (pitcher) proxies. Explicit zero is retained. Nonfinite/negative/fractional observed G and invalid/current/future years are ignored. Flat and nested proxy fields are both supported.
- Resolve known current-club abbreviations, full names, Unicode width and whitespace. A historical row's name wins over its teamId: the real-player converter assigns today's gameId even to prior clubs. Unrecognized names remain literal; old franchise identities are not guessed.
- Within one source, the last valid row for one year/club is its correction, following existing career archive/recent-row semantics. Across sources, keep the higher-priority observation and fill identifiable missing club stints. Sum clubs first, then convert/cap once per season.
- Anonymous rows may be legacy split stints. Keep distinct complete observations, including equal G with different batting/pitching stats; remove identical copies. If a season view lacks club identity, select its higher-priority source rather than add two ambiguous views. This deliberately avoids inventing a missing club or counting an annual total twice. Published total labels are excluded, consistent with the roster importer.
- Normalize before selecting post-exercise years. Pass archive input to the same estimator without a destructive preliminary Map merge.
- For v3–v5 saves, reuse the existing readonly fixed-archive reader for uninitialized player IDs only. Optional archive failure retains the prior inline-load fallback. v6 continues to use its verified selected-generation data, without new reads, latest-master injection or full live-state history inflation.
- Existing `eligibility` returns unchanged and is never re-estimated. No rule/schema/DB/gate change, RNG addition, contract/budget/identity change or certificate/receipt rewrite.

## RED → GREEN

The final two test files were run against an isolated copy of unchanged baseline e63b622c: **18 failures / 15 successes**. Empty/partial history, duplicates, same-source corrections, aliases, proxies, exercise-cycle input, anonymous migration stints, fixed old archives and actual inline reload cases failed before the fix. The fixed implementation passes all **33** cases in those two files. No source was temporarily changed in the active review checkout.

Coverage includes all requested history forms, split clubs, duplicates across flat/nested arrays, same G with distinct anonymous observations, invalid observations, no-history fallback, existing eligibility, optional archive unavailability and two save → cold-load cycles with invariant balances/identity/budget. The existing v6 selected archive, frozen pre-evidenceVersion v2 certificate, v1 posting snapshots, immutable receipt and failed-save/recovery suites remain intact.

Independent source/caller review found no remaining confirmed P0/P1/P2 or minor issue. The reviewer independently reran the 33 history/save tests and compared the complete before/after audit JSON.

## Real-roster and RNG audit

Using the unmodified baseline factory and then the fixed factory with seed 42 and Date.now fixed at 1791508062000, compare all generated teams and all per-player eligibility/progress (not only totals). **Every value is identical.**

- Real players: 1,059; domestic-qualified including overseas holders: 79; overseas-qualified: 51.
- RNG calls: 18,400 in both runs.
- Complete world SHA-256: `8594364a6628db06c9757bcdd47da4d33c21db025dd0abe73bf9ca72cc913811`.
- Eligibility/progress SHA-256: `fd3b6b1e66e068b0d13d2ef7151a1b165375ec02bb582d17174cb8aef469e136`.

The baseline values are pinned in the real-factory integration test. No existing expected value was changed. [Audit summary](./audit.json).

Build succeeds with the existing mixed-import/large-chunk warnings. Final exact-HEAD CI results are recorded in PR #549 when available. No deleted tests, new skips, timeout extensions, reduced assertions, changed browser selection or new retry setting.

## Browser-fixture correction

The first CI for core fix d4952954 passed all 4,317 unit/integration tests, including the complete real-roster audit, but the six dedicated eligibility-display browser cases failed. That display-only preset intended one synthetic season (116 modeled days), while copying other years in the source player's careerLog/recentCareerLog. The corrected estimator legitimately included those years: the first batter had 229 days / 1,076 overseas days remaining instead of the preset's intended 116 / 1,189.

Define all three history views for that synthetic preset by clearing its inherited career/tail fields. Actual source rosters and normal browser fixtures are untouched. Keep the original exact 1,189-day text, visibility, acquired-right, development, completed-season, layout and focus assertions. The unchanged browser assertions failed in all six CI cases and all three local Chromium cases before this fixture correction; afterwards Chromium 3/3 and WebKit 3/3 pass at 360/390/1440px with workers=1/retries=0 and the existing timeouts. This is controlled input correction, not a changed expectation or a return to ignoring available history. The final HEAD's complete CI remains required.
