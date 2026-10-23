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
3. Termination after primary publication but before journal phase update must be recognized from real primary.
4. A stale rollback must never overwrite a newer primary; failed stages must not destroy pre-existing rows.
5. Async ZIP generation must finish before an explicit new share tap; cancellation and unsupported sharing must remain retryable.

## Task 1 — Characterize current storage

- [x] Add `tests/save-01b0-storage.test.js`: characterize root-before/archive-after mismatch, strict source reads, and legacy v3–v5 career capture using real production functions without writing destination career keys.
- [x] Add browser characterization of a second tab overwriting the same archive batch while the save Web Lock is held.
- [x] Verify `npx vitest run tests/save-01b0-storage.test.js` and the focused browser cases; store evidence under `docs/validation/save-01b0/`.

## Task 2 — Isolated locking and interrupted-publication probe

Files: `scripts/save-01b0/journal.js`, `scripts/save-01b0/locks.js`, `tests/save-01b0-journal.test.js`, `e2e/save-01b0.spec.js`.

Interfaces: `withProbeSnapshot(task)` obtains save then archive Web Locks. `prepareProbeRestore(payload)` writes an owned stage/journal in a separate probe DB. `publishProbeRestore()` compares current primary and verifies staged bytes before one probe-primary setItem. `inspectProbeRestore()` classifies none/unpublished/published/conflict/invalid. `rollbackProbeRestore()` compares expected primary under the same locks before restoring the old probe primary. `discardProbeStage()` removes only owned unpublished probe rows.

- [x] Write tests first: unpublished cleanup, published-but-phase-not-updated cold reopen, tampered stage, absent old primary, conflict, cancellation and rollback CAS.
- [x] Run the tests RED, then implement the minimal probe and verify GREEN with real fake-indexeddb transactions.
- [x] Browser tests use a newly created page after closing the publisher, and two pages to show a participating archive writer waits behind a snapshot lock.

## Task 3 — ZIP output and explicit handoff probe

Files: `scripts/save-01b0/zip.js`, `scripts/save-01b0/index.html`, `scripts/save-01b0/ui.js`, `tests/save-01b0-zip.test.js`, focused browser config and evidence runner.

Interfaces: `createProbeZip({entries, signal, onProgress})` consumes an async sequence of fixed-path entries, each <=256 KiB, and returns a ready File plus byte/count/time measurements. ZIP is a probe format with per-entry SHA-256 and a manifest, not the frozen game backup schema. `handoffProbeFile(file)` invokes supported native share from a later click; unsupported sharing exposes a download and cancellation preserves the ready file.

- [x] Tests RED: roundtrip hashes, duplicate/unsafe path rejection, oversized entries, cancellation, output budget and fixed-size incompressible fixture.
- [x] Pin fflate as a dev dependency, implement bounded per-entry output to Blob parts, then verify GREEN. Never call whole-ZIP unzip in the browser probe.
- [x] Use Python zipfile and hashlib to independently validate the browser-downloaded file, including every manifest entry.
- [x] Run Chromium/WebKit at 390px, share-cancel/unsupported cases and 1/16/64 MiB synthetic capacity output. Report actual sizes/times and unavailable memory metrics honestly.
- [x] Run production build and full Vitest suite; include the new focused E2E in CI without weakening existing gates.
- [x] Write measured findings, library tradeoffs, next decisions and real-iPhone checklist. Create an independent draft PR from main, feed its concrete results into #494, leave release/spec-freeze blocked by unverified gates.
