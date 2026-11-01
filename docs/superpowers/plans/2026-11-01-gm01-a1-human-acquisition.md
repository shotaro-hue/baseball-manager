# GM-01 A1-2a-2 Human market acquisition implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Implement this authorized slice with TDD and a fresh independent whole-branch review.

**Goal:** Human market offers, cancellation, replacement and replies persist atomically with annual reservations, acquisitions and receipts.

**Architecture:** A versioned acquisition decision delegates financial/roster admission to the existing annual transaction engine. Renewal and acquisition share reply-clock semantics and an explicit due scheduler. Human handlers reuse the acknowledged save/adoption boundary; annual market routes use saved decisions rather than the legacy immediate-signing wallet.

**Tech Stack:** Existing React, Vitest, Playwright, generation storage; no dependency additions.

**Spec:** `docs/superpowers/specs/2026-10-30-gm01-a1-integration-design.md`, sections 4.1–4.4 and 5; parent integration plan Task 5.

## Scope and constraints

- Baseline main `e26d4f2664a56052fbd71161c239032f672006af`, #530 merged; no other open PR at start. Dedicated branch; no main push or merge.
- This is the next human market slice, not completion of all A1-2a. Public annual gate stays OFF. CPU, market generation/departures, day/Worker progression, spring joining, compensation selection UI, activation/storage fence remain later stages.
- Only explicitly classified market candidates can receive formal offers; unknown legacy entries stay visible without guessed classification/rank. Existing A/B compensation basis and reserve checks apply; accepted offseason players remain pending spring entry, including unresolved compensation obligations.
- Guaranteed integer annual salaries; maximum three years, development acquisitions one year. No new incentive or opt-out clauses.
- Agent implementation choice within approved direction: reuse salary demand/minimum consent and deterministic overall evaluation, frozen at offer; no global random draw. Two/three/four day/turn reply bands match new renewals. No later reevaluation.
- Civil-date registration closes after July 31. August 1 expires all outstanding in-season acquisitions even if their reply date is later. Renewals retain their own dates. Offseason offers stop after turn 30; replies stop after turn 37.
- Cancellation/replacement only before due/expiry; replacement cancellation and new reserve form one unpublished candidate and one save. Failed replacement preserves original offer.
- Save success AND React adoption precede UI success. Retry/recovery uses stable identities. Preserve legacy behavior and block unconnected annual phase advancement.

## Review focus

1. Changed market membership/metadata, slots or budget at reply must invalidate safely without erasing history.
2. Unknown candidate data and unsupported clauses must fail closed, never enter legacy wallet handlers.
3. Fixed answers/deadlines and receipt evidence must survive mail deletion, reload, failed write and replay.
4. Replacement failure, stale callbacks, acknowledgement interruption and mixed renewal/acquisition batches must remain atomic.
5. UI must distinguish drafts, saved promises and accepted spring arrivals, with correct values after selection/reload.

## Task 1: Pure acquisition promises and shared due scheduling

Files: new `src/engine/acquisitionDecisions.js`, `decisionClock.js`, `economyDecisions.js`, fixture and `__tests__/acquisitionDecisions.test.js`; modify renewal timing import and economy persistence validation.

Interfaces: `acquisitionRequest(world, action)`, `reduceAcquisitionRequest(world, request)`, `dueAcquisitionDecisions(world)`, `validateAcquisitionDecisions(world)`, `advanceEconomyDecisions(world, request)` returning `{ok,world,replayed,error}`. Actions `offer` (playerId, salary, years, optional replaceProposalId), `cancel`, `resolve-due`. Shared clock helper preserves renewal v1/v2 timing.

- [x] RED: July 1 acceptance charges 5000/10000/10000; July 31 accepts, August 1 expires acquisitions while accepting renewals; offseason pending arrival; salary floor, fixed results, due boundaries, replacement rollback, identity and receipt tampering.
- [x] Implement pure lifecycle, snapshot validation and immutable save-history extension.
- [x] GREEN: new lifecycle plus annual acquisition/renewal/compensation/save migration tests; commit.

## Task 2: Acknowledged human handlers and annual market routes

Files: `useGameState.js`, `useOffseason.js`, new `useOffseason.economyAcquisition.test.js`, `AnnualMarketTab.jsx` and test; `HubContentRouter.jsx`, `OffseasonFaPhaseScreen.jsx`.

Interfaces: `commitAcquisitionRequest(request,sessionToken)`, `commitDueEconomyRequest(request,sessionToken)`; human `handleAcquisitionOffer`, `handleCancelAcquisition`, `handleResolveEconomyDecisions`. Annual route calls these; legacy route unchanged.

- [x] RED: root/world preservation on failed save, duplicate/stale callback, cold reload, due retry, ack recovery; UI awaits success, keeps draft, shows saved terms and history, unknown data blocks contracts.
- [x] Implement handlers and annual view with shared management components and budget table.
- [x] GREEN: focused hook/UI and existing market/renewal routes; commit.

## Task 3: Browser verification, review and PR

Files: test-only real DOM harness, existing CI `e2e/save-generations.spec.js`, validation evidence under `docs/validation/gm-01-a1-human-acquisition/`.

- [x] Browser save failure/retry/cold reload/answer/ack recovery with actual hooks and storage; Chromium/WebKit, 360/390/1440px before/after and overflow.
- [x] Build and affected regressions; fresh independent review of whole branch and adjacent contract pipeline; resolve material findings.
- [ ] Create PR from dedicated branch and verify final HEAD CI. Report exact SHA, tests, limits and merge readiness; do not merge.
