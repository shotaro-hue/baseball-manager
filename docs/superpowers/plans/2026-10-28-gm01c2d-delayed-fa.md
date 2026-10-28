# GM-01C-2D Delayed FA Replies Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session; use TDD and one fresh whole-branch review at the end.

**Goal:** Accept a same-year FA offer on a later day without backdating payroll, rewriting offered terms, or bypassing current admission checks.

**Architecture:** Preserve the original proposal and record an optional acceptedProposal in the existing resolution. Reuse the contract ledger for actual payroll and annualSpending assessment for all affected years; annualTransactions derives acceptance date from state.

**Tech Stack:** Existing JavaScript modules / Vitest; no dependency or CI changes.

**Spec:** `docs/superpowers/specs/2026-10-28-gm01c2d-delayed-fa-design.md`

## Global Constraints

- Base main `daddaf8a17f14e533ce290e1ec20ec0d74640779`; one PR; no main push, merge or auto-merge.
- Same-year preseason/season acquisitions only; registration deadline July 31; existing 420万円 minimum and maximum three-year FA term remain.
- All offered terms and original identities remain unchanged; only the accepted effective date advances. Existing same-day histories stay compatible.
- Quote/failure do not mutate input; replay stays once after JSON round-trip; no live adoption, old-save migration, UI, calibration or actual-device claim.

## Review Focus

- An acceptedProposal must not become a way to rewrite salary, term, club, player, guarantee or classification in accepted histories.
- An acceptance delayed across a month or from preseason to season must use the response date without extending expiry or modifying prior payroll.
- Current cap changes, competing offers and unrelated rookie/renewal holds must be rechecked without blocking legitimate loser cancellation in deficit.
- Source proposal IDs, contract IDs and transaction IDs must survive JSON replay and cannot revive a cancelled/lost bid.
- Date/phase regression, registration deadline and current roster ownership must be enforced even after a successful quote.

### Task 1: Preserve original offers while settling later payroll

**Files:** Modify `src/engine/annualSpending.js`; create `src/engine/__tests__/annualDelayedFaSpending.test.js`.

**Interfaces:** Extend `commitContractReservation(plan, proposal, {effectiveDate} = {})`. The original proposal remains the reservation identity; delayed FA resolutions add `acceptedProposal`, which must differ only by a later effectiveDate in the same startSeason and match the sign record. Existing two-argument behavior remains unchanged.

- [x] Add tests for July 1→16 (10000万円×3年: 5000留保→4516確定 in 2026, 10000 in 2027/28), month crossing, original/actual histories, legacy same-day shape, JSON replay and forged/missing/rewritten acceptance metadata.
- [x] Add tests rejecting earlier/invalid/next-year/after-deadline dates, retiming rookies/renewals, changed terms and insufficient future budget; verify input is unchanged. Protect competitor loss and unrelated holds.
- [x] Run `npx vitest run src/engine/__tests__/annualDelayedFaSpending.test.js`; record feature-missing RED.
- [x] Implement the narrow settlement projection, history validation, replay and immutable history comparison. Reuse ledger admission and assessment.
- [x] Run the new file plus existing annualSpending/contractLedger tests; expect all GREEN. Commit Task 1.

### Task 2: Route FA replies through the current transaction date

**Files:** Modify `src/engine/annualTransactions.js`; create `src/engine/__tests__/annualDelayedFaTransactions.test.js`; update `SPEC.md`, `ROADMAP.md`; add `docs/validation/gm-01c-2d/README.md`.

**Interfaces:** Existing `offer-fa`/`accept-fa`/`cancel-fa`; acceptance calls Task 1 with state.date. Allow forward preseason→season replies in the same year, preserving submitted contract terms; keep offseason routing closed.

- [x] Add behavior tests for delayed current-year payroll, cross-month and phase replies, July 31/ August 1 boundaries, cancellation, roster/current ownership/retirement/class/cap/requirements changes after quote, unrelated holds, losing bids and exact-once JSON replay.
- [x] Run `npx vitest run src/engine/__tests__/annualDelayedFaTransactions.test.js`; record same-day-only RED.
- [x] Implement offer-vs-reply date/phase validation and derive actual effectiveDate solely from trusted state; preserve market placement and all-year assessment.
- [x] Run both new files and annualTransactions/development/renewal/rookie/spending/ledger/capacity regression files; expect all GREEN. Build, diff-check and document the exact evidence and limits. Commit Task 2.
- [ ] Request a fresh whole-branch review against the spec/plan; fix material findings with RED→GREEN and related regressions. Publish one PR and confirm exact-head CI including existing browser groups. Stop before merge.

## Pre-flight and rulings

Task 2 consumes Task 1's optional effectiveDate and acceptedProposal history; no other shared interface changes. Fresh clone is this task's isolated checkout, with a dedicated feature branch and no user changes. Existing autonomous PR scope supplies execution authorization; do not repeat design/plan approval.
