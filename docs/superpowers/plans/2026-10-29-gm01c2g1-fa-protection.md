# GM-01C-2G-1 FA protection implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline with test-driven-development and one independent whole-branch source review. User authorized staged implementation through PR; do not repeat approval. This file is the committed progress ledger.

**Goal:** Persist a validated FA protection list and quote safe candidate IDs without resolving or transferring the compensation.
**Architecture:** A dedicated pure protection module owns eligible pools, snapshot validation and history. Annual quote/apply validates the whole state and binds submission receipts to immutable list snapshots.
**Tech Stack:** Existing JavaScript/Vitest/Vite, no new dependencies.
**Spec:** `docs/superpowers/specs/2026-10-29-gm01c2g1-fa-protection-design.md`

## Global constraints

- Base main521d64b98447d68509b58f0fa3f9e6eaf81f379f, #513 merged. No main push/merge/auto-merge.
- Optional new state only; no live hooks/CPU/Worker/UI/save migration, no personnel selection/transfer/settlement or deadline automation.
- Keep the #513 pending cash obligation unchanged and spring joining blocked until existing cash settlement. No effect on salary/ledger/budgets or roster placement.
- A club/start-year has one immutable shared list. Protect 0–28 eligible IDs, preserve ID types, reject type collisions. Frozen original eligible pool, current candidate intersection.

## Review focus

- Orphan/duplicate/rewritten list or receipt must be rejected before any transaction replay, including unrelated commands.
- Current roster changes must remove stale candidates without rewriting old lists or admitting later newcomers; historical lists survive trades and later years.
- Expiring and future-renewed players remain eligible; unsigned contract status is a later transfer concern.
- Zero IDs, wrong actor/claim/phase, cross-year and same-club competing claims cannot bypass one-list admission.
- Protection submission in deficit remains information-only; it cannot release any pending fee or create old-club income.

## Task 1: Protection transaction and candidate query

**Files:** Create `src/engine/faProtection.js`, `src/engine/__tests__/annualFaProtection.test.js`; modify `src/engine/annualTransactions.js`, `src/constants.js`.
**Interfaces:** `normalizeFaProtectedIds(ids)`; `inspectFaProtectionLists(state)`; `createFaProtectionList(state,command)`; `faProtectionView(state,{proposalId})`. Expose `quoteFaProtectionList(state,{proposalId})` through annualTransactions. Command `submit-fa-protection {id,proposalId,teamId,protectedPlayerIds}`. Optional state.faProtectionLists and receipt.faProtection use identical records specified in design.

- [x] Add tests for eligible/excluded pools, max28, first/second-team, expiring/future contracts, immutable nonfinancial submission, both-direction receipt binding, shared claims, JSON replay/order independence, roster changes/history and strict typed IDs.
- [x] Run new file and observe RED from missing query/command.
- [x] Implement pure eligibility and snapshot checks; insert new receipt with list before global inspection, then reuse existing quote/apply financial assessment.
- [x] Run focused FA/protection/annual transaction regressions; expect GREEN. Commit.

## Task 2: Documentation and final validation

**Files:** SPEC.md, ROADMAP.md, CHANGELOG.md, docs/validation/gm-01c-2g1/README.md, design/plan above.

- [x] Record sources/game simplifications, G1 limits/G2 dependencies and actual RED/GREEN results.
- [x] Run relevant contract/transaction/roster/save regressions, build and compare44 deployed file paths/SHA256 to same-tree baseline. Run git diff --check.
- [x] Independent whole-source review; fix material issues using RED→GREEN and applicable regressions.
- [ ] Publish feature PR, confirm same remote/local tree and all exact-head CI jobs. Final publication/CI results are recorded in PR body without a bookkeeping-only source revision.

## Execution record

- Baseline: four related files227 pass (F compensation, offseason acquisition, annual transaction).
- Ruling: split selection/transfer into G2 because off-season and concurrent claims need additional ledger/priority integration; G1 ships persisted protection and safe candidate query, never pretends personnel compensation is settled. Cost: this PR alone does not enable playable personnel compensation.
- Ruling: shared club/year lists, 0–28 protection, newcomer exclusions are explicit game policy; immutable snapshot is compared to receipt while current candidate availability is derived. Missing next-year contract is not an eligibility exclusion. Cost: full public-notice roster calendars remain future work.

- Task1: initial55 cases35 RED/20 pre-existing rejection checks pass →55 GREEN; five extra boundary/regression cases bring total60. Stored noncanonical receipt array order reproduced1 RED → canonical history check GREEN. Focused five files287 pass. Builder check completed with no blocker; historical audit, shared typed key, newcomer cohort and atomic receipt insertion rulings adopted.
- Task2: related24files857 pass. Independent whole-source review at189ba7da082a74a1eb9d3f5cb3848ba3fa3063b5: no Critical/Important/actionable Minor; independent60/60 pass. Product unchanged after review. Published-head CI remains PR-body final gate.

- Final local gate: baseline/feature builds pass and44/44 deployed paths/SHA256 match. git diff --check pass.
