# Archive retry ordering follow-up

Date: 2026-10-24 (Japan). Base main `a7883f90a8c410267d1c688169ab59c828c35496`, #498 merged. [Plan](../../implementation/archive-retry-order-plan.md).

## Behavior

The mutable archive queue now tracks only currently active records, drops superseded failure entries on newer enqueue, and does not retain an older active failure when a newer record is already queued. Legacy retry skips pending/active identities. This fixes the shared queue where accepted receipt projection and save-time legacy retry meet, without a permanent map of historical versions.

Optional `{saveId}` arguments scope queue status, flush results and failed retry; omitted arguments preserve existing whole-queue behavior. Receipt projection and save-time reporting use the current save identity. A foreign failed row remains retryable without producing an archive warning for this save. A receipt is checked again if legacy retry repairs its projection during the same save.

Writing raw batches, aggregates and metadata now explicitly aborts on synchronous exceptions and waits for termination before permitting retry. Previously, a synchronous `put` error could leave an earlier aggregate request committed without its batch, making retry double count. Aggregate-ready cache entries are installed only after commit.

## Evidence and failures

- Two real fake-IDB/controlled-lock regressions observed **180→140 RED**: retry during a replacement write, and an older active failure after a replacement was queued. They are GREEN with exact persisted batch and aggregate assertions.
- A real hook/save regression observed **archive.ok false RED** with a foreign failed projection, then GREEN while the foreign row remained retryable. Another own-history repair case observed false before the final receipt recheck, then GREEN.
- Chromium additionally exposed partial aggregate commit after a synchronous batch-write exception (2 events / 320 total instead of 1 / 180). A narrow fake-IDB test reproduced the leftover aggregate RED; explicit abort makes both unit and browser checks GREEN. No expected value was weakened.
- Final focused verification: **13 files / 158 tests passed**, including receipt/queue/lock/aggregate, main generations/delete/load, feedback/diagnostics and real hook/save reporting. The existing multi-chunk hook fixture now sets its save identity to the identity of its archive records; its wait/failure expectations stay unchanged.
- Baseline whole suite: **1 failed, 1,830 passed, 2 skipped** (233 files, 309.89s). The failure was `scripts/farm-catcher-diagnostics.test.js > observes the real batch without changing state or consuming game RNG`. A separate focused RED run showed the only changed values were the two generated `archiveRun.runId` UUIDs. Both simulations now receive the same explicit run ID; the full state, RNG and non-mutation assertions remain. **6/6 catcher diagnostics passed** afterward (13.72s). No gameplay/RNG logic changed.
- An overlapping heavy diagnostic attempt was killed (exit 137), and an early combined RED runner ended with `fatal library error, lookup self`; those are not counted as product evidence. The independently rerun targeted failures above are the RED evidence.
- Chromium: **11/11 passed**, worker1/retry0, including the two new retry/isolation cases and existing actual new-game→batch→save/reload→single→save progression. Repeated after the review fix because the null-receipt flush interface changed.
- Local WebKit: **not verified**. All 11 attempts failed at launch because host libraries were missing. OS dependency installation failed with setgroups/seteuid permission errors. Do not count these as assertion failures or browser success; the required CI suite covers both Chromium and WebKit on its supported runner.
- Direct Vite build (same command as package build): **success**, existing chunk/import warnings; repeated after the review fix. Generated physics report data from the baseline run was restored and excluded from this change.

The main/PR CI job logs could not be fetched (connector transport errors); its failed status and successful E2E jobs were read directly. Local whole-suite reproduction identifies the deterministic run-ID mismatch, but a new exact-commit CI is required before accepting the fix. The full suite is not redundantly repeated locally after focused repair; repository CI runs it on the published commit.

## Limits

One independent whole-branch review (`a7883f9..7bb53c5`) identified one additional P2: a current legacy save with a null receipt still selected all foreign receipt jobs. The real hook regression was RED. `flushBattedBallReceipts(receipt, {saveId})` now accepts explicit scope even without a receipt, and both save-time calls pass the current identity. Omitted arguments retain global compatibility. This was the sole final fix pass; there was no second reviewer. No new Minor finding was deferred.

This follow-up does not reclaim accepted immutable versions, change legacy provenance, rebuild aggregates from a selected old root, or implement export/import. Conservative retention, the disclosed cancelled seal/discard metadata orphan, long-run capacity/whole-pipeline memory and physical iPhone/Files acceptance remain open. The queue fix orders this realm's shared writer; it is not a new cross-tab publication fence. Existing native archive locks still protect transactions.

Execution decisions: repair the common queue rather than maintaining competing retry policies; use current-save status for UI while retaining whole-queue defaults; keep explicit transactional abort in this fix because the new failure test demonstrated aggregate corruption; let required CI perform WebKit and complete-suite acceptance rather than modifying protected OS dependency settings.
