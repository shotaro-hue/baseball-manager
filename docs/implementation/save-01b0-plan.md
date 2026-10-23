# SAVE-01B-0 implementation plan

> For agentic workers: use superpowers:executing-plans to execute and verify each task in this session.

**Goal:** Establish executable evidence for portable-backup risks before freezing SAVE-01A or adding game-facing backup UI.

**Architecture:** Keep all prototypes under `scripts/save-01b0/`, outside the game import graph. Characterize current production storage with isolated fixtures, then exercise proposed locking, journal recovery and bounded-entry ZIP output against real browser APIs. Publish evidence and explicitly leave real-iPhone/peak-memory and production integration gates open.

**Tech stack:** Existing Vitest/fake-indexeddb, Playwright Chromium/WebKit, pinned development-only fflate, Python zipfile as an independent ZIP oracle.

**Spec:** [SAVE-01A at reviewed commit 03cd445](https://github.com/shotaro-hue/baseball-manager/blob/03cd445bb1bee3065684abc781bcd153938f514a/docs/implementation/save-01a.md).

## Global constraints

- Start at main `7dc29c0809526ce937e9948b9a0940c7287dc38d`; keep #494 open and update its workflow condition separately.
- Do not change production code, save schema or existing game data. Probe journal/rows/primary have their own namespace; fixtures never access a user's save.
- No main push, merge, auto-merge or claim of real-iPhone success.
- A capacity fixture is not years of simulated gameplay; browser throughput is not peak-memory evidence.
- B-0 prototypes do not establish that existing/old tabs participate in proposed locks or that archive data matches an old root.

## Review focus

1. Same batch ID and count can conceal a content replacement across tabs.
2. Legacy numeric/string player IDs can collide with the destination's global career store.
3. Termination after primary publication but before Promise completion must be recognized from real primary; this prototype has no phase-update operation.
4. A stale rollback must never overwrite a newer primary; failed stages must not destroy pre-existing rows.
5. Async ZIP generation must finish before an explicit new share tap; cancellation and unsupported sharing must remain retryable.

## PR #495 review follow-up (2026-10-23)

Scope: the user's review-fix specification; keep the existing PR and #494 design authority. Execute inline without changing production storage/UI. The existing protocol has **no phase-update operation**: interrupt after primary publication but before function completion, and classify using actual primary plus the unchanged `verified` journal.

- [x] Recovery: add `publishProbeRestore({ afterPrimaryPublished })`, a probe-only barrier after setItem; first add a failing unit test proving the promise is still pending at that boundary. Replace the close-after-completion browser test with a real interrupted promise. Cold-page assertions cover real primary, journal, explicit rollback, unrelated rows and another tab's newer primary.
- [x] Locks: both pages call `withProbeSnapshot(task)`; inspect granted/pending lock names, then release the barrier and verify order. Cover synchronous throw followed by later peer/same-page progress, and async rejection with a waiting page. Demonstrate archive→save inversion with abortable raw Web Locks; abort the inverted waiter and verify forward progress. The common helper always acquires save→archive; it cannot protect nonparticipating/old tabs or callers holding raw locks.
- [x] CI: reproduce the missed `mirror+file:/etc/apt/apt-mirrors.txt` indirection with a fixture test, then replace only Ubuntu archive URIs while retaining suites/signatures/signing settings/timeouts/retries. Record the original 30-minute dependency-install timeout and failed aggregate gate separately from product/test failures.
- [x] Run npm ci, focused Vitest (21 probe / 23 with CI cases), complete probe E2E (Chromium 14/14, mobile WebKit 14/14), build, and update browser evidence. Independent review found no Critical/Important/Minor findings; self-review preserves the page-close/power-loss distinction.

Final gate: execute the full local Vitest suite and require every exact-head CI job to succeed; the final outcome and immutable SHA are recorded in [PR #495](https://github.com/shotaro-hue/baseball-manager/pull/495). Feed these results and remaining product/device gates into #494. No new PR, main push, merge, format freeze or product-completion claim. A cancelled/skipped test job cannot satisfy this gate.

## Task 1 — Characterize current storage

- [x] Add `tests/save-01b0-storage.test.js`: characterize root-before/archive-after mismatch, strict source reads, and legacy v3–v5 career capture using real production functions without writing destination career keys.
- [x] Add browser characterization of a second tab overwriting the same archive batch while the save Web Lock is held.
- [x] Verify `npx vitest run tests/save-01b0-storage.test.js` and the focused browser cases; store evidence under `docs/validation/save-01b0/`.

## Task 2 — Isolated locking and interrupted-publication probe

Files: `scripts/save-01b0/journal.js`, `scripts/save-01b0/locks.js`, `tests/save-01b0-journal.test.js`, `e2e/save-01b0.spec.js`.

Interfaces: `withProbeSnapshot(task)` obtains save then archive Web Locks. `prepareProbeRestore(payload)` writes an owned stage/journal in a separate probe DB. `publishProbeRestore()` compares current primary and verifies staged bytes before one probe-primary setItem. `inspectProbeRestore()` classifies none/unpublished/published/conflict/invalid. `rollbackProbeRestore()` compares expected primary under the same locks before restoring the old probe primary. `discardProbeStage()` removes only owned unpublished probe rows.

- [x] Write tests first: unpublished cleanup, published-with-unchanged-verified-journal cold reopen, tampered stage, absent old primary, conflict, cancellation and rollback CAS.
- [x] Run the tests RED, then implement the minimal probe and verify GREEN with real fake-indexeddb transactions.
- [x] Browser tests now close a publisher with a pending post-primary barrier, then use a cold page. Both competing pages call the common helper; inversion and exception release are explicitly covered.

## Task 3 — ZIP output and explicit handoff probe

Files: `scripts/save-01b0/zip.js`, `scripts/save-01b0/index.html`, `scripts/save-01b0/ui.js`, `tests/save-01b0-zip.test.js`, focused browser config and evidence runner.

Interfaces: `createProbeZip({entries, signal, onProgress})` consumes an async sequence of fixed-path entries, each <=256 KiB, and returns a ready File plus byte/count/time measurements. ZIP is a probe format with per-entry SHA-256 and a manifest, not the frozen game backup schema. `handoffProbeFile(file)` invokes supported native share from a later click; unsupported sharing exposes a download and cancellation preserves the ready file.

- [x] Tests RED: roundtrip hashes, duplicate/unsafe path rejection, oversized entries, cancellation, output budget and fixed-size incompressible fixture.
- [x] Pin fflate as a dev dependency, implement bounded per-entry output to Blob parts, then verify GREEN. Never call whole-ZIP unzip in the browser probe.
- [x] Use Python zipfile and hashlib to independently validate the browser-downloaded file, including every manifest entry.
- [x] Run Chromium/WebKit at 390px, share-cancel/unsupported cases and 1/16/64 MiB synthetic capacity output. Report actual sizes/times and unavailable memory metrics honestly.
- [x] Run production build and full Vitest suite; include the new focused E2E in CI without weakening existing gates.
- [x] Write measured findings, library tradeoffs, next decisions and real-iPhone checklist. Create an independent draft PR from main, feed its concrete results into #494, leave release/spec-freeze blocked by unverified gates.
