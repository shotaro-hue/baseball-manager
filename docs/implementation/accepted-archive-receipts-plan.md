# SAVE-01B-0C — accepted progress archive receipts

> For agentic workers: use superpowers:executing-plans inline, TDD, and one independent whole-branch review.

**Goal:** Bind each accepted regular-season progression to immutable batted-ball bytes through save/load, so a strict reader cannot mix cancelled, ahead-of-root or replacement history into that root.

**Architecture:** A unique run streams bounded chunks into compressed, add-only `save_chunks` rows under a new `batted-ball-version:` prefix. A SHA-256 referenced immutable run node links its chunk refs and previous receipt. Only accepted progress adopts the receipt and projects its rows into the existing mutable analysis archive. A root holds a constant-size `battedBallReceipt`; no archive content is copied into React/root JSON. Existing five stores and DB v4 remain unchanged.

**Tech Stack:** Existing JS/React/Worker, IndexedDB, Web Crypto SHA-256, Vitest/fake-indexeddb, actual Chromium/mobile WebKit. No dependencies.

**Spec:** SAVE-01A #494, section 15.2, head `f77aadfdbb4c283f68322aced2c8ba61fb85c12c`. Existing design authority stays #494. Base main `3599dcbbb0ad6f4af49c6483371bfddc021cff0e` (#497 merged). User requested the next already-described receipt implementation; no new approval round.

## Constraints / decisions

- Keep primary/bk1/bk2, career numeric/string keys, legacy archive and gameplay semantics. Archive failure must not turn a successful main game save into failure; it must remain explicit as archive incomplete.
- Considered: infer by date/gameId/count (cannot prove identity); snapshot all mutable archive at save (can contain cancelled/ahead-of-root data); explicit per-run immutable references (selected per prior design and continue instruction).
- Run data and node JSON get SHA-256. Keys contain `[saveId,runId,kind,index]`; writes use add, and idempotent retry accepts only identical existing bytes. No replacement or cross-save refs. Expected run ID, contiguous chunk indexes and final producer counts prevent accepting a missing/repeated/out-of-order stream as complete.
- Builder check decisions: a child supersedes an ancestor with the same logical batch ID in the effective snapshot; retain both immutable versions but emit the latest once. `coverage` records provenance eligibility, not durability: transient write failure does not permanently poison it. A full strict read alone returns complete. Save-time flush verifies its current head and chunks after pending retries (scope `head`), never claims whole-chain integrity from an empty queue. Full-chain capture always revalidates all references and hashes; it is not a per-autosave scan.
- `battedBallReceipt = {version:1,saveId,coverage:'complete'|'legacy_unverified'|'incomplete',head:null|{key,digest}}`. Only new games start complete/empty. Legacy roots without provenance start legacy_unverified; never infer past ownership. Missing/corrupt data and explicit gaps prevent a strict complete result. New nodes link the prior receipt and retain its coverage.
- New prefix is outside existing chunk GC's deletion allowlist. This conservatively protects accepted, backup and in-flight references, including failed root publication. Accepted versions are retained; archival GC/restore journal integration is deferred, not falsely claimed complete. Cancelled, never-adopted runs may delete only their own unique staged rows. Concurrent run-node seal/discard can leave unreferenced metadata (deferred Minor); cancellation cleanup is best effort. Interrupted-process orphan collection remains deferred.
- Accepted immutable rows also remain after the current deleteSave/legacy archive deletion. Reference-aware reclamation, storage capacity and delete reclamation are explicit next prerequisites; this PR does not claim to free all archived bytes. Stored JSON is LZ-UTF16 compressed using the existing dependency and SHA-256 checks canonical decoded content. The serialized-size test compares against actual normalized legacy rows, not a smaller unsanitized input object; it is not a physical IDB quota measurement.
- DB v4 remains compatible. Old v4 code can still drop a receipt during an old publication; such roots have unknown provenance. New code rejects silent receipt loss for a matching saved identity. Strict readers use only receipt refs and ignore mutable archive replacement/deletion. Universal old-publication fencing remains a separate gate.
- Full ZIP export/import, aggregate reconstruction from a restored receipt, physical iPhone/Files, whole-pipeline memory, v1 freeze and B-1 remain out of scope. New immutable history currently coexists with mutable analysis rows; measure retention/capacity before export release.

## Review focus

1. Same IDs/counts but changed bytes and two different roots must capture their own immutable bytes.
2. Cancel/stale/load while sealing must not adopt or project that run; late chunks cannot be accepted after seal/discard.
3. Missing/invalid stream or failed IDB write must never report complete, while main save can remain successful with archive warning.
4. Receipt survives initial save, reducer adoption, autosave/manual/batch save, load, year changes and new-save reset; matching-save receipt omission is refused.
5. GC, backup rotation and delayed legacy archive deletion must not remove referenced versions; strict reading is read-only, bounded by one chunk's data and rejects cycles/cross-save/hash corruption.

