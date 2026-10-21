# Offseason save failure implementation plan

> **For agentic workers:** Use superpowers:executing-plans. User has authorized implementation and CI, without merging or starting SAVE-01A/B.

**Goal:** Diagnose the reported 2026 iPhone Safari planning save failure, correct reproduced defects, and preserve recoverable saves.
**Architecture:** Keep generation, locking and backup guarantees. Add bounded local diagnostics to real failures and persistent feedback to the existing planning UI; identify any root-cause fix from actual progression evidence.
**Tech Stack:** React, localStorage, IndexedDB, Web Locks, Vitest, Playwright.
**Spec:** PR #490 issuecomment-6312036017 and the 2026-10-21 user request.

## Constraints
- Base main `46d75e21b1f6e27c0f60274a38cd7619a80d951d`; PR #490 races are a separate existing-PR update.
- Do not clear roots/backups, disable locking, hide errors, change save format, merge, or implement SAVE-01A/B.
- No save payload, player data, identifiers or arbitrary exception messages in structured diagnostics.
- WebKit emulation is not physical iPhone Safari verification.

## Review focus
- Quota or storage denial retains all committed roots and supports retry.
- IndexedDB abort settles failure and allows the next request.
- Rejected lock acquisition exposes a reason rather than an unexplained rejection.
- Autosave/manual overlap must not misreport stale success or clear dirty changes.
- Persistent reason must survive notification expiry and clear after real success.

## Tasks
1. Reproduce: generate a seeded real 143-game season with farm synchronization, then use the real postseason/retirement/planning UI. Record reason, root sizes and reload state. If actual-device failure remains unreproduced, say so.
2. Diagnostics: `tests/save-diagnostics.test.js` first RED; annotate failure boundaries in `src/engine/saveload.js` using `src/engine/saveDiagnostics.js`. Verify privacy, retained roots and retry GREEN.
3. UI: focused RED tests for `PlanningSaveStatus` and `saveFeedback`; persist reason/unsaved risk/retry, preserving actual commit status. Browser tests at 360/390/1440.
4. Root cause: only implement fixes supported by reproduction, with RED→GREEN and real save/reload. Record unresolved actual-device uncertainty.
5. Verify: focused Vitest, relevant browser tests, build, independent review, then separate PR and exact-head normal CI. Stop at review-ready without merge.
