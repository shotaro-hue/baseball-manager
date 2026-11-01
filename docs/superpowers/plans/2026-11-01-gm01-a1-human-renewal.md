# GM-01 A1-2a-1 Human renewal integration

> **For agentic workers:** Use superpowers:executing-plans. Implement this authorized slice with TDD and one independent whole-branch review.

**Goal:** An annual fixture can submit, replace, cancel and resolve a human renewal through the acknowledged save boundary, without changing the current salary or losing a pending promise when display mail is removed.

**Architecture:** Pure renewal actions reuse the existing annual transaction engine. A versioned decision records the fixed evaluation and civil-date/turn deadline alongside its reservation. The existing hook commit/recovery pipeline persists and adopts the complete result once. A small annual-only contract view uses these handlers; legacy views retain their behavior.

**Tech Stack:** Existing React 18, Vite, Vitest, Playwright and generation saves; no added dependency.

**Spec:** `docs/superpowers/specs/2026-10-30-gm01-a1-integration-design.md`, sections 4.2–4.4 and 5; parent Task 5.

## Scope and constraints

- Baseline main `cb2eea56ddf115e1a1f610719eaba593c4a5c66d` (#529 merged); no open PR at start.
- This completes the first human-renewal slice, not all A1-1d or A1-2a. FA, CPU/Worker/day progression, annual rollover, activation anchors and storage fences remain later work. Release gate remains OFF and standard player data is unchanged.
- Existing approval to proceed and the parent design settle the direction. Implementation choices below are agent decisions, not new user requirements.
- New terms remain guaranteed, begin next February, and reserve every affected year. New incentives/opt-out clauses are rejected; recorded legacy clauses are preserved.
- Reply evaluation is deterministic and fixed when offered. Replays use typed save/epoch/revision action identity, not wall-clock time or new random draws.
- New offseason offers stop after turn 30; replies take 2–4 turns (within the existing seven-turn maximum). Season replies use calendar dates. A season reply crossing December 1 becomes due on the equivalent offseason turn; deadline is turn 37.
- The UI can explicitly resolve due replies. The pure scheduler is ready for the later day/Worker producer; this PR does not invent calendar progression.
- Ordinary legacy release/FA/phase-advance handlers must not execute from the connected annual contract view.
- Focused local verification, full suite and required E2E on the exact PR SHA in CI; no duplicate full runs without a reason.

## Review focus

1. Older callbacks/retries across load, session or revision changes must not apply to a different world.
2. A promise cannot disappear or change its fixed terms when mailbox entries are removed or a newer root is saved.
3. Rejected/cancelled offers restore planning reserves even in deficit without creating a new spending exception.
4. Publication followed by failed acknowledgement must expose recovery and never report a second successful transaction.
5. Unknown/invalid economy mode must not fall through to a legacy salary or roster mutation.

## Task 1: Pure renewal decision lifecycle

**Files:** new `src/engine/renewalDecisions.js`, `src/engine/__tests__/renewalDecisions.test.js`; modify `annualTransactions.js`, `annualSpending.js`, `economyPersistence.js` and focused regression tests.

**Interfaces:** `renewalRequest(world, action)` creates `{saveId,epoch,baseRevision,action}`; `reduceRenewalRequest(world, request)` returns the existing `{ok,world,replayed,error}` shape; `dueRenewalDecisions(world)` and `validateRenewalDecisions(world)` expose current-clock scheduling/validation. Actions are offer, cancel, resolve-due. `reject-renewal` is distinct from cancellation.

- [x] RED: current salary 10000 remains 10000 after a 12000 × 3 next-year agreement; reserves become liabilities for 2027–2029.
- [x] RED: replacement/cancellation/rejection, final-year shortage, due dates on August 1 and November 30, offseason cutoff/turns, mailbox deletion, malformed decisions, stable replay and stale revision.
- [x] Implement the pure boundary and preserve fixed decision history at save overwrite.
- [x] GREEN: `npx vitest run src/engine/__tests__/renewalDecisions.test.js src/engine/__tests__/annualRenewalTransactions.test.js tests/economy-save-migration.test.js` (zero failures).
- [x] Commit the lifecycle and tests.

## Task 2: Human handler and acknowledged save

**Files:** `src/hooks/useGameState.js`, `src/hooks/useOffseason.js`, new `src/hooks/useOffseason.economyRenewal.test.js`.

**Interfaces:** internal commit runner selects a fixed reducer; public `commitRenewalRequest` checks the captured session token and shares #529 commit/recovery. Existing human offer handler branches by economy mode; annual cancellation/resolution handlers return structured async outcomes.

- [x] RED: offer/replace/cancel/reply persist together; save failure preserves the old root/current salary; retries and double clicks yield one reservation/contract; old callback/session rejected.
- [x] Wire annual handlers and keep legacy contract effects separate.
- [x] GREEN: new hook tests plus `useGameState.economyCommit.test.js` and existing contract reply/renewal tests.
- [x] Commit hook integration.

## Task 3: Annual-only contract view and browser evidence

**Files:** new `src/components/tabs/AnnualContractTab.jsx` and tests; `HubContentRouter.jsx`, `ContractRenewalRoute.jsx`; test DOM harness and existing required `e2e/save-generations.spec.js`.

**Interfaces:** the view reads ledger/decisions, calls the human handlers, and awaits acknowledged completion before showing success. Busy/errors/recovery remain visible. Existing shared design-system controls and management layout are reused.

- [x] RED: confirmed offer stays pending until save/adoption; failure/recovery and reloaded decision display; next-year salary shown independently of current salary.
- [x] Connect annual hub/offseason routes to the view without old release/phase mutations.
- [x] GREEN: focused UI/hook tests, build, real React DOM save/restore at 360/390/1440px in Chromium and mobile WebKit; record unavailable checks honestly.
- [ ] Independent review, fix material findings, create a PR from the dedicated branch, verify exact-head CI. Do not merge.
