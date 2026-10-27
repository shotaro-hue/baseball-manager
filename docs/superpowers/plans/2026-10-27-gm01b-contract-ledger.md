# GM-01B Contract Liability and Annual Spending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** #505の月割り計算を、期間付きの契約負担・保証残債・年度別予算とオファー留保の共通審査へ進める。

**Architecture:** 契約ごとの初期条件と取引境界だけを正本にし、在籍/負担者/給与変更と年度負担を導出する。年次支出計画は許可額・契約負担・未確定オファー・一時費用・未充足人数の最低維持費を分離する。ゲームへの有効化、旧セーブ移行、UIとCPU接続はGM-01C/Dへ残す。

**Tech Stack:** Existing JavaScript ES modules, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-10-26-club-management-gameplay-design.md` and `docs/validation/gm-00/README.md`.

## Global Constraints

- Base main `6be20cef7aba1637f457e588fa27fe68f67c4a68` (#505 merged). Existing game behavior, coefficients, save formats, and coach prices remain unchanged.
- Money is whole 万円; zero is recorded. Missing/invalid values, unknown versions, overlapping contracts, backdating, unsafe totals and stale ownership must fail explicitly.
- Salary periods are half-open civil dates; 2/1–12/1 accrual reuses #505 cumulative-difference arithmetic. No game-round inference.
- New acquisitions, transfers and salary increases use the common July 31 registration deadline; postseason qualification requires separate future registration snapshots.
- Existing salary liabilities cannot disappear with roster removal. Guaranteed club release retains all remaining salary; formal retirement/posting requires explicit retained/waived settlement.
- All proposal years, including years 4–7, require explicit authorizations. New ordinary income never creates authorization here. No final allocation or coach-rate coefficient is selected.
- Normal new spending must fit each affected club/year; removing a losing/cancelled hold can improve an existing deficit without creating new spending. A cashless trade can preserve an existing deficit only when every affected club/year is no worse, with no changed cash expense, offer hold, resolution history or approved cap. Minimum-roster costs come from the future authoritative roster planner and may legitimately change with filled vacancies.
- No live activation or save adoption in this PR. Existing unknown signing phases are not reconstructed.

## Review Focus

- Repeated IDs after JSON reload must be idempotent; conflicting payloads under the same ID must fail.
- Release debt, historical paid salary and future transfer liability must survive amendments and year closure.
- Reserve acceptance must not double count, refund unrelated holds, accept changed terms, or silently drop future-year checks.
- A negative-budget exception must not admit a new signing, cash transfer, or worsening seventh year.
- Rewriting/removing an earlier ledger record, changing approved caps, or backdating a cost must not create headroom.

## Task 1: Calendar and contract liability ledger

**Files:** Add `src/engine/contractCalendar.js`, `src/engine/contractLedger.js`, their `__tests__/*.test.js`; modify `monthlyPayroll.js` to reuse the same calendar validation.

**Interfaces:**
- Calendar: `parseContractDate(value)` → validated year/month/day/days; `registrationDateAllowed(season,date)` → boolean, malformed input throws.
- `createContractLedger()` → `{version:1,closedThroughSeason:0,records:[]}`.
- `applyContractLedgerAction(ledger,action)` → immutable ledger; identical action ID/payload returns the original ledger.
- Sign action: `{id,type:'sign',contract,teamId,effectiveDate}`. Other actions include contractId, teamId and effectiveDate; transfer adds toTeamId, increase adds annualSalaryManYen, end adds reason (`release/retirement/posting`) and settlement (`retain/waive`).
- Each persisted record has original contract, initialTeamId, effectiveDate, actionId and changes. No duplicated materialized payer or salary-history state.
- `contractLiabilityRows(ledger)` → rows `{contractId,playerId,teamId,season,kind:'salary'|'guarantee',amountManYen}`; all retained seasons are represented.
- `validateContractLedger(ledger)`, `closeContractLedgerThrough(ledger,season)`, `isContractLedgerExtension(before,after)` protect immutable history and closed years.

- [x] Write RED cases for month splits/transfers/raises, guaranteed release and formal settlement, overlap/stale owner, exact ID replay after closure/reload, safe integer aggregation and July 31 boundaries.
- [x] Run focused tests and confirm the missing behavior fails.
- [x] Implement immutable boundary records and derivation using #505 salary math. Zero-length same-day payer intervals are omitted; effective dates are nondecreasing.
- [x] Verify old 60 foundation cases plus new tests; commit.

## Task 2: Annual authorization, holds and atomic acceptance

**Files:** Add `src/engine/annualSpending.js`, `src/engine/__tests__/annualSpending.test.js`.

**Interfaces:**
- Plan: `{version:1,budgetSeason,ledger,authorizations,reservations,resolvedReservations,oneOffCosts}`. Authorization `{teamId,season,approvedManYen,minimumRosterReserveManYen}`. Reservation `{kind:'renewal'|'offer'|'rookie',proposal:<sign action>}`; costs are derived, never copied. Resolved reservation adds `resolution:'cancelled'|'replaced'|'accepted'|'lost'`, preserving identity without holding money. One-off `{id,teamId,season,kind:'coach'|'scouting'|'stadium'|'trade',amountManYen}`; only trade cash may be signed.
- `quoteAnnualSpendingPlan(plan)` → explicit annual rows with salary, guarantee, one-off, held, minimum-roster and remaining amounts; malformed/missing funding throws.
- `assessAnnualSpendingChange(before,after,{mode:'spend'|'cashless-trade'})` → `{ok,violations,rows}`. Caps/history cannot be rewritten. Closed costs remain immutable. A cashless exception permits transfer-only appended ledger actions with holds/cash/authorizations unchanged.
- `reserveContractProposal(plan,{kind,proposal,replaceId?})`, `cancelContractReservation(plan,id)`, `commitContractReservation(plan,proposal)` → immutable plans, latest affordability checked, accepted proposal replay is a no-op. Reservation key equals proposal action ID; all seven years use the same ledger cost rules.
- Acceptance resolves overlapping losing bids for the same player atomically and retains unrelated/nonoverlapping holds. Canceled/replaced/lost IDs cannot reopen, including after JSON reload; exact retry is a no-op and changed payload is rejected.

- [x] Write tests with literal annual figures: 7/1 three-year signing costs 5000/10000/10000; hold→accept leaves headroom unchanged; reject future funding missing/insufficient; JSON replay and conflicting signatures.
- [x] Test guarantee debt after release, two-club transfer acceptance/rejection, deficit-preserving cashless swaps versus cash/signing bypasses, immutable history/caps and historical costs.
- [x] Run RED; implement the common pure quote/validator and atomic hold replacement.
- [x] Run Task 1/2 focused tests and commit.

## Task 3: Evidence and delivery

**Files:** Add `docs/validation/gm-01b/README.md`; update `ROADMAP.md` and this plan's progress.

- [x] Record precise scope, APIs, expected figures, rule decisions, acceptance commands and unimplemented migration/CS eligibility/live integration.
- [ ] Build and verify the focused tests. Reuse exact-head PR CI for the full unit/E2E gate; do not repeat the expensive all-tests run locally.
- [x] Request one independent whole-branch review; fix important findings using RED→GREEN.
- [ ] Create a dedicated PR with exact tree/head verification, CI status and limitations. Do not merge or enable the model in the game.
