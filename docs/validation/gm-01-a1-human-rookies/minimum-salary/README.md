# PR #532 minimum salary fix — GM-01 A1-2b-1-FIX

Baseline: `a93e2166473a5931d57ec1be6d26dbcfa054c6ab`. Scope: rookie salary consistency only; release gate remains OFF.

## Cause and correction

`makePlayer` can produce a controlled player with a 240万円 salary. The draft passed this directly into the human rookie contract, whose strict 420万円 minimum correctly rejected it. Existing human fixtures used 600万円 and missed the real generation path.

- `draftSalary.js` owns the draft quote: a recorded positive integer is raised only to its registration-class minimum (controlled420/development240); higher offers remain unchanged. Missing, zero, negative and fractional evidence is not repaired.
- `initDraftPool` fixes the salary before candidate/result presentation, including scouted prospects. The general player generator, class and random draws are unchanged.
- For old **unfunded** results, the same quote is displayed in the row and final confirmation, with the original amount and correction explicitly stated. Merely viewing, loading or saving the world does not mutate that old result.
- A successful reservation records the displayed salary in the existing canonical `draftResult.pool` and native proposal/receipt in one commit. Assignment-valid duplicate salaries are checked before correction. Failed budget/write operations retain the old world/root.
- Existing held/resolved contracts and receipts remain immutable. Their validator still uses the exact recorded salary and rejects mismatch or below-minimum evidence. No migration of established contracts, new schema/state, or changed ID/revision/epoch protocol.
- Legacy `applyDraftAcquisitions` retains its existing immediate controlled joining and 420万円 floor, including its existing handling of development flags.

## Verification

- RED before production edits: **12 failures /44 passes** in engine, real hooks and UI. The fixed-seed real generator path failed with `指名時の年俸が未記録または不正です。`; development240 and controlled600 already passed.
- GREEN: **26 related files /778 tests passed** (594 in23 files,182 persistence tests in3 files, then2 added budget-boundary cases). Current changed engine43, hook9 and UI6 tests pass.
- Additional FA/renewal competition confirms420 rookie +10000 other offer fits10420 approval, and10419 fails without changing the input.
- Coverage includes single-year guaranteed terms,70/71 places, multiple rookies, decline/release, duplicate clicks and stale callbacks, failed writes/retry, acknowledgement recovery, cold reload, save migration/history guards and legacy immediate joining.
- Playwright: `npm run test:e2e -- save-generations.spec.js --grep 'human rookie' --workers=1 --retries=0`: **8 passed**, Chromium4 + mobile WebKit4. At360/390/1440px, confirmation420 = proposal420 = reservation420 = receipt420 = cold-reload draft salary420. Failure retains the old240 draft/root. Development remains240 after the other rookie is declined.
- `npm run build`: passed. Existing mixed static/dynamic import and large-chunk warnings remain.
- `git diff --check`: passed.
- Independent read-only review: no actionable P1/P2; reviewer ran9 files/254 tests. The reviewer did not run browser E2E/full CI; those results are separately recorded here/in the PR.
- Exact final-HEAD CI status is recorded in PR #532. Per AGENTS.md, full `npm test` and broad E2E are delegated to that CI, without repeating an identical complete local suite.

## Generation and visual comparison

The baseline and fix were loaded from separate checkouts using the real browser imports. With the same seeded random stream (seed4, LCG1664525/1013904223), both made5897 random calls and generated160 candidates. All fields other than salary, including IDs and order, were identical. Below420 controlled candidates changed48→0. See [machine-readable result](generation-check.json). These are a deterministic fixture result, not a population estimate.

The same old240 salary fixture and confirmation state were captured before/after the code change. Both browsers passed overflow checks at all three widths. Representative baseline/fixed, mobile failure and desktop screenshots were visually inspected. E2E captured failed save and post-decline cold-reload history separately. No CSS/layout changes; physical iPhone testing was not performed.

| Browser / width | Baseline confirmation | Fixed confirmation | Save failure | Reloaded history |
|---|---|---|---|---|
| chromium / 360 | [before](chromium-360-baseline-confirmation.png) | [after](chromium-360-fixed-confirmation.png) | [failure](chromium-360-failed.png) | [history](chromium-360-history.png) |
| chromium / 390 | [before](chromium-390-baseline-confirmation.png) | [after](chromium-390-fixed-confirmation.png) | [failure](chromium-390-failed.png) | [history](chromium-390-history.png) |
| chromium / 1440 | [before](chromium-1440-baseline-confirmation.png) | [after](chromium-1440-fixed-confirmation.png) | [failure](chromium-1440-failed.png) | [history](chromium-1440-history.png) |
| mobile-webkit / 360 | [before](mobile-webkit-360-baseline-confirmation.png) | [after](mobile-webkit-360-fixed-confirmation.png) | [failure](mobile-webkit-360-failed.png) | [history](mobile-webkit-360-history.png) |
| mobile-webkit / 390 | [before](mobile-webkit-390-baseline-confirmation.png) | [after](mobile-webkit-390-fixed-confirmation.png) | [failure](mobile-webkit-390-failed.png) | [history](mobile-webkit-390-history.png) |
| mobile-webkit / 1440 | [before](mobile-webkit-1440-baseline-confirmation.png) | [after](mobile-webkit-1440-fixed-confirmation.png) | [failure](mobile-webkit-1440-failed.png) | [history](mobile-webkit-1440-history.png) |
