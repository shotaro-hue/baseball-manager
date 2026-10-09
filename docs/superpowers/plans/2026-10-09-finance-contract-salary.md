# Finance contract salary implementation plan

Goal: show current owned annual salaries without mutating teams or changing payment/save rules.
Base: main c39882596a8c7390f9ef2bb1d2f9066d7981c025. Spec: user requirements 2026-10-09 and docs/validation/finance-contract-salary.md.
Architecture: a pure finance selector reads players/farm, deduplicates by ID, classifies by 育成 before roster, and returns groups, valid subtotal, missing/invalid counts and ordered entries. FinanceTab derives every render; no new persistent state. Both mobile and desktop use HubContentRouter/FinanceTab.

## Constraints and review focus
- Preserve PR420–425; no budget/payment/formula/IndexedDB changes.
- Current ownership is players/farm (renewalRules.ownedPlayers). 育成players is an unused empty initializer, not an operational roster. FA/scout pools excluded.
- Numeric salary 0 is valid; undefined/null are missing, non-number/non-finite/negative are invalid. Incomplete totals must say confirmed subtotal.
- Duplicate ID: current active roster wins over farm; ID 0 valid; unidentified objects deduplicated by reference.
- Same salary ties retain roster order; unknown salaries follow valid amounts and are explicitly labelled; ranking is at most six.

## Task 1: selector and display
Files: src/engine/finance.js, src/engine/__tests__/financeSalary.test.js, src/components/tabs/FinanceTab.jsx, FinanceTab.test.js, finance-tab.css.
- [x] Write failing component regressions for farm inclusion, frozen render, mutation, missing values and rank.
- [x] Run RED against current FinanceTab, record assertions; add selector cases for duplicate IDs/0, empty/zero/invalid, promotion, salary changes, acquisition/release and frozen data.
- [x] Implement calcContractPayroll(team) and minimal labelled rows/ranking; derive on every render and use fmtSal.
- [x] Run GREEN plus complete unit suite.

## Task 2: browser and delivery
Files: e2e/finance.spec.js, scripts/capture-finance-comparison.mjs, docs/validation/finance-contract-salary.md, CI finance matrix entry.
- [x] Write fixed real-save fixture E2E for 360/390/desktop, unchanged roster/order/lineups/pitching/budget across repeated display/save/reload; verify expected subtotals and ranks.
- [x] Capture identical before/after states; inspect actual mobile/desktop and malformed-salary views.
- [ ] npm ci, npm test, build, validate:physics-hr, smoke and full E2E workers=1/retries=0; execute CI suite commands. Record pass/fail/skip/unrun separately.
- [ ] Fresh whole-branch review, independent PR base main, inspect exact-head CI; never merge or auto-merge.
