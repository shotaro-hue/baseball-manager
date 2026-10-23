# SAVE-01B-0C — accepted progression and immutable batted-ball receipts

Date: 2026-10-23. Base main `3599dcbbb0ad6f4af49c6483371bfddc021cff0e` (#497 merged). #497 exact-head CI: all 13 jobs successful. [Plan](../../implementation/accepted-archive-receipts-plan.md). Design authority remains [#494](https://github.com/shotaro-hue/baseball-manager/pull/494), section 15.2.

## What is now implemented

Normal auto/tactical result handlers, single-day Worker and batch Worker stage each run under a unique identity. Worker chunks carry a run ID and contiguous index; its terminal result includes actual chunk/record/event totals. Only successful progress adoption installs `battedBallReceipt` in the same reducer transition and projects the run into the existing analysis archive. Cancelled/stale tasks attempt to discard only rows they actually created; a known concurrent seal/discard metadata orphan is documented below. A base token is rechecked after async sealing; unmount cancellation also prevents adoption.

Each chunk and run node is add-only under `batted-ball-version:` in the existing `save_chunks` store. JSON is compressed with the existing LZ-UTF16 dependency; references contain SHA-256 of canonical decoded JSON. A node references its chunks and the previous receipt, so the root's reference stays constant-size rather than growing with seasons. Idempotent retry accepts identical bytes; a collision cannot replace or delete a prior owner's row. No DB/store or root version bump is required.

The strict reader traverses only that root's receipt chain, validates identity/order/totals/SHA, rejects missing or corrupt rows, cross-save references and cycles, and emits the latest version per logical batch once. It reads one chunk's payload at a time, retaining visited node/batch IDs. Callbacks are provisional until the whole read resolves; a consumer must discard partial output on rejection. This is a regular-season batted-ball scope, not a claim that a complete game backup exists.

Only an explicitly initialized new game starts empty/complete. Existing unproven archive is retained as `legacy_unverified`; dates/counts do not turn it into proven history. `coverage` denotes provenance eligibility, not proof that every write is durable. Temporary write failure can be repaired with the same bytes. A missing/invalid producer stream produces a persisted incomplete receipt, which cannot be mistaken for a valid empty archive.

Receipt state is included in initial/manual/autosave/batch saves, reducer adoption, App load, year changes and new-save reset. New code refuses omitting an existing same-save receipt or dropping its head. Main save success remains independent of archive failure. Save-time flush retries accepted work for the matching save and verifies the current head/chunks (`scope: head`); it does not certify historical completeness. Full strict capture rechecks the entire chain. Reload with a missing head/chunk therefore cannot claim a successful head flush merely because the in-memory retry queue is empty.

## Evidence

- Baseline: four relevant existing files, **11/11** successful.
- New storage interface tests: initial **6/6 RED** before implementation. Subsequent collision-discard and owned-parent regressions observed **2/2 RED**, then GREEN. IDB write failure, missing/hash corruption, cycles, cross-save, stream gaps and immutable replacement are covered.
- Progress/save integration: reducer receipt omission, same-save overwrite and incomplete-archive reporting, plus both core summaries observed RED. Worker fixtures initially had a harness-render timing error; it was corrected before observing the actual pre-adoption projection/stale/cancel failures. The harness error is not product RED evidence.
- First implementation relied on producer input eventCount metadata; actual event lengths now determine it. A known earlier gap initially suppressed valid later analysis records; RED→GREEN now retains the gap while projecting the valid new run. A failed foreign-save job initially poisoned another save's flush; RED→GREEN restricts receipt-specific retry status by save identity.
- Final focused regression: **26 files / 233 tests passed**. Includes immutable/legacy archive, all four progress routes, main/farm/career generations, save/delete/load races, save feedback/diagnostics, farm annual transition, hook save status and both real simulation cores. Existing batch-save assertion now waits for the real async seal; no success assertion or behavior was removed.
- Real browsers: **Chromium 9/9 + mobile WebKit 9/9**, one worker, retry 0, **42.35 seconds**. Primary/backup with the same game identity retain 180/140 km/h respectively after reload. A two-tab native Web Lock blocks staging transactions until grant. Cancellation, foreign save retention, mutable replacement/legacy deletion isolation, missing-row failure after reload and quota-failed primary publication with retry are covered.
- Actual UI: new game→five-game batch→save→reload→single Worker game→save retains a complete receipt chain in both browsers. This verifies integration beyond isolated fixtures. Normal auto/tactical handlers also have direct hook/data assertions.
- JSON audit: `test-results/batted-ball-receipts/results.json`, expected **18**, unexpected/skipped/flaky **0**. Default config discovers all eighteen, and a required CI step runs the dedicated suite without weakening existing gates/characterization.

## Independent review and fixes

One independent whole-branch review of base `3599dcb` through `e9d6ae7` found no Critical findings, three Important findings and one Minor finding. The three Important findings were fixed together, without a second review:

- An older accepted run whose mutable projection failed could retry after a newer replacement and roll its value/aggregate back (180→140 km/h). The regression failed before the fix; pending older jobs now remember only their superseded logical IDs, repair immutable bytes and skip the obsolete projection. The replacement value and aggregate remain unchanged.
- React DOM StrictMode's setup→cleanup→setup lifecycle left the cancellation flag set, rejecting a first tactical result. Lifecycle setup now restores mounted/cancellation state, while unmount still prevents late adoption. A real StrictMode browser regression failed in both engines before the fix.
- Normal auto/tactical handlers published box scores, game result, news, transfer history and CPU offers before async sealing and final token validation. Those effects now publish only after accepted adoption. Both browser engines failed the held-seal/token-change regressions before the fix; all six new browser regressions then passed. RNG arguments are evaluated when staged, preserving the existing draw order.

**Deferred Minor:** discard can finish while seal is hashing/writing its run node outside the chunk tail. If cancelled at that point, the unreferenced run metadata may remain. It is never adopted/projected, and cannot alter another root, but cancellation does not guarantee reclaiming every staged byte. Reference-aware GC must include this orphan; no complete cleanup claim is made.

Review limits retain explicit scope rulings: accepted/delete/crash retention and future journal/import protection are assessed for preservation only; serialized compression is not physical quota or whole-process memory evidence; selected-root active aggregate rebuild is deferred; old-v4/raw writers and hostile authenticated input remain outside the trusted consistency guarantee; full ZIP/other dependency scopes/cold-start restore/v1 freeze/B-1 and physical iPhone/Files are unfinished. Head flush alone does not certify a chain. Exact-head CI is separately checked in the PR; local focused runs do not replace it.

The serialized-storage test measures compressed rows against the actual normalized mutable archive row, requiring less than half its serialized UTF-8 size for the representative 300-event fixture and exact retained event count. An initial comparison against an unsanitized smaller input was invalid and corrected; the threshold stayed unchanged. This is neither physical IndexedDB usage nor a long-run quota/OS memory measurement.

Build, independent review and exact-head CI status are recorded in the implementation PR. Local focus/browser success is not a substitute for pending or failed CI. WebKit is an actual desktop-hosted mobile browser engine using the established host-library wrapper, not a physical iPhone.

## Deliberate limits and next prerequisite

1. **Accepted versions are retained conservatively, including after current save/legacy-archive deletion.** Existing GC only deletes its known generation/root prefixes. This protects backups and unpublished accepted references, but leaves accepted versions and process-crash orphans. Reference-aware GC, delete reclamation, journal/import protection and long-run capacity are required next; this PR does not claim to free all archived storage.
2. Immutable compressed history coexists with mutable analysis rows. Pending writes/failures can retain additional queued payloads. No whole-pipeline memory bound or 10/20-year device capacity acceptance is claimed. Compression reduces serialized overhead in the tested fixture; it does not prove quota safety.
3. Old DB-v4 code can still publish a root without a receipt, and raw/versionless writers can bypass app rules. Such a root has unknown provenance, never inferred complete. Universal old-publication fencing remains unresolved.
4. The strict reader does not restore selected-root aggregates into the active analysis UI. An old backup's captured bytes are correct, but existing mutable analysis may reflect another run until a future isolated restore/projection rebuild. No export/import UI is introduced.
5. Full ZIP writer/reader, all dependency scopes, journal/GC integration, physical iPhone/Files and restored game→cold start→advance→save remain open. SAVE-01A freeze and B-1 are not unlocked by this prerequisite.

## Reproduce

```bash
npx vitest run tests/batted-ball-receipts.test.js src/hooks/useSeasonFlow.receipts.test.js src/hooks/useGameState.receipts.test.js src/workers/__tests__/archiveRun.test.js --maxWorkers=2 --minWorkers=1
npx playwright test --config=scripts/batted-ball-receipts.playwright.config.js --workers=1 --retries=0
npm run build
```
