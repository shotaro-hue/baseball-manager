# PR #549 review fixes

> Execute inline with RED → minimal fix → GREEN. Independent reviewers inspect the FA and persistence/posting paths in separate contexts.

**Goal:** Update existing PR #549 onto merged #548 and resolve verified review findings without changing saved history.

**Spec:** User's PR #549 review request; `../specs/2026-11-05-unified-eligibility-design.md`.

**Constraints:** No new PR, main push, merge, auto-merge, history rewrite, deleted/skipped/weakened tests, schema/gate changes or unrelated refactoring. Preserve RNG, contracts, budgets and historical certificates.

## Tasks

- [x] Inspect remote HEAD/main/CI/comments and merge main without rewriting history. Confirm identical pre/post merge trees and #549-only diff.
- [x] Reproduce duplicate-import parser failure; remove only duplicate; rerun posting tests/parser.
- [x] Add failing engine/UI tests for official domestic rights with estimated overseas balance, Japanese/foreign overseas rights and acquired-state display. Separate qualification evidence from day evidence. Preserve old v2 declaration certificates with a historical projection; test a frozen pre-fix real reducer output, JSON reload/replay and tamper rejection.
- [x] Add failing player detail tests for fixed proStartYear and completed-season professional years, independent of serviceYears. Show basis and explicit completed year; current season is not counted before completion. Keep the existing contract layout and development/free-contract states.
- [x] Verify any independent-review findings by reproduction, then RED → minimal fix → GREEN.
- [ ] Run relevant regressions/build/browser checks at 360/390/1440px; independent final diff review. Update only this PR branch and description, wait for exact-HEAD CI and report remaining limits.

## Review focus

143-day schedule boundaries, traded/deregistered/development players and fractional carry; consumed rights and 580-day reacquisition; old v1/v2 immutable snapshots; failed-save/retry/recovery; completed-season posting count and UI caller consistency.

## Evidence ledger

- Baseline PR HEAD `600bb27bd15c5afd92bd944316288b1c1037d975`, main `377987a8fa9ed4a26ca20420d31108bf198e6583`; merge `3f9be84310e4581a888e50c4254dfc44a04af215` changes no tree. Main diff is the 62 PR-only files. Initial CI #687 successful; remote comments/reviews/threads empty.
- Baseline focused tests: 3 files / 59 tests passed. Duplicate import survives Vitest's transformer, so native parser is the reproducer.
- Implementation choice: preserve already-published FA certificate shapes rather than rewrite receipts. Explicit evidence version distinguishes corrected day provenance from frozen v2 provenance.
- Implementation choice: show professional years with its completed-season year, separate from tenure. Explicit offseason callers provide the ended season; regular-season callers use the prior season.
- Additional review fixed: serviceYears-only consumed FA history, inline full-history migration order and generation-v6 archive context. Each had a failing reproduction before its production fix. Latest relevant save/migration suite: 174 passed.
- Final visual/browser verification: 19 existing Chromium detail cases; 3 new Chromium + 3 new WebKit cases pass, without retries. Overseas text is scrolled into view and checked visible. Same-state before/after captures at 360/390/1440px are in `docs/validation/unified-eligibility/pr549-review/`.
- Local full suite: 4,283 passed / existing 2 skipped; subsequently added four save-load tests pass in the final focused suite. Final-HEAD CI remains the complete final gate. Latest build passed; only existing bundling warnings. No deferred minor findings. Keep the existing signed-season model and history-authenticity boundary documented in the review record.
