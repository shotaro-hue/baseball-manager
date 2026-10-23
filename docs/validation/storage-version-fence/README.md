# SAVE-01B-0B — version-pinned DB connection fence

Date: 2026-10-23. Base main: `66a8dda77132892946f0da69c323db853dbac4b9` (#496 merged, exact-head CI 13 jobs successful). Design authority: [#494](https://github.com/shotaro-hue/baseball-manager/pull/494). [Implementation plan](../../implementation/storage-version-fence-plan.md).

## Product behavior and boundary

The shared DB advances from version 3 to **4**, preserving the five stores, existing indexes and rows. After activation, old product code opening an explicitly pinned version 1–3 receives `VersionError`. No root format, gameplay behavior or archive batch representation changes. Helper-owned connections close on `versionchange` to permit future upgrades. Version-3 code is no longer a compatible rollback loader after activation; rollback requires a compatible connection layer.

A noncooperating old connection prevents activation. The helper reports `storage_upgrade_blocked` without publishing a new root; when that connection later closes, the abandoned upgrade aborts rather than silently activating. Calls in the same realm share a pending request's failure until its native request settles. Successful concurrent callers receive separate handles so one owner's close cannot invalidate another's connection.

A different realm may have a request queued behind that blocked native request without receiving any event. Each native request has a **10,000 ms application timer budget**; it rejects with `storage_open_timeout`, abandons the result, attempts to abort an active upgrade and closes a subsequently delivered connection. Concurrent helper callers can first wait for a successful predecessor and then start their own budget: this is not a total per-invocation deadline. Browser timer suspension can delay the deadline. Timeout is not proof of the native operation's final outcome; no late success is returned. Blocked-before-upgrade cancellation is separately tested to keep the DB at v3 until an explicit retry.

Save diagnostics retain safe reason/exception names without error messages or save payloads. Blocked guidance preserves this tab's edits and asks users to preserve other tabs' work before closing them and retrying. `storage_version_outdated` requires the latest app and explicitly says unsaved work does not transfer automatically. Unknown timeout causes retain conservative diagnostic guidance.

This is a **DB-open fence**, not protection from versionless raw IDB, direct localStorage writes, arbitrary existing connection code, or an already-in-flight old root publication. It does not add immutable archive versions, accepted-progress receipts, export/import, restore journal or GC protection. Actual iPhone Safari/Files and whole-pipeline memory remain unverified.

## Verification and corrected failures

- Initial six migration/lifecycle/saving regressions failed against production v3. A real Chromium cooperative-old-page case also failed before the bump.
- First implementation exposed two unit timeouts and a browser hang: rejecting `onblocked` did not cancel the native request, so later opens queued behind it. Keeping the abandoned request record until native settlement and bounding cross-realm no-event requests corrected the cause. No assertions were removed or relaxed.
- A synchronous schema exception aborts the upgrade and allows a fresh retry. A throwing `indexedDB` getter was separately RED for synchronous throw; the async helper restores the prior rejected-Promise contract and is GREEN.
- Final focused unit verification: **89/89** across DB fence (9), archive lock (7), strict legacy storage (4), save feedback, safe diagnostics and save/delete/load (30). Run as five files / 59 tests plus the delete/load file / 30 tests after the last product edit.
- Additional storage regression: **8 files / 86 tests passed**, covering root/farm/career generations, capacity, save scopes, hook archive integration and delete/load integration. This ran before the final one-word async API correction; the focused tests above and browsers ran afterward.
- Final actual browser verification: **Chromium 4/4 + mobile WebKit 4/4**, one worker, retry 0. Three pages reproduce a cross-realm request with no events until timeout, then safe recovery. Other cases prove row/root preservation before explicit retry, save/load afterward, old v3 rejection after activation, and v4 connection release for a future v5 followed by refusal of the old saver.
- Independently inspected `test-results/storage-version-fence/results.json`: expected 8, unexpected 0, skipped 0, flaky 0. Config path resolves into the uploaded repository directory. Browser list output was buffered; the structured final report confirms all eight completed.
- `npm run build`: success; existing large-chunk warning only. Installed Vitest **2.1.9** matches the lock. WebKit uses the established host-library wrapper, not a physical iPhone.

The fixture seeds all five historical v3 stores, including numeric `0` versus string `'0'` career keys and root-body/archive payloads. Snapshots compare every key/value row, store names and index names; store/index property metadata is not separately enumerated. Migration preservation is checked before a subsequent normal save, whose existing GC may legitimately remove orphan fixture root bodies.

## Independent review and CI

Independent read-only review found **no Critical/Important issues** within this bounded scope. Three Minor observations: the Promise API regression was corrected with RED→GREEN; the per-native-request deadline distinction is documented above; fuller schema-property snapshot coverage is deferred because production preserves existing stores/indexes without editing them. Reviewer also independently checked a late-success timeout probe: rejection stayed final and the delayed connection closed once.

The dedicated two-browser suite is a **required step** of `save-portable-backup-probe`, reaches the existing aggregate gate and uploads JSON/trace output under `test-results/**`. Existing suites, assertions, retries and advisory characterization remain intact. Full unit/integration and existing browser gates are delegated to exact-head GitHub CI; the PR records the current SHA/status. Local success does not substitute for pending or failed CI.

## Next design prerequisite

Normal simulation and Worker `ARCHIVE_CHUNK` can write history before `applyProgressCandidate` accepts the result. Save ID, date, game ID and counts cannot prove which immutable bytes belong to an accepted root. The next design must attach explicit per-run receipts to accepted progress atomically, retain their immutable batch version identities through reducer/Worker/save/load, and keep unproven legacy history unverified. Root capture, complete readers and future GC must use those references. This PR supplies only one prerequisite, so v1 freeze and B-1 remain blocked.

Connection queue, lower-version rejection and upgrade abort behavior follow the primary [IndexedDB specification](https://www.w3.org/TR/IndexedDB/); real browser tests above verify the relevant product behavior.

## Reproduce

```bash
npx vitest run tests/storage-version-fence.test.js tests/archive-lock.test.js tests/save-01b0-storage.test.js tests/save-feedback.test.js tests/save-diagnostics.test.js tests/save-delete-load.test.js --maxWorkers=2 --minWorkers=1
npx vitest run tests/save-generations.test.js tests/farm-save-generations.test.js tests/career-generations.test.js tests/save-capacity.test.js src/engine/__tests__/saveload.test.js src/engine/__tests__/saveloadScopes.test.js src/hooks/useGameState.archive.test.js src/App.deleteLoad.integration.test.js --maxWorkers=2 --minWorkers=1
npx playwright test --config=scripts/storage-version-fence.playwright.config.js --workers=1 --retries=0
npm run build
```
