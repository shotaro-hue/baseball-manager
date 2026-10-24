# Archive retry ordering and save isolation

> Use superpowers:executing-plans inline, TDD, and one independent final review.

**Goal:** A delayed retry must never replace newer accepted analysis data, and another save's failed projection must not make this save report archive failure.

**Architecture:** Keep existing immutable receipts, stores and locks. Fix ordering at the shared mutable archive queue, where both receipt projection and legacy retry meet. Scope queue failure/status queries and save-time retry by saveId; default callers retain whole-queue behavior. No permanent per-batch version map or new storage schema.

**Tech Stack:** Existing JavaScript, React, IndexedDB, Vitest/fake-indexeddb and Playwright.

**Spec:** Follow-up to #498 review, accepted by the user's “進めて”. Base main `a7883f90a8c410267d1c688169ab59c828c35496`. Preserve main save success, strict immutable capture, unrelated saves and retryable failed bytes. GC/capacity/export/import and gameplay changes remain separate.

## Review focus

- Old failure retried during a replacement's active write must leave the replacement and aggregate current.
- A failed active write must not override a newer already-queued replacement.
- Unrelated failed batches must remain retryable without poisoning the current save's status.
- Save-time reporting must distinguish own projection failure from another save's failure, including successful repair during the same save.
- Existing default queue callers, delete/lock behavior and immutable ancestors must remain compatible.

### Task 1 — ordered queue and save-scoped reporting

Files: `src/engine/battedBallArchive.js`, `src/engine/battedBallReceipts.js`, `src/hooks/useGameState.js`; `tests/batted-ball-receipts.test.js`, focused queue tests and hook tests.

- [x] Add real fake-IDB regressions with controlled archive-lock grant: failed 140 → active 180 → legacy retry must retain 180; old active failure plus queued replacement must preserve the replacement. Observe RED.
- [x] Add foreign projection failure / successful current save and own failure regressions. Observe RED without weakening old expectations.
- [x] Implement queue ordering and optional saveId-scoped queue status/retry; update receipt/save consumers. Run focused archive/save regressions GREEN and commit.

### Task 2 — CI failure and verification

- [x] Reproduce the failed main unit/integration gate locally if CI logs remain unavailable; identify cause before changing it. Keep unrelated failures explicit.
- [x] Run relevant browsers/build; one independent branch review, one material-fix pass if needed. Chromium verified; local WebKit blocked by missing host libraries, required CI remains pending.
- [ ] Publish a dedicated PR from the verified main tree, inspect exact-commit CI, update ROADMAP/validation. No merge, auto-merge or save deletion.

Execution decisions: existing isolated worktree reused on a new branch from actual main. User's approved follow-up scope and repository rule against repeat approvals permit direct inline execution; no additional design/preference gate. Repo tiered validation takes precedence over duplicating whole suites locally and in CI. The plan itself records execution progress.

Execution ledger: Task 1 complete after RED→GREEN for both rollback orders and foreign/own repair, plus transactional abort after browser-discovered partial commit. Baseline suite had one deterministic diagnostic run-ID comparison failure; same explicit ID restores all six diagnostic assertions. Independent final review of `a7883f9..7bb53c5` found one P2: legacy null-receipt saves still flushed foreign jobs. The real hook case failed first; explicit saveId scope now reaches receipt flushing as well. One fix pass, no re-review. Final focused unit/browser/build evidence and exact-commit CI are recorded in validation/PR. Deferred reviewer scope: preservation/GC, old-root reconstruction, old-writer fencing, export/import, capacity and devices remain outside this repair; shipping costs are unchanged conservative storage retention and unfinished complete restore. No new deferred minor.