### Task 1 — immutable receipt store and strict reader

Files: new `src/engine/battedBallRun.js` (pure receipt shape + producer), new `src/engine/battedBallReceipts.js` (stage/adopt/retry/discard/read), tiny export of existing batch sanitizer; new `tests/batted-ball-receipts.test.js`.

Interfaces: `emptyBattedBallReceipt(saveId)`, `validateBattedBallReceipt(receipt,saveId)`, `createBattedBallRunEmitter(onChunk,{runId})` → `{add(records),finish():{version:1,runId,chunkCount,recordCount,eventCount}}`; `createBattedBallReceiptRun({saveId,previousReceipt,runId})` → `{append(chunk),seal(summary):Promise<receipt>,adopt(),discard():Promise}`; `flushBattedBallReceipts(receipt?)` → `{ok}`; `readBattedBallReceipt(receipt,{onChunk}?)` → strict `{status:'complete'|'legacy_unverified'|'incomplete',recordCount,eventCount}` or throws on invalid/missing/hash/IDB data. Reader emits latest-run-first chunks, no success before full traversal.

- [x] Add RED tests for immutable same-ID versions, strict parent traversal, absent/legacy provenance, corrupt/missing/cross-save/cyclic refs, bad stream summaries, cancellation and retry after write failure.
- [x] Implement minimal store/producer and run focused GREEN. All mutations use the existing archive lock; never acquire save from archive. Hash outside IDB transactions; reads/transactions close on all paths.
- [x] Commit the tested deliverable (Task1 focused 24/24; initial 6 RED plus ownership/parent-copy RED→GREEN).

### Task 2 — accepted normal/Worker progression and save lifecycle

Files: `src/workers/{singleDayCore,seasonBatchCore,seasonBatchWorker}.js`, `src/hooks/{useSeasonFlow,useGameState,gameStateReducer}.js`, `src/App.jsx`, `src/engine/{saveload,saveDiagnostics,saveFeedback}.js`; existing/new hook/Worker/save integration tests.

Interfaces: Worker START provides `archiveRunId`; emitted chunks carry that run ID and index; core result includes final `archiveRun` summary. Main collector seals before adoption, rechecks baseToken, and adopts/project only after `applyProgressCandidate` succeeds. Both normal result handlers use the same producer/collector. Root state includes `battedBallReceipt`; initial save seeds empty complete provenance, App load explicitly clears missing legacy provenance, year updates retain it. The save queue flushes immutable retry/projection plus existing legacy queue after main save; it reports archive failures. New save validation preserves receipt shape and refuses dropping an existing same-save receipt.

- [x] Observe RED for stale/cancelled Worker chunks becoming active history and for receipt loss in reducer/save payload/load/new-save paths. Add a producer summary test for each real core.
- [x] Integrate all four regular progression routes; preserve existing result/history/farm/save ordering. Invalid/missing producer summary marks incomplete rather than falsely adopting an empty complete archive.
- [x] Run hook/Worker/save/generation/career/farm/delete regression GREEN (26 files / 233 tests) and commit.

### Task 3 — real browsers, required CI and reviewable PR

Files: new `e2e/batted-ball-receipts.spec.js`, dedicated browser config; existing CI/default project list; ROADMAP/CHANGELOG and validation record. Update existing #494 with actual implementation scope.

- [x] Real Chromium/WebKit: two roots with same game/batch identity and different bytes, save/reload/backup selection, missing row failure, legacy projection mutation/deletion isolation, foreign-save protection and staged cancellation. One worker/retry0; JSON under repository test-results. Actual new game→batch→reload→single progression included; 9/9 per browser.
- [x] Build and focused regressions; independent whole-branch review; fix material findings with RED→GREEN. Record retained immutable storage/legacy/memory/device limits.
- [ ] Publish dedicated PR based on exact main, verify source tree and required exact-head CI. No merge/main push/auto-merge.

## Execution ledger

- Ruling: repository plan location and existing #494 authority override new generic design-document locations. The user's continue instruction authorizes the prior chosen approach and inline implementation; don't repeat preference/approval questions.
- Ruling: use existing stores with a dedicated prefix rather than another schema bump. Conservative retention prevents unknown-reference deletion; the cost is duplicate archive bytes and deferred crash-orphan reclamation, which remain release gates.
- Ruling: SHA-256 is computed at staging, outside synchronous simulation cores. Producer run IDs/indexes/final totals bind the delivered stream; the main stage fixes immutable byte identity. This is consistency checking inside a trusted app, not an authenticated message protocol.

Final review: three Important findings (older projection retry rollback, StrictMode lifecycle, pre-adoption normal effects) reproduced RED and fixed in one pass. One Minor concurrent seal/discard metadata orphan is deferred to reference-aware GC; see validation for user impact and all review scope rulings. No second review.
