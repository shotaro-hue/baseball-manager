# A1-2c retirement-game income boundary

Base: main `417b83d85d61e1cc93484d5e9f2080eee5384fe2`, after merged #544.
This is the remaining Task7 extraordinary-income boundary, under the existing
approved A1 design: retirement-game income is recorded separately for later
budget review, without increasing current spending permission.

## Scope and implementation decisions

Use `record-extraordinary-income {id, kind:'retirement-game', reservationId,
amountManYen}` inside the existing economy command envelope. The amount is an
explicit, nonnegative safe integer in man-yen, including a real zero. It is
recorded final event income, not a new price/balance policy or evidence that a
regular match was simulated. Do not derive it from the legacy UI's 50000 bonus
or its inconsistent yen label. Actual event production/price approval, UI, CPU,
Worker, and production rollover remain later work.

Only a pending, same-season retirement reservation can source a new event,
during the season and on/after its notice. Source team/player/contract come
from the verified reservation; date and round come from the verified world
clock/schedule projection. The event does not finalize retirement or change
placement, player abilities, payroll, guarantee liability, ordinary clubFinance,
budgetPolicies, authorizations, or current team budget.

Alternatives considered by the implementer: changing the legacy hook would
publish before the annual UI/lifecycle is ready; assigning a posting-style
supplement would change the approved budget policy. Use the existing pure
quote/reduce/commit boundary and existing incomeReceipts owner instead.

## Evidence and persistence

- Store one versioned retirement-game income receipt and its transaction receipt
  atomically. Bind save/epoch, retirement reservation, season, club, player,
  original contract, explicit amount, notified event date and gameDay.
- Source uniqueness is employment/event based, not caller ID. Same-ID replay is
  unchanged, even after finalization/year advance; changed terms and another-ID
  duplicate reject. No new event may be appended to an already finalized source.
- Load validates both receipt directions and the reservation reference. Unknown
  income kinds, missing amount, orphan/repeated evidence and forged allocation
  fields reject. Keep the existing posting validator and exact-year supplements.
- Current and available archived schedules are authoritative for event round/date
  validation. Missing current schedule entries reject; unavailable old archives
  follow the existing historical calendar compatibility rule. Never duplicate
  schedules, gameDay or income arrays in engine persistence.
- Extend the existing append-only income/save history guard. A new event needs
  a new transaction in the same extension, and cannot be backfilled onto a
  previously published finalization. Failed publication retains original world
  and roots; published-before-adoption uses the existing recovery path.
- Retain income across finalization and years for Task10's later budget input.
  Do not automatically allocate it, or include posting income in ordinary review.

Public gate OFF, schemaVersion1/DB5, v1/legacy behavior and old income-free
retirements remain unchanged. No automatic legacy event conversion/backfill.

## Acceptance

RED→GREEN: same-source once, zero/missing/invalid money, ID0, pending/finalized
and wrong reservation, malformed/extra fields, calendar tampering (also paired
evidence), JSON, finalization and later-year replay, mixed posting income,
all spending/payroll invariants, real createInitialTeams positive/refusal pair.
Real inline/external save, publication failure/retry/recovery, coordinated
history rewrite and after-finalization backfill refusal. Related retirement,
posting, budget, ledger, legacy and commit regressions; independent review and
exact-HEAD required CI before presenting a PR. No merge/auto-merge/main push.
