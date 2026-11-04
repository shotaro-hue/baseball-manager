# Posting applications implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation, then an independent reviewer.

**Goal:** Persist explicit posting requests and one GM decision without premature departures or income.
**Architecture:** Optional append-only engine events + existing transaction receipts and save barrier. Derived status, no market pricing or random generation.
**Tech Stack:** JavaScript, Vitest, fake-indexeddb, React hook tests.
**Spec:** docs/superpowers/specs/2026-11-04-gm01-posting-applications-design.md

## Global Constraints

Public gate OFF; schemaVersion1/DB5; preserve legacy and existing explicit annual completion. No random draw or new balance constants. No main push/merge.

## Review Focus

- Paired event/receipt deletion must fail publication history guard.
- A rejected request must not be bypassed through standalone posting completion.
- Active requests must not acquire conflicting future renewal obligations.
- Historical rejected records must survive legitimate subsequent departures.
- Stale legacy callbacks must observe current annual mode before any mutation.

### Task 1: Shared request and decision boundary

Files: create src/engine/annualPostingApplications.js and src/engine/__tests__/annualPostingApplications.test.js; modify annualTransactions.js, contractEconomy.js, economyPersistence.js.
Interfaces: request-posting and decide-posting from spec; postingApplicationViews(state) -> request rows plus status; inspectAnnualPostingApplications(state), createPostingApplication(state, command, signature).
- [ ] Write tests for explicit request, one approval/refusal, exact replay, different-ID duplicate, invalid input/clock/roster, financial identity, active conflicts, bypass rejection, JSON and real roster.
- [ ] Run `npx vitest run src/engine/__tests__/annualPostingApplications.test.js` and confirm RED from unsupported command.
- [ ] Implement minimal strict normalizers, event/receipt validation, derived views, shared dispatch, optional projection and history prefix.
- [ ] Run new tests and related annual posting/retirement/FA regressions; expect PASS.

### Task 2: Persistence and legacy boundary

Files: create tests/posting-application-commit.test.js; modify src/hooks/useOffseason.js, src/hooks/useOffseason.posting.test.js; update SPEC/ROADMAP and validation/residual work record.
Interfaces: existing commitEconomyCandidate/recoverEconomyCommit; no new storage or hook API.
- [ ] Add RED for annual and stale legacy mail callbacks; add inline/external cold load, publication failure/retry, adoption recovery, history deletion, stale command and Worker result cases.
- [ ] Add live-mode legacy guard before recording handled IDs or changing any state.
- [ ] Run focused save/hook tests and build, expect PASS.
- [ ] Record data blockers, options/tradeoffs and dependency order. Independently review exact diff and generated-roster entry, resolve confirmed P2+, push PR branch and check exact HEAD CI.
