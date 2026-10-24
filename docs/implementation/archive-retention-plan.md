# Archive retention implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclaim unreachable immutable batting archives without removing the current save, either backup, or a live tab's unpublished progress.

**Architecture:** Keep the existing save→archive lock order. A live tab holds native Web Lock pins describing its staged run and previous receipt; GC marks saved receipt chains and held pins, then sweeps only recognized unreachable version keys. Pins disappear automatically on tab/process exit. Increment the existing DB connection epoch so older explicit-version clients that do not pin cannot reopen it. Preserve all five stores and existing data. Run archive collection at a bounded cadence rather than on every autosave.

**Tech Stack:** Existing JavaScript, IndexedDB, Web Locks, Vitest/fake-indexeddb, Chromium/WebKit Playwright. No dependencies.

**Spec:** User agreement on 2026-10-24: capacity work only; protect current save/backups, reclaim unused/cancelled data, measure multi-year capacity and verify save/reload. Existing receipt contract: [accepted archives](./accepted-archive-receipts-plan.md).

## Global constraints

- Base main `19dd33d0e5862c511c90c4a4cc0c767a139cdf72`; isolated branch, independent PR; no merge/main push/auto-merge.
- No export/import, ZIP work, UI redesign, gameplay changes, history retention-year changes, or user save deletion/reset.
- Unknown roots, corrupt reference metadata, unavailable Web Lock inventory, or a stale snapshot prohibit archive reclamation.
- Saved and live histories remain byte-for-byte readable. Legitimate retained history may grow with play; no unlimited-storage claim.
- Pins are runtime protection, not a restoration journal. There is no product import/journal writer yet; unknown chunk namespaces are preserved.
- Database epoch 5 fences explicit v4 and earlier opens; unversioned raw writes remain outside the existing cooperative-writer guarantee.

## Approaches and decision

Reference marking with native live pins is the selected implementation choice. Root-only deletion would destroy unsaved or older live-tab references. Age-based deletion cannot prove a paused tab is finished. Persistent time leases add timers/expiry races; native pins are released by the browser itself. Keep all accepted historical semantics; compaction or history truncation would be a separate change.

## Review focus

1. Another tab has a staged/failed/unpublished run while this tab saves: all its run bytes and anchor chain survive.
2. A backup is the only owner of an older history: it still loads after collection and rotation.
3. A tab exits during seal/discard: orphan chunks and metadata become reclaimable, without touching adopted data.
4. A root or chain cannot be decoded, or lock inventory fails: no archive versions are deleted.
5. GC races with new writes/publication, deletion, or a cold load: common locks and pin-before-publication preserve the selected state.

## Task 1: Live references and collection

**Files:** create `src/engine/battedBallRetention.js`, `tests/archive-retention.test.js`; modify `battedBallReceipts.js` and `baseballManagerDb.js`.

**Interfaces:** retention pins expose `ready`, `adopt`, `settled`, `release`; `retainBattedBallReceipt(receipt)` returns a ready pin. `collectUnusedBattedBallVersions(roots)` runs under the save lock, acquires archive lock, returns `{deleted, retained, skipped?}`. Receipt metadata traversal marks exact SHA-linked keys without inflating event chunks.

- [x] Write and observe RED: unreachable closed-owner versions accumulate; root/backup/live pins survive; unknown metadata and lock errors block sweeping.
- [x] Implement pins, strict metadata marking, allowlisted cursor sweep, and DB epoch fence. Await pin readiness before any staged write. Complete seal before cancellation cleanup.
- [x] Verify focused unit cases, including synchronous IDB abort and stale pin release.

## Task 2: Save/load lifecycle and capacity evidence

**Files:** modify `saveload.js`, existing DB-version tests; create `e2e/archive-retention.spec.js`, a focused browser config, validation README/evidence, update CI/ROADMAP/CHANGELOG.

**Interfaces:** compact root cache includes `battedBallReceipt`; save collection cadence is five minutes with a first-run pass, retry after failed collection. Load pins the validated receipt before final unchanged-root check and adopts it only after ownership is confirmed. Delete triggers best-effort collection under save lock. Pending retry work keeps its pin even after a newer run becomes current.

- [x] Write RED integration cases for backup-only ownership, delete reclamation, and cancellation during seal.
- [x] Integrate save/load and execute native two-tab Chromium/WebKit cases: unsaved progress, held old root, tab close, save/reload, old explicit v4 writer rejection.
- [x] Measure deterministic multi-year history plus abandoned runs: retained history grows only with necessary data; repeated orphan creation/collection returns to the same retained row/byte baseline. Measurements are serialized stored bytes, not physical disk or a full 20-year simulation.
- [x] Run focused regressions/build, one independent whole-branch review, repair Important findings RED→GREEN, publish independent PR, and confirm exact-head CI. Reuse passing baseline/CI results; do not repeat full suites without a cause.

## Execution ledger

- Initial main tree `e91e4375eabfc3e7e550167c7a57856e4eb31540` matches existing isolated checkout. Dependencies already present.
- User reports original real-device save failure improved. Reload durability remains unreported; this work does not replace that observation with a simulated claim.
- Implementation decisions above are engineering choices within the agreed capacity scope; full backup remains deferred.
- Task 1 complete: seven initial RED failures, cancellation race, snapshot pre-GC protection and root identity checks corrected; 17 new unit cases GREEN. Storage wrapper strongly retained after native WebKit exposed weak-key identity loss.
- Task 2 local verification complete: 16 files / 151 tests, Chromium/WebKit 10 new cases, 8 storage fence cases, build success. Read-only load and current progress use separate pins after a new RED exposed premature release. Independent review / exact-head CI pending.
- Final independent review: no product Critical/Important findings. Test readiness finding regraded as a required-gate correctness issue because a valid conservative GC could otherwise fail CI; all exited-owner scenarios now await native ownership release before collection, with exact row/byte assertions retained. No product change in this pass; no second review. Cost if wrong: test may block on a real ownership leak rather than masking it.
- First CI: product/storage gates succeeded; existing mobile management position test failed at59px because setup's manual save notice expired during measurement (raw trace retained). Stabilize only that test's initial saved UI/notice completion before recording the origin; preserve4px/focus/filters/teams assertions and product code. New exact-head CI required after this test-only follow-up.
- Next CI: management and all product/storage gates passed; the remaining-season test's poll callback dereferenced a transient null while root publication and old-generation cleanup overlapped its read. Raw timestamps show the legitimate conflict. Handle null only in that poll and keep the persisted143 expectation/timeout/retries; no runtime modification.

- #500 merged at main bed66fb2ad1f9e3e4b94e3fdacd8727bece7287d. Exact PR head19c65b6 CI40084084038 all13 jobs succeeded; final metadata is in PR#500.
