# GM-01C-2E Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. User authorized implementation through PR; do not repeat approval.

**Goal:** 市場区分と提示/回答/翌年度効力/春加入を共通台帳で安全に扱う。

**Architecture:** 任意の明示市場情報を正規化し、既存の留保と解決履歴へ日時を追加する。受諾は将来signと選手スナップショットを確定し、春に同じ契約の二軍加入を一度だけ行う。本番の旧処理は接続しない。

**Tech Stack:** Existing JavaScript, Vitest, React/Vite build.

**Spec:** `docs/superpowers/specs/2026-10-28-gm01c2e-offseason-design.md`

## Global Constraints

- No main push/merge/auto-merge. No dependencies/CI changes or weakening existing tests.
- Preserve legacy untyped same-season FA and existing renewal/rookie/trade APIs.
- Use existing qualification, salary/proration, ledger, authorization and capacity rules.
- Quote/failure immutable, replay idempotent, all contract seasons authorized.

## Review Focus

- Type-colliding/zero IDs and stale or changed listing: reject safely; retain original offer.
- Pending player and draft slots: count controlled once through either spring join order.
- JSON missing/duplicated accepted acquisition: reject; never silently lose a signed contract.
- Date regression, unanswered spring carry, accepted-before-effective and stale year: retain only valid states.
- A/B compensation and foreign/development distinctions: no unpaid domestic transfer, no 70-slot misuse.

### Task 1: Market metadata and immutable reply history

**Files:** Create `src/engine/acquisitionMarket.js`, `src/engine/__tests__/annualAcquisitionSpending.test.js`; modify `annualSpending.js`.
**Interfaces:** `normalizeMarketEntry(input)`, `acquisitionOfferMetadata(proposal)`, existing spending functions with optional `answeredDate`, cancel options `resolution`.

- [x] Write tests for preserving offered/answered/effective dates, rejected/cancelled/lost, unsafe metadata/time edits and JSON round trips.
- [x] Run `npx vitest run src/engine/__tests__/annualAcquisitionSpending.test.js`; observe RED.
- [x] Implement strict optional paired metadata and resolution-date validation; preserve old function/data shape.
- [x] Run new spending tests + existing annualDelayedFaSpending, annualSpending tests; expect GREEN. Commit.

### Task 2: Offseason acceptance and spring joining

**Files:** Create `src/engine/annualAcquisitions.js`, `src/engine/__tests__/annualOffseasonAcquisitions.test.js`; modify `annualTransactions.js`.
**Interfaces:** explicit lifecycle functions consumed by annualTransactions; optional `state.acquisitions`; commands `reject-fa` / `join-fa`. Reuse `reserveAnnualProposal` callback for shared floor projection.

- [x] Write tests for released/domestic/overseas FA, qualification and compensation gates, future payroll and immutable original offers, cancel/reject/competition, zero and stale IDs, 70th place/development, both rookie-join orders, budget/source/retirement changes, JSON replay and missing history.
- [x] Run `npx vitest run src/engine/__tests__/annualOffseasonAcquisitions.test.js`; observe RED.
- [x] Implement explicit lifecycle, accepted pending state validation, projected controlled capacity and spring farm join. Keep old FA path intact for untyped same-year offers.
- [x] Run new tests and all annual transaction/spending/ledger/calendar/payroll plus existing hook market/save/renewal/trade regressions; expect GREEN. Commit.

### Task 3: Validation, documentation and PR

**Files:** `SPEC.md`, `ROADMAP.md`, `docs/validation/gm-01c-2e/README.md`, design/plan above.

- [x] Update specs, scope, primary-source audit, results and next dependencies.
- [x] Run `npm run build`, compare production files with baseline build, `git diff --check`; expect unchanged production behavior.
- [x] Fresh whole-branch review per requesting-code-review, resolve material findings with RED/GREEN.
- [ ] Publish feature branch and create PR against main; verify remote tree/source and all CI jobs for the final head. Report actual pass/fail, boundaries and merge decision; do not merge.

## Execution record

- Task 1: complete at `fe4c24d`; 27 RED → GREEN, spending regression 116 pass.
- Task 2: complete at `6242dab`, integrity fixes at `7d4848b`; 44 initial RED/10 pass → full acquisition GREEN; additional cancellation/date/missing-history regressions RED → GREEN. Final local related 21 files/681 pass, 99 new tests.
- Design check rulings: keep pending employment separate from roster ownership; preserve snapshots in metadata lookup; forbid stripping typed market offers into legacy; separate full offer identity from ledger core; limit acceptance to original off while allowing spring cancellation; keep joined records historical after trades. All implemented within authorized scope.
- Whole-branch review uses these committed product sources. Remaining publication/exact-head CI completion is recorded in the PR body, so updating final CI bookkeeping does not trigger another source/CI cycle.

- Final source review: `7d4848b2640b4edb13a74bb49d84fed1d19ea543`, Critical 0 / Important outstanding 0 / Minor requiring action 0. Independent 4-file/172-test run passed; full CI remains the publication gate.
