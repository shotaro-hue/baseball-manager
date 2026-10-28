# GM-01C-2C-FIX Duplicate Rookie Integrity Plan

> **For agentic workers:** Use superpowers:executing-plans in this session; TDD followed by a fresh independent whole-branch review.

**Goal:** Refuse ambiguous rookie attributes without rejecting equivalent duplicates or stale lottery history.

**Architecture:** Keep evaluateRosterCapacity's assignment/class/ownership validation authoritative. At the opt-in acceptedRookie boundary, compare only records that independently pass that existing validation. No candidate-level revision/provenance exists to select newer attributes. Compare all data inherited at join, excluding assignment history and fields replaced by the agreed contract.

**Tech Stack:** Existing JavaScript, Vitest and GitHub Actions; no dependency changes.

**Spec:** User's GM-01C-2C-FIX instruction for PR #510, plus `docs/superpowers/specs/2026-10-28-gm01c2c-rookie-design.md`.

## Global Constraints

- Add commits to existing PR #510, starting at d4385d1c0de305f9fa5525036e68477714280001. No new PR, merge, auto-merge, direct main push or history rewrite.
- Preserve accepted owner/class, minimum salaries, 70 controlled places, funding, exact contract terms, decline and JSON replay guarantees.
- No live hook, CPU/Worker, rollover, migration, UI or balance changes. The known annual E2E retirement-dialog issue remains out of scope.
- Preserve all existing tests and expectations.

## Review Focus

- Assignment-invalid stale duplicates must never veto a legitimate final pick.
- Equal nested objects with different key insertion order must remain equal after JSON round-trip.
- Both development-flag representations and agreed-contract overrides must not create spurious ambiguity.
- Retirement, identity, role, potential, injuries, traits, history and new player fields can affect joined players just as abilities do.
- A new conflict introduced after reserve or quote must reject the entire operation without consuming funding or receipts.

### Task 1: Reproduce and guard ambiguous accepted rookie data

**Files:** Modify `src/engine/annualTransactions.js`, `src/engine/__tests__/annualRookieTransactions.test.js` and the existing rookie design/validation documents. Read `src/engine/rosterCapacity.js` without changing production capacity behavior.

**Interfaces:** Existing reserve-rookie, decline-rookie, join-rookie quote/apply commands; no new state or public command fields.

- [x] Add failing tests for 50/80 abilities in both orders and classes, at reserve and join; cover inherited non-ability fields and all-state nonmutation.
- [x] Run `npx vitest run src/engine/__tests__/annualRookieTransactions.test.js`; confirm assertion failures on previously admitted ambiguous candidates. RED: 66 failed, 54 passed.
- [x] Add the smallest guard at acceptedRookie using per-record evaluateRosterCapacity validation and stable inherited-attribute comparison.
- [x] Run the same tests GREEN, including equivalent/normalized duplicates, canonical assignments with stale lottery snapshots, JSON once-only lifecycle and post-quote revalidation. GREEN: 120 passed; related 14 files / 445 passed.
- [x] Run related transaction, spending, ledger and capacity regression files; run production build and diff check. 445 passed; build/diff check succeeded; 44 production assets unchanged by SHA-256.
- [ ] Commit and update the existing PR branch. Independently review the latest SHA; run the full unit/integration suite and all required browser jobs in exact-head CI. Report all findings and limits without merging.

## Pre-flight and decisions

- Single task; no shared task interfaces. Existing clean checkout is already on the requested PR branch, so reuse it rather than branching from main.
- The user's instruction explicitly authorizes implementation through push/CI; proceed without another design approval.
- Keep shared capacity's public behavior unchanged: the new integrity check applies only to opt-in rookie operations, avoiding live feature activation.
