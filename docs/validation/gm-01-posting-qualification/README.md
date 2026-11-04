# Posting qualification evidence validation

Base main `3f6a665dcf163b119ab0a3aa9fe04a34a064995f` (#546 merged).
[Design](../../superpowers/specs/2026-11-04-gm01-posting-qualification-design.md) /
[plan](../../superpowers/plans/2026-11-04-gm01-posting-qualification.md).

## Data audit and scope

The release master contains 1059 birthdays, all with matching NPB player-profile
references; 706 rows have some performance history. No row owns an explicit
MLB-recognized professional-season set or completeness assertion. Runtime
bootstrap retains realPlayerId but does not retain birthDate. Therefore a single
indexed read-only lookup snapshots birth facts from the existing master owner;
it does not infer a birthday from gameAge or turn performance years into service.

MLB [posting](https://www.mlb.com/glossary/transactions/japanese-posting-system)
and [bonus-pool](https://www.mlb.com/glossary/transactions/international-amateur-free-agency-bonus-pool-money)
definitions were checked 2026-11-04 for the 25/six exemption conditions. This
assessor only checks those conditions. Full signing classification/registration,
contract forms, player choice, pricing and pool capacity are not implemented.
The pure evidence normalizer validates shape and temporal consistency, not the
truth of an arbitrary source ID or a caller-supplied completeness claim.

## Executed evidence

- Baseline: application/income/master schema, 3 files / 70 passed.
- RED: 48 new tests failed on missing implementation. GREEN: 36 assessor and
  12 source tests passed. Exact birthdays/leap dates, 5/6 years, complete zero,
  partial/unknown/stale facts, duplicate/future/pre-birth records, unknown fields,
  invalid dates/provenance, source/identity mismatch, stable JSON and detached
  snapshots are covered.
- Real `createInitialTeams()` produces both inputs without altering the roster:
  npb:21625150 birthday 2003-03-25 -> age 23/restricted on 2026-12-01;
  npb:21325134 birthday 1994-12-19 -> age 31/unknown, not exempt, because pro
  evidence is unrecorded. No real six-season certificate was fabricated.
- Changing name, gameAge, serviceYears or quota flags does not change the lookup.
  All 1059 master rows return their documented birthday and null pro evidence.
  Legacy/fictional/unmatched real IDs retain unknowns even with a large gameAge.
- Source and returned-fact mutation after lookup creation do not change later
  results. Complete explicit zero differs from missing evidence; a stale complete
  list below six becomes unknown, while six documented seasons remain sufficient.
- Related regression: 12 files / 183 passed, including master schema/data,
  real/generated bootstrap (100 seeds and an actual large save), civil dates,
  application/income and real commit/reload tests. Build succeeded with existing
  mixed-import and large-chunk warnings.

Final regression/build, independent review, submitted SHA/tree and exact-HEAD CI
results are recorded in the PR description. Do not infer CI from scoped tests.

## Remaining ownership

The qualification API is intentionally not connected to existing application,
end-contract, complete-posting or save handlers. Pending/approved market progress
remains blocked. A future market producer must own recognized-season data and
completeness, generated-year facts, birth/draft classification, exact signing
date, rule version, and save/epoch/player-bound evidence snapshots before using
this assessor. Existing receipt persistence is unchanged in this PR.

No new live player/engine fields, master edits, data publication, market price,
acceptance probability, random draw or financial policy. Public gate OFF,
schemaVersion1/DB5, legacy unchanged. No production market/rollover/Worker,
new UI, long-play or real-iPhone verification. Task7/A1 remains unfinished.
