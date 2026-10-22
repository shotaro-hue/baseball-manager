# Save Capacity Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User explicitly authorized design, implementation, tests and PRs without stopping at investigation; execute inline.

**Goal:** Preserve recoverable games while removing large root bodies from localStorage.
**Architecture:** Immutable verified IndexedDB root bodies plus small atomic localStorage references, retaining existing generation and locking rules.
**Tech Stack:** React, IndexedDB, localStorage, LZString, Vitest, Playwright Chromium/WebKit.
**Spec:** `docs/superpowers/specs/2026-10-22-save-capacity-design.md`

## Global Constraints
- Never delete/initialize user saves, directly push main, or merge automatically.
- Preserve legacy roots, all backup dependencies and origin-wide locks.
- Report physical iPhone Safari as untested.

## Review Focus
- Missing/corrupt body must recover its own backup history.
- Aborted body write/readback must retain every old root.
- GC must protect pointers and reused history generations.
- Cold-tab loads/deletes must preserve existing epoch/conflict behavior.
- Diagnostics must remain safe with arbitrary secret-bearing input and denied clipboard/storage.

## Tasks

### 1. Capacity reproduction and body references
Files: `src/engine/saveRootBodies.js`, `src/engine/saveload.js`, `src/engine/saveGenerations.js`, `tests/save-capacity.test.js`, `e2e/save-capacity.spec.js`.
Interfaces: `prepareRootBody(raw): Promise<string>`, `readRootBody(raw): Promise<string>`, `rootBodyKey(raw): string|null`.
- [ ] Write quota/large-body test and run against main (RED).
- [ ] Write immutable body/abort/corruption/GC tests and observe RED.
- [ ] Implement staging, independent readback, async root decoding, safe rotation and GC.
- [ ] Run focused generation/delete/career regressions and both browser engines (GREEN).

### 2. Safe diagnostic copying
Files: `saveDiagnostics.js`, `SaveDiagnosticDetails.jsx`, `HubHeader.jsx`, `OffseasonPlanningScreen.jsx`, tests.
Interface: `collectSaveDiagnostics(result): Promise<object>` returns whitelist-only data; reusable component exposes copy and selectable fallback.
- [ ] Write privacy/copy tests (RED), implement numeric store breakdown and screen access (GREEN).
- [ ] Check 360/390/1440px and clipboard-denied fallback.

### 3. Long-term verification and delivery
Files: measurement script, validation report, CI browser matrix, ROADMAP.
- [ ] Generate 2026 Hanshin 106-game data using production simulation and 10/20-year equivalent history; measure and hash restored fields.
- [ ] Run unit suite, build, pertinent Chromium/WebKit browser regressions, independent whole-branch review.
- [ ] Create separate design and implementation PRs, inspect exact-head CI, document remaining risks and iPhone procedure.
