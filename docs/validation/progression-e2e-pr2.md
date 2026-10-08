# Progression E2E and CI (PR2)

Stacked on unmerged PR #413, branch `fix/regular-season-progress`, starting from
main `7dfce42eb4afd87fdfcb8cb7d5cdda5da323231b` (#412).

## Browser coverage

| Scenario | Chromium | Mobile WebKit (390 × 844) |
| --- | --- | --- |
| E1: new Yomiuri game → real five-game Worker → result → hub → save → reload/load → one more real game | Yes | Yes, bottom navigation and mobile home controls |
| E2: fixed coherent round-143 save → final regular game → one postseason game → persisted reload → actual offseason/draft/camp → new year and first game | Yes | Outside requested mobile scope |
| E2: 143 completed games including a fixed draw; correct postseason plan; regular buttons cannot start games | Yes | Outside requested mobile scope |
| E3: empty user lineup rejected without advancing; guidance → roster UI automatic lineup repair → real game; error cleared | Yes | Outside requested mobile scope |

E1 compares year, team ID, next round, wins/losses/draws, remaining games and a
representative player's ID/name/full season stats. After loading, saving again
verifies the restored in-memory state, not merely the unchanged old storage.
E2 checks the same active series and saved postseason state, new-year reset,
previous-year standings and the representative player's compact career stats.

Each Playwright test gets a fresh browser context and storage. The fixed gzip
JSON fixture is documented in `e2e/fixtures/README.md`; historical summaries and
standings derive from the same normal deterministic schedule. Fixtures use the
real save API and title load route. Workers, game results, storage and transitions
are not replaced. No production state-injection API is added.

Save assertions wait for the actual queue to drain, then load and inspect saved
content. Polling full multi-megabyte loads repeatedly exhausted an assertion's
wait despite successful writes; it was replaced by queue-state waiting and a
single strict content comparison. This does not extend polling deadlines or
relax expected state. Unhandled page exceptions and progression/save error logs
fail tests. Smoke runs override retries to zero.

## Baseline and existing assets

Baseline `batch.spec.js` + `title.spec.js`: four title tests passed, two batch
tests failed because current controls are collapsed and the return label changed.
Existing batch/game/hub/tactical assets now open or scope current UI controls;
English victory/defeat/draw assertions and existing outcomes are retained.
Current score switches expose role `tab`, roster tables are in collapsed
settings, and the visible dashboard date includes the year. Selectors now scope
those actual controls. Vite prebundled React/ReactDOM use default exports; the
component mounts now read those exports. Component-mount imports now include Vite's `/baseball-manager/` base path.
No E2E test is deleted or skipped. The 100-game test remains available separately
and is not included in the CI smoke command.

One existing unit assertion compared independent random 600-sample exit-velocity
averages; an intermediate full run reversed the small pitcher effect while its
code was unchanged. PR2 compares matched samples at three fixed seeds and keeps
the same strict inequality. Simulation production formulas are unchanged.

## Commands and CI

- `npm test`, `npm run build`, `npm run validate:physics-hr` retain their existing CI job.
- `npm run test:e2e:smoke -- --workers=1` executes the four desktop cases and mobile E1 with no retries.
- `npx playwright test --project=chromium --grep-invert 'E1 new game|E2 final|E2 draw-inclusive|E3 invalid' --retries=0 --workers=1` audits existing tests including the long batch.

CI installs Chromium/WebKit with system dependencies and uses Playwright's real
Vite webServer. Main PRs/main pushes run the smoke job; the explicit PR1 base
branch trigger also validates this stacked PR before merge. Failures fail the
job. HTML report, trace, screenshots and test-results are uploaded with
`if: always()` and 14-day retention. Job timeout is ten minutes; per-scenario
smoke timeout is 60 seconds for the measured real simulation/storage/season
workflow (global existing-test timeout remains 30 seconds). Actual local totals
and CI job times are recorded in the PR description.

## Limits and separate observations

Mobile WebKit emulation is not physical iPhone Safari verification. Save schema,
version, history retention, dependencies and branch protection are unchanged.
The existing notification timer (`useGameState.notify`) can clear a newer toast
when an older timer fires; queue/content assertions avoid relying on toast
persistence. Notification lifecycle cleanup is recorded as separate follow-up,
not included in the production changes here.

## Final local results

| Command | Result | Time |
| --- | --- | --- |
| `npm test` | 567 passed, 2 pre-existing skipped | 33.27s |
| `npm run build` | passed | 14.30s |
| `npm run validate:physics-hr` | passed | 7.73s |
| smoke run 1, retries 0 | all 5 passed | 2.5m |
| smoke run 2, retries 0 | all 5 passed | 2.3m |
| smoke run 3, retries 0 | all 5 passed | 2.6m |
| existing Chromium suite including 100-game batch, retries 0 | all 18 passed | 1.4m |

The three smoke runs are consecutive with identical final application/smoke
source. Later changes only corrected other legacy test selectors/mounts and
added this report. No new skips, relaxed game outcomes, retry increases or
production changes were used to obtain these results. Additional selected
legacy tests are compared against the untouched main worktree using the same
browser/dependencies; only Vite cache/report paths are isolated. CI final run
links and durations are recorded in the PR description after completion.
