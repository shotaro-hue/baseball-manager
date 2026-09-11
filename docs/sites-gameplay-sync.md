# Sites gameplay integration

## Sources and scope

- GitHub base: `344e1e2cc3a219d3765eebb16bdf50a6cf1bc6e6` (main).
- Imported gameplay source: Sites v14, `243f21a6cdff061fd66233e19403a27154a0ec71`.
- Only the GitHub repository is updated. The existing Sites publication is unchanged.
- Existing-save reconstruction/backfill is not a new requirement of this integration.

## Imported features

- Preserve complete source career histories before slimming React state; use source
  counts instead of estimated historical statistics; retain traded-year split rows.
- Include current-season statistics in career views and retain detailed summaries
  used by awards, records, and rookie eligibility.
- Await career persistence before advancing years or removing retiring players;
  guard duplicate transitions and show persistence failures.
- Share roster validation, DH/no-DH fielding assignments, emergency replacement,
  manual/full automation modes, and preview-and-apply roster planning across UI
  and simulation workers. Preserve players' primary positions.
- Use uniform pitcher batting profiles, track sacrifice hits separately from
  at-bats, maintain the pitcher batting slot through substitutions, and require
  a replacement pitcher after a pinch hitter occupies that slot.
- Store postseason statistics separately, resolve result-screen player names
  across rosters, and preserve numeric team ID zero in saves and analysis.
- Cache batted-ball aggregates with idempotent replacement and transactional
  raw-event/aggregate updates.

## GitHub-specific behavior retained

- Corrected wOBA denominator: `AB + BB + HBP + SF`.
- Pitcher RBI and OPS display, missing-stats guard, and all existing display
  fields; add AB and SH without removing existing fields.
- React 18 / Vite 5 dependencies and lockfile, GitHub Pages base path and workflows,
  existing tests, license, contributor documentation, and repository metadata.
- No Sites hosting manifest, worker wrapper, or Sites-specific dependencies.

## Integration regression coverage

The imported tests are adapted to Vitest under `tests/` and included in the
existing `npm test` command. The original test suites are retained.

The 100-game payload test now uses the actual `createInitialTeams` production
bootstrap rather than an unvalidated first-eight-batters fixture, and exercises
three deterministic seeds. Its payload-size and no-retained-trajectory assertions
are unchanged.

A focused regression also covers a valid emergency fielding assignment being
replaced by an empty lineup during a scheduled lineup-only refresh. Such refreshes
retain the emergency fallback without changing roster membership.

Validation commands:

```sh
npm ci
npm test -- --silent --maxWorkers=2 --minWorkers=1
npm run build
git diff --check
```

The career integration test compares all 445 real players and 2,009 history rows
to the bundled source data. The pitcher calibration test uses a fixed seed for
100,000 at-bats.
