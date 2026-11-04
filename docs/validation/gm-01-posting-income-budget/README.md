# Posting income / next-season permission validation

## Scope and source

Main observed `3b6192e32568ee14710f9842bc402afba166e698`. This branch depends on
unmerged #543 `ebee5f8d79b72902c3f51f4605fd11bab38ca56d`; submit as a dependent
draft against main. Public annual gate remains OFF, schemaVersion1/DB5 unchanged.

Implements explicit `complete-posting` monetary completion, not a market or
eligibility producer. [Spec](../../superpowers/specs/2026-11-04-gm01-posting-income-budget-design.md)
and [plan](../../superpowers/plans/2026-11-04-gm01-posting-income-budget.md).

## Executed evidence

- Before changes: existing posting departures, annual budget policy and posting
  real-save tests: 3 files / 76 passed.
- Initial new tests: 35 failed on missing monetary implementation and completion
  command. After implementation and fixture-preserving assertions: 111 passed
  across the new core and the baseline files.
- Additional RED: extra `reason` inputs were incorrectly overwritten by
  normalization (2 cases), and income-only history rewrites were not independently
  prefix-protected (1 case). Strict input fields and the income history prefix
  fixed those failures.
- Initial new tests: 16 monetary + 25 completion/budget + 8 real save = 49 passed.
  Cent rounding, tier boundaries, zero vs missing, retain/waive/natural expiry,
  duplicate source/different command ID, altered terms/source/owner/target year,
  funded vacancy costs, future-year refusal, ordinary spending authorization
  protection, budget quote/reinstall, base-chain isolation, spring retention and
  later-year non-carry are covered.
- Real `createInitialTeams()` roster preserves original names/salaries/terms;
  changing only the request flag distinguishes positive completion from a
  missing-request refusal. This does not certify actual MLB eligibility.
- Inline compressed and external uncompressed root tests cover publication
  failure, untouched original roots/world, cold load/rebuild of identical money
  and spending, retry, published-before-adoption recovery, one income allocation,
  and coordinated command/fee/authorization rewrites rejected by save history.
- `npm run build`: succeeded (existing mixed-import/chunk-size warnings).
- `npm test`: 4028 passed, 7 failed, 2 existing skipped (318 files), 3 unhandled
  `listen EPERM` errors, in the restricted shell. The 7 failures were
  `scripts/source-instrumentation.test.js` (3, localhost listen denied),
  `scripts/qa-d1-draft.test.js` (1, git subprocess EPERM), and
  `tests/save-01b0-zip.test.js` (3, python subprocess EPERM).
- Re-ran only those affected files with execution network permission: source
  instrumentation 3/3 passed; draft/zip 10/10 passed. Code, expectations,
  timeouts and retries were unchanged. The first full run is not reported as a
  green full suite; the exact public HEAD CI remains the final gate.
- The physics test's generated `scripts/physics-hr-report.json` was restored;
  no generated report or dependency/build artifact is part of the change.

## Review and final publication

Independent review of implementation `f4b88ccf23008e1754023fd4ac65a43705d8050c`
found one reproducible P2, no confirmed P0/P1: old standalone departures could
receive income later by appending a matching parent receipt and allowance. The
reviewer reproduced successful actual save/commit/cold-load. The implementer
confirmed a RED test, then added a save-history requirement that a new posting
income's departure and child/parent receipts are all new in that same extension.
GREEN: the new rejection, 50 total new tests and related regression, 8 files /
162 passed. The ordinary complete command remains atomic and the old standalone
API remains readable without income. No review findings were deferred.

The reviewer separately checked actual generated 12-club/1059-player inputs,
source-flag refusal/success, other-player preservation, JSON, deletion/forged
allowance rejection and policy/spending semantics. No code edits by reviewer.
Exact public HEAD/CI and the post-fix full-suite result are recorded in the PR
description. Do not infer a green CI from local tests.

## Limits and next owners

- Production Task10 open-offseason/rollover is still unimplemented. The spring /
  later-year tests use the existing explicitly named test lifecycle adapter.
- Request evidence beyond the legacy request flag, professional-season/MLB
  eligibility data, market amounts, player acceptance, UI/CPU and Worker producers
  are not implemented. This command consumes explicit final monetary terms.
- Task9 must use the same effective annual permission; Task10 must preserve
  historical income and exact-year allowance while excluding it from ordinary
  operating-surplus inputs and preceding-base comparisons. No reallocation of
  the same receipt at a later budget review.
- No long-play economic calibration, real iPhone or new browser UI was tested.
  General activation and the whole A1/Task7 completion are out of scope.
