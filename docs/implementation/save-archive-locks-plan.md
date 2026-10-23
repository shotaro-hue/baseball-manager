# SAVE-01B-0A — 製品打球アーカイブの共通排他

> For agentic workers: use superpowers:executing-plans to implement and verify this prerequisite inline.

**Goal:** 共通archiveロックを保持する読取中は、参加する製品コードが打球batch/meta/aggregateを変更しない。

**Architecture:** 既存SAVE-01A 4.1節のorigin共通ロックを、製品の単一mutation入口へ統合する。タブ内queueを維持してarchiveロックを取得し、書込・retry・backfillの読取から置換完了まで・削除を保護する。saveロックを追加取得しないため、save→archive順序と両立する。

**Tech Stack:** Existing JavaScript, Web Locks, IndexedDB, Vitest/fake-indexeddb and Playwright Chromium/mobile WebKit.

**Spec:** [SAVE-01A 4.1 at 1153f728](https://github.com/shotaro-hue/baseball-manager/blob/1153f728a969161b41c0544f7b6a7cb82ce4ea8a/docs/implementation/save-01a.md).

## Global constraints

- Base main `beb79823828642617b9044edb6a3abec24523a80` (#495 merged); independent PR, no main push/merge/auto-merge.
- This is prerequisite storage work permitted by SAVE-01A section 9, not B-1/export/import, a format freeze, or completion of B-0.
- Keep existing save schema, root publication and valid batch replacement semantics. No user data deletion/migration.
- Only updated participants coordinate. Old tabs/raw IndexedDB writers are not fenced; export remains blocked pending that separate design.
- Browser without Web Locks fails closed for archive mutations. Node unit harness keeps existing single-process fallback.
- Retain the #495 save-lock-bypass characterization: archive-only writers may still run under a save-only lock. Do not claim save locking alone suffices.

## Review focus

1. Lock granted to a snapshot before a queued mutation: no DB changes before release.
2. Retry after failed write must acquire the same lock and preserve all data.
3. Backfill must lock both source read and aggregate replacement to prevent stale totals.
4. Synchronous/asynchronous lock failure must release local queue and preserve retryability.
5. Delete under the save lock must not reacquire save; subsequent writes continue after archive release.

### Task 1: Lock integration and regression

**Files:** `src/engine/battedBallArchive.js`, new `src/engine/archiveLock.js`, new `tests/archive-lock.test.js`, new `e2e/archive-lock.spec.js`.

**Interfaces:** `BATTED_BALL_ARCHIVE_LOCK = 'baseball-manager-archive'`; `withBattedBallArchiveLock(task)` returns the task Promise, uses an exclusive Web Lock, throws `archive_lock_unavailable` in a browser without support. Caller must not nest it inside the same raw lock. Normal save→archive callers remain supported.

- [x] Write positive tests: common lock blocks actual writer/retry/backfill/delete and preserves state while pending; unsupported browser rejects without writing; rejection then later progress.
- [x] Run focused tests and observe RED on actual production bypass.
- [x] Add helper and integrate `runArchiveMutation` once for every mutation path; no caller wraps a second time.
- [x] Run new and existing archive, aggregate and save/delete regression tests GREEN; browser tests use two pages, actual granted/pending Web Locks, one worker/no retries.
- [x] Build, independently review final diff, and record results and open legacy/immutability/device gates. Update #494 design authority and ROADMAP without claiming full backup completion.
- [ ] Commit, publish independent PR based on latest main, and inspect exact-head CI.
