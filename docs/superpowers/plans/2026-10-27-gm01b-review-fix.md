# GM-01B-FIX Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement in this session and request one final independent review.

**Goal:** PR #506のP1/P2を再現・修正し、同じPRの最新headで全CIを確認する。マージしない。

**Architecture:** 台帳の原契約・履歴と給与/保証の表示分類は維持する。通常審査では球団・年度・契約ごとに給与と保証の合計を比較し、既存債務の減少/分類変更と新規債務を区別する。無金銭例外では全年度の余力を比較し、片側の契約移管を交換として扱わない。

**Tech Stack:** Existing JavaScript ES modules, Vitest, Vite, GitHub Actions.

**Spec:** 2026-10-27 user instruction “PR #506 レビュー指摘修正・最終検証指示書”; existing `docs/validation/gm-01b/README.md` and `docs/superpowers/specs/2026-10-26-club-management-gameplay-design.md`.

## Global Constraints

- Starting main `6be20cef7aba1637f457e588fa27fe68f67c4a68`; PR head `fffa123a4544f8790755a665292146c6164a8ccb`.
- Update `feat/gm01b-contract-ledger`; do not merge, create a separate PR, activate the foundation, migrate saves, change UI/coach rates/balance, or implement GM-01C/D.
- Preserve all seven years, 2–11月の月割り, original terms, append-only history, retained debt, explicit retain/waive, IDs, reservations and replay semantics.
- New contracts, raises, expenses and holds must not hide behind an existing liability reduction.
- Follow AGENTS.md: focused local verification; exact-head CI supplies full unit/stress/E2E evidence without duplicating the same full run locally.

## Review Focus

- A seller can remain in deficit after a legitimate reduction; ordinary approval must still work.
- A receiver's seventh year can worsen while still positive; the cashless exception must reject it.
- A zero-salary one-way transfer cannot masquerade as a reciprocal exchange.
- Ending a contract and adding a different liability must remain subject to ordinary deficit checks even if the net cost falls.
- JSON reload must preserve full guaranteed debt, immutable transactions and idempotence.

## Task 1: Regressions and minimal spending fix

**Files:** Modify `src/engine/annualSpending.js`, `src/engine/__tests__/annualSpending.test.js`, `src/engine/__tests__/contractLedger.test.js`.

**Interfaces:** Preserve `assessAnnualSpendingChange(before,after,{mode:'spend'|'cashless-trade'})` and quote/ledger APIs. `ok:false` represents unaffordable valid changes; malformed cashless requests (non-transfer or nonreciprocal) throw, as other invalid exception requests already do.

- [x] Add tests for a 10000/5000 salary exchange, unilateral zero-salary transfer, remaining-deficit seller, and a seventh-year-only increase. Cashless worsening must reject even when the resulting remainder is positive; ordinary funded trades must pass.
- [x] Add termination tests: 10000 salary/9000 cap retains 5484 salary + 4516 guarantee in 2026 and 10000 guarantee in 2027–2032. Test release/retirement/posting retain; waive keeps accrued 5484. Add mixed signing/raise/expense/hold rejection and JSON replay checks.
- [x] Run both test files and record expected RED failures before production edits.
- [x] In `prepare`, derive per-contract/year totals for the approval comparison while leaving detailed quote rows/fingerprints intact. Existing obligations can decrease or change salary/guarantee category; any new obligation token remains new spending. Keep all other identity/history checks.
- [x] For cashless approval require participating clubs to send and receive existing contracts, leave other exception checks intact, and reject any negative year-by-year remainder change, irrespective of the final sign.
- [x] Run both test files; expected all pass. Run the six-file foundation command from `docs/validation/gm-01b/README.md`; expected all pass. Run build and `git diff --check`.

## Task 2: Review, evidence and existing PR delivery

**Files:** Update `docs/validation/gm-01b/README.md` and this plan. No unrelated production changes.

- [x] Request one independent review of this fix against the user requirements; resolve material findings with RED→GREEN.
- [x] Record RED/GREEN counts, approval responsibilities, seven-year and JSON evidence, and GM-01C's required atomic linking of both cash-transfer sides under one transaction ID.
- [ ] Commit and update the existing branch without rewriting history; verify remote head and tested source/tree match.
- [ ] Observe all exact-head GitHub Actions jobs (build, full unit/stress, existing browser/save/progression suites). Investigate any failure; do not mark pending jobs successful.
- [ ] Update PR body with the final SHA, actual CI result, fix summary and remaining integration requirements. Report YES/NO for merge readiness, without merging.

Implementation evidence: initial RED 13/67, first GREEN 67/67; mixed-raise RED 1 selected failure; final-review RED 2/70; final foundation GREEN 150/150. The final review exposed exact-total masking and payer misattribution. Both were resolved by comparing candidate costs against the same candidate ledger without only its newly appended raise boundaries, and treating resulting raise costs as affected even when old/new fingerprints match. No new domain policy or out-of-scope work was added. Delivery/CI checkboxes above are the pre-submission snapshot; the exact-head result and completion record are maintained in PR #506's body after CI finishes.
