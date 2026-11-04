# Retirement-game income validation

## Source and scope

Base main `417b83d85d61e1cc93484d5e9f2080eee5384fe2` (#544 merged).
See [design](../../superpowers/specs/2026-11-04-gm01-retirement-income-design.md)
and [plan](../../superpowers/plans/2026-11-04-gm01-retirement-income.md).

`createInitialTeams` supplies actual player/contract inputs; the existing private
annual new-game adapter creates the ledger, and `reserve-retirement` creates the
source notice. `record-extraordinary-income` records an explicitly finalized
event amount. `reduceEconomyCommand` projects one candidate; the existing
commit/save service publishes it before reducer adoption. No legacy UI callback
or price is reused and no public activation is added.

## Executed evidence

- Baseline retirement, posting income and posting save: 3 files / 73 passed.
- New core RED: 16 failed / 14 passed on missing command. Implementation then
  exposed one mixed-kind failure: posting creation passed all income to its
  posting-only inspector. Restricting that local check to posting preserves the
  common dispatcher's unknown-kind and global identity checks.
- Save RED: finalized-retirement backfill passed `economyOverwriteIssue` (null)
  instead of conflict; other 6 save tests passed. The save prefix now requires
  a fresh event transaction and forbids a previously finalized reservation.
- GREEN: related 15 files / 529 passed, including 31 new core and 7 real-save
  tests. Covers zero/missing/invalid money, ID0, changed terms and second IDs,
  wrong/finalized reservation, explicit-input fields, unchanged payroll/guarantee
  rows and spending, unknown/orphan/duplicate evidence, current/archived calendar
  mismatch, missing current schedule, unavailable old archives, ordinary budget
  quotes, posting coexistence, finalization/year advance and later health.
- Real generated 12-club data: pending notice succeeds; deleting its notice and
  matching notice receipt produces a valid income-free input whose event command
  rejects. Successful income preserves the teams and survives JSON validation.
- Actual compressed inline and uncompressed external roots: commit, cold load,
  same-ID replay, failed publication keeps old roots/world, cold rebuild/retry,
  and published-before-adoption recovery. Coordinated amount/command rewrite,
  income rollback and finalized-history backfill reject without publication.
- Regression includes retirement, posting fee/departure, annual budget/ledger,
  command/economy adapters, renewal/acquisition decisions, save/migration and
  existing retirement career-generation commit paths.

## Remaining verification / limits

Final independent review, build and exact published HEAD CI are recorded in the
PR description; do not infer their success from the local targeted test count.
Event production, gameplay price/balance, human/CPU hooks and production annual
rollover are unconnected. The year-boundary test uses the existing named test
adapter. No long-play economic/performance calibration or real iPhone/new UI
verification. Old archives may be unavailable under existing retention rules;
available archives are checked and missing current data always rejects.
Public annual gate OFF, schemaVersion1/DB5 and legacy unchanged. Task7/A1 remains
unfinished. No merge, auto-merge or main push.
