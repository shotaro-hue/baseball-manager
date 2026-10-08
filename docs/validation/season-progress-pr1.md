# Regular-season progress consistency (PR1)

Base: main `7dfce42eb4afd87fdfcb8cb7d5cdda5da323231b` (#412), fetched before implementation.

The Hub counted wins + losses, excluding draws. The batch selector generated one game even at zero remaining. MobileHome separately used the round cursor as remaining games. The single-game opponent selection could invent a matchup when a schedule entry was missing, and task IDs filtered responses but did not synchronously reject a second invocation.

`seasonProgress.js` derives standings progress (wins + losses + draws) without storing it. Missing legacy draws is zero; invalid counters remain invalid. A separate request guard preserves the round ceiling and requires standings, round, phase, opponents and existing results to agree. Missing/inconsistent saves stop with guidance rather than being repaired. The UI and both Worker cores use these boundaries. Task refs claim execution before asynchronous work. Winning percentages and ranking formulas remain unchanged. #412 postseason resume routes remain available.

No save schema/version change, duplicated progress fields, migration, history pruning, new CPU decision rule or balance adjustment. Existing CPU roster preparation is reused at the previously uncovered single-game/postseason boundaries.

Baseline:
- `npm test`: 537 passed, 2 existing skipped, 79 passing files (35.19s).
- `npm run build`: passed (19.51s).
- `npm run validate:physics-hr`: passed (6.73s).
- Original `playwright test e2e/batch.spec.js e2e/title.spec.js --workers=1`: 4 passed, 2 failed (1.3m). Batch buttons are inside collapsed details in the current UI; existing tests do not expand them. This is corrected in PR2, not hidden by skipping.

PR1 validation:
- Full `npm test`: initially 561 passed, 2 existing skipped (38.12s); final integrated validation 567 passed, 2 existing skipped (41.77s). PR2 stabilizes one existing random-sampling assertion without changing its expected inequality.
- `npm run build`: passed (final 13.17s).
- `npm run validate:physics-hr`: passed (final 6.65s).
- New tests cover counts, legacy draws, invalid counters, tails, a deterministic final draw, real Worker oversize requests, invalid/ended/nonregular/replayed requests, and synchronous duplicate handler calls.
- Existing singleDayCore tests previously relied on an empty schedule and the fallback. They now provide scheduled home/away opponents and CPU pairings with the same assertions.
- Existing postGameConsistency hook mock now supplies the real hook's getGameResultsMap dependency; parity expectations are unchanged.

PR2 depends on PR1 and adds persisted-save/browser assertions, mobile WebKit and CI. Browser emulation does not constitute physical iPhone Safari verification. Branch protection is untouched.

Browser E1 additionally reproduced a pre-existing single-day CPU roster failure after a batch: injured CPU assignments were sent to strict game preparation before the CPU management used by batch games. The single-day Worker and opponent pregame preparation now apply that same existing CPU policy. A real Worker regression covers an injured CPU club outside the user matchup. No new roster rule or evaluation formula is introduced.

The last regular game also reproduced the same CPU injury-preparation failure at postseason entry. The playoff engine now reuses existing CPU management while leaving the user roster untouched, and persists the prepared CPU roster. Its deterministic regression verifies no change to regular-season wins/losses/draws. Removed legacy fallback CPU pairings: an absent schedule never invents extra games. Header counters/dates show an unavailable marker for corrupt data rather than NaN.

A1–A7/A12 are covered by progress and panel tests; A8/A9 by real Worker tests; A10 by synchronous handler/task and application claims; A11 by existing save tests plus PR2 real IndexedDB browser reload tests; A13 invokes the unchanged real winning-rate/ranking functions, with the existing standings suite also passing.
