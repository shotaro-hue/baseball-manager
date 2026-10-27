# GM-01C-2A Development contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make contract class and development-to-controlled conversion a dated, atomic annual transaction.

**Architecture:** Optional explicit class on season contracts; a conversion boundary on the existing ledger; current employment drives both roster projection and funded controlled places. One shared quote/apply candidate updates all affected state or nothing.

**Tech Stack:** Existing JavaScript, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-10-27-gm01c2-development-contract-design.md`; parent `docs/superpowers/specs/2026-10-26-club-management-gameplay-design.md`.

## Global Constraints

- Base main `818ae5025dd749b9bb254bbfcdcd7ba4ceb5cbc9`; dedicated branch; no merge.
- Keep 2–11月 monthly salary math, whole 万円, current July 31 registration deadline and 70 controlled places.
- Preserve contract term, original annual rate and guarantee. A conversion boundary supplies the new rate/class.
- No live activation, hook/UI/save migration, budget coefficients or development draft.
- Keep untyped C-1 inputs compatible; explicit conflicting types fail. Never infer a missing class for a conversion.
- Use exact-source CI for full regression per AGENTS.md, without repeating an already successful full run.

## Review Focus

- Same-rate conversion must change classification without inventing a raise or resetting expiry.
- A decrease in the minimum floor must not hide fresh salary spending in an over-budget year.
- Current roster flags must match an explicit ledger class; stale draft copies cannot override owned metadata.
- Past classification, transfers and retained guarantees survive conversion and JSON reload.
- Accepted unowned controlled rookies consume a place; development rookies do not.

### Task 1: Dated contract class and conversion ledger boundary

**Files:** `src/engine/seasonContract.js`, `src/engine/contractLedger.js`, corresponding `__tests__` files.

**Interfaces:** Optional `registrationType` on season contracts; ledger `convert-to-controlled` action has contractId/teamId/effectiveDate/annualSalaryManYen. `contractEmploymentAt(ledger,date)` returns effective `registrationType` when recorded.

- [x] Add tests: class roundtrip/invalid type; conversion before/after 7/16, salary 322/420/420, same-rate 600, transfer/guarantee preservation, rejected invalid class/rate/date/replay.
- [x] Run focused tests, observe expected RED, implement validation and date projection using existing monthly math.
- [x] Run seasonContract and contractLedger tests, expect GREEN; commit task.

### Task 2: Atomic conversion and authoritative classification in annual transactions

**Files:** `src/engine/annualTransactions.js`, `src/engine/annualSpending.js`, new `src/engine/__tests__/annualDevelopmentTransactions.test.js`.

**Interfaces:** `quoteAnnualTransaction`/`applyAnnualTransaction` accept `{id,type:'convert-to-controlled',teamId,playerId,contractId,annualSalaryManYen}`. Same return contract as C-1. Current date is always state-owned.

- [x] Add RED cases for quote purity, 28-person first team/farm retention, floor/322 current liability, expiry/rate projection, replay and changed terms, 70 including rookies, salary below minimum/current, unknown class, stale owner/contract, 7/31 vs 8/1, missing/deficit future year, opposing flags, and conversion then trade.
- [x] Implement conversion through ledger and existing capacity/annual budget checks. Derive funded places from dated explicit class, otherwise legacy C-1 metadata. Include conversion raises in spending admission.
- [x] Run new and existing annual transactions/spending/ledger/calendar/payroll/capacity tests, expect GREEN; commit task.

### Task 3: Integration evidence and reviewable PR

**Files:** `SPEC.md`, `ROADMAP.md`, `docs/validation/gm-01c-2a/README.md`, plan execution ledger.

- [x] Run related existing hook/contract tests and build; document actual output and remaining C-2/D work.
- [x] Independent whole-branch review, with RED/GREEN fixes for any material finding.
- [ ] Verify diff and branch base; push dedicated branch, open PR, inspect final-head CI. Do not merge.

## Execution ledger

- Pre-flight: Task 1 → Task 2: optional recorded class and `convert-to-controlled` boundary match; Task 2 → Task 3: existing public quote/apply interface retained. No conflicts.
- Baseline: latest main verified merged #507; 3 files/87 tests passed before changes.
- Ruling: this is C-2A, a coherent prerequisite; live cutover remains gated on C-2/D and calibration. Premature cutover risks mixed accounting, so no production flag is introduced.
- Ruling: old untyped foundation data stays readable, while conversion requires explicit development class. Migration must supply it later; no automatic guess enters a contract record.
- Native implementation is authorized by the user's continuation request and AGENTS.md; do not repeat approval questions.
- Task 1: complete — new cases 19, RED 12 / existing-boundary passes 7; seasonContract/contractLedger GREEN 67/67; `git diff --check` passed. Raw logs in task workspace, final reproducible commands in validation record.
- Execution note: cloud skill helper scripts were unavailable; this committed execution ledger records exact commands/results instead.
- Task 2: complete — new annual cases RED 15; GREEN 8 files / 260 tests. A test helper froze a restored state before a later test-side date edit; fixed that test to create a new state snapshot, without changing product code or expectations. Added a passing boundary case for second-season remaining years.
- Final review: fresh independent reviewer checked `818ae502..248253ea`; Important1, Critical/Minor0.
- Final: fixed conflicting explicit rookie class/capacity metadata — both mismatch directions and hidden 71st place, 3 RED→GREEN, 6 added cases, relevant 8 files/266 tests passed. Existing related hooks/contract/planning/GM-00: 11 files/127 tests passed; build passed. Exact-head full suite is CI-gated per AGENTS.md.
- Final: Ruling: live hook/Worker/UI, migration, annual rollover and calibration stay deferred as designed — enabling incomplete accounting risks incompatible state; no cutover in this PR.
- Final: Ruling: actual rookie onboarding/future renewal execution are later C-2 work; current typed rookie reservations must already agree with accepted assignment — an incorrect split could miscount roster places, now regression-protected.
- Final: Ruling: physical-device performance is unverified; synthetic old-path quote is only regression evidence — actual iPhone latency remains a required gate before live cutover.
- Task 3 local verification: synthetic 780-player/84-year-row quote, source `ed85dac`, median596.5ms (558.1–643.8), immutable input/identical rows/no committed receipts. No live/device performance claim.
