# SAVE-01B-0A — production archive exclusion

Date: 2026-10-23. Base main: `beb79823828642617b9044edb6a3abec24523a80` (#495 merged).

## Scope and result

The product's `runArchiveMutation` now wraps every existing mutation with the exclusive origin-wide Web Lock **`baseball-manager-archive`**. The tab-local tail still orders mutations and recovers after rejection. Normal queue writes, failed-write retries, aggregate backfill (including all source reads), and batch/meta/aggregate deletion participate. Archive code never reacquires the save lock; combined callers acquire **save → archive**. Do not nest the archive helper inside the same raw lock or drain the mutation queue while holding it.

This is the independent storage prerequisite allowed by SAVE-01A section 9, not B-1/export/import, a format freeze, old-tab fencing or immutable archive storage. The design authority remains [#494](https://github.com/shotaro-hue/baseball-manager/pull/494). No save schema, root publication or gameplay behavior is changed. Existing same-ID replacement semantics remain; they must be redesigned with committed root correspondence later.

## RED → GREEN evidence

- Baseline: existing aggregate and strict legacy storage regressions **10/10** passed before product changes.
- New Vitest regression: **7/7 failed** before implementation. Actual writer/retry/backfill/delete never requested the lock; unsupported browsers wrote instead of rejecting. After integration all 7 pass.
- Actual Chromium two-page RED: holding save+archive did not yield a pending archive request; the other tab's write completed. The same test passes after integration.
- Focused final Vitest: **6 files / 51 tests passed**, including new lock cases, aggregates, strict legacy reads, profiles, the useGameState archive/save integration and save/delete/load regressions. Error-injection cases emit their expected diagnostics.
- Actual final browser run: **Chromium 7/7 + mobile WebKit 7/7**, one worker, retry 0. It checks all four mutation routes, no archive transaction before grant (including backfill reads), byte/record preservation while blocked, correct replacement/aggregation or removal afterward, unrelated-save preservation, root-key sentinels, rejection release and future progress, unsupported-browser retry, and save→archive acquisition without save reacquisition.
- `npm run build`: success; existing large-chunk warning only.
- Historical unit characterization: **2/2**, unchanged. Save-lock-only bypass and same-ID mutability are still possible; these tests are advisory observations, not required product behaviors.

The local runner initially followed a stale dependency symlink and `npx` selected an incompatible Vitest. That CLI error did not execute a test or constitute RED. Runs above use the existing installed Vitest **2.1.9** matching the repository lock. The real mobile WebKit binary uses the previously established host-library wrapper; this is not physical iPhone/Safari evidence.

Independent code review found **no Critical/Important/Minor issues** in the product/test/config diff. The reviewer separately verified mutation coverage, no save reacquisition, required CI gating and 14 discovered browser tests.

## Exact CI

CI runs the new two-browser suite as a **required step** in the existing `save-portable-backup-probe` matrix job, retaining all previous suites, assertions and aggregate gating. No retry/timeout or advisory-policy relaxation. Existing `test-results/**` artifacts include its JSON/trace output. The default extended browser run also includes both projects. Full unit/integration and existing save/browser regressions are enforced by the exact-head CI; their result and source SHA are recorded in the linked implementation PR. Local focus/build success does not substitute for a pending/failed CI.

A final artifact audit found that Playwright resolved the JSON reporter path relative to `scripts/`, outside the uploaded directory. The config was corrected to `../test-results/archive-lock/results.json`; a fresh two-browser run passed **14/14** and an independent filesystem/JSON check confirmed that exact CI-uploaded path with expected=14, unexpected=0, skipped=0, flaky=0. This configuration-only follow-up does not change production code.

## Mutation inventory

| Public path | Protected operation |
|---|---|
| enqueue → flush | `writeRecords`: batch, incremental aggregate, meta in one existing transaction |
| retryFailedBattedBallWrites → flush | Same mutation entry; failure retains records for retry |
| comparison profiles → ensureAggregateBackfill | Entire `performAggregateBackfill`: meta + raw reads, rebuild, aggregate/meta replacement |
| deleteBattedBallArchiveBySaveId | Batch/aggregate cursor deletion and meta removal |

No other production archive write transaction exists outside `battedBallArchive.js` at the base. Future import/GC writers must participate explicitly; raw IndexedDB is not automatically protected.

## Open gates

1. Old/nonparticipating tabs and direct IndexedDB writers can ignore Web Locks. A migration/fencing policy remains necessary before export is released. This PR does not provide it.
2. Mutable batches still have no immutable per-root commit correspondence. Save failure may still leave ahead-of-root archive data. Shared locking alone does not repair it.
3. The #495 probe lock is deliberately separate (`baseball-manager-backup-archive-probe`). Its helper is not a production backup reader. No game-facing snapshot/export UI is introduced here.
4. Whole-row root/career decoding, device peak memory, Files persistence, strict package import, restore journal/GC integration and restore→reload→advance→save remain unverified.
5. Existing delayed deletion semantics and per-tab read caches are unchanged. Coordinated mutations do not prove stale-cache invalidation, absence of a later stale queued write, or GC/restore safety.
6. #495's observed DH-less starting-lineup error is a separate unresolved product reliability issue. No claim of fixing it or stabilizing all CI is made.

## Reproduce

```bash
npx vitest run tests/archive-lock.test.js tests/batted-ball-aggregate.test.js tests/save-01b0-storage.test.js src/engine/__tests__/battedBallProfile.test.js src/hooks/useGameState.archive.test.js tests/save-delete-load.test.js --maxWorkers=1 --minWorkers=1
npx playwright test --config=scripts/archive-lock.playwright.config.js --workers=1 --retries=0
npx vitest run --config scripts/save-01b0/vitest.characterization.config.js
npm run build
```
